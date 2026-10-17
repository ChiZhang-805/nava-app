"""Prepare one complete Meshy cat-plus-accessory model for the wardrobe viewer.

The full generated character is kept intact.  This script never separates,
repositions, or independently scales the accessory; it only reduces mesh and
texture weight for web delivery.  Runtime centering is handled with one uniform
transform applied to the complete scene.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--texture", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--texture-size", type=int, default=1536)
    parser.add_argument("--target-triangles", type=int, default=60000)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(max(1, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        [min(point[index] for point in points) for index in range(3)],
        [max(point[index] for point in points) for index in range(3)],
    )


args = parse_args()
source = Path(args.input).resolve()
source_texture = Path(args.texture).resolve()
output = Path(args.output).resolve()
report_path = Path(args.report).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
report_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("Meshy GLB contained no mesh")

for obj in meshes:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

triangles_before = sum(triangle_count(obj) for obj in meshes)
if triangles_before > args.target_triangles:
    ratio = max(0.02, args.target_triangles / triangles_before)
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("Web silhouette reduction", "DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)

# Replace every base-color image with one clean, web-sized JPEG.  The immutable
# 8K PNG remains in TestRuns; it is never overwritten or copied into Git.
runtime_texture = report_path.parent / f"{args.name}-basecolor-{args.texture_size}.jpg"
image = bpy.data.images.load(str(source_texture), check_existing=False)
largest = max(image.size)
if largest > args.texture_size:
    factor = args.texture_size / largest
    image.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
image.file_format = "JPEG"
image.filepath_raw = str(runtime_texture)
bpy.context.scene.render.image_settings.quality = 90
image.save()
runtime_image = bpy.data.images.load(str(runtime_texture), check_existing=False)
runtime_image.colorspace_settings.name = "sRGB"
runtime_image.pack()

for obj in meshes:
    for material in obj.data.materials:
        if not material or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None:
                node.image = runtime_image
        principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if principled:
            principled.inputs["Metallic IOR Level" if "Metallic IOR Level" in principled.inputs else "Metallic"].default_value = 0
            principled.inputs["Roughness"].default_value = 0.9

for candidate in list(bpy.data.images):
    if candidate is not runtime_image and candidate.users == 0:
        bpy.data.images.remove(candidate)

root = bpy.data.objects.new(f"worn-{args.name}", None)
bpy.context.collection.objects.link(root)
top_level = [obj for obj in bpy.context.scene.objects if obj is not root and obj.parent is None]
for obj in top_level:
    obj.parent = root
root["assetKind"] = "complete-cat-with-single-accessory"
root["accessorySlug"] = args.name
root["sourceSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
root["textureSourceSha256"] = hashlib.sha256(source_texture.read_bytes()).hexdigest()
root["transformPolicy"] = "complete-model-only; no accessory extraction or independent fitting"

bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    export_extras=True,
    export_animations=False,
    export_yup=True,
)

triangles_after = sum(triangle_count(obj) for obj in meshes)
bounds_min, bounds_max = world_bounds(meshes)
report = {
    "name": args.name,
    "kind": "complete-cat-with-single-accessory",
    "input": str(source),
    "output": str(output),
    "sourceSha256": root["sourceSha256"],
    "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "sourceBytes": source.stat().st_size,
    "outputBytes": output.stat().st_size,
    "meshCount": len(meshes),
    "trianglesBefore": triangles_before,
    "trianglesAfter": triangles_after,
    "textureSize": list(runtime_image.size),
    "bounds": {"min": bounds_min, "max": bounds_max},
    "preservedWornRelationship": True,
}
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
