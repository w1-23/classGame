import json
from pathlib import Path

from pypinyin import Style, pinyin


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "manifest.json"
ERRORS = []


def check(condition, message):
    if not condition:
        ERRORS.append(message)


def lesson_items(pack):
    for item in pack.get("items", []):
        yield "pack", item
    for unit in pack.get("units", []):
        for lesson in unit.get("lessons", []):
            for item in lesson.get("items", []):
                yield f"{unit.get('id')}/{lesson.get('id')}", item


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
pack_paths = manifest.get("packs", [])
check(len(pack_paths) >= 15, "manifest must include at least 15 packs")

total_items = 0
english_items = 0
pinyin_items = 0
english_books = 0
poetry_levels = 0
poetry_variants = 0

for relative_path in pack_paths:
    pack_path = ROOT / relative_path
    check(pack_path.exists(), f"{relative_path}: missing pack file")
    if not pack_path.exists():
        continue
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    check(bool(pack.get("id")), f"{relative_path}: missing id")
    check(bool(pack.get("name")), f"{relative_path}: missing name")
    check(bool(pack.get("subject")), f"{relative_path}: missing subject")
    if pack.get("subject") == "英语":
        english_books += 1
    poetry_pack = any(
        lesson.get("questionPool")
        for unit in pack.get("units", [])
        for lesson in unit.get("lessons", [])
    )

    seen_pairs = {}
    local_count = 0
    for scope, item in lesson_items(pack):
        local_count += 1
        total_items += 1
        if pack.get("subject") == "英语":
            english_items += 1
        if pack.get("id") == "g1-chinese-pinyin":
            pinyin_items += 1

        item_id = item.get("id", "<missing-id>")
        options = [item.get("correct"), *item.get("distractors", [])]
        check(bool(item.get("correct", "").strip()), f"{item_id}: empty answer")
        check(len(item.get("distractors", [])) >= 2, f"{item_id}: fewer than two distractors")
        check(len(options) == len(set(options)), f"{item_id}: duplicate options")
        check("reviewed" in item, f"{item_id}: missing review marker")
        if item.get("audio"):
            check((ROOT / item["audio"]).exists(), f"{item_id}: missing audio {item['audio']}")
        else:
            check(bool(item.get("speechText")), f"{item_id}: needs audio or speechText")
        if item.get("games"):
            check(
                set(item["games"]).issubset({"runner", "listen", "assemble", "memory"}),
                f"{item_id}: invalid game mapping",
            )
        pair = (item.get("prompt"), item.get("correct"))
        scope_pairs = seen_pairs.setdefault(scope, set())
        check(pair not in scope_pairs, f"{item_id}: duplicate prompt/answer pair in {scope}")
        scope_pairs.add(pair)
        if pack.get("id") == "g1-chinese-basic":
            generated = pinyin(item["prompt"], style=Style.TONE)[0][0]
            check(
                generated == item["correct"],
                f"{item_id}: pinyin mismatch {generated} != {item['correct']}",
            )

    check(local_count > 0 or pack.get("poems") or poetry_pack, f"{relative_path}: no items")
    if poetry_pack:
        for unit in pack.get("units", []):
            for lesson in unit.get("lessons", []):
                poetry_levels += 1
                pool = lesson.get("questionPool", [])
                poetry_variants += len(pool)
                check(
                    lesson.get("samplingPolicy") == "one_variant_per_group_then_shuffle",
                    f"{lesson.get('id')}: unsupported poetry sampling policy",
                )
                check(
                    isinstance(lesson.get("questionsPerRun"), int) and lesson["questionsPerRun"] > 0,
                    f"{lesson.get('id')}: invalid questionsPerRun",
                )
                groups = {}
                seen_pool_ids = set()
                for question in pool:
                    question_id = question.get("id", "")
                    check(question_id not in seen_pool_ids, f"{lesson.get('id')}: duplicate pool id {question_id}")
                    seen_pool_ids.add(question_id)
                    groups.setdefault(question.get("variantGroupId", ""), []).append(question)
                    line_index = question.get("line")
                    source_poem = next(
                        (poem for poem in pack.get("poems", []) if poem.get("id") == question.get("poemId")),
                        None,
                    )
                    check(source_poem is not None, f"{question_id}: unknown poem")
                    if source_poem and isinstance(line_index, int) and 0 <= line_index < len(source_poem.get("lines", [])):
                        reconstructed = f"{question.get('before', '')}{question.get('answer', '')}{question.get('after', '')}"
                        check(
                            reconstructed == source_poem["lines"][line_index],
                            f"{question_id}: cloze does not reconstruct its source line",
                        )
                    options = [question.get("answer"), *question.get("distractors", [])]
                    check(len(question.get("distractors", [])) >= 2, f"{question_id}: fewer than two distractors")
                    check(len(options) == len(set(options)), f"{question_id}: duplicate options")
                check(
                    len(groups) == lesson.get("questionsPerRun"),
                    f"{lesson.get('id')}: variant groups must equal questionsPerRun",
                )
    for poem in pack.get("poems", []):
        if poetry_pack:
            check(len(poem.get("lines", [])) >= 2, f"{poem['id']}: poem lines incomplete")
            continue
        check((ROOT / poem["audio"]).exists(), f"{poem['id']}: missing audio {poem['audio']}")
        check(poem.get("reviewed") is True, f"{poem['id']}: not reviewed")
        check(len(poem.get("lines", [])) >= 2, f"{poem['id']}: poem lines incomplete")
        line_audio = poem.get("lineAudio", [])
        check(
            len(line_audio) == len(poem.get("lines", [])),
            f"{poem['id']}: lineAudio count must match poem lines",
        )
        for audio_path in line_audio:
            check((ROOT / audio_path).exists(), f"{poem['id']}: missing line audio {audio_path}")
        cloze = poem.get("cloze", [])
        check(len(cloze) >= 2, f"{poem['id']}: not enough reviewed cloze questions")
        seen_cloze_ids = set()
        for question in cloze:
            question_id = question.get("id", "")
            check(question_id not in seen_cloze_ids, f"{poem['id']}: duplicate cloze id {question_id}")
            seen_cloze_ids.add(question_id)
            line_index = question.get("line")
            check(
                isinstance(line_index, int) and 0 <= line_index < len(poem.get("lines", [])),
                f"{question_id}: invalid poem line index",
            )
            reconstructed = f"{question.get('before', '')}{question.get('answer', '')}{question.get('after', '')}"
            if isinstance(line_index, int) and 0 <= line_index < len(poem.get("lines", [])):
                check(
                    reconstructed == poem["lines"][line_index],
                    f"{question_id}: cloze does not reconstruct its source line",
                )
            options = [question.get("answer"), *question.get("distractors", [])]
            check(len(options) == len(set(options)), f"{question_id}: duplicate cloze options")
            check(len(question.get("distractors", [])) >= 2, f"{question_id}: fewer than two cloze distractors")

check(english_books >= 12, "all 12 English books must be present")
check(english_items >= 1200, f"English corpus is incomplete: {english_items} < 1200")
check(pinyin_items >= 40, f"pinyin corpus is incomplete: {pinyin_items} < 40")
chinese_books = [
    json.loads((ROOT / relative_path).read_text(encoding="utf-8"))
    for relative_path in pack_paths
    if relative_path.startswith("data/G") and "语文-" in relative_path and "拼音" not in relative_path
]
check(len(chinese_books) >= 12, f"Chinese books are incomplete: {len(chinese_books)} < 12")
chinese_items = sum(
    1
    for pack in chinese_books
    for _, _item in lesson_items(pack)
)
check(chinese_items >= 3000, f"Chinese character/word corpus is incomplete: {chinese_items} < 3000")
check(poetry_levels == 48, f"poetry levels incomplete: {poetry_levels} != 48")
check(poetry_variants == 384, f"poetry variants incomplete: {poetry_variants} != 384")

for required in [
    "vendor/phaser/phaser.min.js",
    "assets/kenney/characters/adventurer-idle.png",
    "assets/kenney/characters/adventurer-run1.png",
    "assets/kenney/characters/adventurer-hurt.png",
    "assets/kenney/characters/adventurer-cheer0.png",
    "assets/kenney/platformer/background_color_trees.png",
    "assets/kenney/platformer/terrain_grass_block_top.png",
    "assets/kenney/ui/button-rectangle-blue.png",
    "assets/kenney/particles/star.png",
    "audio/kenney/switch_002.ogg",
    "audio/kenney/confirmation_002.ogg",
    "audio/kenney/error_004.ogg",
    "audio/kenney/result.ogg",
    "assets/kenney/licenses/Toon-Characters-License.txt",
    "assets/kenney/licenses/New-Platformer-Pack-License.txt",
    "assets/kenney/licenses/UI-Pack-License.txt",
    "assets/kenney/licenses/Particle-Pack-License.txt",
    "assets/kenney/licenses/Interface-Sounds-License.txt",
    "assets/kenney/licenses/Music-Jingles-License.txt",
    "assets/spirits/New-Platformer-Pack-License.txt",
    "assets/spirits/manifest.json",
    "assets/spirits/kenney/slime_normal_rest.png",
    "assets/spirits/kenney/slime_normal_walk_a.png",
    "assets/spirits/kenney/slime_normal_walk_b.png",
    "docs/licenses/guanchunsheng-english-MIT.txt",
    "docs/licenses/xuepinyin-MIT.txt",
    "docs/licenses/dictation-robot-MIT.txt",
]:
    check((ROOT / required).exists(), f"missing asset {required}")

for license_path in [
    "docs/licenses/guanchunsheng-english-MIT.txt",
    "docs/licenses/xuepinyin-MIT.txt",
]:
    text = (ROOT / license_path).read_text(encoding="utf-8")
    check("MIT" in text or "Permission is hereby granted" in text, f"{license_path}: not MIT")

if ERRORS:
    print("CONTENT VALIDATION FAILED")
    for error in ERRORS:
        print(f"- {error}")
    raise SystemExit(1)

print("CONTENT VALIDATION PASSED")
print(f"Packs: {len(pack_paths)}")
print(f"English books: {english_books}")
print(f"English items: {english_items}")
print(f"Pinyin items: {pinyin_items}")
print(f"Chinese books: {len(chinese_books)}")
print(f"Chinese items: {chinese_items}")
print(f"Total items: {total_items}")
print(f"Poetry levels: {poetry_levels}")
print(f"Poetry variants: {poetry_variants}")
