from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "docs" / "screenshots"
OUTPUT = SCREENSHOTS / "0.6.0-pages-overview.png"

PAGES = [
    ("游戏大厅", "home-1366x768.png"),
    ("班级模式", "class-lobby.png"),
    ("教材关卡地图", "map-1366x768.png"),
    ("诗词 48 关地图", "map-poetry-48.png"),
    ("森林寻宝记", "mode-runner.png"),
    ("听音找精灵", "mode-listen.png"),
    ("答对后精灵出场", "listen-spirit.png"),
    ("拼音 / 单词拼装", "mode-assemble.png"),
    ("记忆翻牌配对", "mode-memory.png"),
    ("翻牌分波与锁定", "memory-locked.png"),
    ("诗词填空", "mode-beat.png"),
    ("小组知识守护战", "mode-battle.png"),
    ("答对反馈", "runner-correct-feedback.png"),
    ("答错反馈", "runner-wrong-feedback.png"),
    ("暂停", "runner-pause.png"),
    ("抵达终点", "runner-complete-1366x768.png"),
    ("本关结算", "runner-result.png"),
    ("设置", "settings-dialog.png"),
    ("本机存档", "backup-dialog.png"),
    ("手机竖屏地图", "map-390x844.png"),
]

CELL = (400, 225)
LABEL_HEIGHT = 34
GAP = 18
COLUMNS = 3
TOP = 78
LEFT = 22


def load_font(size: int):
    for path in (
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    ):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main():
    rows = (len(PAGES) + COLUMNS - 1) // COLUMNS
    width = LEFT * 2 + COLUMNS * CELL[0] + (COLUMNS - 1) * GAP
    height = TOP + rows * (CELL[1] + LABEL_HEIGHT + GAP)
    sheet = Image.new("RGB", (width, height), "#f4f1e8")
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(25)
    label_font = load_font(17)

    draw.text((LEFT, 18), "学习闯关乐园 0.6.0 · 全部前端页面实际截图", fill="#243c2d", font=title_font)
    draw.text(
        (LEFT, 50),
        "静态截图 · 1366×768，另有手机竖屏页；无录屏",
        fill="#68766b",
        font=load_font(14),
    )

    for index, (label, filename) in enumerate(PAGES):
        row = index // COLUMNS
        column = index % COLUMNS
        x = LEFT + column * (CELL[0] + GAP)
        y = TOP + row * (CELL[1] + LABEL_HEIGHT + GAP)
        image = Image.open(SCREENSHOTS / filename).convert("RGB")
        image.thumbnail(CELL, Image.Resampling.LANCZOS)
        frame_x = x + (CELL[0] - image.width) // 2
        frame_y = y + (CELL[1] - image.height) // 2
        sheet.paste(image, (frame_x, frame_y))
        draw.rounded_rectangle(
            (frame_x - 1, frame_y - 1, frame_x + image.width, frame_y + image.height),
            radius=5,
            outline="#c9d2c4",
            width=1,
        )
        draw.text((x, y + CELL[1] + 7), label, fill="#294435", font=label_font)

    sheet.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
