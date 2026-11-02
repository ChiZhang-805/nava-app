"""Compact cloth voyage cap with a connected crown and enclosed ears."""
import math
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from fitted_common import *


def build_night_cap(surface,cat,fitted_hat_shell,profile_plate):
    navy=material('Voyage_midnight_wool',(.016,.030,.085),'felt')
    piping=material('Voyage_ice_blue_piping',(.43,.68,.91),'satin')
    silver=material('Voyage_silver_star',(.80,.87,.91),'polished')
    profile=[(.985,-.010),(1.018,-.008),(1.022,.025),(1.020,.07),
             (1.025,.12),(.99,.18),(.90,.24),(.70,.285),(.45,.31),(.20,.318),(.05,.320)]
    hat,contact=fitted_hat_shell(surface,cat,profile,navy,'Voyage_fitted_continuous_cloth_shell',ax=-.025,ay=-.06)
    for v in hat.data.vertices:
        dx,dy=v.co.x-CX,v.co.y-CY
        h=max(0,min(1,(v.co.z-.52+.025*dx+.06*dy)/.32))
        q=math.atan2(dx,-dy)
        v.co.x+=.045*math.sin(math.pi*h)
        v.co.z+=.020*math.sin(q)*h-.016*math.exp(-((h-.55-.12*math.sin(q))/.13)**2)
    hat.data.update()
    tree=BVHTree.FromPolygons([v.co for v in hat.data.vertices],[list(p.vertices) for p in hat.data.polygons])
    changed=set(cat.get('compressedCoveredVertices',[]))
    for v in cat.data.vertices:
        x,y,z=v.co
        if z<.555:continue
        h,_,_,_=tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),4)
        ceiling=h.z-.030 if h is not None else .565
        if z>ceiling:
            v.co.z=ceiling;changed.add(v.index)
    cat['compressedCoveredVertices']=sorted(changed);cat.data.update()
    parts=[hat];c=Vector((CX,CY,.52))
    line=[]
    for p in contact:
        d=Vector(p)-c;q=math.atan2(d.x,-d.y)
        ray=Vector((math.sin(q),-math.cos(q),0));z=p[2]+.073
        hit,normal,_,_=tree.ray_cast(Vector((CX,CY,z))+ray*2,-ray,4)
        line.append(hit+normal*.004)
    line.append(line[0]);parts.append(tube('Voyage_continuous_lower_piping',line,.0045,piping,10))
    # A single star fixed on anatomical left-front, rather than mirrored
    # ornaments independently added to every view.
    x=CX+.19;z=.655
    hit,normal,_,_=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
    u=Vector((0,0,1)).cross(normal).normalized();up=normal.cross(u).normalized()
    basis=Matrix((u,-normal,up)).transposed();center=hit+normal*.009
    shape=[]
    for k in range(8):
        a=math.pi/2+TAU*k/8;r=.065 if k%2==0 else .019
        shape.append((r*math.cos(a),r*math.sin(a)))
    parts.append(profile_plate('Single_attached_four_point_voyage_star',shape,center,basis,.009,silver,.003))
    # Subtle stitched crown ridge lies on the cap surface itself.
    seam=[]
    for i in range(48):
        y=CY-.34+.70*i/47;x=CX+.018
        h,normal,_,_=tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),4)
        if h is not None:seam.append(h+normal*.002)
    parts.append(tube('Voyage_sewn_crown_ridge',seam,.0025,navy,8))
    return parts
