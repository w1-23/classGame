import json
import re
import urllib.request
from pathlib import Path

from pypinyin import Style, pinyin


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LICENSES = ROOT / "docs" / "licenses"

ENGLISH_SOURCE = "https://raw.githubusercontent.com/guanchunsheng/guanyiyi-english/main/english-data.txt"
ENGLISH_LICENSE = "https://raw.githubusercontent.com/guanchunsheng/guanyiyi-english/main/LICENSE"
PINYIN_SOURCE = "https://raw.githubusercontent.com/caopengfei/xuepinyin/main/app/src/main/assets/lessons.json"
PINYIN_LICENSE = "https://raw.githubusercontent.com/caopengfei/xuepinyin/main/LICENSE"
CHINESE_SOURCE = "https://raw.githubusercontent.com/athenayan123-web/dictation-robot/main/server/data/chinese_textbook.json"
CHINESE_LICENSE = "https://raw.githubusercontent.com/athenayan123-web/dictation-robot/main/LICENSE"
CHINESE_SOURCE_LABEL = "athenayan123-web/dictation-robot (MIT)"

GRADE_NUMBERS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}
CHINESE_BOOK_CODES = {
    ("一", "上册"): "g1-chinese-a",
    ("一", "下册"): "g1-chinese-b",
    ("二", "上册"): "g2-chinese-a",
    ("二", "下册"): "g2-chinese-b",
    ("三", "上册"): "g3-chinese-a",
    ("三", "下册"): "g3-chinese-b",
    ("四", "上册"): "g4-chinese-a",
    ("四", "下册"): "g4-chinese-b",
    ("五", "上册"): "g5-chinese-a",
    ("五", "下册"): "g5-chinese-b",
    ("六", "上册"): "g6-chinese-a",
    ("六", "下册"): "g6-chinese-b",
}


def fetch_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "classGame-curriculum-import"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def write_json(path, payload):
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_english(source):
    books = []
    book = None
    unit = None
    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        book_match = re.fullmatch(r"([一二三四五六])年级([上下])册", line)
        if book_match:
            grade = GRADE_NUMBERS[book_match.group(1)]
            volume = book_match.group(2)
            book = {
                "grade": grade,
                "volume": volume,
                "units": [],
            }
            books.append(book)
            unit = None
            continue
        unit_match = re.fullmatch(r"Unit\s+(.+)", line)
        if unit_match and book is not None:
            unit = {
                "title": f"Unit {unit_match.group(1)}",
                "words": [],
            }
            book["units"].append(unit)
            continue
        if "|" in line and unit is not None:
            english, chinese = [part.strip() for part in line.split("|", 1)]
            if english and chinese:
                unit["words"].append((english, chinese))
    return books


def build_english_packs(books):
    manifest = []
    for book_index, book in enumerate(books, start=1):
        grade = book["grade"]
        volume = book["volume"]
        is_pep_g3a = grade == 3 and volume in {"上", "上册"}
        pack_id = "g3-english-basic" if is_pep_g3a else f"en-book-{book_index:02d}"
        pack_name = f"{grade}年级{volume}英语 · 开源同步词表"
        units = []
        seen_pairs = set()
        for unit_index, unit in enumerate(book["units"], start=1):
            words = unit["words"]
            all_english = [english for english, _ in words]
            items = []
            for word_index, (english, chinese) in enumerate(words, start=1):
                pair = (chinese, english)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                distractors = [
                    candidate for candidate in all_english
                    if candidate != english
                ]
                distractors = list(dict.fromkeys(distractors))[:2]
                while len(distractors) < 2:
                    distractors.append(f"word{len(distractors) + 1}")
                items.append({
                    "id": f"{pack_id}-u{unit_index:02d}-w{word_index:02d}",
                    "prompt": chinese,
                    "correct": english,
                    "distractors": distractors,
                    "audio": None,
                    "speechText": english,
                    "speechLang": "en-US",
                    "games": ["runner", "listen", "assemble", "memory"],
                    "source": "guanchunsheng/guanyiyi-english (MIT)",
                    "reviewed": False,
                    "lesson": unit_index,
                })
            lessons = []
            for lesson_index, start in enumerate(range(0, len(items), 6), start=1):
                group = items[start:start + 6]
                if not group:
                    continue
                lessons.append({
                    "id": f"u{unit_index:02d}-l{lesson_index:02d}",
                    "title": f"词汇 {lesson_index}",
                    "items": group,
                })
            units.append({
                "id": f"u{unit_index:02d}",
                "title": unit["title"],
                "note": f"{grade}年级{volume} · {unit['title']}",
                "lessons": lessons,
            })
        pack = {
            "id": pack_id,
            "name": pack_name,
            "subject": "英语",
            "grade": grade,
            "volume": volume,
            "edition": "开源同步词表（需按学校教材核对）",
            "units": units,
            "items": [],
        }
        filename = f"{grade}年级{volume}英语-开源词表.json"
        write_json(DATA / filename, pack)
        manifest.append(f"data/{filename}")
    return manifest


def build_pinyin_pack(source):
    payload = json.loads(source)
    all_letters = [
        letter
        for lesson in payload["lessons"]
        for letter in lesson.get("letters", [])
    ]
    units = []
    for unit in payload["units"]:
        lessons = []
        for lesson in payload["lessons"]:
            if lesson["unitId"] != unit["id"]:
                continue
            items = []
            for index, letter in enumerate(lesson.get("letters", []), start=1):
                prompt = letter.get("sceneWord") or letter.get("mnemonic") or letter["pinyin"]
                candidates = [
                    other["pinyin"]
                    for other in all_letters
                    if other["pinyin"] != letter["pinyin"]
                ]
                distractors = []
                for candidate in candidates:
                    if candidate not in distractors:
                        distractors.append(candidate)
                    if len(distractors) == 2:
                        break
                items.append({
                    "id": f"py-u{unit['id']}-l{lesson['id']}-{index:02d}",
                    "prompt": prompt,
                    "correct": letter["pinyin"],
                    "distractors": distractors,
                    "audio": None,
                    "speechText": letter.get("mnemonic") or letter["pinyin"],
                    "speechLang": "zh-CN",
                    "games": ["runner", "listen", "assemble", "memory"],
                    "source": "caopengfei/xuepinyin (MIT)",
                "reviewed": False,
                })
            lessons.append({
                "id": f"pinyin-{lesson['id']:02d}",
                "title": f"第 {lesson['id']} 课 · {lesson['title']}",
                "items": items,
            })
        units.append({
            "id": f"pinyin-unit-{unit['id']}",
            "title": unit["title"],
        "note": f"第三方拼音数据 · {unit['title']}（未声明教材版次）",
            "lessons": lessons,
        })
    pack = {
        "id": "g1-chinese-pinyin",
        "name": "一年级上册语文 · 旧版拼音练习",
        "subject": "语文",
        "grade": 1,
        "volume": "上册",
        "edition": "第三方拼音数据（未声明教材版次）",
        "alignmentStatus": "legacy_unverified",
        "notes": "导入器不会把第三方词表标为新版教材；仍含旧版 i u ü y w 合课。",
        "units": units,
        "items": [],
    }
    filename = "G1-语文-拼音上册.json"
    write_json(DATA / filename, pack)
    return f"data/{filename}"


def clean_word(value):
    return re.sub(r"\s+", "", str(value or "")).strip()


def pronunciation(value):
    syllables = pinyin(value, style=Style.TONE, heteronym=False)
    return "".join(syllable[0] for syllable in syllables if syllable)


def unique_values(values):
    return list(dict.fromkeys(value for value in values if value))


def build_chinese_packs(payload):
    manifest = []
    for book in payload.get("grades", []):
        match = re.fullmatch(r"([一二三四五六])年级(上册|下册)", book.get("grade", ""))
        if not match:
            continue
        grade_label, volume = match.groups()
        grade = GRADE_NUMBERS[grade_label]
        pack_id = CHINESE_BOOK_CODES[(grade_label, volume)]
        seen_words = set()
        pronunciation_pool = []
        source_units = []
        for unit in book.get("units", []):
            for lesson in unit.get("lessons", []):
                for raw_word in lesson.get("words", []):
                    word = clean_word(raw_word)
                    if not word or word in seen_words:
                        continue
                    seen_words.add(word)
                    pronunciation_pool.append({
                        "word": word,
                        "pinyin": pronunciation(word),
                        "length": len(word),
                    })
        pronunciation_pool = [entry for entry in pronunciation_pool if entry["pinyin"]]
        global_answers = unique_values(entry["pinyin"] for entry in pronunciation_pool)

        word_count = 0
        lesson_count = 0
        for unit_index, unit in enumerate(book.get("units", []), start=1):
            unit_id = f"{pack_id}-u{unit_index:02d}"
            lessons = []
            for lesson_index, lesson in enumerate(unit.get("lessons", []), start=1):
                title = str(lesson.get("title") or f"第 {lesson_index} 课").strip()
                words = unique_values(clean_word(word) for word in lesson.get("words", []))
                words = [word for word in words if word]
                if not words:
                    continue
                lesson_count += 1
                for group_index, start in enumerate(range(0, len(words), 8), start=1):
                    group = words[start:start + 8]
                    items = []
                    for word_index, word in enumerate(group, start=1):
                        correct = pronunciation(word)
                        if not correct:
                            continue
                        local_candidates = [
                            entry["pinyin"]
                            for entry in pronunciation_pool
                            if entry["length"] == len(word) and entry["pinyin"] != correct
                        ]
                        distractors = unique_values(local_candidates)[:2]
                        if len(distractors) < 2:
                            distractors.extend(
                                answer for answer in global_answers
                                if answer != correct and answer not in distractors
                            )
                        distractors = distractors[:2]
                        if len(distractors) < 2:
                            continue
                        items.append({
                            "id": f"{unit_id}-l{lesson_index:02d}-g{group_index:02d}-{word_index:02d}",
                            "prompt": word,
                            "correct": correct,
                            "distractors": distractors,
                            "audio": None,
                            "speechText": word,
                            "speechLang": "zh-CN",
                            "games": ["runner", "listen", "assemble", "memory"],
                            "source": CHINESE_SOURCE_LABEL,
                            "reviewed": False,
                            "kind": "character" if len(word) == 1 else "word",
                        })
                        word_count += 1
                    if not items:
                        continue
                    suffix = f" · 第 {group_index} 组" if len(words) > 8 else ""
                    lessons.append({
                        "id": f"{unit_id}-l{lesson_index:02d}-g{group_index:02d}",
                        "title": f"{title}{suffix}",
                        "items": items,
                    })
            if lessons:
                source_units.append({
                    "id": unit_id,
                    "title": str(unit.get("title") or f"第 {unit_index} 单元").strip(),
                    "note": f"{grade_label}年级{volume} · 人教版（部编版）字词同步",
                    "lessons": lessons,
                })

        pack = {
            "id": pack_id,
            "name": f"{grade_label}年级{volume}语文 · 字词同步",
            "subject": "语文",
            "grade": grade,
            "volume": volume,
            "edition": "人教版（部编版）字词同步",
            "coverage": {
                "books": 1,
                "units": len(source_units),
                "lessons": lesson_count,
                "items": word_count,
                "content": "课文标题、生字与词语；不含受版权保护的课文原文",
            },
            "units": source_units,
            "items": [],
        }
        filename = f"G{grade}-语文-{volume}.json"
        write_json(DATA / filename, pack)
        manifest.append(f"data/{filename}")
    return manifest


def main():
    DATA.mkdir(exist_ok=True)
    LICENSES.mkdir(parents=True, exist_ok=True)
    english_text = fetch_text(ENGLISH_SOURCE)
    pinyin_text = fetch_text(PINYIN_SOURCE)
    chinese_text = fetch_text(CHINESE_SOURCE)
    (LICENSES / "guanchunsheng-english-MIT.txt").write_text(
        fetch_text(ENGLISH_LICENSE), encoding="utf-8"
    )
    (LICENSES / "xuepinyin-MIT.txt").write_text(
        fetch_text(PINYIN_LICENSE), encoding="utf-8"
    )
    (LICENSES / "dictation-robot-MIT.txt").write_text(
        fetch_text(CHINESE_LICENSE), encoding="utf-8"
    )
    english_manifest = build_english_packs(parse_english(english_text))
    pinyin_path = build_pinyin_pack(pinyin_text)
    chinese_manifest = build_chinese_packs(json.loads(chinese_text))
    manifest = {
        "packs": [
            *english_manifest,
            pinyin_path,
            *chinese_manifest,
            "data/poetry-cloze-48-v1.json",
        ]
    }
    write_json(DATA / "manifest.json", manifest)
    print(f"Generated {len(english_manifest)} English books")
    print(f"Generated {len(chinese_manifest)} Chinese books")
    print(pinyin_path)
    print("data/manifest.json")


if __name__ == "__main__":
    main()

