"""Export the editable NAVA cat without depending on the research input GLB.

blender --background --factory-startup --python export_from_blend.py -- \
  --blend nava-cat-editable.blend --texture nava-cat-basecolor-4k.jpg \
  --output nava-cat-rigged.glb

The .blend stores lossless base color, the local tail refinement, semantic
rig/anchors, and four complete actions. The JPEG is an approved technical
encoding of the same atlas. No image re-encoding is requested during export.
"""
from pathlib import Path
import argparse,sys,json,hashlib,struct
import bpy
HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--blend',type=Path,default=HERE/'nava-cat-editable.blend')
p.add_argument('--texture',type=Path,default=HERE/'nava-cat-basecolor-4k.jpg')
p.add_argument('--output',type=Path,default=HERE/'nava-cat-rigged.glb')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
for item in [a.blend,a.texture]:
 if not item.is_file():raise FileNotFoundError(item)
bpy.ops.wm.open_mainfile(filepath=str(a.blend.resolve()))
scene=bpy.context.scene
rig=scene.objects.get('NAVA_Cat_Rig');mesh=scene.objects.get('NAVA_Cat')
assert rig is not None and rig.type=='ARMATURE'
assert mesh is not None and mesh.type=='MESH'
assert {x.name for x in bpy.data.actions} >= {'bubble_touch','star_catch','flower_sniff','snowflake'}
if rig.animation_data:
 rig.animation_data.action=None
 for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:
 bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0);bone.location=(0,0,0);bone.scale=(1,1,1)
scene.render.fps=30;scene.frame_set(0);bpy.context.view_layer.update()
image=bpy.data.images.load(str(a.texture.resolve()),check_existing=True)
for material in mesh.data.materials:
 nodes=material.node_tree.nodes
 for node in nodes:
  if node.type=='TEX_IMAGE':node.image=image
 # The authored color -> surface link is intentionally preserved. Blender
 # recognizes this as KHR_materials_unlit and exports a baseColorTexture.
for obj in scene.objects:obj.select_set(False)
mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_all_influences=False,export_rest_position_armature=True,export_anim_single_armature=True,export_image_format='AUTO',export_yup=True)
# Byte-level proof that AUTO reused the approved JPEG, and the semantic contract survived.
data=a.output.read_bytes();json_length=struct.unpack_from('<I',data,12)[0]
gltf=json.loads(data[20:20+json_length]);binary_start=20+json_length+8
assert len(gltf['images'])==1 and gltf['images'][0]['mimeType']=='image/jpeg'
view=gltf['bufferViews'][gltf['images'][0]['bufferView']]
embedded=data[binary_start+view.get('byteOffset',0):binary_start+view.get('byteOffset',0)+view['byteLength']]
assert embedded==a.texture.read_bytes(),'Unexpected JPEG re-encoding'
assert 'KHR_materials_unlit' in gltf['materials'][0].get('extensions',{})
assert {x['name'] for x in gltf['animations']}=={'bubble_touch','star_catch','flower_sniff','snowflake'}
print(json.dumps({'output':str(a.output.resolve()),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'exact_source_jpeg':True,'actions':[x['name'] for x in gltf['animations']]},indent=2))
