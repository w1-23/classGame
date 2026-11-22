#!/usr/bin/env python3
"""Prepare, validate, and safely link offline vocabulary recordings (Python stdlib).

Does not synthesize speech. Run build_offline_audio.ps1 on a Windows build machine
after prepare. Pinyin phonemes require reviewed recordings; never mark TTS as
teacher-reviewed. Source files change only with the explicit write-back command.
"""
from __future__ import annotations

import argparse
import array
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import wave


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # A failed write must not truncate an existing content pack or job file.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".offline-audio-", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def safe_path(root, relative):
    relative = str(relative).replace("\\", "/")
    if Path(relative).is_absolute() or ":" in relative:
        raise ValueError(f"Expected a project-relative path: {relative}")
    result = (root / relative).resolve()
    if not result.is_relative_to(root):
        raise ValueError(f"Path leaves project: {relative}")
    return result


def manual_recording(pack):
    return pack.get("id") == "g1-chinese-pinyin" or "拼音" in pack.get("name", "")


def speech_items(pack):
    # Poetry cloze is text-only. Do not accidentally turn a future poems/items
    # representation into a request to narrate every poem.
    if pack.get("subject") == "古诗" or "poems" in pack:
        return
    yield from iter_items(pack)


def job_id(text, lang, manual):
    role = "phoneme-recording" if manual else "word-tts-candidate"
    return hashlib.sha256((role + "\0" + lang + "\0" + text).encode("utf-8")).hexdigest()[:24]


def validate_plan(data):
    if data.get("schemaVersion") != 1 or not isinstance(data.get("jobs"), list):
        raise ValueError("Unsupported audio job schema")
    seen = set()
    for job in data["jobs"]:
        text, lang, manual = job.get("text"), job.get("lang"), job.get("requiresManualRecording")
        if (not isinstance(text, str) or not text.strip() or lang not in ("zh-CN", "en-US")
                or type(manual) is not bool):
            raise ValueError("Every job needs text, an exact supported language and an explicit manual-recording boolean")
        expected = job_id(text, lang, manual)
        if job.get("id") != expected or job.get("output") != f"audio/generated/{lang}/{expected}.wav":
            raise ValueError("Job text/language/manual role or output was changed; regenerate jobs")
        if expected in seen or not isinstance(job.get("references"), list) or not job["references"]:
            raise ValueError("Job IDs must be unique and have content references")
        seen.add(expected)


def iter_items(pack):
    for index, item in enumerate(pack.get("items", [])):
        yield ["items", index], item
    for ui, unit in enumerate(pack.get("units", [])):
        for li, lesson in enumerate(unit.get("lessons", [])):
            for ii, item in enumerate(lesson.get("items", [])):
                yield ["units", ui, "lessons", li, "items", ii], item


def prepare(root, out):
    manifest_bytes = (root / "data/manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8-sig"))
    jobs, sources, total = {}, [], 0
    source_paths = set()
    for relative in manifest["packs"]:
        path = safe_path(root, relative)
        if path in source_paths:
            raise ValueError(f"Duplicate pack path in manifest: {relative}")
        source_paths.add(path)
        source_bytes = path.read_bytes()
        pack = json.loads(source_bytes.decode("utf-8-sig"))
        sources.append({"path": relative, "sha256": hashlib.sha256(source_bytes).hexdigest()})
        for location, item in speech_items(pack):
            total += 1
            text = item.get("speechText")
            lang = item.get("speechLang")
            if not isinstance(text, str) or not text.strip() or lang not in ("zh-CN", "en-US"):
                raise ValueError(f"{relative}/{item.get('id')}: explicit speechText/speechLang required")
            manual = manual_recording(pack)
            key = job_id(text, lang, manual)
            job = jobs.setdefault(key, {
                "id": key, "text": text, "lang": lang,
                "output": f"audio/generated/{lang}/{key}.wav",
                "requiresManualRecording": manual,
                "pronunciationReview": "pending", "references": []
            })
            job["references"].append({
                "pack": relative, "packId": pack.get("id"),
                "itemId": item.get("id"), "location": location,
                "originalAudio": item.get("audio")
            })
    value = {
        "schemaVersion": 1,
        "scope": "Vocabulary and pinyin only; poetry cloze does not require narration.",
        "sourceManifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "sourceFiles": sources, "totalItemReferences": total,
        "jobs": list(jobs.values())
    }
    if Path(out).resolve() in source_paths | {(root / "data/manifest.json").resolve()}:
        raise ValueError("The jobs output must not overwrite a source content file")
    save_json(out, value)
    print(json.dumps({"references": total, "uniqueRecordings": len(jobs),
        "ttsCandidates": sum(not j["requiresManualRecording"] for j in jobs.values()),
        "manualRecordings": sum(j["requiresManualRecording"] for j in jobs.values()),
        "jobsFile": str(Path(out).resolve())}, ensure_ascii=False))


def check_wav(path):
    with wave.open(str(path), "rb") as recording:
        channels, width = recording.getnchannels(), recording.getsampwidth()
        rate, frames = recording.getframerate(), recording.getnframes()
        if channels not in (1, 2) or width != 2 or rate < 8000 or frames < rate * 0.08:
            raise ValueError("Expected nonempty PCM16 mono/stereo WAV, duration >= 80ms")
        raw = recording.readframes(frames)
        if len(raw) != frames * channels * width:
            raise ValueError("WAV is truncated: the sample data does not match its header")
        samples = array.array("h", raw)
        if sys.byteorder != "little":
            samples.byteswap()
        rms = math.isqrt(sum(value * value for value in samples) // len(samples)) if samples else 0
        if not samples or max(abs(value) for value in samples) < 32 or rms < 16:
            raise ValueError("Recording is silent or effectively silent")
        return {"durationSeconds": round(frames / rate, 3), "sampleRate": rate,
                "channels": channels, "rmsPcm16": rms, "sha256": digest(path)}


def verify(root, job_file, report, require_complete):
    data = read_json(job_file)
    validate_plan(data)
    good, errors = [], []
    for job in data["jobs"]:
        try:
            path = safe_path(root, job["output"])
            good.append({"id": job["id"], "output": job["output"], **check_wav(path)})
        except (OSError, ValueError, wave.Error, EOFError) as error:
            errors.append({"id": job["id"], "output": job["output"], "error": str(error)})
    result = {"filesPassed": len(good), "filesFailed": len(errors),
              "complete": not errors,
              "validationScope": "WAV structure, duration, non-silent signal; not pronunciation approval.",
              "files": good, "errors": errors}
    save_json(report, result)
    print(json.dumps({key: result[key] for key in ("filesPassed", "filesFailed", "complete")}, ensure_ascii=False))
    if require_complete and errors:
        raise ValueError("Offline audio is incomplete; do not release it as fully voiced")
    return result


def write_back(root, job_file, backup_directory):
    data = read_json(job_file)
    validate_plan(data)
    manifest_bytes = (root / "data/manifest.json").read_bytes()
    if data.get("sourceManifestSha256") != hashlib.sha256(manifest_bytes).hexdigest():
        raise ValueError("Content manifest changed since prepare; regenerate jobs first")
    manifest = json.loads(manifest_bytes.decode("utf-8-sig"))
    source_names = [source["path"] for source in data["sourceFiles"]]
    if len(source_names) != len(set(source_names)) or source_names != manifest["packs"]:
        raise ValueError("The plan source list no longer matches the content manifest")
    snapshots, packs = {}, {}
    for source in data["sourceFiles"]:
        original = safe_path(root, source["path"])
        source_bytes = original.read_bytes()
        if hashlib.sha256(source_bytes).hexdigest() != source["sha256"]:
            raise ValueError(f"Content changed since prepare: {source['path']}")
        snapshots[source["path"]] = source_bytes
        packs[source["path"]] = json.loads(source_bytes.decode("utf-8-sig"))
    # Preflight every audio before modifying any pack. Missing files never enter JSON.
    for job in data["jobs"]:
        check_wav(safe_path(root, job["output"]))
    expected_locations = {(relative, tuple(location)) for relative, pack in packs.items()
                          for location, _ in speech_items(pack)}
    seen_locations, changed_packs = set(), set()
    for job in data["jobs"]:
        for reference in job["references"]:
            key = (reference["pack"], tuple(reference["location"]))
            if key not in expected_locations or key in seen_locations:
                raise ValueError("A content reference is missing, duplicated or not a vocabulary item")
            seen_locations.add(key)
            pack = packs[reference["pack"]]
            item = pack
            for part in reference["location"]:
                item = item[part]
            if (item.get("id") != reference["itemId"] or pack.get("id") != reference.get("packId")
                    or item.get("speechText") != job["text"] or item.get("speechLang") != job["lang"]
                    or manual_recording(pack) != job["requiresManualRecording"]):
                raise ValueError("Item identity, pronunciation text/language or manual-recording role does not match the plan")
            item["audio"] = job["output"]
            item["audioReview"] = (
                "pinyin_preview_pending_teacher_review"
                if job["requiresManualRecording"]
                else "tts_preview_pending_teacher_review"
            )
            changed_packs.add(reference["pack"])
    if seen_locations != expected_locations:
        raise ValueError("The plan does not cover every vocabulary/pinyin item; regenerate jobs")
    backup = Path(backup_directory).resolve()
    if backup.exists():
        raise ValueError("Backup directory already exists; use a new directory to preserve previous backups")
    backup.mkdir(parents=True)
    manifest_backup = safe_path(backup, "data/manifest.json")
    manifest_backup.parent.mkdir(parents=True, exist_ok=True)
    manifest_backup.write_bytes(manifest_bytes)
    for source in data["sourceFiles"]:
        destination = safe_path(backup, source["path"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(snapshots[source["path"]])
    # Check again after audio validation and backup work, before the first edit.
    if digest(root / "data/manifest.json") != data["sourceManifestSha256"]:
        raise ValueError("Manifest changed during preflight; no source packs were written")
    for source in data["sourceFiles"]:
        if digest(safe_path(root, source["path"])) != source["sha256"]:
            raise ValueError("Content changed during preflight; no source packs were written")
    for relative in sorted(changed_packs):
        save_json(safe_path(root, relative), packs[relative])
    print(json.dumps({"updatedPacks": len(changed_packs), "backupDirectory": str(backup),
        "reviewStatus": "Audio linked; teacher review remains pending"}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    a = sub.add_parser("prepare")
    a.add_argument("--project-root", required=True); a.add_argument("--out", required=True)
    b = sub.add_parser("verify")
    b.add_argument("--project-root", required=True); b.add_argument("--jobs", required=True)
    b.add_argument("--report", required=True); b.add_argument("--require-complete", action="store_true")
    c = sub.add_parser("write-back")
    c.add_argument("--project-root", required=True); c.add_argument("--jobs", required=True)
    c.add_argument("--backup-dir", required=True)
    args = parser.parse_args(); root = Path(args.project_root).resolve()
    try:
        if args.command == "prepare": prepare(root, args.out)
        elif args.command == "verify": verify(root, args.jobs, args.report, args.require_complete)
        else: write_back(root, args.jobs, args.backup_dir)
    except (OSError, ValueError, KeyError, TypeError, IndexError, EOFError, wave.Error) as error:
        parser.exit(1, f"ERROR: {error}\n")


if __name__ == "__main__":
    main()
