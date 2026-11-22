from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "docs" / "screenshots"
OUTPUT = SCREENSHOTS / "runner-six-themes-contact-sheet.png"
MAP_OUTPUT = SCREENSHOTS / "map-six-themes-contact-sheet.png"

THEMES = [
    ("forest", "森林"),
    ("stream", "溪谷"),
    ("mountain", "山谷"),
    ("orchard", "果园"),
    ("coast", "海岸"),
    ("snow", "雪原"),
]
STAGES = ["阶段 1", "阶段 2", "阶段 3"]

CELL = (430, 242)
LABEL_WIDTH = 94
GAP = 18
TOP = 78


def load_font(size: int):
    for path in (
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    ):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main():
    width = LABEL_WIDTH + len(STAGES) * (CELL[0] + GAP) + GAP
    height = TOP + len(THEMES) * (CELL[1] + GAP)
    sheet = Image.new("RGB", (width, height), "#f4f1e8")
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(24)
    label_font = load_font(19)
    stage_font = load_font(16)

    draw.text((24, 17), "森林寻宝记 · 六主题 × 三阶段实际截图", fill="#243c2d", font=title_font)
    for column, stage in enumerate(STAGES):
        x = LABEL_WIDTH + GAP + column * (CELL[0] + GAP)
        draw.text((x + 8, 48), stage, fill="#657465", font=stage_font)

    for row, (theme_id, theme_name) in enumerate(THEMES):
        y = TOP + row * (CELL[1] + GAP)
        draw.text((18, y + CELL[1] / 2 - 14), theme_name, fill="#294435", font=label_font)
        for column in range(len(STAGES)):
            path = SCREENSHOTS / f"runner-{theme_id}-stage{column}-1366x768.png"
            image = Image.open(path).convert("RGB")
            image.thumbnail(CELL, Image.Resampling.LANCZOS)
            x = LABEL_WIDTH + GAP + column * (CELL[0] + GAP)
            frame_y = y + (CELL[1] - image.height) // 2
            sheet.paste(image, (x, frame_y))
            draw.rounded_rectangle(
                (x - 1, frame_y - 1, x + image.width, frame_y + image.height),
                radius=5,
                outline="#c9d2c4",
                width=1,
            )

    sheet.save(OUTPUT, optimize=True)
    print(OUTPUT)

    map_cell = (500, 281)
    map_width = len(THEMES[:3]) * (map_cell[0] + GAP) + GAP
    map_height = TOP + 2 * (map_cell[1] + GAP + 24)
    map_sheet = Image.new("RGB", (map_width, map_height), "#f4f1e8")
    map_draw = ImageDraw.Draw(map_sheet)
    map_draw.text((24, 17), "教材冒险地图 · 六区域实际资产截图", fill="#243c2d", font=title_font)
    for index, (theme_id, theme_name) in enumerate(THEMES):
        column = index % 3
        row = index // 3
        x = GAP + column * (map_cell[0] + GAP)
        y = TOP + row * (map_cell[1] + GAP + 24)
        map_draw.text((x, y - 24), theme_name, fill="#294435", font=stage_font)
        image = Image.open(SCREENSHOTS / f"map-{theme_id}-1366x768.png").convert("RGB")
        image.thumbnail(map_cell, Image.Resampling.LANCZOS)
        map_sheet.paste(image, (x, y))
        map_draw.rounded_rectangle(
            (x - 1, y - 1, x + image.width, y + image.height),
            radius=5,
            outline="#c9d2c4",
            width=1,
        )
    map_sheet.save(MAP_OUTPUT, optimize=True)
    print(MAP_OUTPUT)


if __name__ == "__main__":
    main()
