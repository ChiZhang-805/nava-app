"""Bake the editable sculpt's procedural colors to UV atlases and export GLB.

Uses Blender 5.2.2:
  blender --background --python bake_nava_turntable.py -- --out PATH
The original .blend is never changed; baked deliverables are separate.
"""
from pathlib import Path
import shutil
import argparse
import sys
import bpy

parser=argparse.ArgumentParser(description='Bake NAVA cat sculpt atlas and export glTF GLB')
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--name',default='nava-cat-turntable-study-v1.glb')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=args.out.resolve()
bpy.ops.wm.open_mainfile(filepath=str(OUT/'nava-cat-sculpt-study.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=4
scene.render.bake.margin=6
scene.render.bake.use_clear=True

MESH_PARAMS={
    'Continuous pear body with sculpted fur and paws': (186,192,2048,2048,'Body'),
    'Tapered left ear': (25,54,512,512,'LeftEar'),
    'Tapered right ear': (25,54,512,512,'RightEar'),
    'Continuous long low tail': (52,56,1024,512,'Tail'),
}

def add_atlas_uv(obj,rings,sides):
    mesh=obj.data
    atlas=mesh.uv_layers.new(name='NAVA baked atlas')
    for p in mesh.polygons:
        if p.index < (rings-1)*sides:
            i=p.index//sides
            j=p.index%sides
            coords=[(j/sides,i/(rings-1)),((j+1)/sides,i/(rings-1)),((j+1)/sides,(i+1)/(rings-1)),(j/sides,(i+1)/(rings-1))]
            for loop_idx,uv in zip(p.loop_indices,coords):
                atlas.data[loop_idx].uv=(.006+.988*uv[0],.006+.988*uv[1])
        else:
            # Pole caps are only a few pixels high, placed in the spare edge.
            v=.006 if p.index==(rings-1)*sides else .994
            for loop_idx in p.loop_indices:
                vi=mesh.loops[loop_idx].vertex_index
                u=(vi%sides)/sides
                atlas.data[loop_idx].uv=(.006+.988*u,v)
    mesh.uv_layers.active=atlas

def bake_object(obj, rings,sides,w,h,label):
    add_atlas_uv(obj,rings,sides)
    source=obj.active_material.copy()
    source.name=f'NAVA {label} procedural source'
    obj.data.materials.clear()
    obj.data.materials.append(source)
    nodes=source.node_tree.nodes
    links=source.node_tree.links
    v5=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image and n.image.name=='home-mascot-v5.png')
    source_uv=nodes.new('ShaderNodeUVMap')
    source_uv.uv_map='Front v5 projection'
    links.new(source_uv.outputs['UV'],v5.inputs['Vector'])
    image=bpy.data.images.new(f'NAVA_{label}_Baked',width=w,height=h,alpha=False,float_buffer=False)
    image.generated_color=(1,1,1,1)
    target=nodes.new('ShaderNodeTexImage')
    target.image=image
    for n in nodes:n.select=False
    target.select=True
    nodes.active=target
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.bake(type='EMIT')
    image.filepath_raw=str(OUT/f'NAVA_{label}_Baked.png')
    image.file_format='PNG'
    image.save()
    print('BAKED',label,image.filepath_raw,flush=True)

    # Background color is recognized by Blender's glTF exporter as
    # KHR_materials_unlit. The same baked atlas drives Blender and Three.js.
    unlit=bpy.data.materials.new(f'NAVA {label} unlit baked')
    unlit.use_nodes=True
    unlit.node_tree.nodes.clear()
    unodes=unlit.node_tree.nodes
    ul=unlit.node_tree.links
    tex=unodes.new('ShaderNodeTexImage')
    tex.image=image
    atlas_map=unodes.new('ShaderNodeUVMap')
    atlas_map.uv_map='NAVA baked atlas'
    bg=unodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value=1
    output=unodes.new('ShaderNodeOutputMaterial')
    ul.new(atlas_map.outputs['UV'],tex.inputs['Vector'])
    ul.new(tex.outputs['Color'],bg.inputs['Color'])
    ul.new(bg.outputs['Background'],output.inputs['Surface'])
    obj.data.materials.clear()
    obj.data.materials.append(unlit)
    # glTF multiplies COLOR_0 into a base-color texture. The procedural
    # attributes have already been baked, so retaining them would darken
    # the character twice in Three.js.
    for attribute in list(obj.data.attributes):
        if attribute.name in {'Col','Front'}:
            obj.data.attributes.remove(attribute)
    old_uv=obj.data.uv_layers.get('Front v5 projection')
    if old_uv is not None:
        obj.data.uv_layers.remove(old_uv)

for name,params in MESH_PARAMS.items():
    bake_object(bpy.data.objects[name],*params)

root=bpy.data.objects['NAVA yaw root']
root.rotation_euler=(0,0,0)
bpy.context.view_layer.update()

def anchor(name,location):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type='SPHERE'
    obj.empty_display_size=.04
    obj.location=location
    obj.parent=root
    obj.matrix_parent_inverse=root.matrix_world.inverted()
    return obj

anchor('NAVA_Anchor_Hat',(0,-.04,1.12))
anchor('NAVA_Anchor_Glasses',(0,-.80,.41))
anchor('NAVA_Anchor_Neck',(0,-.70,.10))
anchor('NAVA_Anchor_LeftEar',(-.35,.05,1.0))
anchor('NAVA_Anchor_RightEar',(.35,.05,1.0))
anchor('NAVA_Anchor_LeftPaw',(-.22,-.77,-.65))
anchor('NAVA_Anchor_RightPaw',(.22,-.77,-.65))
anchor('NAVA_Anchor_TailBase',(.40,.07,-.76))

# Editable weight groups identify continuous forepaw bulges for a later rig.
body=bpy.data.objects['Continuous pear body with sculpted fur and paws']
for label,xcenter in [('LeftPaw',-.21),('RightPaw',.21)]:
    group=body.vertex_groups.new(name=f'NAVA_{label}_Deform')
    for vertex in body.data.vertices:
        x,y,z=vertex.co
        if y<-.30 and -.98<z<-.41:
            wx=max(0,1-abs(x-xcenter)/.25)
            wz=max(0,1-abs(z+.70)/.30)
            weight=wx*wz
            if weight>.001:
                group.add([vertex.index],weight,'REPLACE')

scene.render.filepath=str(OUT/'baked-000.png')
bpy.ops.render.render(write_still=True)
root.rotation_euler.z=3.141592653589793/2
scene.render.filepath=str(OUT/'baked-090.png')
bpy.ops.render.render(write_still=True)
root.rotation_euler.z=0

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'nava-cat-sculpt-baked.blend'))
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children_recursive:obj.select_set(True)
bpy.context.view_layer.objects.active=root
study=OUT/args.name
bpy.ops.export_scene.gltf(filepath=str(study),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False)
# Alias kept for the parallel wardrobe integration work in this task.
shutil.copyfile(study,OUT/'nava-cat-sculpt-baked.glb')
print('EXPORTED RESEARCH ASSET',study,flush=True)
