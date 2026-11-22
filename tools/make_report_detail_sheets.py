from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "docs" / "screenshots"

SHEETS = {
    "0.5.0-games-detail.png": [
        ("森林寻宝记", "mode-runner.png"),
        ("听音找精灵", "mode-listen.png"),
        ("拼音 / 单词拼装", "mode-assemble.png"),
        ("记忆翻牌配对", "mode-memory.png"),
        ("诗词填空闯关", "mode-beat.png"),
        ("小组知识守护战", "mode-battle.png"),
    ],
    "0.5.0-flow-detail.png": [
        ("游戏大厅", "home-1366x768.png"),
        ("班级模式", "class-lobby.png"),
        ("教材关卡地图", "map-1366x768.png"),
        ("答对反馈", "runner-correct-feedback.png"),
        ("答错反馈", "runner-wrong-feedback.png"),
        ("暂停", "runner-pause.png"),
        ("抵达终点", "runner-complete-1366x768.png"),
        ("本关结算", "runner-result.png"),
        ("设置", "settings-dialog.png"),
        ("本机存档", "backup-dialog.png"),
        ("手机竖屏地图", "map-390x844.png"),
    ],
}

CELL = (640, 360)
LABEL_HEIGHT = 34
GAP = 20
COLUMNS = 2
TOP = 72
LEFT = 24


def load_font(size: int):
    for path in (
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    ):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def make_sheet(title: str, pages: list[tuple[str, str]], output: Path):
    rows = (len(pages) + COLUMNS - 1) // COLUMNS
    width = LEFT * 2 + COLUMNS * CELL[0] + (COLUMNS - 1) * GAP
    height = TOP + rows * (CELL[1] + LABEL_HEIGHT + GAP)
    sheet = Image.new("RGB", (width, height), "#f4f1e8")
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(25)
    label_font = load_font(18)
    draw.text((LEFT, 18), title, fill="#243c2d", font=title_font)

    for index, (label, filename) in enumerate(pages):
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
        draw.text((x, y + CELL[1] + 6), label, fill="#294435", font=label_font)

    sheet.save(output, optimize=True)
    print(output)


def main():
    make_sheet(
        "学习闯关乐园 0.5.0 · 六种玩法实际截图",
        SHEETS["0.5.0-games-detail.png"],
        SCREENSHOTS / "0.5.0-games-detail.png",
    )
    make_sheet(
        "学习闯关乐园 0.5.0 · 页面流程与关键状态",
        SHEETS["0.5.0-flow-detail.png"],
        SCREENSHOTS / "0.5.0-flow-detail.png",
    )


if __name__ == "__main__":
    main()
