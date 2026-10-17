"""Compose the APP review screenshots for rapid multiview inspection."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--catalog", default="scripts/mascot-models/meshy/accessory-catalog-v1.json")
args = parser.parse_args()

root = Path(args.input).resolve()
catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))["accessories"]
font_path = Path("C:/Windows/Fonts/arial.ttf")
font = ImageFont.truetype(str(font_path), 22) if font_path.exists() else ImageFont.load_default()
angles = (0, 90, 180, 270)
cell_width, cell_height = 210, 250
label_height = 34
group_width = cell_width * len(angles)
group_height = cell_height + label_height
sheet = Image.new("RGB", (group_width * 2, group_height * ((len(catalog) + 1) // 2)), "#eaf6fb")
draw = ImageDraw.Draw(sheet)

for index, item in enumerate(catalog):
    group_x = (index % 2) * group_width
    group_y = (index // 2) * group_height
    draw.text((group_x + 10, group_y + 5), f"{index + 1:02d}  {item['slug']}", fill="#092a49", font=font)
    for angle_index, angle in enumerate(angles):
        image = Image.open(root / f"{item['slug']}-{angle:03d}.png").convert("RGB")
        image.thumbnail((cell_width, cell_height - label_height), Image.Resampling.LANCZOS)
        x = group_x + angle_index * cell_width + (cell_width - image.width) // 2
        y = group_y + label_height + (cell_height - label_height - image.height) // 2
        sheet.paste(image, (x, y))

sheet.save(root / "all-models-four-angles.jpg", quality=92, subsampling=0)
print(root / "all-models-four-angles.jpg")
