import json
from pathlib import Path

from pypinyin import Style, pinyin


ROOT = Path(__file__).resolve().parents[1]
PACKS = [
    ROOT / "data" / "G1-语文-拼音识字.json",
    ROOT / "data" / "G3-英语-基础词汇听力.json",
    ROOT / "data" / "古诗-常见篇目朗读.json",
]
ERRORS = []


def check(condition, message):
    if not condition:
        ERRORS.append(message)


for pack_path in PACKS:
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    review_markers = [item.get("reviewed") for item in pack.get("items", [])]
    review_markers.extend(poem.get("reviewed") for poem in pack.get("poems", []))
    check(bool(review_markers), f"{pack_path.name}: missing review marker")
    for item in pack.get("items", []):
        options = [item["correct"], *item["distractors"]]
        check(len(options) == len(set(options)), f"{item['id']}: duplicate options")
        check(len(item["distractors"]) >= 2, f"{item['id']}: fewer than two distractors")
        check(Path(ROOT / item["audio"]).exists(), f"{item['id']}: missing audio {item['audio']}")
        check(item["correct"].strip(), f"{item['id']}: empty answer")
        if pack_path.name.startswith("G1"):
            generated = pinyin(item["prompt"], style=Style.TONE)[0][0]
            check(generated == item["correct"], f"{item['id']}: pinyin mismatch {generated} != {item['correct']}")
        if item.get("games"):
            check(set(item["games"]).issubset({"runner", "listen", "assemble", "memory"}), f"{item['id']}: invalid game mapping")
    seen_prompts = []
    for item in pack.get("items", []):
        check(item["prompt"] not in seen_prompts, f"{item['id']}: duplicate prompt")
        seen_prompts.append(item["prompt"])
    for poem in pack.get("poems", []):
        check(Path(ROOT / poem["audio"]).exists(), f"{poem['id']}: missing audio {poem['audio']}")
        check(poem.get("reviewed") is True, f"{poem['id']}: not reviewed")
        check(len(poem.get("lines", [])) >= 2, f"{poem['id']}: poem lines incomplete")

for required in [
    "audio/sfx/click_001.ogg",
    "audio/sfx/confirmation_001.ogg",
    "audio/sfx/error_001.ogg",
    "audio/music/jingles_PIZZI00.ogg",
    "assets/mascot-idle.svg",
    "assets/mascot-run.svg",
    "assets/mascot-celebrate.svg",
    "assets/mascot-jump.svg",
    "assets/mascot-surprise.svg",
    "assets/mascot-miss.svg",
    "assets/mascot-wave.svg",
]:
    check((ROOT / required).exists(), f"missing asset {required}")

if ERRORS:
    print("CONTENT VALIDATION FAILED")
    for error in ERRORS:
        print(f"- {error}")
    raise SystemExit(1)

print("CONTENT VALIDATION PASSED")
print(f"Packs: {len(PACKS)}")
print(f"Items: {sum(len(json.loads(path.read_text(encoding='utf-8')).get('items', [])) for path in PACKS)}")
