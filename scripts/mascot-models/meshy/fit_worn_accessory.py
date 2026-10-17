"""Register one approved full worn model and retain its accessory placement.

The downloaded full cat stays immutable.  Registration is deliberately a
uniform similarity transform: the generated cat and its worn accessory move as
one unit into the canonical cat frame.  Axis-by-axis bounds fitting is forbidden
because differences in tails, ruffs, and generated body width stretch a correctly
worn accessory away from its anatomical contact points.

The reviewed face mask is applied only after registration to hide the duplicate
generated cat body.  Combinations are assembled from the registered worn models
without another generation request.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector


SLOTS = {
    "bell-collar": ("neck", "Anchor_Chest"),
    "cloud-scarf": ("neck", "Body"),
    "mist-beret": ("head", "Anchor_Head"),
    "star-moon-clip": ("head", "Anchor_Head"),
    "pearl-bow": ("neck", "Anchor_Chest"),
    "mint-earmuffs": ("head", "Anchor_Head"),
    "honey-neck-warmer": ("neck", "Body"),
    "cloud-backpack": ("back", "Anchor_Back"),
    "fish-brooch": ("chest", "Anchor_Chest"),
    "laurel-crown": ("head", "Anchor_Head"),
    "sailor-hat": ("head", "Anchor_Head"),
    "cherry-bow": ("head", "Anchor_Head"),
    "star-glasses": ("face", "Anchor_Head"),
    "raindrop-cape": ("body", "Body"),
    "aurora-scarf": ("neck", "Body"),
    "lily-garland": ("head", "Anchor_Head"),
    "night-voyage-cap": ("head", "Anchor_Head"),
}

TARGET_TRIANGLES = {
    "head": 8000,
    "neck": 10000,
    "face": 6000,
    "chest": 4000,
    "body": 14000,
    "back": 10000,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True, choices=sorted(SLOTS))
    parser.add_argument("--input", required=True)
    parser.add_argument("--mask", required=True)
    parser.add_argument("--cat", required=True)
    parser.add_argument("--texture", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def robust_frame(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return np.quantile(points, 0.015, axis=0), np.quantile(points, 0.985, axis=0)


def upper_body_frame(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return a tail-resistant registration frame for head and neck landmarks."""
    lo, hi = robust_frame(points)
    cutoff = lo[2] + (hi[2] - lo[2]) * 0.34
    upper = points[points[:, 2] >= cutoff]
    if len(upper) < 200:
        raise RuntimeError("Upper-body registration region is implausibly small")
    return robust_frame(upper)


def mesh_points(obj: bpy.types.Object) -> np.ndarray:
    return np.asarray([obj.matrix_world @ vertex.co for vertex in obj.data.vertices], dtype=np.float64)


args = parse_args()
slot, anchor = SLOTS[args.name]
source = Path(args.input).resolve()
mask_path = Path(args.mask).resolve()
cat_path = Path(args.cat).resolve()
texture_path = Path(args.texture).resolve()
output_dir = Path(args.output_dir).resolve()
output_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
generated = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(generated) != 1:
    raise RuntimeError(f"Expected one generated mesh, found {len(generated)}")
obj = generated[0]
mask = np.load(mask_path)["accessory_faces"].astype(bool)
if len(mask) != len(obj.data.polygons):
    raise RuntimeError("Segmentation mask no longer matches the immutable master")
if int(mask.sum()) < 200:
    raise RuntimeError(f"Accessory mask is implausibly small: {int(mask.sum())}")

# Use body vertices outside the selected faces to register the *complete worn
# model* to the canonical cat.  The transform is estimated before deleting the
# duplicate cat, so the accessory preserves the placement inferred by Meshy.
source_points = mesh_points(obj)
body_vertex_ids = np.unique(np.asarray([vertex for index, poly in enumerate(obj.data.polygons) if not mask[index] for vertex in poly.vertices], dtype=np.int32))
source_body = source_points[body_vertex_ids]
before_cat = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(cat_path))
imported_cat = set(bpy.context.scene.objects) - before_cat
cat_meshes = [candidate for candidate in imported_cat if candidate.type == "MESH"]
if not cat_meshes:
    raise RuntimeError("Canonical cat GLB contained no mesh")
target_points = np.concatenate([mesh_points(candidate) for candidate in cat_meshes], axis=0)
source_lo, source_hi = robust_frame(source_body)
target_lo, target_hi = robust_frame(target_points)
source_upper_lo, source_upper_hi = upper_body_frame(source_body)
target_upper_lo, target_upper_hi = upper_body_frame(target_points)

# Height is the stable common dimension across the fixed seated pose.  Width and
# depth are intentionally not fitted: separately generated tails and cheek ruffs
# make those bounds noisy, and non-uniform fitting visibly distorts hats, bands,
# glasses, and collars.  Align the upper-body centre in X/Y and the ear/top line
# in Z so head and neck contact is retained.
uniform_scale = float((target_hi[2] - target_lo[2]) / max(source_hi[2] - source_lo[2], 1e-6))
scale = np.asarray([uniform_scale, uniform_scale, uniform_scale], dtype=np.float64)
source_upper_center = (source_upper_lo + source_upper_hi) * 0.5
target_upper_center = (target_upper_lo + target_upper_hi) * 0.5
translation = target_upper_center - source_upper_center * uniform_scale
translation[2] = target_hi[2] - source_hi[2] * uniform_scale
for candidate in imported_cat:
    bpy.data.objects.remove(candidate, do_unlink=True)

bm = bmesh.new()
bm.from_mesh(obj.data)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[face for index, face in enumerate(bm.faces) if not mask[index]], context="FACES")
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
loose = [vertex for vertex in bm.verts if not vertex.link_faces]
if loose:
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
for vertex in bm.verts:
    vertex.co.x = vertex.co.x * float(scale[0]) + float(translation[0])
    vertex.co.y = vertex.co.y * float(scale[1]) + float(translation[1])
    vertex.co.z = vertex.co.z * float(scale[2]) + float(translation[2])
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
boundary_before = sum(edge.is_boundary for edge in bm.edges)
bm.to_mesh(obj.data)
bm.free()
obj.data.update()

# Keep the selected outer surface while making thin generated cuts read as a
# real garment edge. This return rim is hidden inside the cat at rest.
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
if len(obj.data.polygons) > TARGET_TRIANGLES[slot]:
    modifier = obj.modifiers.new("Mobile silhouette preserving reduction", "DECIMATE")
    modifier.ratio = TARGET_TRIANGLES[slot] / len(obj.data.polygons)
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
solid = obj.modifiers.new("Hidden cloth return rim", "SOLIDIFY")
solid.thickness = 0.006 if slot in {"head", "face", "chest"} else 0.010
solid.offset = -1
solid.use_even_offset = False
bpy.ops.object.modifier_apply(modifier=solid.name)
for polygon in obj.data.polygons:
    polygon.use_smooth = True

# Runtime textures retain a clean 2K copy. The untouched 8K source remains in
# TestRuns for offline refinement and evidence.
runtime_texture = output_dir / f"{args.name}-basecolor-1k.jpg"
image = bpy.data.images.load(str(texture_path), check_existing=False)
largest = max(image.size)
if largest > 1024:
    ratio = 1024 / largest
    image.scale(max(1, round(image.size[0] * ratio)), max(1, round(image.size[1] * ratio)))
image.file_format = "JPEG"
image.filepath_raw = str(runtime_texture)
bpy.context.scene.render.image_settings.quality = 88
image.save()
runtime_image = bpy.data.images.load(str(runtime_texture), check_existing=False)
runtime_image.pack()
for material in obj.data.materials:
    if not material or not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image = runtime_image
    principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if principled:
        principled.inputs["Metallic"].default_value = 0
        principled.inputs["Roughness"].default_value = 0.88

# Add subtle, zero-at-boundary cloth shapes for the garments that need them.
if slot in {"neck", "body"}:
    obj.shape_key_add(name="Basis")
    coordinates = [vertex.co.copy() for vertex in obj.data.vertices]
    low_z = min(value.z for value in coordinates)
    high_z = max(value.z for value in coordinates)
    span_z = max(1e-6, high_z - low_z)
    relax = obj.shape_key_add(name="cloth_relax")
    lift = obj.shape_key_add(name="cloth_lift")
    for index, base in enumerate(coordinates):
        weight = max(0.0, min(1.0, (high_z - base.z) / span_z)) ** 1.6
        relax.data[index].co = base + Vector((0.012 * math.sin(base.y * 6.0), 0.018 * weight, -0.022 * weight))
        lift.data[index].co = base + Vector((-0.018 * weight, -0.012 * weight, 0.032 * weight))

group = bpy.data.objects.new(f"accessory-{args.name}", None)
bpy.context.collection.objects.link(group)
obj.parent = group
obj.name = f"Meshy worn-derived {args.name}"
obj.data.name = f"Approved worn {args.name} surface"
group["followAnchor"] = anchor
group["stackGroup"] = slot
group["source"] = "Locally extracted from approved Meshy full worn-character master"
group["rawSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
group["referenceProfile"] = "latest model; 2K geometry; 8K source texture; lighting removed"

for candidate in list(bpy.context.scene.objects):
    if candidate not in {group, obj}:
        bpy.data.objects.remove(candidate, do_unlink=True)
for candidate in list(bpy.data.images):
    if candidate is not runtime_image and candidate.users == 0:
        bpy.data.images.remove(candidate)

blend_path = output_dir / "fitted.blend"
glb_path = output_dir / "fitted.glb"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    export_extras=True,
    export_animations=False,
    export_yup=True,
    export_all_vertex_colors=True,
)
report = {
    "name": args.name,
    "slot": slot,
    "anchor": anchor,
    "rawSha256": group["rawSha256"],
    "selectedSourceFaces": int(mask.sum()),
    "fittedFaces": len(obj.data.polygons),
    "fittedVertices": len(obj.data.vertices),
    "boundaryBeforeReturn": int(boundary_before),
    "scale": scale.tolist(),
    "translation": translation.tolist(),
    "registration": {
        "method": "uniform-height-scale-upper-body-center-top-align",
        "sourceUpperFrame": [source_upper_lo.tolist(), source_upper_hi.tolist()],
        "targetUpperFrame": [target_upper_lo.tolist(), target_upper_hi.tolist()],
        "preservesWornAspectRatio": True,
    },
    "runtimeTexture": str(runtime_texture),
    "blend": str(blend_path),
    "glb": str(glb_path),
    "bytes": glb_path.stat().st_size,
}
(output_dir / "fit-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
