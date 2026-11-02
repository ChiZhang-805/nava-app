"""Create transparent wardrobe fronts without repainting the approved artwork.

The segmentation model supplies alpha only. Every RGB pixel in the output is
copied from its matching source pixel so the cat, accessory, lighting and
texture stay identical to the approved frontal image.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image
from PIL import ImageChops
from rembg import new_session, remove


FRONTS = (
    ("01_无配饰_正面.png", "accessory-none.png"),
    ("02_铃铛项圈_正面.png", "accessory-bell-collar.png"),
    ("03_云蓝围巾_正面.png", "accessory-cloud-scarf.png"),
    ("04_雾紫贝雷帽_正面.png", "accessory-mist-beret.png"),
    ("05_星月发夹_正面.png", "accessory-star-moon-clip.png"),
    ("06_珍珠领结_正面.png", "accessory-pearl-bow.png"),
    ("07_薄荷耳罩_正面.png", "accessory-mint-earmuffs.png"),
    ("08_蜂蜜围脖_正面.png", "accessory-honey-neck-warmer.png"),
    ("09_云朵背包_正面.png", "accessory-cloud-backpack.png"),
    ("10_小鱼胸针_正面.png", "accessory-fish-brooch.png"),
    ("11_月桂花冠_正面.png", "accessory-laurel-crown.png"),
    ("12_海盐水手帽_正面.png", "accessory-sailor-hat.png"),
    ("13_樱桃蝴蝶结_正面.png", "accessory-cherry-bow.png"),
    ("14_星星眼镜_正面.png", "accessory-star-glasses.png"),
    ("15_雨滴斗篷_正面.png", "accessory-raindrop-cape.png"),
    ("16_极光围巾_正面.png", "accessory-aurora-scarf.png"),
    ("17_晨露铃兰_正面.png", "accessory-lily-garland.png"),
    ("18_夜航小帽_正面.png", "accessory-night-voyage-cap.png"),
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    session = new_session("u2netp")
    base_alpha: Image.Image | None = None

    for source_name, output_name in FRONTS:
        source_path = args.source / source_name
        original = Image.open(source_path).convert("RGBA")
        segmented = remove(
            original,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=235,
            alpha_matting_background_threshold=15,
            alpha_matting_erode_size=3,
        ).convert("RGBA")
        alpha = segmented.getchannel("A")
        if base_alpha is None:
            base_alpha = alpha.copy()
        elif output_name == "accessory-honey-neck-warmer.png":
            # The bright orange neck warmer can make the compact model classify
            # the white lower body as background. The approved cat silhouette is
            # pixel aligned across this pair, so retain that known cat mask and
            # union it with the accessory-specific mask.
            alpha = ImageChops.lighter(alpha, base_alpha)
        original.putalpha(alpha)
        original.save(args.output / output_name, optimize=True)
        print(output_name)


if __name__ == "__main__":
    main()
