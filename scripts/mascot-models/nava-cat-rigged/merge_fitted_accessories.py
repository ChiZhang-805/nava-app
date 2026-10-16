"""Replace only the two pilot accessory groups in the editable catalog.

blender -b --factory-startup --python merge_fitted_accessories.py -- \
  --source BASE.blend --beret BERET.glb --scarf SCARF.glb \
  --editable OUTPUT.blend --output OUTPUT.glb
All merging is local. No generation API or cat geometry is used or changed.
"""
import argparse
import bmesh
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

p = argparse.ArgumentParser()
for name in ['source', 'beret', 'scarf', 'editable', 'output']:
    p.add_argument('--' + name, required=True)
args = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
paths = {name: Path(getattr(args, name)).resolve() for name in ['source', 'beret', 'scarf', 'editable', 'output']}
bpy.ops.wm.open_mainfile(filepath=str(paths['source']))


def group_fingerprint(group):
    """Exact retained authored coordinates, transforms, topology and shape keys."""
    digest = hashlib.sha256()
    for obj in sorted([group, *group.children_recursive], key=lambda value: value.name):
        digest.update(obj.name.encode())
        digest.update(repr(tuple(tuple(row) for row in obj.matrix_world)).encode())
        if obj.type != 'MESH':
            continue
        for vertex in obj.data.vertices:
            digest.update(struct.pack('<3f', *vertex.co))
        for polygon in obj.data.polygons:
            digest.update(struct.pack('<I', len(polygon.vertices)))
            for index in polygon.vertices:
                digest.update(struct.pack('<I', index))
        if obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                digest.update(key.name.encode())
                for vertex in key.data:
                    digest.update(struct.pack('<3f', *vertex.co))
    return digest.hexdigest()


replacements = {'accessory-mist-beret': 'beret', 'accessory-cloud-scarf': 'scarf'}
groups = [obj for obj in bpy.context.scene.objects if obj.name.startswith('accessory-')]
assert len(groups) == 17
retained = {obj.name: group_fingerprint(obj) for obj in groups if obj.name not in replacements}


def clean_imported_mesh(mesh):
    """Remove only mathematically collapsed edges/faces from generated input."""
    before = (len(mesh.vertices), len(mesh.polygons))
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.dissolve_degenerate(edit, dist=1e-9, edges=list(edit.edges))
    collapsed = [face for face in edit.faces if face.calc_area() <= 1e-12]
    if collapsed:
        bmesh.ops.delete(edit, geom=collapsed, context='FACES')
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
    return before, (len(mesh.vertices), len(mesh.polygons))


def prepare_runtime_textures(group, asset):
    """Keep masters external while embedding a detailed mobile-sized copy."""
    images = set()
    for obj in [group, *group.children_recursive]:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            material = slot.material
            if not material or not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    images.add(node.image)
    replacements = {}
    bpy.context.scene.render.image_settings.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.color_mode = 'RGB'
    bpy.context.scene.render.image_settings.quality = 92
    for index, image in enumerate(sorted(images, key=lambda value: value.name)):
        width, height = image.size
        largest = max(width, height)
        if largest > 2048:
            scale = 2048 / largest
            image.scale(max(1, round(width * scale)), max(1, round(height * scale)))
        destination = paths['editable'].parent / f'{asset}-basecolor-{index}-2k.jpg'
        image.file_format = 'JPEG'
        image.filepath_raw = str(destination)
        image.save()
        runtime = bpy.data.images.load(str(destination), check_existing=False)
        runtime.name = f'{asset}-basecolor-{index}-2k'
        runtime.pack()
        replacements[image] = runtime
    for obj in [group, *group.children_recursive]:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            material = slot.material
            if not material or not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image in replacements:
                    node.image = replacements[node.image]
    return [
        {'name': runtime.name, 'size': list(runtime.size), 'packed': bool(runtime.packed_file)}
        for runtime in replacements.values()
    ]

repairs = {}
runtime_textures = {}
for group_name, asset in replacements.items():
    old = bpy.data.objects.get(group_name)
    assert old is not None
    for obj in [*old.children_recursive, old]:
        bpy.data.objects.remove(obj, do_unlink=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(paths[asset]))
    imported = set(bpy.data.objects) - before
    group = bpy.data.objects.get(group_name)
    assert group in imported, f'Missing imported group {group_name}'
    keep = {group, *group.children_recursive}
    transform = group.matrix_world.copy()
    group.parent = None
    group.matrix_world = transform
    for obj in imported - keep:
        bpy.data.objects.remove(obj, do_unlink=True)
    assert group.get('followAnchor') == ('Anchor_Head' if asset == 'beret' else 'Body')
    repairs[asset] = []
    for obj in [group, *group.children_recursive]:
        if obj.type == 'MESH':
            before, after = clean_imported_mesh(obj.data)
            repairs[asset].append({'object': obj.name, 'before': before, 'after': after})
    runtime_textures[asset] = prepare_runtime_textures(group, asset)

groups = [obj for obj in bpy.context.scene.objects if obj.name.startswith('accessory-')]
assert len(groups) == 17
for name, fingerprint in retained.items():
    assert group_fingerprint(bpy.data.objects[name]) == fingerprint, f'Retained geometry changed: {name}'
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            key.value = 0
for image in bpy.data.images:
    if image.source == 'FILE' and image.has_data and not image.packed_file:
        image.pack()
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.update()
for key in ['editable', 'output']:
    paths[key].parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(paths['editable']))
bpy.ops.export_scene.gltf(filepath=str(paths['output']), export_format='GLB',
    export_extras=True, export_animations=False, export_yup=True, export_all_vertex_colors=True)
blob = paths['output'].read_bytes()
doc = json.loads(blob[20:20 + int.from_bytes(blob[12:16], 'little')])
assert len([node for node in doc['nodes'] if node.get('name', '').startswith('accessory-')]) == 17
assert sum(len(mesh['primitives']) for mesh in doc['meshes']) <= 70
print(json.dumps({'retainedGroups': len(retained), 'replacedGroups': list(replacements),
    'topologyRepairs': repairs, 'runtimeTextures': runtime_textures,
    'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest(),
    'editable': str(paths['editable']), 'output': str(paths['output'])}))
