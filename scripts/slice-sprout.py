"""Slice the Sprout Lands UI sheets (client/src/assets/sprout/raw) into single PNGs.

Run after changing the raw sheets:  python scripts/slice-sprout.py
Outputs go to client/src/assets/sprout/{icons,panels,buttons,emoji}.
Requires Pillow (pip install pillow).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "client" / "src" / "assets" / "sprout"
RAW = ROOT / "raw"


def cell(sheet: Image.Image, x: int, y: int, w: int, h: int) -> Image.Image:
    return sheet.crop((x, y, x + w, y + h))


def trim(im: Image.Image) -> Image.Image:
    box = im.getbbox()
    return im.crop(box) if box else im


def save(im: Image.Image, rel: str) -> None:
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)


# --- icons: 16px grid, 3 rows x 6 names, three colour variants side by side --------------
NAMES = [
    ["controller", "chat", "skull", "gear", "question", "star"],
    ["exclaim", "dollar", "cart", "podium", "trophy", "crown"],
    ["plus", "minus", "house", "check", "cross", "ban"],
]
icons = Image.open(RAW / "All Icons.png").convert("RGBA")
# The dark block on the sheet is rotated by three columns relative to the other two.
ROTATE = {"pale": 0, "light": 0, "dark": 3}
for vi, variant in enumerate(["pale", "light", "dark"]):
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            col = (c + ROTATE[variant]) % 6
            save(cell(icons, (vi * 6 + col) * 16, r * 16, 16, 16), f"icons/{variant}-{name}.png")
white = Image.open(RAW / "white icons.png").convert("RGBA")
for r, row in enumerate(NAMES):
    for c, name in enumerate(row):
        save(cell(white, c * 16, r * 16, 16, 16), f"icons/white-{name}.png")

# --- panels: Inventory_Blocks_Spritesheet, 3 sizes x 3 shades ------------------------------
blocks = Image.open(RAW / "Inventory_Blocks_Spritesheet.png").convert("RGBA")
COLS = [(3, 42), (51, 42), (99, 42)]  # x, width
ROWS = {"small": (9, 32), "medium": (57, 32), "large": (98, 44)}  # y, height
for size, (y, h) in ROWS.items():
    for shade, (x, w) in zip(["light", "mid", "dark"], COLS):
        save(trim(cell(blocks, x, y, w, h)), f"panels/{size}-{shade}.png")

# --- buttons: Square Buttons 26x26, column 0 = up (26x28 incl. shadow), column 1 = pressed --
# The pressed tile is 26x26; it is padded to 26x28 with transparent rows at the bottom so both
# states share one border-image slice (3 3 6 3) and swapping them does not move the layout.
btns = Image.open(RAW / "Square Buttons 26x26.png").convert("RGBA")
BX = [11, 59]
BY = [11, 59, 107, 155]
for r, shade in enumerate(["grey", "cream", "tan", "brown"]):
    for c, state in enumerate(["up", "down"]):
        tile = trim(cell(btns, BX[c], BY[r], 26, 28))
        padded = Image.new("RGBA", (26, 28), (0, 0, 0, 0))
        padded.paste(tile, (0, 0))
        save(padded, f"buttons/{shade}-{state}.png")

# --- emoji: ~28px sprites on a 32px pitch (not exact), cropped per cell and trimmed ---------
emoji = Image.open(RAW / "Emoji_Spritesheet_Free.png").convert("RGBA")
EMOJI = {  # name: (col, row) on the 32px pitch
    "cat-green": (0, 2), "cat-lime": (1, 2), "cat-yellow": (2, 2), "cat-orange": (3, 2), "cat-red": (4, 2),
    "cat-pink": (0, 3), "cat-purple": (1, 3), "cat-skull": (2, 3), "cat-blue": (3, 3), "cat-cry": (4, 3),
    "bunny": (0, 4), "bunny-smile": (1, 4), "bunny-happy": (2, 4), "bunny-blush": (3, 4),
    "bunny-check": (0, 5), "bunny-thumb": (1, 5), "bunny-exclaim": (2, 5), "bunny-love": (3, 5), "bunny-cross": (4, 5),
    "bunny-question": (0, 6), "bunny-dizzy": (1, 6), "bunny-sleep": (2, 6), "bunny-sweat": (3, 6),
    "check": (0, 7), "cross": (1, 7), "exclaim": (2, 7), "question": (3, 7), "zzz": (4, 7),
    "note": (0, 8), "coin": (1, 8), "hearts": (2, 8), "heart": (3, 8), "star": (4, 8),
    "thumb-up": (0, 9), "thumb-down": (1, 9),
    "sprout": (0, 12), "flower": (1, 12), "clover": (2, 12), "mushroom": (3, 12),
    "apple": (0, 13), "leaf": (1, 13), "tomato": (2, 13), "corn": (3, 13), "carrot": (4, 13),
    "tree": (0, 14), "bush": (1, 14), "rock": (4, 14),
    "hammer": (0, 16), "axe": (1, 16), "watering-can": (2, 16),
    "chicken": (0, 17), "chick": (1, 17), "cow": (2, 17), "calf": (3, 17),
    "sun": (0, 18), "cloud": (1, 18), "rain": (2, 18), "sun-face": (3, 18), "moon": (4, 18),
}
for name, (c, r) in EMOJI.items():
    save(trim(cell(emoji, c * 32, r * 32, 32, 32)), f"emoji/{name}.png")

# --- bunny character ("Teemo"): 32x32 frames, one animation per row --------------------------
# Each strip is saved as a horizontal film strip; PxSprite.vue steps through it with CSS.
teemo = Image.open(RAW / "Teemo emotes.png").convert("RGBA")
STRIPS = {  # name: [(col, row), ...]
    "bunny-idle": [(0, 0), (0, 0), (0, 0), (0, 1), (1, 1), (0, 0), (0, 0), (0, 2), (1, 2), (2, 2), (3, 2), (4, 2)],
    "bunny-happy": [(0, 3), (1, 3), (2, 3), (3, 3)],
    "bunny-love": [(0, 4), (1, 4), (0, 5), (1, 5)],
    "bunny-cool": [(0, 8), (1, 8)],
    "bunny-angry": [(0, 9), (1, 9), (0, 10), (1, 10)],
    "bunny-surprised": [(0, 11), (1, 11)],
    "bunny-sleep": [(0, 13), (1, 13)],
    "bunny-dizzy": [(0, 14)],
}
for name, frames in STRIPS.items():
    strip = Image.new("RGBA", (32 * len(frames), 32), (0, 0, 0, 0))
    for k, (c, r) in enumerate(frames):
        strip.paste(cell(teemo, c * 32, r * 32, 32, 32), (32 * k, 0))
    save(strip, f"sprites/{name}.png")

print("sliced into", ROOT)
