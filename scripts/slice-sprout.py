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

print("sliced into", ROOT)
