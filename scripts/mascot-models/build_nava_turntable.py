"""Independent Blender sculpt study for the NAVA turntable.

Run with:
  blender --background --python build_nava_turntable.py -- --repo PATH --out PATH
"""
from __future__ import annotations

from pathlib import Path
import math
import json
import argparse
import sys
import bpy
from mathutils import Vector

parser=argparse.ArgumentParser(description='Build editable NAVA cat turntable .blend')
parser.add_argument('--repo',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--contour',type=Path)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
REPO=args.repo.resolve()
OUT=args.out.resolve()
OUT.mkdir(parents=True, exist_ok=True)
SOURCE=REPO/'src/assets/figma/home-option2/home-mascot-v5.png'
CONTOUR = json.loads((args.contour or OUT/'source-body-contour.json').read_text(encoding='utf-8'))
CONTOUR_FIRST=CONTOUR[0][0]
SMOOTH_CONTOUR=[]
for i,row in enumerate(CONTOUR):
    weights=[]
    values=[]
    for offset in range(-5,6):
        j=max(0,min(len(CONTOUR)-1,i+offset))
        weight=math.exp(-.5*(offset/2.1)**2)
        weights.append(weight)
        values.append(CONTOUR[j])
    total=sum(weights)
    SMOOTH_CONTOUR.append((sum(w*v[1] for w,v in zip(weights,values))/total,
                           sum(w*v[2] for w,v in zip(weights,values))/total))

def source_body_widths(z):
    source_y = 256-(z-.10)*512/3.40
    if source_y < 145 or source_y > 424:
        return None
    row_float=max(0,min(len(CONTOUR)-1,source_y-CONTOUR_FIRST))
    low=int(math.floor(row_float))
    high=min(len(CONTOUR)-1,low+1)
    frac=row_float-low
    left=SMOOTH_CONTOUR[low][0]*(1-frac)+SMOOTH_CONTOUR[high][0]*frac
    right=SMOOTH_CONTOUR[low][1]*(1-frac)+SMOOTH_CONTOUR[high][1]*frac
    scale=512/3.40
    left_world=(left-256)/scale+.20
    right_world=(right-256)/scale+.20
    active=max(0,min(1,(source_y-145)/15))
    active=active*active*(3-2*active)
    return -left_world,right_world,active

def front_art_weight(sine):
    u=max(0,min(1,(-sine-.70)/.30))
    return u*u*(3-2*u)

# Reset factory scene without touching preferences or installed files.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    front = nodes.new("ShaderNodeAttribute")
    front.attribute_name = "Front"
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(SOURCE), check_existing=True)
    front_mask = nodes.new("ShaderNodeMath")
    front_mask.operation = 'MULTIPLY'
    mat.node_tree.links.new(front.outputs["Fac"],front_mask.inputs[0])
    mat.node_tree.links.new(image_node.outputs["Alpha"],front_mask.inputs[1])
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type='MIX'
    mat.node_tree.links.new(front_mask.outputs[0],mix.inputs[0])
    mat.node_tree.links.new(attr.outputs["Color"],mix.inputs[1])
    mat.node_tree.links.new(image_node.outputs["Color"],mix.inputs[2])
    mat.node_tree.links.new(mix.outputs["Color"], emission.inputs["Color"])
    mat.node_tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat


def plain_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*color, 1.0)
    mat.node_tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat


BODY_MAT = material("NAVA continuous airbrush body")
TAIL_MAT = material("NAVA tail two-sided gradient")
WHITE = plain_material("NAVA ivory white facial marks", (1, 1, 1))


def loft_mesh(name, vertices, faces, colors, fronts, mat, smooth_normals=None):
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    color_layer = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for item, color in zip(color_layer.data, colors):
        item.color = (*color, 1.0)
    front_layer=mesh.attributes.new(name='Front',type='FLOAT',domain='POINT')
    for item,value in zip(front_layer.data,fronts):
        item.value=value
    uv=mesh.uv_layers.new(name='Front v5 projection')
    for polygon in mesh.polygons:
        for loop_idx in polygon.loop_indices:
            vi=mesh.loops[loop_idx].vertex_index
            x,y,z=vertices[vi]
            # Matches the calibrated 512px orthographic front camera.
            sx=256+(x-.20)*512/3.40
            sy=256-(z-.10)*512/3.40
            uv.data[loop_idx].uv=(sx/512,1-sy/512)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if smooth_normals is not None:
        mesh.normals_split_custom_set_from_vertices(smooth_normals)
    return obj


def catmull(x, pts):
    if x <= pts[0][0]: return pts[0][1]
    if x >= pts[-1][0]: return pts[-1][1]
    for j in range(len(pts)-1):
        x1,y1=pts[j]; x2,y2=pts[j+1]
        if x1 <= x <= x2:
            t=(x-x1)/(x2-x1)
            # Hermite tangents are derivatives in world Z, scaled by the
            # current segment width. The old half-neighbour difference only
            # works for uniform keys and left C1 kinks at every profile key.
            def tangent(k):
                lo=max(0,k-1);hi=min(len(pts)-1,k+1)
                return (pts[hi][1]-pts[lo][1])/(pts[hi][0]-pts[lo][0])
            m1=tangent(j)*(x2-x1)
            m2=tangent(j+1)*(x2-x1)
            return (2*t**3-3*t*t+1)*y1+(t**3-2*t*t+t)*m1+(-2*t**3+3*t*t)*y2+(t**3-t*t)*m2
    return pts[-1][1]


# One body surface. Fur tiers are radial displacements within the SAME mesh;
# the paws are front-surface bulges, not separate cylinders attached by seams.
XR=[(-1.03,.06),(-.99,.38),(-.90,.63),(-.75,.77),(-.54,.83),(-.36,.86),(-.15,.91),(.04,.94),(.20,.91),(.39,.84),(.56,.74),(.73,.62),(.86,.45),(.95,.21),(.98,.05)]
YR=[(-1.03,.06),(-.99,.37),(-.90,.54),(-.75,.62),(-.54,.69),(-.36,.71),(-.15,.73),(.04,.73),(.20,.69),(.39,.64),(.56,.57),(.73,.46),(.86,.33),(.95,.15),(.98,.04)]


def profile(z):
    xr=catmull(z,XR)
    yr=catmull(z,YR)
    # Three tiered fur crowns. Gentle broad bases and sharp outward crest.
    fur=sum(a*math.exp(-((z-h)/w)**2) for h,a,w in ((.35,.105,.105),(.00,.135,.105),(-.29,.095,.095)))
    return xr,yr*.86,fur


def paw_bulge(x,z):
    rise=max(0.0,min(1.0,(z+.97)/.50))
    fall=max(0.0,min(1.0,(.02-z)/.39))
    rise=rise*rise*(3-2*rise)
    fall=fall*fall*(3-2*fall)
    vertical=rise*fall
    return .14*vertical*(math.exp(-((x-.21)/.135)**4)+math.exp(-((x+.21)/.135)**4))


def front_y(x,z):
    xr,yr,_=profile(z)
    q=max(0,min(.995,abs(x)/max(xr,.01)))
    return -yr*math.sqrt(1-q*q)-paw_bulge(x,z)


def smooth_body_position(z, theta):
    xr,yr,_=profile(z)
    cs=math.cos(theta);sn=math.sin(theta)
    x=xr*cs
    y=yr*sn
    if sn<0:
        y-=paw_bulge(x,z)*(-sn)**4
        y-=.20*math.exp(-((x/.56)**2+((z-.37)/.29)**2))*max(0,-sn)**4
    return Vector((x,y,z))

def smooth_body_normal(z, theta):
    step=.002
    tangent_theta=smooth_body_position(z,theta+step)-smooth_body_position(z,theta-step)
    tangent_z=smooth_body_position(z+step,theta)-smooth_body_position(z-step,theta)
    return tuple(tangent_theta.cross(tangent_z).normalized())

verts=[];faces=[];colors=[];fronts=[];body_normals=[]
RINGS=186;SIDES=192
for i in range(RINGS):
    z=-1.01+(1.99*i/(RINGS-1))
    xr,yr,fur=profile(z)
    source_widths=source_body_widths(z)
    for j in range(SIDES):
        theta=2*math.pi*j/SIDES
        cs=math.cos(theta); sn=math.sin(theta)
        side=abs(cs)**8
        if source_widths is None:
            radial=xr+fur*side
        else:
            target=source_widths[0] if cs<0 else source_widths[1]
            # Source contour sculpts the lateral cheek/fur edges. The center
            # of front and rear surfaces follows a smooth pear volume; the
            # 2D row contour must not become an annular ridge around it.
            # V5's three side tufts belong to a narrow meridian at the
            # frontal silhouette. Spreading the 2D row contour around the
            # whole volume creates concentric ridges under real lighting.
            backfade=max(0.0,min(1.0,sn/.32))
            backfade=1-backfade*backfade*(3-2*backfade)
            radial=xr+(target-xr)*source_widths[2]*(abs(cs)**24)*backfade
        x=radial*cs
        # Keep the face/chest volume smooth. Layered fur projects rearward,
        # where it creates the three swept tiers seen in the side guide.
        y=yr*sn
        if sn>0:
            # Side-view fur tips sit on the rear outline rather than forming
            # full horizontal bands across the flank. Their narrow angular
            # footprint also keeps the central side wall continuous.
            rear_tuft=sum(a*math.exp(-((z-h)/w)**2) for h,a,w in ((.22,.105,.10),(-.12,.145,.10),(-.39,.085,.08)))
            y+=rear_tuft*(sn**4)
        if sn<0:
            y-=paw_bulge(x,z)*(-sn)**4
            y-=.20*math.exp(-((x/.56)**2+((z-.37)/.29)**2))*max(0,-sn)**4
        verts.append((x,y,z))
        # The soft fur silhouette is a tufted surface, not a stack of rigid
        # corrugated rings. Smooth the sculpt shading against the continuous
        # underlying pear volume; retain the displaced silhouette vertices.
        body_normals.append(smooth_body_normal(z,theta))
        # Soft ice-blue peripheral shading and darker back of the mask.
        contour=max(0.0,1-abs(sn))
        # Broad lateral tint only; row-wise fur color would revive the
        # horizontal striping even after the surface normals are smoothed.
        cool=(.13+.26*contour+.06*side+.17*max(0,sn))
        base=[min(1,.985-.22*cool),min(1,.995-.075*cool),1]
        if y<.0:
            # The face marking is a smooth dark cap on the forward volume.
            # Basing it on depth avoids projecting source fur pixels around
            # the side as dark horizontal bands.
            face=math.exp(-(((y+.87)/.28)**2+((z-.37)/.32)**2)*1.02)
            navy=(.005,.07,.16)
            base=[(1-face)*base[c]+face*navy[c] for c in range(3)]
            dark=max(0.0,min(1.0,(-z-.44)/.49))**1.55
            paw=(math.exp(-((x-.21)/.123)**6)+math.exp(-((x+.21)/.123)**6))*dark*min(1,(-sn+.15)*1.5)
            base=[(1-min(1,paw))*base[c]+min(1,paw)*(.012,.11,.23)[c] for c in range(3)]
        else:
            # The rear remains white with a subtle pale blue edge.
            back=max(0,sn)*.055
            crown=max(0,sn)**2*math.exp(-((z-.80)/.29)**2)
            base=[base[0]-back-.25*crown,base[1]-back*.4-.07*crown,base[2]]
        colors.append(tuple(max(0,min(1,v)) for v in base))
        # The canonical 2D art is projected only on the truly frontal patch.
        # Excluding the lateral rim avoids carrying its jagged alpha edge
        # around the side as a visible striped seam.
        art_edge=max(0.0,min(1.0,(abs(x)-.50)/.15))
        art_edge=1-art_edge*art_edge*(3-2*art_edge)
        fronts.append(front_art_weight(sn)*art_edge)
for i in range(RINGS-1):
    for j in range(SIDES):
        a=i*SIDES+j; b=i*SIDES+(j+1)%SIDES
        faces.append((a,b,b+SIDES,a+SIDES))
faces.append(tuple(reversed(tuple(range(SIDES)))))
faces.append(tuple((RINGS-1)*SIDES+j for j in range(SIDES)))
BODY=loft_mesh("Continuous pear body with sculpted fur and paws",verts,faces,colors,fronts,BODY_MAT,body_normals)


# Two tapered pointed ears, sunk into the body so no exposed base ring.
for sign,label in ((-1,"left"),(1,"right")):
    ev=[];ef=[];ec=[];efront=[]
    EN=54;ER=25
    for i in range(ER):
        t=i/(ER-1)
        z=.77+.39*t
        width=.28*(1-t)**.80+.006
        depth=.19*(1-t)**.75+.004
        cx=sign*(.34+.035*t)
        cy=.04+.03*t
        for j in range(EN):
            q=2*math.pi*j/EN
            x=cx+width*math.cos(q)
            y=cy+depth*math.sin(q)
            ev.append((x,y,z))
            blue=.08+.20*max(0,-math.sin(q))*(1-t)
            ec.append((1-.15*blue,1-.055*blue,1))
            efront.append(front_art_weight(math.sin(q)))
    for i in range(ER-1):
        for j in range(EN):
            a=i*EN+j;b=i*EN+(j+1)%EN
            ef.append((a,b,b+EN,a+EN))
    ef.append(tuple((ER-1)*EN+j for j in range(EN)))
    loft_mesh(f"Tapered {label} ear",ev,ef,ec,efront,BODY_MAT)


# A single swept 3D tube, attached behind the right haunch. The visible front
# stays pale, while rearward and distal surfaces take the navy gradient.
tv=[];tf=[];tc=[];tfront=[]
TN=56;TR=52
for i in range(TR):
    t=i/(TR-1)
    # Smooth cubic path; no discontinuous elbow or segment overlaps.
    x=.40+1.082*t
    # The tail starts at the right haunch and sweeps rearward. Its lateral
    # offset preserves the source front silhouette; depth makes it legible
    # from the side instead of disappearing edge-on.
    y=.07+.90*t**1.5
    z=-.76-.045*math.sin(math.pi*t)
    root_grow=max(0.0,min(1.0,t/.28))
    root_grow=root_grow*root_grow*(3-2*root_grow)
    r=.04+(.04+.20*root_grow)*(1-t)**.65
    for j in range(TN):
        q=2*math.pi*j/TN
        yy=y+r*.60*math.cos(q)
        zz=z+r*.78*math.sin(q)
        tv.append((x,yy,zz))
        distal=max(0.0,min(1.0,(t-.16)/.84))
        # V5's entire front tail stays pale; navy is restricted to the back
        # of the tube, as seen in the formal side/back turnaround.
        rear=max(0.0,min(1.0,(math.cos(q)+.10)/.50))
        rear=rear*rear*(3-2*rear)
        navy=rear*(distal**.80)
        pale=(.96,.995,1.0); dark=(.002,.012,.04)
        tc.append(tuple((1-navy)*pale[c]+navy*dark[c] for c in range(3)))
        tfront.append(max(0,-math.cos(q))**.4)
for i in range(TR-1):
    for j in range(TN):
        a=i*TN+j;b=i*TN+(j+1)%TN
        tf.append((a,b,b+TN,a+TN))
tf.append(tuple(range(TN)))
end_start=len(tv)
for j in range(TN):
    q=2*math.pi*j/TN
    tv.append((1.482,.97+.04*.60*math.cos(q),-.76+.04*.78*math.sin(q)))
    tc.append((.002,.012,.04))
    tfront.append(0.0)
tf.append(tuple(end_start+j for j in range(TN)))
loft_mesh("Continuous long low tail",tv,tf,tc,tfront,TAIL_MAT)


def curve(name, pts, width=.017):
    c=bpy.data.curves.new(name,'CURVE')
    c.dimensions='3D'
    c.resolution_u=24
    c.bevel_depth=width
    c.bevel_resolution=3
    s=c.splines.new('POLY')
    s.points.add(len(pts)-1)
    for p,xyz in zip(s.points,pts):
        p.co=(*xyz,1)
    obj=bpy.data.objects.new(name,c)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(WHITE)
    return obj


# Eyes and nose are taken from the exact source projection. Independent curves
# would double them in the idle front frame.


# Camera / frame calibration: same orthographic geometry for all yaw views.
cam_data=bpy.data.cameras.new('NAVA orthographic camera')
cam=bpy.data.objects.new('NAVA orthographic camera',cam_data)
bpy.context.collection.objects.link(cam)
cam_data.type='ORTHO';cam_data.ortho_scale=3.40
scene=bpy.context.scene
scene.camera=cam
target=Vector((.20,0,.10))
cam.location=(.20,-6,.10)
cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler()

scene.render.engine='CYCLES'
scene.cycles.samples=8
scene.render.resolution_x=512
scene.render.resolution_y=512
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast'
scene.render.filepath=str(OUT/'blender-front.png')

# Parent the model pieces to a yaw root, leaving camera and scene stable.
root=bpy.data.objects.new('NAVA yaw root',None)
bpy.context.collection.objects.link(root)
root.location.x=.20
bpy.context.view_layer.update()
for obj in list(bpy.context.scene.objects):
    if obj is root or obj.type=='CAMERA':continue
    obj.parent=root
    obj.matrix_parent_inverse=root.matrix_world.inverted()

for yaw in (0,15,45,90,135,180,225,270,315,345):
    root.rotation_euler=(0,0,math.radians(yaw))
    bpy.context.view_layer.update()
    scene.render.filepath=str(OUT/f'blender-{yaw:03d}.png')
    bpy.ops.render.render(write_still=True)

root.rotation_euler=(0,0,0)
bpy.context.view_layer.update()
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'nava-cat-sculpt-study.blend'))
print('Saved independent Blender study to',OUT)
