"""Reference-fitted NAVA beret pilot; preserves the v9 cat outside the hat.

Blender CLI: --background --factory-startup --python <this> -- --output <dir>
No API request, original-file mutation, or app deployment occurs here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BASE = Path('Q:/NAVA-Workspace/NAVA-App/Build/Assets/Mascot/base-cat-v9-shadowless/nava-cat-base-v9-shadowless.glb')
REF = Path('Q:/NAVA-Workspace/NAVA-App/Build/Reference/Meshy/accessory-pilot-v12-beret-two-view')
CX, CY, Z0 = -0.080, -0.280, 0.475
AX, AY = -0.115, -0.205
N = 128


def arguments():
    p = argparse.ArgumentParser()
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--bake', action='store_true')
    p.add_argument('--views', default='front,left')
    p.add_argument('--resolution', type=int, default=512)
    p.add_argument('--felt-texture', type=Path, default=Path('Q:/NAVA-Workspace/NAVA-App/Build/Assets/Mascot/beret-fitted-v1/source-felt.png'))
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:])


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bvh(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices],
                               [list(p.vertices) for p in obj.data.polygons])


def edge_height(x, y):
    return Z0 + AX * (x-CX) + AY * (y-CY)


def fit_contact(cat):
    tree = bvh(cat)
    points = []
    for j in range(N):
        t = math.tau*j/N
        d = Vector((math.cos(t), math.sin(t), AX*math.cos(t)+AY*math.sin(t))).normalized()
        hit, normal, _, distance = tree.ray_cast(Vector((CX, CY, Z0)), d, 2)
        if hit is None:
            raise RuntimeError(f'No contact surface at angle {t}')
        points.append(hit)
    # A little cyclic averaging removes scanned fur spikes while retaining fit.
    a = np.array([tuple(v) for v in points])
    for _ in range(4):
        a = .5*a + .25*np.roll(a, 1, axis=0) + .25*np.roll(a, -1, axis=0)
    return a


def felt():
    m = bpy.data.materials.new('Lavender_felt_authoring')
    m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    p = n.get('Principled BSDF')
    p.inputs['Roughness'].default_value = .91
    p.inputs['Specular IOR Level'].default_value = .18
    p.inputs['Sheen Weight'].default_value = .22
    tex = n.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 145
    tex.inputs['Detail'].default_value = 2.2
    tex.inputs['Roughness'].default_value = .65
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .15
    ramp.color_ramp.elements[0].color = (.285, .182, .420, 1)
    ramp.color_ramp.elements[1].position = .85
    ramp.color_ramp.elements[1].color = (.355, .240, .505, 1)
    # A distorted fine cellular thread pattern supplements the broad fiber
    # noise. Keep its contrast restrained to avoid the old coarse yarn look.
    coords=n.new('ShaderNodeTexCoord')
    warp=n.new('ShaderNodeTexNoise'); warp.inputs['Scale'].default_value=85
    l.new(coords.outputs['Generated'],warp.inputs['Vector'])
    scale=n.new('ShaderNodeVectorMath'); scale.operation='SCALE'; scale.inputs[3].default_value=.018
    l.new(warp.outputs['Color'],scale.inputs[0])
    add=n.new('ShaderNodeVectorMath'); add.operation='ADD'
    l.new(coords.outputs['Generated'],add.inputs[0]); l.new(scale.outputs[0],add.inputs[1])
    fibers=n.new('ShaderNodeTexVoronoi'); fibers.feature='DISTANCE_TO_EDGE'; fibers.inputs['Scale'].default_value=155
    l.new(add.outputs[0],fibers.inputs['Vector'])
    thread=n.new('ShaderNodeValToRGB')
    thread.color_ramp.elements[0].position=.025; thread.color_ramp.elements[0].color=(.77,.77,.77,1)
    thread.color_ramp.elements[1].position=.19; thread.color_ramp.elements[1].color=(.32,.32,.32,1)
    l.new(fibers.outputs['Distance'],thread.inputs[0])
    mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MIX'; mix.inputs[0].default_value=.65
    l.new(tex.outputs['Fac'],mix.inputs[1]); l.new(thread.outputs[0],mix.inputs[2])
    l.new(mix.outputs[0], ramp.inputs[0])
    l.new(ramp.outputs['Color'], p.inputs['Base Color'])
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .26
    bump.inputs['Distance'].default_value = .0024
    l.new(mix.outputs[0], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], p.inputs['Normal'])
    if args.felt_texture.exists():
        image=bpy.data.images.load(str(args.felt_texture.resolve())); image.pack()
        fabric=n.new('ShaderNodeTexImage'); fabric.image=image; fabric.projection='BOX'; fabric.projection_blend=.25
        tiling=n.new('ShaderNodeVectorMath'); tiling.operation='SCALE'; tiling.inputs[3].default_value=.60
        l.new(coords.outputs['Object'],tiling.inputs[0]); l.new(tiling.outputs[0],fabric.inputs[0])
        l.new(fabric.outputs['Color'],p.inputs['Base Color'])
        l.new(fabric.outputs['Color'],bump.inputs['Height'])
        bump.inputs['Strength'].default_value=.20; bump.inputs['Distance'].default_value=.0015
    m.diffuse_color = (.32,.21,.46,1)
    return m


def crown(contact, material):
    # Continuous cross-section: hidden inner lip -> narrow turned edge ->
    # asymmetric low crown -> shared pole. No disconnected band or undercap.
    profile = [
        (.980, -.015), (1.024, -.014), (1.042, .000), (1.043,.018),
        (1.026,.035), (1.010,.048), (1.045,.065), (1.080,.095),
        (1.088,.125), (1.050,.169), (.991,.213), (.878,.259),
        (.720,.301), (.520,.329), (.300,.348), (.120,.356),
    ]
    vertices, faces = [], []
    center = np.array((CX,CY,Z0))
    for ri, (radius, h) in enumerate(profile):
        for j, point in enumerate(contact):
            t = math.tau*j/N
            r = (point-center)*radius
            # Broad sculpted dents follow irregular, gently curving fold paths.
            folds = 0
            if ri >= 6:
                inner=max(0.,min(1.,(radius-.12)/.34))
                inner=inner*inner*(3-2*inner)
                envelope = math.sin(math.pi * min(1., radius/1.10))**1.35 * inner
                for angle, width, depth in [(-.82,.23,.061),(.78,.29,.032),(2.78,.30,.022)]:
                    a = angle + .20*(1-radius)
                    delta = math.atan2(math.sin(t-a), math.cos(t-a))
                    folds -= depth*math.exp(-(delta/width)**2)*envelope
            shift = math.sin(min(h/.356,1)*math.pi/2)
            x = CX+r[0] - .045*shift
            y = CY+r[1] - .012*shift
            # Slanted contact plane continues through the crown, then softens
            # at the top. This is the worn lean visible in both approved views.
            z = Z0 + r[2] + h + folds + .012*math.cos(2*t+.5)*shift*radius
            vertices.append((x,y,z))
    for ri in range(len(profile)-1):
        for j in range(N):
            a=ri*N+j; b=ri*N+(j+1)%N
            faces.append((a,b,b+N,a+N))
    # Leave the skull opening genuinely open. An old flat bottom disk was
    # hidden inside the head but was not a physically meaningful hat cavity.
    top = len(vertices); vertices.append((CX-.045,CY-.012,Z0+.358))
    for j in range(N):
        faces.append(((len(profile)-1)*N+j,(len(profile)-1)*N+(j+1)%N,top))
    mesh=bpy.data.meshes.new('Continuous_felt_surface')
    mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=bpy.data.objects.new('Beret_continuous_crown',mesh)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    mod=obj.modifiers.new('Smooth_cloth_curvature','SUBSURF'); mod.levels=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    lining=obj.modifiers.new('True_inner_lining_and_open_head_cavity','SOLIDIFY')
    lining.thickness=.012;lining.offset=-1.;lining.use_even_offset=True
    bpy.ops.object.modifier_apply(modifier=lining.name)
    for f in mesh.polygons: f.use_smooth=True
    for f in obj.data.polygons: f.use_smooth=True
    obj.data.materials.append(material)
    # Outer cloth, inner lining and narrow joining hem form a closed fabric
    # shell, while its head opening has no spanning disk.
    obj['construction']='hollow fitted cloth shell with inner lining and open head cavity'
    return obj


def stalk(material):
    curve=bpy.data.curves.new('Beret_tip_curve','CURVE'); curve.dimensions='3D'
    curve.resolution_u=16; curve.bevel_depth=.020; curve.bevel_resolution=5
    curve.use_fill_caps=True
    spl=curve.splines.new('BEZIER'); spl.bezier_points.add(2)
    for p,co,r in zip(spl.bezier_points,
        [(CX-.045,CY-.012,.818),(CX-.020,CY-.006,.868),(CX+.006,CY-.002,.893)],
        [1.,.82,.60]):
        p.co=co; p.radius=r; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    obj=bpy.data.objects.new('Beret_short_felt_tip',curve); bpy.context.collection.objects.link(obj)
    activate(obj); bpy.ops.object.convert(target='MESH'); obj=bpy.context.object
    for p in obj.data.polygons: p.use_smooth=True
    obj.data.materials.append(material)
    return obj


def tuck_hidden_ears(cat, hat):
    tree=bvh(hat)
    before=np.array([tuple(v.co) for v in cat.data.vertices])
    modified=[]; uncovered=[]
    for v in cat.data.vertices:
        x,y,z=v.co
        if z < edge_height(x,y)+.025:
            continue
        hit,_,_,_=tree.ray_cast(Vector((x,y,2.0)),Vector((0,0,-1)),4)
        if hit is None:
            uncovered.append(v.index); continue
        threshold=hit.z-.038
        if z>threshold:
            v.co.z=threshold + .014*math.tanh((z-threshold)/.014)
            modified.append(v.index)
    cat.data.update()
    after=np.array([tuple(v.co) for v in cat.data.vertices])
    np.save(out/'cat-original-positions.npy',before)
    np.save(out/'cat-final-positions.npy',after)
    return {'modified_vertices':len(modified),'uncovered_high_vertices':len(uncovered),
            'unchanged_vertices':int(np.sum(np.all(before==after,axis=1))),
            'modified_original_min_z':float(before[modified,2].min()) if modified else None,
            'preservation':'Same topology, UVs and texture; only vertices enclosed by crown tuck downward.'}


def aim(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def stage():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.world=bpy.data.worlds.new('Soft_all_round_environment'); scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.89,1,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.52
    wn,wl=scene.world.node_tree.nodes,scene.world.node_tree.links
    bg=wn.new('ShaderNodeBackground'); bg.inputs[0].default_value=(.69,.81,.94,1)
    path=wn.new('ShaderNodeLightPath'); mix=wn.new('ShaderNodeMixShader')
    wl.new(path.outputs['Is Camera Ray'],mix.inputs[0])
    wl.new(wn.get('Background').outputs[0],mix.inputs[1]); wl.new(bg.outputs[0],mix.inputs[2])
    wl.new(mix.outputs[0],wn.get('World Output').inputs[0])
    for name,pos,energy,size in [('Front_softbox',(-3,-4,5),160,5),('Right_fill',(4,-1,3),100,5),
                                 ('Back_fill',(0,4,4),130,5),('Left_fill',(-4,1,2),65,4)]:
        d=bpy.data.lights.new(name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size; d.use_shadow=False
        o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.location=pos; aim(o,(CX,CY,0))
    camdata=bpy.data.cameras.new('Reference_camera'); camdata.type='ORTHO'; camdata.ortho_scale=2.65
    cam=bpy.data.objects.new('Reference_camera',camdata); bpy.context.collection.objects.link(cam)
    cam.location=(CX,CY-6,.175); aim(cam,(CX,CY,.025))
    scene.camera=cam
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'
    scene.view_settings.exposure=0; scene.view_settings.gamma=1
    scene.render.film_transparent=False
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=args.resolution; scene.render.resolution_y=args.resolution; scene.render.resolution_percentage=100
    return cam


def uv_and_bake(objects):
    # Bake only the hat; original cat image remains byte-for-byte unchanged.
    activate(objects[0])
    for o in objects: o.select_set(True)
    bpy.ops.object.join(); hat=bpy.context.object; hat.name='NAVA_fitted_lavender_beret'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    if not args.bake: return hat
    image=bpy.data.images.new('Beret_baked_soft_felt_2K',2048,2048,alpha=False)
    for material in set(hat.data.materials):
        node=material.node_tree.nodes.new('ShaderNodeTexImage'); node.image=image
        material.node_tree.nodes.active=node
    scene=bpy.context.scene
    scene.cycles.samples=48
    scene.render.bake.margin=24
    scene.render.bake.use_pass_direct=True; scene.render.bake.use_pass_indirect=True; scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type='DIFFUSE')
    image.filepath_raw=str(out/'beret-soft-felt-2k.png'); image.file_format='PNG'; image.save(); image.pack()
    material=bpy.data.materials.new('Beret_shadowless_baked_felt'); material.use_nodes=True
    n,l=material.node_tree.nodes,material.node_tree.links; n.clear()
    tex=n.new('ShaderNodeTexImage'); tex.image=image
    em=n.new('ShaderNodeEmission'); output=n.new('ShaderNodeOutputMaterial')
    l.new(tex.outputs['Color'],em.inputs['Color']); l.new(em.outputs[0],output.inputs[0])
    hat.data.materials.clear(); hat.data.materials.append(material)
    for p in hat.data.polygons: p.material_index=0
    return hat


def render_views(cam):
    directions={'front':(0,-6,.15),'left':(6,0,.12),'right':(-6,0,.12),
                'back':(0,6,.15),'perspective':(-4,-6,2.1),'top':(0,-.001,6)}
    scene=bpy.context.scene
    for view in args.views.split(','):
        cam.location=Vector((CX,CY,.025))+Vector(directions[view]); aim(cam,(CX,CY,.025))
        scene.render.filepath=str(out/f'{view}.png'); bpy.ops.render.render(write_still=True)


args=arguments(); out=args.output.resolve(); out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(BASE)); bpy.context.view_layer.update()
cat=next(o for o in bpy.context.scene.objects if o.type=='MESH'); activate(cat)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
cat.name='NAVA_base_v9_visible_surface_preserved'; cat.visible_shadow=False
contact=fit_contact(cat)
np.save(out/'fitted-contact-ring.npy',contact)
mat=felt(); hat=crown(contact,mat); tip=stalk(mat)
bpy.context.view_layer.update()
preservation=tuck_hidden_ears(cat,hat)
cam=stage()
hat=uv_and_bake([hat,tip])
cat['preservation']=preservation['preservation']
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'nava-cat-beret.blend'))
if args.bake:
    activate(cat); hat.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/'nava-cat-beret.glb'),export_format='GLB',
        use_selection=True,export_animations=False,export_extras=True)
render_views(cam)
report={'base':str(BASE),'base_sha256':hashlib.sha256(BASE.read_bytes()).hexdigest(),
        'felt_source':str(args.felt_texture.resolve()),'felt_sha256':hashlib.sha256(args.felt_texture.read_bytes()).hexdigest() if args.felt_texture.exists() else None,
        'refs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [REF/'front.png',REF/'left.png']},
        'preservation':preservation,'baked':args.bake,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in [cat,hat]),
        'geometry':'Hollow continuous crown/turn-in with inner lining and open head cavity; attached short felt tip; folded concealed ears.',
        'animation':'static; no rig or clips authored','status':'candidate; visual review required'}
(out/'build.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
