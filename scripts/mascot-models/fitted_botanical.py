"""Small connected lily-of-the-valley circlet fitted to the canonical head."""
import math
import bpy
from mathutils import Vector
from fitted_common import *


def build_lily(surface,cat,head_ring_point,leaf_mesh,catmull):
    green=material('Lily_soft_mint_stems',(.42,.59,.29),'matte')
    leafmat=material('Lily_silky_green_leaves',(.49,.67,.37),'matte')
    ivory=material('Lily_porcelain_white_petals',(.94,.96,.87),'satin')
    def ring(q):return head_ring_point(surface,q,.535+.045*math.cos(q)+.018*math.sin(3*q+.4),.010)
    parts=[tube('Continuous_botanical_circlet',[ring(TAU*i/256) for i in range(257)],.0065,green,10)]
    positions=[-.94,-.61,-.29,.05,.38,.72,1.04,1.65,2.12,2.60,3.12,3.65,4.14,4.65]
    for i,q in enumerate(positions):
        base=ring(q);radial=Vector((math.sin(q),-math.cos(q),0))
        lowerz=base.z-.110-.014*math.sin(i*2.3)
        h,_,_,_=surface.tree.ray_cast(Vector((CX,CY,lowerz))+radial*2,-radial,4)
        base_r=math.hypot(base.x-CX,base.y-CY)
        lower_r=math.hypot(h.x-CX,h.y-CY)
        rr=max(base_r+.025,lower_r+.043)
        root=Vector((CX+rr*math.sin(q),CY-rr*math.cos(q),base.z-.040-.014*math.sin(i*2.3)))
        stem=catmull([base,base+radial*.022+Vector((0,0,.016)),root+Vector((0,0,.025)),root],8)
        parts.append(tube('Lily_attached_curved_pedicel',stem,.0035,green,8))
        vs=[];fs=[];uv=[];nt,na=20,40
        for j in range(nt+1):
            t=j/nt
            r=.003+.046*math.sin(math.pi*.51*t)**.75
            for k in range(na):
                a=TAU*k/na
                lip=t**6;rrr=r+.006*lip*math.cos(5*a)
                p=root+Vector((rrr*math.cos(a),rrr*math.sin(a),-.078*t+.007*lip*math.cos(5*a)))
                vs.append(tuple(p));uv.append((k/na,t))
        for j in range(nt):
            for k in range(na):
                a=j*na+k;b=j*na+(k+1)%na;fs.append((a,b,b+na,a+na))
        fs.append(tuple(range(na-1,-1,-1)))
        bell=mesh('Hollow_downward_lily_bell',vs,fs,ivory,uv);active(bell)
        shell=bell.modifiers.new('Fine_petal_thickness','SOLIDIFY');shell.thickness=.0025;shell.offset=-1
        bpy.ops.object.modifier_apply(modifier=shell.name);parts.append(bell)
        parts.append(ellipsoid('Lily_green_calyx',root+Vector((0,0,.002)),(.012,.012,.009),green,24,16))
    for q in (-.85,.85,2.35,3.9):
        p=ring(q);radial=Vector((math.sin(q),-math.cos(q),0))
        _,normal,_,_=surface.tree.ray_cast(p+radial,-radial,2)
        tangent=(ring(q+.025)-p).normalized()
        for sign in (-1,1):
            end=p+tangent*(sign*.15)+Vector((0,0,.045*sign))+normal*.025
            parts.append(leaf_mesh('Connected_lily_leaf',p,end,normal,.040,leafmat))
            vein=[p.lerp(end,j/18)+normal*(.022*math.sin(math.pi*j/18)) for j in range(19)]
            parts.append(tube('Lily_leaf_vein',vein,.0017,green,6))
    return parts
