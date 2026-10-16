"""Replace all authored accessory groups with approved fitted Meshy-derived groups."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--fitted-root", required=True)
    parser.add_argument("--editable", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


args = parse_args()
source = Path(args.source).resolve()
catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
fitted_root = Path(args.fitted_root).resolve()
editable = Path(args.editable).resolve()
output = Path(args.output).resolve()
bpy.ops.wm.open_mainfile(filepath=str(source))

replaced = []
keep_authored = {
    "accessory-bell-collar", "accessory-cloud-scarf", "accessory-honey-neck-warmer",
    "accessory-aurora-scarf", "accessory-sailor-hat", "accessory-fish-brooch",
    "accessory-raindrop-cape",
}
hybrid = set()
for record in catalog["accessories"]:
    group_name = record["id"]
    old = bpy.data.objects.get(group_name)
    if not old:
        raise RuntimeError(f"Missing existing group {group_name}")
    if group_name in keep_authored:
        replaced.append({"id": group_name, "policy": "authored-continuous-fallback"})
        continue
    if group_name not in hybrid:
        for child in [*old.children_recursive, old]:
            bpy.data.objects.remove(child, do_unlink=True)
    fitted = fitted_root / record["slug"] / "fitted" / "fitted.glb"
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(fitted))
    imported = set(bpy.context.scene.objects) - before
    imported_group = next((obj for obj in imported if obj.name.startswith(group_name)), None)
    if not imported_group:
        raise RuntimeError(f"Fitted file did not contain {group_name}")
    keep = {imported_group, *imported_group.children_recursive}
    for extra in imported - keep:
        bpy.data.objects.remove(extra, do_unlink=True)
    policy = "meshy-derived-replacement"
    if group_name in hybrid:
        for child in list(imported_group.children):
            world = child.matrix_world.copy()
            child.parent = old
            child.matrix_world = world
            child.name = f"Meshed outer finish | {group_name}"
        bpy.data.objects.remove(imported_group, do_unlink=True)
        policy = "meshy-derived-outer-with-authored-continuous-support"
    replaced.append({"id": group_name, "policy": policy, "source": str(fitted), "sha256": hashlib.sha256(fitted.read_bytes()).hexdigest()})

groups = [obj for obj in bpy.context.scene.objects if obj.name.startswith("accessory-")]
expected = {record["id"] for record in catalog["accessories"]}
if {obj.name for obj in groups} != expected:
    raise RuntimeError("Merged group set does not match catalog")
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            key.value = 0
for image in bpy.data.images:
    if image.source == "FILE" and image.has_data and not image.packed_file:
        image.pack()

editable.parent.mkdir(parents=True, exist_ok=True)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(editable))
bpy.ops.export_scene.gltf(
    filepath=str(output), export_format="GLB", export_extras=True,
    export_animations=False, export_yup=True, export_all_vertex_colors=True,
)
print(json.dumps({
    "source": str(source),
    "editable": str(editable),
    "output": str(output),
    "bytes": output.stat().st_size,
    "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "replaced": replaced,
}))
