"""Remove the duplicated middle eye baked into the mist-beret texture.

The repair is intentionally limited to the verified UV island rectangle that
contains the unwanted stroke. It preserves the two real eye arcs, nose, hat,
fur, and every other atlas island.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


REPAIR_BOX_AT_1536 = (501, 1101, 586, 1202)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-texture", required=True)
    parser.add_argument("--output-texture", required=True)
    parser.add_argument("--report")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_path = Path(args.input_texture).resolve()
    output_path = Path(args.output_texture).resolve()
    source = np.array(Image.open(source_path).convert("RGB"))
    height, width = source.shape[:2]
    sx, sy = width / 1536, height / 1536
    x0, y0, x1, y1 = (
        round(REPAIR_BOX_AT_1536[0] * sx), round(REPAIR_BOX_AT_1536[1] * sy),
        round(REPAIR_BOX_AT_1536[2] * sx), round(REPAIR_BOX_AT_1536[3] * sy),
    )

    seed = np.zeros((height, width), dtype=np.uint8)
    patch = source[y0:y1, x0:x1]
    pale = (patch.min(axis=2) > 172) & ((patch.max(axis=2) - patch.min(axis=2)) < 48)
    seed[y0:y1, x0:x1][pale] = 255
    hard = np.array(Image.fromarray(seed).filter(ImageFilter.MaxFilter(13))) > 0
    if not 300 <= int(pale.sum()) <= 900:
        raise RuntimeError(f"Unexpected duplicate-eye mask size: {int(pale.sum())}")

    ring_box = (max(0, x0 - 18), max(0, y0 - 18), min(width, x1 + 18), min(height, y1 + 18))
    rx0, ry0, rx1, ry1 = ring_box
    local_mask = hard[ry0:ry1, rx0:rx1]
    ring = source[ry0:ry1, rx0:rx1][~local_mask]
    dark = ring[ring.max(axis=1) < 150]
    fill = np.median(dark if len(dark) > 20 else ring, axis=0).astype(np.uint8)

    repaired = source.copy()
    repaired[hard] = fill
    softened = Image.fromarray(repaired).filter(ImageFilter.GaussianBlur(1.1))
    alpha = Image.fromarray((hard * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    final = Image.composite(softened, Image.fromarray(source), alpha)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.suffix.lower() in {".jpg", ".jpeg"}:
        final.save(output_path, quality=92, optimize=True, subsampling=0)
    else:
        final.save(output_path, optimize=True)

    report = {
        "input": str(source_path),
        "output": str(output_path),
        "dimensions": [width, height],
        "repairBox": [x0, y0, x1, y1],
        "strokePixels": int(pale.sum()),
        "featheredPixels": int(hard.sum()),
        "fillRgb": fill.tolist(),
    }
    if args.report:
        report_path = Path(args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
