"""Replace a GLB's base-color texture without changing its mesh transforms.

Run through Blender:
blender --background --factory-startup --python replace_glb_basecolor.py -- \
  --input input.glb --texture repaired.jpg --output output.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--texture", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(values)


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).resolve()
    texture_path = Path(args.texture).resolve()
    output_path = Path(args.output).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    replacement = bpy.data.images.load(str(texture_path), check_existing=False)
    replacement.name = "mist-beret-basecolor-repaired"
    replaced = 0
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                node.image = replacement
                replaced += 1
    if replaced != 1:
        raise RuntimeError(f"Expected exactly one base-color image node, found {replaced}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path), export_format="GLB", export_yup=True,
        export_apply=False, export_animations=True, export_skins=True, export_morph=True,
        export_image_format="AUTO",
    )
    print(f"Replaced {replaced} image node; wrote {output_path}")


if __name__ == "__main__":
    main()
