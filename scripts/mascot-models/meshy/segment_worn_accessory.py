"""Create deterministic per-face masks for the 17 Meshy worn-character masters.

The mask uses both material colour and the catalog slot's physical region. It
never edits a downloaded master. Review the report and extracted renders before
merging any fitted accessory into the runtime catalog.
"""
from __future__ import annotations

import argparse
import colorsys
import json
from pathlib import Path

import numpy as np
from PIL import Image


CONFIG = {
    "bell-collar": {"mode": "gold", "z": (-0.35, 0.45)},
    "cloud-scarf": {"mode": "blue", "z": (-0.55, 0.35)},
    "mist-beret": {"mode": "purple", "z": (0.22, 1.1)},
    "star-moon-clip": {"mode": "gold", "z": (0.12, 1.05)},
    "pearl-bow": {"mode": "warm-white", "z": (-0.48, 0.28), "front": True},
    "mint-earmuffs": {"mode": "green", "z": (0.02, 1.1)},
    "honey-neck-warmer": {"mode": "orange", "z": (-0.55, 0.34)},
    "cloud-backpack": {"mode": "aqua", "z": (-0.62, 0.42), "back": True},
    "fish-brooch": {"mode": "aqua-strong", "z": (-0.58, 0.28), "front": True},
    "laurel-crown": {"mode": "gold", "z": (0.08, 1.1)},
    "sailor-hat": {"mode": "navy", "z": (0.12, 1.1)},
    "cherry-bow": {"mode": "red", "z": (0.02, 1.1)},
    "star-glasses": {"mode": "purple", "z": (-0.02, 0.78), "front": True},
    "raindrop-cape": {"mode": "aqua", "z": (-0.70, 0.35)},
    "aurora-scarf": {"mode": "purple", "z": (-0.62, 0.38)},
    "lily-garland": {"mode": "green", "z": (0.02, 1.1)},
    "night-voyage-cap": {"mode": "navy", "z": (0.08, 1.1)},
}


def colour_mask(mode: str, rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb.T
    saturation = np.max(rgb, axis=1) - np.min(rgb, axis=1)
    if mode == "red":
        return (r > 0.48) & (r > g * 1.22) & (r > b * 1.16) & (saturation > 0.16)
    if mode == "gold":
        return (r > 0.52) & (g > 0.28) & (r > b * 1.22) & (g > b * 1.05) & (saturation > 0.13)
    if mode == "orange":
        return (r > 0.48) & (g > 0.22) & (r > b * 1.28) & (g > b * 1.08) & (saturation > 0.18)
    if mode == "purple":
        return (b > g * 1.08) & (r > g * 1.05) & ((b - g) > 0.045) & (saturation > 0.07)
    if mode == "green":
        return (g > r * 1.07) & (g > b * 0.99) & ((g - r) > 0.075) & (saturation > 0.085)
    if mode == "navy":
        return (b > r * 1.10) & (b > g * 1.02) & (r < 0.44) & (saturation > 0.10)
    if mode == "aqua-strong":
        return (g > r * 1.12) & (b > r * 1.17) & ((g - r) > 0.10) & ((b - r) > 0.145) & (saturation > 0.15)
    if mode == "aqua":
        return (g > r * 1.065) & (b > r * 1.13) & ((g - r) > 0.06) & ((b - r) > 0.12) & (saturation > 0.12)
    if mode == "blue":
        return (b > r * 1.18) & (g > r * 1.08) & ((b - r) > 0.18) & ((g - r) > 0.075) & (saturation > 0.18)
    if mode == "warm-white":
        return (r > b * 1.025) & (g > b * 1.008) & ((r - b) > 0.018) & (r > 0.58)
    raise KeyError(mode)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True, choices=sorted(CONFIG))
    parser.add_argument("--geometry", required=True)
    parser.add_argument("--texture", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    data = np.load(args.geometry)
    vertices = data["vertices_blender"]
    faces = data["triangles"]
    loops = data["triangle_loops"]
    uv = data["loop_uv"]
    image = Image.open(args.texture).convert("RGB").resize((2048, 2048), Image.Resampling.LANCZOS)
    pixels = np.asarray(image, dtype=np.float32) / 255.0
    samples = []
    for weights in ((1 / 3, 1 / 3, 1 / 3), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6)):
        point = (uv[loops] * np.asarray(weights, dtype=np.float32)[None, :, None]).sum(axis=1)
        px = np.clip((point[:, 0] * 2048).astype(np.int32), 0, 2047)
        py = np.clip(((1 - point[:, 1]) * 2048).astype(np.int32), 0, 2047)
        samples.append(pixels[py, px])
    colours = np.mean(samples, axis=0)
    centers = vertices[faces].mean(axis=1)
    config = CONFIG[args.name]
    mask = colour_mask(config["mode"], colours)
    z_min, z_max = config["z"]
    mask &= (centers[:, 2] >= z_min) & (centers[:, 2] <= z_max)
    # Meshy front is negative Y in Blender. These broad half-space gates remove
    # similarly coloured tail/fur fragments while retaining side thickness.
    if config.get("front"):
        mask &= centers[:, 1] < 0.18
    if config.get("back"):
        mask &= centers[:, 1] > -0.18
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, accessory_faces=mask, colors=colours, centers=centers)
    selected = centers[mask]
    report = {
        "name": args.name,
        "mode": config["mode"],
        "selectedFaces": int(mask.sum()),
        "totalFaces": int(len(mask)),
        "ratio": float(mask.mean()),
        "bounds": [selected.min(axis=0).tolist(), selected.max(axis=0).tolist()] if len(selected) else None,
        "meanColor": colours[mask].mean(axis=0).tolist() if len(selected) else None,
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
