"""Re-export the editable accessory source without scratch or image dependencies.

blender -b --python export_accessories_from_blend.py -- --source SOURCE.blend --output OUTPUT.glb
The source contains the 17 groups, packed material maps and cloth motion shapes.
"""
import argparse,sys,json
from pathlib import Path
import bpy
args=argparse.ArgumentParser();args.add_argument('--source',required=True);args.add_argument('--output',required=True)
opt=args.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(opt.source).resolve();output=Path(opt.output).resolve()
bpy.ops.wm.open_mainfile(filepath=str(source))
groups=[o for o in bpy.context.scene.objects if o.name.startswith('accessory-')]
assert len(groups)==17,'Expected 17 catalog groups'
for g in groups:
 assert g.get('followAnchor') in ['Body','Anchor_Head','Anchor_Chest','Anchor_Back']
 for o in g.children_recursive:
  if o.type=='MESH' and o.data.shape_keys:
   for key in o.data.shape_keys.key_blocks:key.value=0
  if g.name in ['accessory-cloud-scarf','accessory-aurora-scarf','accessory-honey-neck-warmer'] and o.type=='MESH':
   assert o.data.shape_keys and all(n in o.data.shape_keys.key_blocks for n in ['cloth_relax','cloth_lift'])
bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.update()
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_extras=True,export_animations=False,export_yup=True,export_all_vertex_colors=True)
data=output.read_bytes();doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')]);primitives=sum(len(m['primitives']) for m in doc['meshes']);assert primitives<=70
print('Exported',str(output),len(data),'bytes;',primitives,'primitives')
