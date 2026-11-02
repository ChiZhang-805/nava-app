"""Tailored shoulder cape: common neckline, sewn trim and settled cloth.

The collar is sampled from the same boundary as the cape. Hidden shoulder
ruff compresses only underneath the garment; the exposed canonical cat stays
unchanged. Blender cloth relaxes the cut panels against the resulting body.
"""
import math
import bpy
import numpy as np
from mathutils import Vector, Matrix
from fitted_common import *


def build_cape(surface, cat, profile_plate):
    clothmat = material('Rain_cape_fine_woven_aqua', (.45, .73, .86), 'felt')
    trim = material('Cape_ivory_topstitch', (.88, .92, .91), 'matte')
    pearl = material('Cape_mother_of_pearl_clasp', (.83, .91, .95), 'polished')
    # A close neckline sits beneath the ruff, rising over the shoulders.
    def top_z(q): return -.095 - .145 * math.cos(q)
    def tailored_neck(q):
        ry=.51 if math.cos(q)>0 else .56
        ellipse=1/math.sqrt((math.sin(q)/.565)**2+(math.cos(q)/ry)**2)
        return min(surface.radius(q,top_z(q))+.012,ellipse+.010)
    radii = np.array([tailored_neck(TAU*i/256) for i in range(256)])
    for _ in range(14):
        radii = .5*radii + .25*np.roll(radii, 1) + .25*np.roll(radii, -1)
    def neck_radius(q):
        u = (q % TAU) / TAU * 256; i = int(u); f = u-i
        return float(radii[i]*(1-f) + radii[(i+1)%256]*f)
    def gap(t): return .015 + .63*t**1.30
    def hem_z(q):
        front_lobe = math.exp(-((abs(math.atan2(math.sin(q), math.cos(q)))-.80)/.58)**2)
        return -.595 - .060*front_lobe + .021*math.cos(6*q+.3)
    def radius(q, t, z):
        blend = min(1., t/.82); blend = blend*blend*(3-2*blend)
        body = surface.radius(q, z)
        base = neck_radius(q)*(1-blend) + (body+.025)*blend
        fold = (.034*math.sin(6*q+.35*t)+.011*math.sin(9*q-.3*t)) * t**1.25
        return base + .062*t + fold
    def point(u, t):
        q = gap(t)+(TAU-2*gap(t))*u
        z = top_z(q)*(1-t) + hem_z(q)*t
        r = radius(q, t, z)
        return Vector((CX+r*math.sin(q), CY-r*math.cos(q), z))

    # Compress only fur covered by the cloth panel, including the folded
    # neckline. The operation and allowed vertex IDs are exported as evidence.
    changed=[]
    for v in cat.data.vertices:
        x,y,z=v.co; q=math.atan2(x-CX, -(y-CY)) % TAU
        t=(top_z(q)-z)/(top_z(q)-hem_z(q))
        if not -.035 < t < 1: continue
        if q < gap(max(0,t))-.007 or q > TAU-gap(max(0,t))+.007: continue
        limit=radius(q,max(0,t),z)-.022
        r=math.hypot(x-CX,y-CY)
        if r>limit:
            v.co.x=CX+(x-CX)*limit/r; v.co.y=CY+(y-CY)*limit/r
            changed.append(v.index)
    cat.data.update(); cat['compressedCoveredVertices']=changed

    n,m=128,32; vs=[]; fs=[]; uv=[]
    for i in range(n+1):
        for j in range(m+1):
            vs.append(tuple(point(i/n,j/m))); uv.append((i/n*3,j/m))
    for i in range(n):
        for j in range(m):
            k=i*(m+1)+j; fs.append((k,k+m+1,k+m+2,k+1))
    cloak=mesh('Tailored_cape_continuous_shoulder_panels',vs,fs,clothmat,uv)

    # Evaluate a genuine cloth relaxation. This is a construction operation,
    # not a claim that a static GLB contains a runtime physics simulation.
    cvs=[];cfs=[];cn,cm=128,40
    for i in range(cn):
        q=TAU*i/cn
        for j in range(cm+1):
            t=j/cm*1.2;z=top_z(q)*(1-t)+hem_z(q)*t
            r=min(surface.radius(q,z),radius(q,min(1,t),z)-.025)
            cvs.append((CX+r*math.sin(q),CY-r*math.cos(q),z))
    for i in range(cn):
        for j in range(cm):
            a=i*(cm+1)+j;b=((i+1)%cn)*(cm+1)+j
            cfs.append((a,b,b+1,a+1))
    collider=mesh('Cape_smooth_compressed_fur_collision',cvs,cfs,None)
    # Radial cloth collision must face outward. Recalculating an open shell's
    # normals alone cannot establish inside/outside.
    radial_dot=sum(p.normal.dot(Vector((p.center.x-CX,p.center.y-CY,0))) for p in collider.data.polygons)
    if radial_dot<0:
        for p in collider.data.polygons:p.flip()
        collider.data.update()
    active(collider)
    collider.modifiers.new('Cloth_body_collision','COLLISION')
    collider.collision.thickness_outer=.006; collider.collision.cloth_friction=10
    collider.hide_render=True
    active(cloak)
    pins=cloak.vertex_groups.new(name='Sewn_neckline_pins')
    for i in range(n+1):
        for j,w in ((0,1.),(1,1.),(2,.75),(3,.25)):
            pins.add([i*(m+1)+j],w,'REPLACE')
    sim=cloak.modifiers.new('Gravity_settled_soft_cloth','CLOTH')
    settings=sim.settings;settings.quality=8;settings.mass=.20
    settings.tension_stiffness=30;settings.compression_stiffness=30
    settings.shear_stiffness=25;settings.bending_stiffness=2.5
    settings.air_damping=5;settings.vertex_group_mass=pins.name
    settings.pin_stiffness=1;settings.effector_weights.gravity=.20
    sim.collision_settings.use_collision=True;sim.collision_settings.distance_min=.006
    sim.collision_settings.collision_quality=6
    sim.collision_settings.use_self_collision=True;sim.collision_settings.self_distance_min=.005
    sim.point_cache.frame_start=1;sim.point_cache.frame_end=35
    for frame in range(1,36):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        cloak.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices[0].co
    bpy.ops.object.modifier_apply(modifier=sim.name)
    bpy.data.objects.remove(collider,do_unlink=True)
    bpy.context.scene.frame_set(1)
    settled=[v.co.copy() for v in cloak.data.vertices]
    displacement=np.linalg.norm(np.asarray([tuple(v) for v in settled])-np.asarray(vs),axis=1)
    print('CAPE_CLOTH_DISPLACEMENT',float(displacement.mean()),float(displacement.max()))
    cloak['construction']='Tailored panel, 35-frame pinned Blender cloth relaxation'
    # Rounded hems and folded collar share this exact simulated surface.
    def sample(i,j): return settled[i*(m+1)+j].copy()
    collarvs=[]; collaruv=[]; collarfaces=[]
    for i in range(n+1):
        for j in range(6):
            p=sample(i,j); radial=Vector((p.x-CX,p.y-CY,0)).normalized()
            p+=radial*(.009+.006*math.sin(math.pi*j/5))
            collarvs.append(tuple(p));collaruv.append((i/n*3,j/5*.2))
    for i in range(n):
        for j in range(5):
            k=i*6+j;collarfaces.append((k,k+6,k+7,k+1))
    collar=mesh('Connected_folded_cape_collar',collarvs,collarfaces,clothmat,collaruv)
    for ob in (cloak,collar):
        active(ob)
        sub=ob.modifiers.new('Soft_cloth_surface','SUBSURF');sub.levels=1
        bpy.ops.object.modifier_apply(modifier=sub.name)
        thick=ob.modifiers.new('Sewn_fabric_thickness','SOLIDIFY');thick.thickness=.006;thick.offset=0
        bpy.ops.object.modifier_apply(modifier=thick.name)
    parts=[cloak,collar]
    hems=[[sample(i,m) for i in range(n+1)],
          [sample(0,j) for j in range(m+1)],
          [sample(n,j) for j in range(m+1)]]
    for k,path in enumerate(hems):
        parts.append(tube('Soft_rolled_cape_edge_'+str(k),path,.0035,trim,8))
    # Fine separated stitches sit just inside the hem, following its waves.
    stitchpath=[sample(i,m-1) for i in range(n+1)]
    for i in range(0,n-1,2):
        a,b=stitchpath[i],stitchpath[i+1]
        radial=Vector((a.x-CX,a.y-CY,0)).normalized()
        parts.append(tube('Hem_topstitch', [a+radial*.006,a.lerp(b,.72)+radial*.006],.0016,trim,6))
    center=(sample(0,0)+sample(n,0))*.5+Vector((0,-.020,-.045))
    shape=[]
    for i in range(64):
        a=TAU*i/64
        shape.append((.047*math.sin(a)*(1-.40*max(0,math.cos(a))),.064*math.cos(a)))
    parts.append(profile_plate('Pearl_drop_joined_neckline_clasp',shape,center,Matrix.Identity(3),.025,pearl,.010))
    parts.append(tube('Clasp_sewn_connection',[sample(0,1),center,sample(n,1)],.005,clothmat,8))
    return parts
