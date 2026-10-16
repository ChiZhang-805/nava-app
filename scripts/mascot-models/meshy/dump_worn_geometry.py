"""Dump one Meshy worn-character GLB into compact arrays for repeatable segmentation.

Run with Blender:
  blender --background --factory-startup --python dump_worn_geometry.py -- \
    --input MODEL.glb --output geometry.npz
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


args = parse_args()
source = Path(args.input).resolve()
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(objects) != 1:
    raise RuntimeError(f"Expected one generated mesh, found {len(objects)}")
obj = objects[0]
mesh = obj.data
mesh.calc_loop_triangles()
vertices = np.asarray([obj.matrix_world @ vertex.co for vertex in mesh.vertices], dtype=np.float32)
triangles = np.asarray([triangle.vertices[:] for triangle in mesh.loop_triangles], dtype=np.int32)
triangle_loops = np.asarray([triangle.loops[:] for triangle in mesh.loop_triangles], dtype=np.int32)
if not mesh.uv_layers.active:
    raise RuntimeError("Generated mesh has no active UV layer")
loop_uv = np.asarray([loop.uv[:] for loop in mesh.uv_layers.active.data], dtype=np.float32)
np.savez_compressed(
    output,
    vertices_blender=vertices,
    triangles=triangles,
    triangle_loops=triangle_loops,
    loop_uv=loop_uv,
)
print(json.dumps({
    "input": str(source),
    "output": str(output),
    "vertices": int(len(vertices)),
    "triangles": int(len(triangles)),
    "bounds": [vertices.min(axis=0).tolist(), vertices.max(axis=0).tolist()],
}))
