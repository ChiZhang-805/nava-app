"""Articulate the canonical v9 surface; keep neutral geometry/texture intact.

The first review gate is real joint deformation, before runtime integration.
Blender axes: Z up, face -Y. Root and seated support remain stationary.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fitted_common import active,stage,aim,BASE,CX,CY,material,ellipsoid,tube,TAU

def smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a)));return t*t*(3-2*t)

def make_rig():
    data=bpy.data.armatures.new('NAVA_v9_Articulated_Rig')
    rig=bpy.data.objects.new('NAVA_v9_Articulated_Rig',data);bpy.context.collection.objects.link(rig)
    active(rig);bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,h,t,parent=None):
        b=data.edit_bones.new(name);b.head=h;b.tail=t
        if parent:b.parent=data.edit_bones[parent]
    bone('Root',(CX,CY,-.9),(CX,CY,-.65))
    bone('Body',(CX,CY,-.65),(CX,CY,-.22),'Root')
    bone('Head',(CX,CY,-.22),(CX,CY,.55),'Body')
    for side,sign in [('L',1),('R',-1)]:
        x=CX+sign*.235
        bone('UpperPaw_'+side,(x,-.66,-.29),(x,-.72,-.53),'Body')
        bone('ForePaw_'+side,(x,-.72,-.53),(x,-.76,-.77),'UpperPaw_'+side)
        bone('Paw_'+side,(x,-.76,-.77),(x,-.79,-.91),'ForePaw_'+side)
        bone('Anchor_Paw_'+side,(x,-.79,-.91),(x,-.79,-.94),'Paw_'+side)
    bone('Tail',(CX+.41,.20,-.80),(CX+.82,.21,-.84),'Root')
    bone('TailTip',(CX+.82,.21,-.84),(CX+1.12,.18,-.86),'Tail')
    bone('Anchor_Head',(CX,CY,.45),(CX,CY,.55),'Head')
    bone('Anchor_Back',(CX,.32,-.27),(CX,.42,-.27),'Body')
    bone('YarnBall',(CX,-1.075,-.817),(CX,-1.075,-.717),'Root')
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in rig.pose.bones:b.rotation_mode='QUATERNION'
    return rig

def cat_weights(point):
    x,y,z=point;weights={}
    head=smooth(-.25,.14,z)
    weights['Head']=head;weights['Body']=1-head
    # A front-only sleeve envelope separates each foreleg from the seated haunch.
    side='L' if x>CX else 'R';sign=1 if side=='L' else -1
    center=CX+sign*.235
    lateral=1-smooth(.115,.235,abs(x-center))
    depth=smooth(-.52,-.70,y)
    extent=1-smooth(-.46,-.25,z)
    influence=lateral*depth*extent
    wrist=1-smooth(-.86,-.72,z)
    fore=(1-smooth(-.64,-.48,z))*(1-wrist)
    upper=1-wrist-fore
    weights={k:v*(1-influence) for k,v in weights.items()}
    weights['UpperPaw_'+side]=influence*upper
    weights['ForePaw_'+side]=influence*fore
    weights['Paw_'+side]=influence*wrist
    # The separate lateral tail is lightly articulated, away from planted hips.
    tail=smooth(CX+.47,CX+.70,x)*(1-smooth(-.66,-.55,z))*smooth(-.1,.05,y)
    if tail>0:
        weights={k:v*(1-tail) for k,v in weights.items()}
        tip=smooth(CX+.77,CX+.98,x)
        weights['Tail']=tail*(1-tip);weights['TailTip']=tail*tip
    items=sorted(((k,v) for k,v in weights.items() if v>1e-5),key=lambda a:-a[1])[:4]
    total=sum(v for _,v in items);return {k:v/total for k,v in items}

HEADWEAR={'mist-beret','sailor-hat','night-voyage-cap','star-moon-clip','cherry-bow','mint-earmuffs','laurel-crown','lily-garland','star-glasses'}

def bind(ob,rig,is_cat,slug):
    groups={b.name:ob.vertex_groups.new(name=b.name) for b in rig.data.bones if not b.name.startswith('Anchor')}
    for v in ob.data.vertices:
        if is_cat:w=cat_weights(v.co)
        elif slug in HEADWEAR:w={'Head':1.}
        elif slug in {'raindrop-cape','cloud-backpack'}:
            # Lower front fabric follows the same shoulder/upper-foreleg
            # field as the surface beneath it. A rigid Body attachment made
            # both reaching paws emerge through the cape opening edges.
            local=cat_weights(v.co);amount=.85 if slug=='raindrop-cape' else 1.
            w={k:value*amount for k,value in local.items() if 'Paw' in k}
            w['Body']=1-sum(w.values())
        else:w={'Body':1.}
        for name,value in w.items():groups[name].add([v.index],value,'REPLACE')
    mod=ob.modifiers.new('Canonical_joint_skin','ARMATURE');mod.object=rig
    ob.parent=rig

def set_rotation(rig,name,axis,angle):
    b=rig.pose.bones[name];rest=b.bone.matrix_local.to_quaternion()
    b.rotation_quaternion=rest.inverted()@Quaternion(axis,angle)@rest

def add_rotation(rig,name,axis,angle):
    b=rig.pose.bones[name];rest=b.bone.matrix_local.to_quaternion()
    b.rotation_quaternion=b.rotation_quaternion@(rest.inverted()@Quaternion(axis,angle)@rest)

def reset(rig):
    for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)

def pose_wave(rig,t):
    envelope=smooth(.07,.30,t)*(1-smooth(.76,.98,t))
    set_rotation(rig,'UpperPaw_R',(1,0,0),-.42*envelope)
    set_rotation(rig,'ForePaw_R',(1,0,0),-1.25*envelope)
    set_rotation(rig,'Paw_R',(0,1,0),.20*math.sin((t-.32)*math.tau*3)*smooth(.30,.42,t)*(1-smooth(.65,.76,t)))
    set_rotation(rig,'Head',(0,1,0),-.045*envelope)
    set_rotation(rig,'Tail',(0,0,1),.025*math.sin(t*math.tau)*math.sin(t*math.pi)**2)

def pose_reach(rig,t):
    envelope=smooth(.06,.30,t)*(1-smooth(.76,.98,t))
    set_rotation(rig,'UpperPaw_R',(1,0,0),-.22*envelope)
    set_rotation(rig,'ForePaw_R',(1,0,0),-.15*envelope)
    set_rotation(rig,'Head',(1,0,0),.055*envelope)

def yarn_x(t):
    if t<.36:return -2.4+1.97*smooth(0,.36,t)
    if t<.61:return -.43+.018*math.sin((t-.36)/.25*math.tau)**2
    return -.43+2.83*smooth(.61,.98,t)

def pose_yarn(rig,t):
    pose_reach(rig,t)
    rock=math.sin((t-.36)/.25*math.tau)*smooth(.36,.40,t)*(1-smooth(.57,.61,t))
    set_rotation(rig,'Paw_R',(0,0,1),.09*rock)
    push=smooth(.60,.68,t)*(1-smooth(.72,.82,t))
    add_rotation(rig,'UpperPaw_R',(0,1,0),-.08*push)
    # Bone translations are local; convert the world-space rolling path.
    b=rig.pose.bones['YarnBall'];rest=b.bone.matrix_local.to_quaternion()
    b.location=rest.inverted()@Vector((yarn_x(t)-CX,0,0))
    set_rotation(rig,'YarnBall',(0,1,0),(yarn_x(t)+2.4)/.105)

def pose_stretch(rig,t):
    e=smooth(.08,.32,t)*(1-smooth(.68,.97,t))
    # Seated forepaw stretch: hindquarters stay planted, the two forelegs
    # reach forward together without scaling or translating the character.
    for side in ['L','R']:
        set_rotation(rig,'UpperPaw_'+side,(1,0,0),-.28*e)
        set_rotation(rig,'ForePaw_'+side,(1,0,0),-.22*e)
        set_rotation(rig,'Paw_'+side,(1,0,0),.16*e)
    set_rotation(rig,'Head',(1,0,0),.06*e)

def review_ball(rig):
    m=material('Yarn_lavender',(.52,.38,.76),'felt');thread=material('Yarn_winding',(.65,.54,.85),'felt')
    center=Vector((CX,-1.075,-.817));objects=[ellipsoid('Yarn_ball',center,(.102,.102,.102),m,40,24)]
    for k in range(9):
        rotation=Quaternion(Vector((.4,1,.2)).normalized(),k*.51)
        points=[]
        for i in range(121):
            a=TAU*i/120;points.append(center+rotation@Vector((.104*math.cos(a),.025*math.sin(3*a),.104*math.sin(a))))
        objects.append(tube('Yarn_continuous_winding',points,.0025,thread,6))
    for ob in objects:
        active(ob);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        group=ob.vertex_groups.new(name='YarnBall');group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
        mod=ob.modifiers.new('Follow_ball','ARMATURE');mod.object=rig
    return objects

def build_actions(rig):
    for name,seconds,fn in [('paw_wave',3.2,pose_wave),('yarn_ball_play',5.0,pose_yarn),('seated_stretch',3.5,pose_stretch)]:
        rig.animation_data_create();action=bpy.data.actions.new(name);rig.animation_data.action=action
        for frame in range(1,round(seconds*30)+2):
            reset(rig);fn(rig,(frame-1)/(seconds*30))
            for b in rig.pose.bones:
                if not b.name.startswith('Anchor'):
                    b.keyframe_insert('rotation_quaternion',frame=frame,group=b.name)
                    if b.name=='YarnBall':b.keyframe_insert('location',frame=frame,group=b.name)
        action.use_fake_user=True
    rig.animation_data.action=None;reset(rig)

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,default=BASE);p.add_argument('--output',type=Path,required=True);p.add_argument('--slug',default='base');p.add_argument('--review',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.input))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    cat=next((o for o in meshes if o.name.startswith('NAVA_Canonical_Cat')),max(meshes,key=lambda o:len(o.data.vertices)))
    cat.name='NAVA_Canonical_Cat'
    for ob in meshes:active(ob);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    original=np.array([tuple(v.co) for v in cat.data.vertices]);rig=make_rig()
    for ob in meshes:bind(ob,rig,ob==cat,a.slug)
    build_actions(rig);bpy.context.scene.render.fps=30;camera=stage(512)
    assert np.array_equal(original,np.array([tuple(v.co) for v in cat.data.vertices]))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(a.output/(a.slug+'.blend')))
    active(rig)
    for ob in meshes:ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(a.output/(a.slug+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_all_influences=False,export_rest_position_armature=True,export_anim_single_armature=True,export_extras=True)
    evidence=[]
    if a.review:
        ball=review_ball(rig)
        for name,fn,t in [('neutral',pose_wave,0),('wave',pose_wave,.5),('ball-contact',pose_yarn,.45),('stretch',pose_stretch,.5)]:
            for o in ball:o.hide_render=name!='ball-contact'
            reset(rig);fn(rig,t);bpy.context.view_layer.update()
            for angle in [0,45,90,180,270]:
                theta=math.radians(angle);center=Vector((CX,CY,.025));camera.location=center+Vector((6*math.sin(theta),-6*math.cos(theta),.15));aim(camera,center)
                file=a.output/f'{name}-{angle}.png';bpy.context.scene.render.filepath=str(file);bpy.ops.render.render(write_still=True);evidence.append(str(file))
    reset(rig)
    (a.output/'rig-report.json').write_text(json.dumps({'source':str(a.input),'bones':[b.name for b in rig.data.bones],'restGeometryUnchanged':True,'maxInfluences':4,'actions':[x.name for x in bpy.data.actions],'evidence':evidence,'status':'deformation_review_pending'},indent=2),encoding='utf-8')

if __name__=='__main__':main()
