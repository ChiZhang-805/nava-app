"""Build all NAVA wardrobe accessories as editable solids in mascot space.

Run using Blender 5.2: blender --background --python build_accessories.py
NAVA_MODEL_OUTPUT may override the default project build directory.
"""

from __future__ import annotations

import json
import hashlib
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(os.environ.get("NAVA_MODEL_OUTPUT", Path(__file__).resolve().parents[3] / "Build" / "MascotModels" / "accessories"))
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

GROUP = None
COLLECTION = None


def color_material(name, color, metallic=0.0, roughness=0.4, alpha=1.0, emission=0.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = (*color, alpha)
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
    return mat


NAVY = color_material("navy enamel textile", (.017, .105, .29), roughness=.38)
NAVY_DARK = color_material("midnight indigo textile", (.01, .045, .13), roughness=.36)
GOLD = color_material("warm polished gold", (.91, .58, .13), metallic=.85, roughness=.22)
GOLD_LIGHT = color_material("gold leaf highlight", (1, .82, .30), metallic=.72, roughness=.24)
CREAM = color_material("warm pearl ivory", (.94, .94, .87), roughness=.27)
WHITE = color_material("snow ivory", (.93, .97, 1), roughness=.36)
SKY = color_material("cloud-knit blue", (.39, .72, .96), roughness=.74)
SKY_LIGHT = color_material("cloud-knit highlight", (.67, .88, 1), roughness=.73)
SKY_SHADOW = color_material("cloud-knit lower stitch", (.26, .58, .85), roughness=.79)
ICE = color_material("ice blue satin", (.42, .83, .99), roughness=.26)
MINT = color_material("soft mint plush", (.57, .94, .88), roughness=.8)
LAVENDER = color_material("mist lavender velvet", (.59, .51, .84), roughness=.76)
LAVENDER_LIGHT = color_material("lilac velvet light", (.80, .73, .97), roughness=.75)
RED = color_material("cherry satin", (.76, .075, .17), roughness=.29)
RED_LIGHT = color_material("cherry satin light", (.97, .19, .31), roughness=.27)
HONEY = color_material("honey knitted yarn", (.94, .55, .16), roughness=.72)
HONEY_LIGHT = color_material("honey yarn highlights", (1, .75, .32), roughness=.72)
HONEY_SHADOW = color_material("honey woven recess", (.75, .36, .075), roughness=.78)
GREEN = color_material("laurel stem green", (.14, .40, .22), roughness=.52)
LEAF = color_material("laurel leaf green", (.28, .61, .31), roughness=.49)
AQUA = color_material("aqua glass enamel", (.12, .78, .85), metallic=.3, roughness=.20)
PURPLE = color_material("iridescent lilac", (.67, .52, .98), metallic=.24, roughness=.24)
CAPE = color_material("translucent raindrop ice", (.45, .83, .99), roughness=.14, alpha=.67)
CAPE_EDGE = color_material("cape edge opaque blue", (.34, .68, .95), roughness=.22)
BLACK = color_material("dark bell chime slot", (.025, .023, .018), roughness=.35)


def begin(item_id):
    global GROUP, COLLECTION
    COLLECTION = bpy.data.collections.new(item_id)
    bpy.context.scene.collection.children.link(COLLECTION)
    GROUP = bpy.data.objects.new(item_id, None)
    COLLECTION.objects.link(GROUP)
    GROUP.empty_display_type = 'SPHERE'
    GROUP.empty_display_size = .08
    GROUP["wardrobeAccessoryId"] = item_id
    GROUP["coordinateConvention"] = "Z up; -Y front; rotate with mascot around X=0.20"
    return GROUP


def register(obj, mat=None):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    COLLECTION.objects.link(obj)
    obj.parent = GROUP
    if mat:
        obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def sphere(name, pos, scale, mat, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return register(obj, mat)


def cylinder(name, pos, radius, depth, mat, rotation=(0,0,0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos, rotation=rotation)
    obj=bpy.context.object;obj.name=name
    return register(obj,mat)


def mesh(name, vertices, faces, mat):
    data=bpy.data.meshes.new(name+" mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    COLLECTION.objects.link(obj)
    obj.parent=GROUP
    obj.data.materials.append(mat)
    for p in data.polygons:p.use_smooth=True
    return obj


def tube(name, points, radius, mat, sides=8, cyclic=False, elliptical=(1,1)):
    """Round closed solid swept along a 3D polyline."""
    pts=[Vector(p) for p in points]
    if len(pts)<2:return None
    verts=[];faces=[]
    n=len(pts)
    for i,p in enumerate(pts):
        tangent=(pts[(i+1)%n]-pts[(i-1)%n]).normalized() if cyclic else (
            (pts[1]-pts[0]).normalized() if i==0 else
            (pts[-1]-pts[-2]).normalized() if i==n-1 else
            (pts[i+1]-pts[i-1]).normalized())
        trial=Vector((0,0,1)) if abs(tangent.z)<.88 else Vector((0,1,0))
        a=tangent.cross(trial).normalized()
        b=tangent.cross(a).normalized()
        r=radius[i] if isinstance(radius,(list,tuple)) else radius
        for j in range(sides):
            q=2*math.pi*j/sides
            v=p+r*(elliptical[0]*math.cos(q)*a+elliptical[1]*math.sin(q)*b)
            verts.append(v)
    limits=n if cyclic else n-1
    for i in range(limits):
        ni=(i+1)%n
        for j in range(sides):
            jj=(j+1)%sides
            faces.append((i*sides+j,i*sides+jj,ni*sides+jj,ni*sides+j))
    if not cyclic:
        faces.append(tuple(reversed(tuple(range(sides)))))
        faces.append(tuple((n-1)*sides+j for j in range(sides)))
    return mesh(name, verts, faces, mat)


def ring(name, center, rx, ry, z, radius, mat, steps=56):
    return tube(name,[(center[0]+rx*math.cos(t),center[1]+ry*math.sin(t),z) for t in (i*2*math.pi/steps for i in range(steps))],radius,mat,cyclic=True)


def drape_points(rx,ry,base_z,sag,steps=72,z_offset=0):
    """Collar path follows the cat's shoulders, dropping over the chest."""
    result=[]
    for i in range(steps):
        q=2*math.pi*i/steps
        front=max(0,-math.sin(q))
        back=max(0,math.sin(q))
        z=base_z-sag*front**1.5-.5*sag*back**1.5+z_offset
        # The body is shallower at the back of the shoulders; the centre path
        # stays just outside the blended pear silhouette at each angle.
        x=rx*math.cos(q)
        y=(ry+.025*front)*math.sin(q)
        result.append((x,y,z))
    return result


def draped_band(name,rx,ry,base_z,sag,radius,mat,elliptical=(.58,1.3),offset=0):
    return tube(name,drape_points(rx,ry,base_z,sag,z_offset=offset),radius,mat,cyclic=True,elliptical=elliptical)


def curved_hat_brim(name,center,rx,ry,front_z,side_drop,back_drop,radius,mat):
    """Brim lands on sloping cranium at its sides and rear, not a flat disc."""
    cx,cy=center
    pts=[]
    for i in range(64):
        q=2*math.pi*i/64
        side=abs(math.cos(q))**1.7
        back=max(0,math.sin(q))**1.5
        pts.append((cx+rx*math.cos(q),cy+ry*math.sin(q),front_z-side_drop*side-back_drop*back))
    return tube(name,pts,radius,mat,cyclic=True,elliptical=(.7,1))


def ribbon(name, centers, widths, thickness, mat):
    """Solid fabric strip from a center path. Width follows cross-product with Z."""
    pts=[Vector(p) for p in centers]
    n=len(pts)
    if isinstance(widths,(int,float)):widths=[widths]*n
    verts=[];faces=[]
    for i,p in enumerate(pts):
        tan=(pts[min(n-1,i+1)]-pts[max(0,i-1)]).normalized()
        side=tan.cross(Vector((0,0,1)))
        if side.length<.02:side=Vector((1,0,0))
        side.normalize()
        front=Vector((0,-1,0))
        w=widths[i]/2
        for sw,st in ((-1,-1),(1,-1),(1,1),(-1,1)):
            verts.append(p+side*sw*w+front*st*thickness/2)
    for i in range(n-1):
        a=4*i;b=4*(i+1)
        faces.extend(((a,a+1,b+1,b),(a+3,b+3,b+2,a+2),(a,a+3,b+3,b),(a+1,b+1,b+2,a+2)))
    faces.extend(((0,1,2,3),(4*(n-1),4*(n-1)+3,4*(n-1)+2,4*(n-1)+1)))
    return mesh(name,verts,faces,mat)


def leaf(name, center, length, width, direction, mat, depth=.045, fold=.035):
    """Pointed 3D leaf in an arbitrary direction, with raised midrib and back."""
    c=Vector(center);d=Vector(direction).normalized()
    side=Vector((0,0,1)).cross(d)
    if side.length<.01:side=Vector((1,0,0))
    side.normalize()
    normal=d.cross(side).normalized()
    a=c-d*length/2;b=c+d*length/2
    left=c+side*width/2;right=c-side*width/2
    verts=[a,left,b,right,c+normal*fold,c-normal*depth]
    faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)]
    return mesh(name,verts,faces,mat)


def star(name, center, outer, inner, mat, tips=5, depth=.045, angle=math.pi/2):
    x,y,z=center
    pts=[]
    for j in range(2*tips):
        r=outer if j%2==0 else inner
        a=angle+j*math.pi/tips
        pts.append((x+r*math.cos(a),z+r*math.sin(a)))
    verts=[(x,y-depth/2,z),(x,y+depth/2,z)]
    verts += [(px,y-depth/2,pz) for px,pz in pts]
    verts += [(px,y+depth/2,pz) for px,pz in pts]
    faces=[];n=2*tips
    for j in range(n):
        k=(j+1)%n
        faces.extend(((0,2+j,2+k),(1,2+n+k,2+n+j),(2+j,2+n+j,2+n+k,2+k)))
    return mesh(name,verts,faces,mat)


def bow(prefix, center, sx, sz, mat, knot_mat):
    x,y,z=center
    for s in (-1,1):
        a=(x+s*.035*sx,y-.005,z)
        b=(x+s*.20*sx,y-.06,z+.12*sz)
        c=(x+s*.35*sx,y-.025,z+.06*sz)
        d=(x+s*.28*sx,y,z-.11*sz)
        e=(x+s*.17*sx,y-.01,z-.07*sz)
        mesh(f"{prefix} {'left' if s<0 else 'right'} structured satin loop",[a,b,c,d,e,(x+s*.22*sx,y+.07,z)],[(0,1,2),(0,2,3),(0,3,4),(1,5,2),(2,5,3),(3,5,4)],mat)
        tube(f"{prefix} raised loop hem {s}",[a,b,c,d,e,a],.012*sz,knot_mat)
    sphere(f"{prefix} tied knot",center,(.085*sx,.075*sx,.075*sz),knot_mat)


# 01 Bell collar: continuous leather loop, bright metal hardware, hollow bell impression.
begin("accessory-bell-collar")
draped_band("navy fitted collar around shoulders",1.02,.70,.105,.175,.045,NAVY,elliptical=(.56,1.0))
draped_band("collar upper piping",1.02,.70,.105,.175,.008,SKY,elliptical=(.8,1),offset=.038)
sphere("gold hanging bail",(0,-.755,-.13),(.050,.030,.075),GOLD)
sphere("round jingle bell",(0,-.82,-.245),(.112,.098,.11),GOLD)
ring("raised bell equatorial seam",(0,-.82),.11,.098,-.246,.010,GOLD_LIGHT,36)
sphere("bell chime slot",(0,-.913,-.286),(.030,.010,.023),BLACK)
tube("bell lower split",[(0,-.917,-.29),(0,-.917,-.35)],.008,BLACK)

# 02 Cloud scarf: knitted wrap has a complete back, body, pendant end and fringe.
begin("accessory-cloud-scarf")
draped_band("knit scarf follows chest and shoulders",1.045,.775,.16,.285,.116,SKY,elliptical=(.55,1.38))
draped_band("scarf upper plush fold",1.045,.775,.16,.285,.028,SKY_LIGHT,elliptical=(.85,1),offset=.115)
draped_band("scarf lower stitched hem",1.045,.775,.16,.285,.022,SKY_LIGHT,elliptical=(.85,1),offset=-.123)
ribbon("hanging right scarf end",[(.49,-.80,-.14),(.60,-.82,-.28),(.67,-.84,-.48),(.69,-.83,-.67)], [.24,.27,.29,.30],.11,SKY)
for k in range(9):
    x=.56+(k-4)*.027
    tube(f"scarf fringe strand {k+1}",[(x,-.86,-.66),(x+.012,-.89,-.80)],.016,SKY_LIGHT)
for k in range(11):
    q=math.pi+math.pi*(k+.5)/11
    x=1.045*math.cos(q);y=.84*math.sin(q)
    z=.16-.285*max(0,-math.sin(q))**1.5
    tube(f"knit stitch front {k+1}",[(x,y,z+.07),(x+.018,y-.008,z-.065)],.010,SKY_LIGHT)
for row,zshift in enumerate((-.055,.045)):
    for k in range(17):
        q=math.pi+math.pi*(k+.5)/17
        x=1.045*math.cos(q);y=.852*math.sin(q)
        z=.16-.285*max(0,-math.sin(q))**1.5+zshift
        tube(f"interlocked cloud yarn V {row+1}-{k+1}",[(x-.035,y,z+.025),(x,y-.012,z-.018),(x+.035,y,z+.025)],.009,SKY_SHADOW)

# 03 Mist beret: angled felt cap, defined lip, pom stem, complete underside.
begin("accessory-mist-beret")
sphere("structured mist beret crown",(-.12,-.04,.93),(.30,.47,.12),LAVENDER)
curved_hat_brim("beret roll follows cranium",(-.12,-.04),.52,.44,.90,.085,.09,.028,LAVENDER_LIGHT)
sphere("beret center gather",(-.18,-.02,1.025),(.09,.08,.035),LAVENDER_LIGHT)
tube("beret curled stem",[(-.18,-.02,1.03),(-.22,-.01,1.09),(-.19,0,1.13)],.020,LAVENDER)

# 04 Star and moon clip: backing clip and dimensional crescent around star.
begin("accessory-star-moon-clip")
sphere("small hidden hair clasp",(.49,-.23,.99),(.19,.055,.075),NAVY)
star("five point celestial star",(.42,-.33,1.04),.128,.051,GOLD_LIGHT,depth=.042)
arc=[]
for k in range(29):
    t=-1.02+2.25*k/28
    arc.append((.57+.105*math.cos(t),-.315,1.015+.105*math.sin(t)))
tube("golden crescent rim",arc,[.009+.018*math.sin(math.pi*k/28) for k in range(29)],GOLD)
sphere("moon luminous bead",(.60,-.34,.96),(.020,.016,.020),WHITE)

# 05 Pearl bow: sculpted satin folds and raised pearl bead.
begin("accessory-pearl-bow")
bow("pearl neck bow",(0,-.82,-.155),1.0,1.0,CREAM,WHITE)
sphere("central cultured pearl",(0,-.91,-.15),(.073,.07,.073),WHITE)

# 06 Mint earmuffs: arch can be read from the back and each ear pad has volume.
begin("accessory-mint-earmuffs")
arch=[]
for k in range(33):
    t=math.pi*k/32
    arch.append((.66*math.cos(t),-.055,.91+.48*math.sin(t)))
tube("plush padded headband",arch,.060,MINT)
tube("headband inner blue seam",[(x,-.087,z-.028) for x,y,z in arch],.012,ICE)
for s,label in ((-1,"left"),(1,"right")):
    sphere(f"{label} ear covering plush pad",(s*.66,-.115,.875),(.172,.115,.195),MINT)
    sphere(f"{label} pale inner ear cushion",(s*.66,-.225,.875),(.123,.039,.145),WHITE)
    ring(f"{label} pad edge welt",(s*.66,-.12),.162,.107,.87,.010,ICE,32)

# 07 Honey warmer: thick knitted neck ring with a woven rib and full back.
begin("accessory-honey-neck-warmer")
draped_band("honey wool warmer shaped around neck",1.055,.79,.145,.245,.140,HONEY,elliptical=(.58,1.30))
draped_band("honey turned top edge",1.055,.79,.145,.245,.033,HONEY_LIGHT,elliptical=(.7,1),offset=.145)
draped_band("honey lower knitted hem",1.055,.79,.145,.245,.024,HONEY_LIGHT,elliptical=(.7,1),offset=-.145)
for k in range(34):
    t=2*math.pi*k/34
    x=1.055*math.cos(t);y=.84*math.sin(t)
    z=.145-.245*max(0,-math.sin(t))**1.5-.1225*max(0,math.sin(t))**1.5
    tube(f"raised knitted rib {k+1}",[(x,y,z-.11),(x*1.01,y*1.01,z+.11)],.010,HONEY_LIGHT)
for row,zshift in enumerate((-.07,.05)):
    for k in range(20):
        q=math.pi+math.pi*(k+.5)/20
        x=1.055*math.cos(q);y=.872*math.sin(q)
        z=.145-.245*max(0,-math.sin(q))**1.5+zshift
        tube(f"woven honey V {row+1}-{k+1}",[(x-.028,y,z+.025),(x,y-.008,z-.018),(x+.028,y,z+.025)],.010,HONEY_SHADOW)

# 08 Cloud backpack: inflated cloud shell behind the torso, straps over shoulders.
begin("accessory-cloud-backpack")
for j,(x,z,rx,rz) in enumerate(((-.58,-.13,.29,.25),(-.31,-.04,.35,.30),(-.07,-.16,.29,.24),(-.35,-.31,.43,.21))):
    sphere(f"backpack cloud puff {j+1}",(x,.88,z),(rx,.20,rz),SKY_LIGHT)
sphere("backpack cushioned rear body",(-.34,.92,-.18),(.49,.21,.34),SKY)
for s in (-1,1):
    tube(f"backpack shoulder strap {s}",[(s*.56,.68,.15),(s*.67,.23,.13),(s*.62,-.27,.05),(s*.57,-.48,-.19)],.057,ICE)
    sphere(f"strap slider {s}",(s*.60,-.42,-.12),(.055,.025,.040),GOLD_LIGHT)
star("cloud backpack enamel emblem",(-.30,1.115,-.10),.09,.042,GOLD_LIGHT,depth=.02)

# 09 Fish brooch: enamel fish, tail and pin all physically readable.
begin("accessory-fish-brooch")
sphere("little fish enamel body",(-.43,-.76,-.34),(.133,.045,.072),AQUA)
mesh("fish V tail",[(-.55,-.775,-.34),(-.67,-.78,-.25),(-.63,-.79,-.34),(-.67,-.78,-.43),(-.55,-.74,-.34)],[(0,1,2),(0,2,3),(4,2,1),(4,3,2)],AQUA)
leaf("fish dorsal fin",(-.42,-.79,-.277),.105,.047,(.32,0,1),ICE,depth=.025)
sphere("fish pearl eye",(-.36,-.807,-.32),(.014,.008,.014),NAVY_DARK)
tube("fish pin rim",[(-.52,-.79,-.33),(-.45,-.82,-.27),(-.35,-.79,-.30),(-.30,-.76,-.36)],.007,GOLD_LIGHT)

# 10 Laurel crown: genuine circlet with angled metal leaves front and rear.
begin("accessory-laurel-crown")
ring("laurel full gold circlet",(0,.015),.60,.36,.965,.018,GOLD)
for s in (-1,1):
    for k in range(6):
        x=s*(.10+k*.08)
        z=.995+.035*math.sin(k*.6)
        y=-.345+.018*k
        leaf(f"laurel gold leaf {s} {k+1}",(x,y,z),.14,.072,(s*.65,0,.75),GOLD_LIGHT,depth=.018)
    for k in range(3):
        x=s*(.13+k*.12)
        leaf(f"rear green leaf {s} {k+1}",(x,.32,.98),.16,.066,(s*.45,0,.89),LEAF,depth=.025)

# 11 Sailor cap: full soft white crown and navy folded band with a front shell.
begin("accessory-sailor-hat")
sphere("sea salt cap crown",(.04,-.02,.94),(.30,.42,.11),WHITE)
curved_hat_brim("sailor cap fitted folded brim",(.04,-.02),.51,.46,.925,.085,.10,.040,WHITE)
curved_hat_brim("navy cap fitted ribbon",(.04,-.02),.48,.41,.947,.085,.10,.018,NAVY)
sphere("front scallop shell",(.18,-.465,.955),(.10,.024,.057),ICE)
for k in range(5):
    x=.18+(k-2)*.028
    tube(f"shell flute {k+1}",[(x,-.489,.915),(x*.80+.036,-.49,1.005)],.008,WHITE)
ribbon("sailor hat trailing ribbon",[(.67,.25,.88),(.76,.29,.79),(.84,.31,.66)],[.09,.10,.07],.028,NAVY)

# 12 Cherry bow: dimensional double loop with berries on left ear.
begin("accessory-cherry-bow")
bow("cherry ear bow",(-.48,-.28,1.025),.68,.77,RED,RED_LIGHT)
for k,x in enumerate((-.53,-.43)):
    sphere(f"cherry bead {k+1}",(x,-.365,.925),(.037,.038,.039),RED_LIGHT)
    tube(f"cherry stem {k+1}",[(x,-.37,.95),(-.48,-.33,.995)],.008,GREEN)

# 13 Star glasses: two sculpted open star rims, bridge, and side temples.
begin("accessory-star-glasses")
for s in (-1,1):
    x=s*.255
    pts=[]
    for k in range(11):
        t=math.pi/2+k*math.pi/5
        r=.195 if k%2==0 else .100
        pts.append((x+r*math.cos(t),-.735,.42+r*math.sin(t)))
    tube(f"{s} open star lens frame",pts,.022,PURPLE,cyclic=True)
    tube(f"{s} silver spectacle temple",[(s*.42,-.72,.42),(s*.62,-.50,.43),(s*.72,-.20,.45)],.019,ICE)
tube("glasses central bridge",[(-.075,-.735,.43),(0,-.77,.455),(.075,-.735,.43)],.016,ICE)

# 14 Raindrop cape: full mantle with three-dimensional scalloped hem, split front.
begin("accessory-raindrop-cape")
N=96
verts=[];faces=[]
for row in range(11):
    t=row/10
    gap=.045+.25*t
    rx=.73+.25*t
    ry=.70+.11*t
    for j in range(N+1):
        q=-math.pi/2+gap+(2*math.pi-2*gap)*j/N
        front=max(0,-math.sin(q));back=max(0,math.sin(q))
        hem_depth=.34+.035*front+.11*back
        scallop=.026*(.5+.5*math.cos(10*q))**2*t**3
        z=.075-t*hem_depth-scallop
        # Gently flare beyond the fur, then drop across the chest in a V.
        verts.append((rx*math.cos(q),ry*math.sin(q),z))
for row in range(10):
    for j in range(N):
        a=row*(N+1)+j;b=a+1
        faces.append((a,b,b+N+1,a+N+1))
mesh("shoulder fitted split ice cape panels",verts,faces,CAPE)
hem=[verts[10*(N+1)+j] for j in range(N+1)]
tube("curved scalloped cape hem",hem,.018,CAPE_EDGE)
tube("right cape opening bound edge",[verts[row*(N+1)] for row in range(11)],.014,CAPE_EDGE)
tube("left cape opening bound edge",[verts[row*(N+1)+N] for row in range(11)],.014,CAPE_EDGE)
cape_yoke=drape_points(.76,.72,.165,.19,steps=72)
tube("left and right shoulder yoke",cape_yoke[36:]+[cape_yoke[0]],.034,ICE)
sphere("central raindrop clasp",(0,-.78,-.015),(.075,.038,.105),ICE)
for k in range(1,9):
    q=-math.pi/2+.295+(2*math.pi-.59)*k/9
    x=.98*math.cos(q);y=.81*math.sin(q)
    z=.075-(.34+.035*max(0,-math.sin(q))+.11*max(0,math.sin(q)))-.02
    sphere(f"cape pendant water bead {k+1}",(x,y,z),(.022,.022,.034),ICE)

# 15 Aurora scarf: wrapped colored bands and two free flowing tails.
begin("accessory-aurora-scarf")
draped_band("aurora teal draped scarf wrap",1.045,.775,.15,.26,.110,AQUA,elliptical=(.52,1.22))
draped_band("aurora violet upper piping",1.045,.775,.15,.26,.025,PURPLE,elliptical=(.75,1),offset=.105)
draped_band("aurora blue lower piping",1.045,.775,.15,.26,.020,ICE,elliptical=(.75,1),offset=-.110)
for wave,mat in enumerate((PURPLE,SKY_LIGHT,ICE)):
    pts=[]
    for k in range(45):
        q=math.pi+.07+(math.pi-.14)*k/44
        x=1.045*math.cos(q);y=.847*math.sin(q)
        z=.15-.26*max(0,-math.sin(q))**1.5-.038+wave*.04+.014*math.sin(q*6+wave)
        pts.append((x,y,z))
    tube(f"aurora woven color stream {wave+1}",pts,.008,mat)
ribbon("aurora long ribbon end",[(.52,-.79,-.12),(.70,-.79,-.20),(.94,-.74,-.23),(1.15,-.61,-.35)],[.21,.23,.25,.16],.072,PURPLE)
ribbon("aurora short ribbon end",[(.42,-.82,-.16),(.59,-.85,-.27),(.84,-.78,-.42)],[.18,.17,.12],.065,AQUA)
for k in range(7):
    x=.58+k*.09
    star(f"aurora little star fleck {k+1}",(x,-.845,-.22-.01*k),.016,.008,WHITE,depth=.008)

# 16 Lily garland: continuous vine over crown with bell-shaped white flowers.
begin("accessory-lily-garland")
vine=[]
for k in range(33):
    t=math.pi*k/32
    vine.append((.60*math.cos(t),-.22, .90+.25*math.sin(t)))
tube("garland bent ivy stem",vine,.019,GREEN)
for k in range(8):
    t=.20+(math.pi-.40)*k/7
    x=.60*math.cos(t);z=.90+.25*math.sin(t)
    leaf(f"lily garland green blade {k+1}",(x,-.23,z),.135,.055,((-1)**k*.5,-.1,.85),LEAF)
    if k%2==0:
        tube(f"lily blossom stalk {k+1}",[(x,-.24,z),(x+.022,-.31,z-.09)],.010,GREEN)
        sphere(f"lily hanging white bell {k+1}",(x+.023,-.32,z-.115),(.065,.055,.063),WHITE)
        ring(f"lily pale green sepal {k+1}",(x+.023,-.32),.055,.051,z-.14,.008,MINT,18)

# 17 Night voyage cap: felt crown, curved peak, band, and front star crest.
begin("accessory-night-voyage-cap")
sphere("night voyage cap sculpted crown",(.03,-.01,.93),(.30,.43,.11),NAVY_DARK)
curved_hat_brim("night voyage cap fitted rim",(.03,-.01),.50,.43,.915,.08,.10,.030,NAVY)
sphere("cap forward peak",(.03,-.39,.865),(.41,.22,.042),NAVY)
curved_hat_brim("night blue fitted embroidered band",(.03,-.02),.50,.44,.930,.08,.10,.013,ICE)
star("night voyage gold front badge",(.04,-.452,.940),.075,.036,GOLD_LIGHT,depth=.031)
sphere("star badge center gem",(.04,-.48,.940),(.018,.012,.018),ICE)


def ear_clearance_tool(side):
    """Closed rounded ear envelope copied from slices of the shipped cat GLB.

    The envelope follows the sculpted ear's taper rather than removing a large
    circular hole through the crown. A small gap leaves a readable fabric edge
    and keeps either ear from clipping at profile or three-quarter angles.
    """
    slices = (
        (.69, .305, .220), (.77, .305, .225), (.80, .267, .182),
        (.85, .238, .163), (.90, .209, .144), (.95, .178, .124),
        (1.00, .145, .102), (1.05, .111, .079), (1.10, .073, .054),
        (1.15, .029, .022), (1.20, .010, .010),
    )
    vertices=[]
    faces=[]
    n=24
    for z,rx,ry in slices:
        for j in range(n):
            angle=2*math.pi*j/n
            # Superellipse profile gently rounds the opening while covering
            # the actual front and back of the tapered triangular ear.
            c=math.cos(angle);s=math.sin(angle)
            x=side*.34+(rx+.033)*math.copysign(abs(c)**.75,c)
            y=.04+(ry+.032)*math.copysign(abs(s)**.75,s)
            vertices.append((x,y,z))
    for k in range(len(slices)-1):
        for j in range(n):
            jj=(j+1)%n
            faces.append((k*n+j,k*n+jj,(k+1)*n+jj,(k+1)*n+j))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((len(slices)-1)*n+j for j in range(n)))
    data=bpy.data.meshes.new(f"temporary ear clearance {side} mesh")
    data.from_pydata(vertices,[],faces)
    data.update()
    tool=bpy.data.objects.new(f"temporary ear clearance {side}",data)
    bpy.context.scene.collection.objects.link(tool)
    return tool


def carve_hat_ears(group_id, component_names):
    """Make physical openings in cap fabric so the ears emerge cleanly."""
    tools=[ear_clearance_tool(-1),ear_clearance_tool(1)]
    group=bpy.data.objects[group_id]
    for component in component_names:
        obj=next(obj for obj in group.children_recursive if obj.name==component)
        original_material=obj.data.materials[0]
        for tool in tools:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active=obj
            modifier=obj.modifiers.new('tailored cat ear opening','BOOLEAN')
            modifier.operation='DIFFERENCE'
            modifier.solver='EXACT'
            modifier.object=tool
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Blender's exact Boolean adds the cutter's empty material slot; keep
        # the tailored cap and the fresh cut faces in its original textile.
        obj.data.materials.clear()
        obj.data.materials.append(original_material)
        for polygon in obj.data.polygons:
            polygon.material_index=0
    for tool in tools:
        bpy.data.objects.remove(tool,do_unlink=True)


carve_hat_ears('accessory-mist-beret',(
    'structured mist beret crown','beret roll follows cranium'))
carve_hat_ears('accessory-sailor-hat',(
    'sea salt cap crown','sailor cap fitted folded brim','navy cap fitted ribbon'))
carve_hat_ears('accessory-night-voyage-cap',(
    'night voyage cap sculpted crown','night voyage cap fitted rim',
    'night blue fitted embroidered band'))


def add_ear_opening_welts(group_id, material):
    """Show the deliberately tailored edge around each ear aperture."""
    global GROUP,COLLECTION
    old_group,old_collection=GROUP,COLLECTION
    GROUP=bpy.data.objects[group_id]
    COLLECTION=bpy.data.collections[group_id]
    for side in (-1,1):
        points=[]
        for j in range(48):
            angle=2*math.pi*j/48
            c=math.cos(angle);s=math.sin(angle)
            points.append((side*.34+.226*math.copysign(abs(c)**.75,c),
                           .04+.166*math.copysign(abs(s)**.75,s),.925))
        tube(f"tailored {'left' if side<0 else 'right'} ear aperture welt",
             points,.011,material,cyclic=True)
    GROUP,COLLECTION=old_group,old_collection


add_ear_opening_welts('accessory-mist-beret',LAVENDER_LIGHT)
add_ear_opening_welts('accessory-sailor-hat',NAVY)
add_ear_opening_welts('accessory-night-voyage-cap',ICE)


# Every standalone item now sits on the cat body rather than being lifted for
# simultaneous selection. The app can assign temporary offsets at runtime if
# several scarves or hats are equipped, while preserving the real base fit.
FITTING_OFFSETS={
    'accessory-fish-brooch':(0,-.105,-.025),
    'accessory-cloud-scarf':(0,0,-.08),
    'accessory-honey-neck-warmer':(0,0,-.08),
    'accessory-aurora-scarf':(0,0,-.08),
}
for item_id,offset in FITTING_OFFSETS.items():
    root=bpy.data.objects[item_id]
    root.location=offset
    root['fittingOffsetXYZ']=list(offset)

for order,item_id in enumerate(('accessory-bell-collar','accessory-cloud-scarf','accessory-honey-neck-warmer','accessory-aurora-scarf')):
    root=bpy.data.objects[item_id]
    root['stackGroup']='neckwear'
    root['stackOrder']=order
for order,item_id in enumerate(('accessory-mist-beret','accessory-sailor-hat','accessory-night-voyage-cap')):
    root=bpy.data.objects[item_id]
    root['stackGroup']='headwear'
    root['stackOrder']=order


def geometry_fingerprint(group):
    """Material-tagged world vertices: stable across object joining."""
    bpy.context.view_layer.update()
    rows=[]
    for obj in group.children_recursive:
        if obj.type!='MESH':continue
        assert len(obj.data.materials)==1, (group.name,obj.name)
        mat=obj.data.materials[0].name
        world=obj.matrix_world
        for vertex in obj.data.vertices:
            p=world@vertex.co
            rows.append((mat,round(p.x,4),round(p.y,4),round(p.z,4)))
    rows.sort()
    return hashlib.sha256(repr(rows).encode('utf-8')).hexdigest(),len(rows)


groups=sorted((obj for obj in bpy.data.objects if obj.type=='EMPTY' and obj.name.startswith('accessory-')),key=lambda obj:obj.name)
pre_merge={group.name:geometry_fingerprint(group) for group in groups}
pre_merge_meshes=sum(len([child for child in group.children_recursive if child.type=='MESH']) for group in groups)

# glTF/Three renders one draw call per mesh/material primitive. Preserve the
# 17 selection roots while combining each root's matching-material parts once
# offline, so the phone does not perform hundreds of tiny per-frame draw calls.
for group in groups:
    by_material={}
    for obj in group.children_recursive:
        if obj.type=='MESH':
            by_material.setdefault(obj.data.materials[0].name,[]).append(obj)
    for mat_name,parts in sorted(by_material.items()):
        if len(parts)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in parts:obj.select_set(True)
            active=next((obj for obj in parts if all(abs(v-1)<1e-6 for v in obj.scale)),parts[0])
            bpy.context.view_layer.objects.active=active
            bpy.ops.object.join()
        else:
            active=parts[0]
        active.name=f"{mat_name} | {group.name.removeprefix('accessory-')}"
        active.data.name=active.name+' mesh'
        assert active.parent is group, (group.name,active.name)

post_merge={group.name:geometry_fingerprint(group) for group in groups}
assert pre_merge==post_merge,[(name,pre_merge[name],post_merge[name]) for name in pre_merge if pre_merge[name]!=post_merge[name]]
post_merge_meshes=sum(len([child for child in group.children_recursive if child.type=='MESH']) for group in groups)
assert post_merge_meshes<=70,(pre_merge_meshes,post_merge_meshes)


# Save all source geometry and export one GLB per exact product ID.
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.render.resolution_x=512
scene.render.resolution_y=512
scene.render.resolution_percentage=100
scene.world.color=(.17,.18,.22)

manifest=[]
for group in [obj for obj in bpy.data.objects if obj.type=='EMPTY' and obj.name.startswith('accessory-')]:
    desc=[obj for obj in group.children_recursive if obj.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    group.select_set(True)
    for obj in desc:obj.select_set(True)
    bpy.context.view_layer.objects.active=group
    target=OUT/(group.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_extras=True,export_apply=True,export_yup=True)
    manifest.append({"id":group.name,"meshes":len(desc),"vertices":sum(len(o.data.vertices) for o in desc),"bytes":target.stat().st_size,"file":target.name})

bpy.ops.object.select_all(action='DESELECT')
for group in [obj for obj in bpy.data.objects if obj.type=='EMPTY' and obj.name.startswith('accessory-')]:
    group.select_set(True)
    for obj in group.children_recursive:obj.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['accessory-bell-collar']
bpy.ops.export_scene.gltf(filepath=str(OUT/'nava-wardrobe-accessories.glb'),export_format='GLB',use_selection=True,export_extras=True,export_apply=True,export_yup=True)

# Show only baseline accessory when opening editable blend; others can be toggled in Outliner.
for collection in scene.collection.children:
    if collection.name.startswith('accessory-') and collection.name!='accessory-bell-collar':
        collection.hide_viewport=True
        collection.hide_render=True

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'nava-wardrobe-accessories.blend'))
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('EXPORTED',len(manifest),'ACCESSORY GROUPS',sum(x['vertices'] for x in manifest),'VERTICES','MESHES',pre_merge_meshes,'TO',post_merge_meshes,'MATERIAL GEOMETRY VERIFIED')
