from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "kenney" / "characters" / "adventurer-cheer0.png"
OUTPUT_DIR = ROOT / "build"
SIZE = 256


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    background = Image.new("RGBA", (SIZE, SIZE), "#69c9f4")
    pixels = background.load()
    for y in range(SIZE):
        ratio = y / (SIZE - 1)
        top = (78, 184, 237)
        bottom = (231, 249, 255)
        color = tuple(round(top[index] * (1 - ratio) + bottom[index] * ratio) for index in range(3))
        for x in range(SIZE):
            pixels[x, y] = (*color, 255)

    draw = ImageDraw.Draw(background)
    draw.ellipse((150, -54, 298, 94), fill=(255, 226, 104, 235))
    draw.ellipse((-58, 184, 92, 334), fill=(65, 190, 107, 230))
    draw.ellipse((-24, 206, 176, 322), fill=(134, 221, 112, 185))
    background.putalpha(rounded_mask(SIZE, 54))
    canvas.alpha_composite(background)

    hero = Image.open(SOURCE).convert("RGBA")
    target_height = 214
    target_width = round(hero.width * target_height / hero.height)
    hero = hero.resize((target_width, target_height), Image.Resampling.NEAREST)
    left = (SIZE - target_width) // 2
    top = SIZE - target_height - 8
    canvas.alpha_composite(hero, (left, top))

    canvas.save(OUTPUT_DIR / "icon.png")
    canvas.save(
        OUTPUT_DIR / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(OUTPUT_DIR / "icon.ico")


if __name__ == "__main__":
    main()
