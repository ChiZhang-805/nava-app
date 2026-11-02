"""Fixed-camera 360 and contact-angle review of an actual exported GLB.

This is a camera turntable, not a character action or evidence of rigging.
Blender --background --python <script> -- --input candidate.glb --output <dir>
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

p=argparse.ArgumentParser()
p.add_argument('--input',required=True,type=Path)
p.add_argument('--output',required=True,type=Path)
p.add_argument('--resolution',type=int,default=512)
p.add_argument('--frames',type=int,default=120)
p.add_argument('--contact-z',type=float,default=.58)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.output.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.input.resolve()))
s=bpy.context.scene
s.render.engine='CYCLES'; s.cycles.samples=8; s.cycles.use_denoising=True
s.render.resolution_x=a.resolution;s.render.resolution_y=a.resolution;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.view_settings.view_transform='Standard';s.view_settings.look='None'
s.world=bpy.data.worlds.new('Review_background');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs[0].default_value=(.69,.81,.94,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=1
c=bpy.data.cameras.new('Fixed_scale_review_camera');c.type='ORTHO';c.ortho_scale=2.65
cam=bpy.data.objects.new('Fixed_scale_review_camera',c);s.collection.objects.link(cam);s.camera=cam
target=Vector((-.08,-.28,.025)); evidence=[]

def capture(group,index,yaw,elevation,focus=None,span=None):
    center=target if focus is None else Vector(focus)
    c.ortho_scale=2.65 if span is None else span
    phi=math.radians(yaw);alpha=math.radians(elevation)
    direction=Vector((math.sin(phi)*math.cos(alpha),-math.cos(phi)*math.cos(alpha),math.sin(alpha)))
    cam.location=center+6*direction
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    f=a.output/group/f'{index:03d}.png';f.parent.mkdir(exist_ok=True)
    s.render.filepath=str(f);bpy.ops.render.render(write_still=True)
    evidence.append({'group':group,'file':str(f),'yaw_degrees':yaw,'elevation_degrees':elevation,'span':c.ortho_scale})

for i in range(a.frames):capture('turntable',i,360*i/a.frames,1.5)
for i in range(8):capture('high',i,45*i,38)
for i in range(8):capture('low-contact',i,45*i,-8,(-.08,-.28,a.contact_z),1.65)
capture('top',0,0,89.9)
report={'source':str(a.input.resolve()),'source_sha256':hashlib.sha256(a.input.read_bytes()).hexdigest(),
        'frames':evidence,'scene_animation':False,'purpose':'camera-only 360 silhouette, occlusion and contact review',
        'visual_review':'pending; rendering is not approval'}
(a.output/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'rendered':len(evidence),'evidence':str(a.output/'evidence.json')}))
