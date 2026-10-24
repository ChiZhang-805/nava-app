"""Build complete single-accessory variants against canonical v9 cat.
Blender --background --python build_fitted_wardrobe.py -- --slug cloud-scarf --output DIR --bake
"""
import sys,argparse,math,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy,numpy as np
from mathutils import Vector, Matrix
from fitted_common import *

def scarf(surface,cat,kind='cloud-scarf'):
    color=(.42,.68,.95)
    mat=material('Cloud_blue_fine_knit',color,'knit');parts=[]
    if kind=='aurora-scarf':
        mat=material('Aurora_cyan_to_lavender_soft_satin',(.4,.7,.9),'satin')
        n,l=mat.node_tree.nodes,mat.node_tree.links;p=n.get('Principled BSDF')
        p.inputs['Roughness'].default_value=.52;p.inputs['Sheen Weight'].default_value=.25
        geo=n.new('ShaderNodeNewGeometry');xyz=n.new('ShaderNodeSeparateXYZ');remap=n.new('ShaderNodeMapRange')
        remap.inputs['From Min'].default_value=-.68;remap.inputs['From Max'].default_value=.02
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.55,.43,.86,1);ramp.color_ramp.elements[1].color=(.38,.73,.91,1)
        l.new(geo.outputs['Position'],xyz.inputs[0]);l.new(xyz.outputs['Z'],remap.inputs[0]);l.new(remap.outputs[0],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
    # One continuous padded cloth wrap, two soft non-parallel folds on outer face.
    def center(q):return -.135-.105*math.cos(q)+.020*math.sin(2*q-.3)
    samples=np.asarray([surface.radius(TAU*i/256,center(TAU*i/256))-.035-.075*math.sin(TAU*i/256)**2 for i in range(256)])
    for _ in range(20):samples=.5*samples+.25*np.roll(samples,1)+.25*np.roll(samples,-1)
    def ring_radius(q):
        u=(q%TAU)/TAU*256;i=int(u);u-=i
        return float(samples[i]*(1-u)+samples[(i+1)%256]*u)
    def wrap_point(q,a):
        s=math.sin(a);c=math.cos(a);z=center(q)+.118*s
        fold=.008*math.cos(math.pi*s+.3*math.sin(2*q))-.016*math.exp(-((s-.12-.26*math.sin(q+.5))/.32)**2)
        dq=math.atan2(math.sin(q-.84),math.cos(q-.84))
        gathered=(.006*math.sin(4*q+2*s)-.018*math.exp(-((dq-.25*s)/.17)**2)+.012*math.exp(-((dq-.25*s-.18)/.22)**2))*max(0,c)
        radius=ring_radius(q)+.043+.040*c+max(0,c)*fold+gathered
        return Vector((CX+radius*math.sin(q),CY-radius*math.cos(q),z))
    nq,na=192,48;vs=[];uv=[];fs=[]
    for i in range(nq+1):
        q=TAU*i/nq
        for j in range(na+1):
            a=TAU*j/na;vs.append(tuple(wrap_point(q,a)));uv.append((i/nq*4,j/na*.7))
    for i in range(nq):
        for j in range(na):k=i*(na+1)+j;fs.append((k,k+1,k+na+2,k+na+1))
    parts.append(mesh('Cloud_scarf_continuous_soft_wrap',vs,fs,mat,uv))
    # Fur hidden by the wrap compresses under fabric. Only the collar's covered
    # band is modified, keeping face, paws, tail and visible upper/lower fur.
    moved=[]
    for v in cat.data.vertices:
        x,y,z=v.co;q=math.atan2(x-CX,-(y-CY));s=(z-center(q))/.118
        if abs(s)>=.985:continue
        r=math.hypot(x-CX,y-CY)
        inside=ring_radius(q)+.043-.040*math.sqrt(1-s*s)-.012
        if r>inside:
            v.co.x=CX+(x-CX)*inside/r;v.co.y=CY+(y-CY)*inside/r;moved.append(v.index)
    cat.data.update();cat['compressedCoveredVertices']=moved
    # Two broad, unequal ribbon ends attached only at anatomical left front.
    def tail_point(t,a,qstart,qend,end,width,extra):
        z=center(qstart)-.018+(end-center(qstart)+.018)*t
        q=qstart+(qend-qstart)*t+(.10 if kind=='aurora-scarf' else .045)*math.sin(TAU*t)
        s=math.sin(a);c=math.cos(a);twist=.12+(.48 if kind=='aurora-scarf' else .30)*math.sin(math.pi*t)
        w=width*(1-.16*t);side=s*w/2
        z+=side*math.sin(twist);q+=side*math.cos(twist)/surface.radius(q,z)
        fold=(.024 if kind=='aurora-scarf' else .010)*math.cos(1.5*math.pi*s+.4*t)*math.sin(math.pi*t)
        if kind=='aurora-scarf':
            z+=.035*abs(s)**4*t**10
        offset=extra+.028*math.sin(math.pi*t)**2+.014*c+fold+.012*t*t
        return surface.point(q,z,offset)
    tails=[(.72,.75,-.57,.23,.053),(.96,1.12,-.48,.22,.050)]
    if kind=='aurora-scarf':tails=[(.72,.76,-.68,.28,.053),(.96,1.12,-.54,.26,.055)]
    for index,params in enumerate(tails):
        nt,na=56,32;vs=[];uv=[];fs=[]
        for i in range(nt+1):
            t=i/nt
            for j in range(na+1):
                a=TAU*j/na;vs.append(tuple(tail_point(t,a,*params)));uv.append(((math.sin(a)+1)*.22,t*.85))
        for i in range(nt):
            for j in range(na):k=i*(na+1)+j;fs.append((k,k+1,k+na+2,k+na+1))
        fs.extend([tuple(range(na,-1,-1)),tuple(nt*(na+1)+j for j in range(na+1))])
        parts.append(mesh(f'Cloud_scarf_soft_tail_{index+1}',vs,fs,mat,uv))
        for k in range(7 if kind=='cloud-scarf' else 0):
            a=math.asin((k-3)/3.7);p=tail_point(.995,a,*params)
            end=p+Vector((.009*math.sin(k),-.008,-.065-.006*(k%2)))
            pts=[p.lerp(end,j/6)+Vector((.004*math.sin(math.pi*j/6),0,0)) for j in range(7)]
            parts.append(tube(f'Cloud_scarf_short_fringe_{index}_{k}',pts,[.0065*(1-.22*j/6) for j in range(7)],mat,10))
    # A fabric loop over both ribbon roots, with an opening through its middle.
    # This has two cloth faces and rounded side edges, not a solid oval badge.
    q=.84;vs=[];fs=[];uv=[];nt,nw=72,24
    for i in range(nt+1):
        t=TAU*i/nt
        for j in range(nw+1):
            a=TAU*j/nw;side=.110*math.sin(a);thick=.012*math.cos(a)
            qq=q+side/.72+.040*math.sin(t)
            z=center(q)+.115*math.sin(t)+.35*side
            r=ring_radius(qq)+.090+.073*math.cos(t)+thick*math.cos(t)
            vs.append((CX+r*math.sin(qq),CY-r*math.cos(qq),z+thick*math.sin(t)))
            uv.append(((math.sin(a)+1)*.14,i/nt*.8))
    for i in range(nt):
        for j in range(nw):k=i*(nw+1)+j;fs.append((k,k+1,k+nw+2,k+nw+1))
    parts.append(mesh('Cloud_scarf_crossover_cloth_loop',vs,fs,mat,uv))
    return parts

def bell_collar(surface,cat):
    navy=material('Midnight_navy_soft_collar',(.016,.033,.075))
    gold=material('Warm_gold_bell',(.92,.59,.13),'polished')
    dark=material('Bell_opening',(.035,.022,.006))
    band,point=collar_band(surface,cat,navy,width=.066,offset=.008);parts=[band]
    # Real linked loop between collar lower edge and bell suspension.
    front=point(0,-.058,.025)
    pts=[front+Vector((.026*math.cos(TAU*i/48),0,.037*math.sin(TAU*i/48))) for i in range(49)]
    parts.append(tube('Bell_suspension_ring',pts,.0075,gold,12))
    loc=front+Vector((0,-.012,-.098));bell=ellipsoid('Gold_jingle_bell',loc,(.083,.076,.084),gold,48,32);parts.append(bell)
    equator=[loc+Vector((.084*math.cos(TAU*i/64),.077*math.sin(TAU*i/64),-.005)) for i in range(65)]
    parts.append(tube('Bell_equatorial_rolled_seam',equator,.004,gold,8))
    # Engraved lower slot follows the front shell rather than a floating stripe.
    slit=[]
    for i in range(13):
        z=-.057+i*.0036;y=-.076*math.sqrt(max(0,1-(z/.084)**2))-.0015
        slit.append(loc+Vector((0,y,z)))
    parts.append(tube('Bell_lower_sound_slot',slit,.0028,dark,8))
    hole=ellipsoid('Bell_sound_hole',loc+Vector((0,-.076,-.010)),(.010,.003,.010),dark,24,16);parts.append(hole)
    # Rear buckle with an open rectangular center and attached tongue.
    rear=point(math.pi,0,.016)
    path=[(-.054,-.025),(.054,-.025),(.060,-.017),(.060,.017),(.054,.025),(-.054,.025),(-.060,.017),(-.060,-.017),(-.054,-.025)]
    parts.append(tube('Rear_collar_buckle',[rear+Vector((x,0,z)) for x,z in path],.0055,gold,10))
    parts.append(tube('Rear_buckle_tongue',[rear+Vector((-.040,-.002,0)),rear+Vector((.015,-.002,0))],.0035,gold,8))
    keeper=bevel_box('Rear_collar_keeper',rear+Vector((.10,.003,0)),(.022,.028,.067),navy,.007);parts.append(keeper)
    return parts

def ribbon_bow(center,mat,scale=1.0,rotation=None,prefix='Bow'):
    """Folded ribbon loops, broad short tails, and central fabric gathering."""
    center=Vector(center);parts=[]
    def transform(v):
        v=Vector(v)*scale
        if rotation is not None:v=rotation@v
        return center+v
    for sign in (-1,1):
        vs=[];uv=[];fs=[];nt,nw=72,24
        for i in range(nt+1):
            t=TAU*i/nt;extent=math.sin(t/2);x=sign*(.018+.23*extent)
            yy=-.075*math.sin(t);zz=.035*extent
            width=.025+.080*extent
            for j in range(nw+1):
                a=TAU*j/nw;s=math.sin(a);thick=.010*math.cos(a)
                # Fold narrows toward knot; longitudinal curl gives volume.
                y=yy+thick-.013*(1-s*s)*math.sin(t)+.021*s*s*extent
                z=zz+width*s
                rounded_x=x-sign*.030*s*s*extent
                vs.append(tuple(transform((rounded_x,y,z))));uv.append((i/nt*.75,(s+1)*.22))
        for i in range(nt):
            for j in range(nw):k=i*(nw+1)+j;fs.append((k,k+1,k+nw+2,k+nw+1))
        parts.append(mesh(f'{prefix}_folded_loop_{sign}',vs,fs,mat,uv))
        vs=[];uv=[];fs=[];nt,nw=40,24
        for i in range(nt+1):
            t=i/nt;x=sign*(.035+.105*t);z=-.015-.25*t;y=.012-.035*math.sin(math.pi*t)
            width=.038+.028*t
            for j in range(nw+1):
                a=TAU*j/nw;s=math.sin(a);thick=.011*math.cos(a)
                xx=x+width*s;zz=z+sign*.4*width*s+.015*s*s*t
                yy=y+thick+.018*math.cos(math.pi*s)*math.sin(math.pi*t)
                vs.append(tuple(transform((xx,yy,zz))));uv.append(((s+1)*.18,t*.6))
        for i in range(nt):
            for j in range(nw):k=i*(nw+1)+j;fs.append((k,k+1,k+nw+2,k+nw+1))
        fs.extend([tuple(range(nw,-1,-1)),tuple(nt*(nw+1)+j for j in range(nw+1))])
        parts.append(mesh(f'{prefix}_soft_ribbon_tail_{sign}',vs,fs,mat,uv))
    center_wrap=ellipsoid(prefix+'_central_fabric_gather',transform((0,-.017,0)),(.043*scale,.046*scale,.060*scale),mat)
    if rotation is not None:center_wrap.rotation_euler=rotation.to_euler()
    parts.append(center_wrap)
    return parts

def pearl_bow(surface,cat):
    satin=material('Warm_ivory_satin',(.91,.89,.83),'satin')
    pearl=material('Cream_lustrous_pearl',(.98,.96,.89),'polished')
    # The front arc drops into the neck/chest junction and meets the bow
    # anchor. It must not bridge horizontally between the outer shoulder tufts.
    center=lambda q: -.190-.130*math.cos(q)+.008*math.sin(q)
    band,point=collar_band(surface,cat,satin,width=.034,offset=-.010,name='Ivory_bow_neckband',center_fn=center)
    origin=point(0,-.006,.092);parts=[band]+ribbon_bow(origin,satin,.88)
    parts.append(bevel_box('Bow_anchor_tab',point(0,-.006,.038),(.040,.105,.036),satin,.010))
    parts.append(ellipsoid('Pearl_center_button',origin+Vector((0,-.069,.005)),(.048,.032,.048),pearl,40,24))
    # Move each ribbon vertex to the body's front clearance only where needed.
    # This keeps the draped ends out of the torso without changing the cat.
    bpy.context.view_layer.update()
    for ob in parts[1:]:
        if ob.type!='MESH' or 'soft_ribbon_tail' not in ob.name:continue
        for v in ob.data.vertices:
            world=ob.matrix_world@v.co
            hit,_,_,_=surface.tree.ray_cast(Vector((world.x,-2,world.z)),Vector((0,1,0)),4)
            if hit is not None and world.y>hit.y-.028:
                world.y=hit.y-.028;v.co=ob.matrix_world.inverted()@world
        ob.data.update()
    rear=point(math.pi,0,.018)
    path=[(-.035,-.018),(.035,-.018),(.040,-.010),(.040,.010),(.035,.018),(-.035,.018),(-.040,.010),(-.040,-.010),(-.035,-.018)]
    parts.append(tube('Ivory_rear_clasp',[rear+Vector((x,0,z)) for x,z in path],.004,pearl,10))
    return parts

def cherry_bow(surface,cat):
    red=material('Cherry_red_satin_ribbon',(.68,.022,.045),'satin')
    clasp=material('Cherry_bow_hidden_barrette',(.40,.10,.12),'satin')
    x,z=.30,.66
    hit,_,_,_=surface.tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
    normals=[]
    for dx in (-.01,0,.01):
        for dz in (-.01,0,.01):
            h,n,_,_=surface.tree.ray_cast(Vector((x+dx,-2,z+dz)),Vector((0,1,0)),4)
            if h is not None:normals.append(n)
    n=sum(normals,Vector()).normalized();u=Vector((0,0,1)).cross(n).normalized();v=n.cross(u).normalized()
    basis=Matrix((u,-n,v)).transposed();rot=basis@Matrix.Rotation(math.radians(22),3,'Y')
    center=hit+n*.055
    parts=ribbon_bow(center,red,.72,rot,'Cherry_bow')
    # Real local surface normal sets the ribbon plane. Its depth and cavities
    # remain intact; per-vertex projection would tear cloth at silhouette rays.
    rail=[hit+n*.004,center+rot@Vector((0,.018,0))]
    parts.append(tube('Cherry_barrette_support',rail,.012,clasp,12))
    for sign in (-1,1):
        p=hit+u*(sign*.042)
        parts.append(tube('Cherry_spring_grip_'+str(sign),[p-n*.008,p+n*.025,center+rot@Vector((sign*.028,.012,0))],.005,clasp,10))
    return parts

def mint_earmuffs(surface,cat):
    mint=material('Mint_soft_fleece',(.49,.78,.61),'felt')
    support=material('Mint_satin_support',(.29,.57,.43),'satin')
    seam=material('Ivory_fleece_seam',(.88,.91,.76),'felt');parts=[]
    for sign in (-1,1):
        loc=Vector((CX+sign*.61,-.24,.55))
        pad=ellipsoid('Mint_ear_cushion_'+str(sign),loc,(.095,.18,.215),mint,64,40);parts.append(pad)
        points=[loc+Vector((sign*.067,.142*math.cos(TAU*i/96),.174*math.sin(TAU*i/96))) for i in range(97)]
        parts.append(tube('Earpad_rounded_piping_'+str(sign),points,.0055,seam,10))
        pivot=loc+Vector((sign*.017,.145,.025))
        parts.append(ellipsoid('Ear_cuff_swivel_'+str(sign),pivot,(.046,.043,.044),support,32,20))
        parts.append(ellipsoid('Ear_cuff_pin_'+str(sign),pivot+Vector((sign*.035,0,0)),(.012,.018,.018),seam,24,16))
    # A single behind-head band enters the rear swivel joints. This avoids
    # routing a crown strap through the triangular ears.
    points=[]
    for i in range(97):
        t=-math.pi/2+math.pi*i/96
        x=CX+.627*math.sin(t);z=.575-.060*math.cos(t)
        hit,_,_,_=surface.tree.ray_cast(Vector((x,2,z)),Vector((0,-1,0)),4)
        y=hit.y+.034 if hit is not None else -.095
        points.append((x,y,z))
    # Small sampling spikes at the silhouettes are removed while preserving
    # the supported endpoints. Confirm clearance in the rendered top view.
    for _ in range(4):
        points=[points[0]]+[tuple(.25*Vector(points[i-1])+.5*Vector(points[i])+.25*Vector(points[i+1])) for i in range(1,96)]+[points[-1]]
    parts.append(tube('Continuous_padded_headband',points,.023,mint,16))
    return parts

def honey_neck_warmer(surface,cat):
    knit=material('Honey_gold_fine_rib_knit',(.98,.57,.10),'knit')
    ivory=material('Snood_ivory_woven_tag',(.90,.85,.70))
    def zc(q):return -.135-.105*math.cos(q)+.014*math.sin(2*q)
    rr=np.array([surface.radius(TAU*i/256,zc(TAU*i/256))-.035-.065*math.sin(TAU*i/256)**2 for i in range(256)])
    for _ in range(20):rr=.5*rr+.25*np.roll(rr,1)+.25*np.roll(rr,-1)
    def rad(q):
        t=(q%TAU)/TAU*256;i=int(t);t-=i;return float(rr[i]*(1-t)+rr[(i+1)%256]*t)
    vs=[];uv=[];fs=[];n,m=384,40
    for i in range(n+1):
        q=TAU*i/n
        for j in range(m+1):
            a=TAU*j/m;c=math.cos(a);s=math.sin(a);z=zc(q)+.112*s
            rib=.0055*math.cos(96*q+.18*s)*max(0,c)
            r=rad(q)+.048+.040*c+rib+.008*max(0,c)*math.cos(2*q+2*s)
            vs.append((CX+r*math.sin(q),CY-r*math.cos(q),z));uv.append((i/n*5,(s+1)*.35))
    for i in range(n):
        for j in range(m):k=i*(m+1)+j;fs.append((k,k+1,k+m+2,k+m+1))
    parts=[mesh('Honey_snood_continuous_padded_cloth',vs,fs,knit,uv)]
    # A softly rolled top edge joins the main cloth, not a separate floating ring.
    path=[]
    for i in range(385):
        q=TAU*i/384;r=rad(q)+.087
        path.append((CX+r*math.sin(q),CY-r*math.cos(q),zc(q)+.100))
    parts.append(tube('Honey_snood_rolled_hem',path,.032,knit,16))
    moved=[]
    for v in cat.data.vertices:
        x,y,z=v.co;q=math.atan2(x-CX,-(y-CY));s=(z-zc(q))/.112
        if abs(s)>=.99:continue
        r=math.hypot(x-CX,y-CY);inside=rad(q)+.048-.040*math.sqrt(1-s*s)-.008
        if r>inside:v.co.x=CX+(x-CX)*inside/r;v.co.y=CY+(y-CY)*inside/r;moved.append(v.index)
    cat.data.update();cat['compressedCoveredVertices']=moved
    q=1.20;r=rad(q)+.092;loc=Vector((CX+r*math.sin(q),CY-r*math.cos(q),zc(q)-.062))
    tag=bevel_box('Single_left_side_woven_label',loc,(.058,.009,.064),ivory,.006);tag.rotation_euler.z=q;parts.append(tag)
    return parts

def profile_plate(name,profile,center,basis,thickness,mat,bevel=.004):
    center=Vector(center);n=len(profile);vs=[]
    for d in (-thickness/2,thickness/2):
        vs.extend(tuple(center+basis@Vector((x,d,z))) for x,z in profile)
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    for i in range(n):j=(i+1)%n;fs.append((i,j,n+j,n+i))
    ob=mesh(name,vs,fs,mat)
    if bevel:
        active(ob);mod=ob.modifiers.new('Rounded_enamel_edge','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

def star_moon_clip(surface,cat):
    gold=material('Soft_gold_clip_bezel',(.89,.60,.19),'polished')
    enamel=material('Moon_pearl_enamel',(.95,.91,.80),'polished')
    x,z=CX+.30,.59
    hit,normal,_,_=surface.tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
    if hit is None:raise RuntimeError('No ear surface at clip anchor')
    # Slightly turned front plane, corresponding to the anatomical left ear.
    n=Vector((.40,-.90,.16)).normalized();up=Vector((0,0,1));u=up.cross(n).normalized();v=n.cross(u).normalized()
    basis=Matrix((u,-n,v)).transposed();center=hit+n*.030
    star=[]
    for i in range(10):
        a=math.pi/2+TAU*i/10;r=.063 if i%2==0 else .030
        star.append((-.052+r*math.cos(a),.005+r*math.sin(a)))
    outer=[(.067+.095*math.cos(math.radians(-130+260*i/64)),.095*math.sin(math.radians(-130+260*i/64))) for i in range(65)]
    tipx=outer[-1][0];tipz=outer[-1][1]
    inner=[(tipx+tipz*math.cos(math.pi/2-math.pi*i/48),tipz*math.sin(math.pi/2-math.pi*i/48)) for i in range(1,48)]
    moon=outer+inner;parts=[]
    for name,profile in [('Star',star),('Crescent',moon)]:
        parts.append(profile_plate(name+'_gold_base',profile,center,basis,.025,gold,.003))
        # Enamel laid over metal, leaving a visible narrow gold border.
        px=sum(p[0] for p in profile)/len(profile);pz=sum(p[1] for p in profile)/len(profile)
        inset=[(px+(xx-px)*.91,pz+(zz-pz)*.91) for xx,zz in profile]
        parts.append(profile_plate(name+'_ivory_inlay',inset,center+n*.016,basis,.008,enamel,.002))
    # Actual barrette rail and spring grip meet the supporting ear fur.
    rail=[center+basis@Vector((t,-.0,-.015)) for t in (-.075,.11)]
    parts.append(tube('Clip_connected_back_rail',rail,.007,gold,12))
    clamp=[center+basis@Vector((-.02,-.004,-.02)),hit-n*.012,hit+n*.012,center+basis@Vector((.06,-.004,-.02))]
    parts.append(tube('Clip_spring_clasp',clamp,.005,gold,10))
    return parts

def fish_brooch(surface,cat):
    aqua=material('Aqua_glazed_enamel',(.13,.66,.79),'polished')
    gold=material('Fish_pale_gold_rim',(.87,.66,.28),'polished')
    navy=material('Fish_tiny_navy_eye',(.007,.025,.05),'polished')
    x,z=CX+.25,-.30
    hit,n,_,_=surface.tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
    u=Vector((0,0,1)).cross(n).normalized();v=n.cross(u).normalized();basis=Matrix((u,-n,v)).transposed();center=hit+n*.022
    profile=[]
    for i in range(49):
        a=math.radians(180-155*i/48);profile.append((-.025+.090*math.cos(a),.075*math.sin(a)))
    profile +=[(.130,.065),(.115,0),(.130,-.065)]
    for i in range(49):
        a=math.radians(-25-155*i/48);profile.append((-.025+.090*math.cos(a),.075*math.sin(a)))
    parts=[profile_plate('Fish_rounded_gold_backplate',profile,center,basis,.023,gold,.006)]
    body=ellipsoid('Fish_domed_aqua_enamel',center+basis@Vector((-.025,-.016,0)),(.084,.023,.069),aqua,48,32);body.rotation_euler=basis.to_euler();parts.append(body)
    tail=[(.050,.012),(.117,.051),(.102,0),(.117,-.051),(.050,-.012)]
    parts.append(profile_plate('Fish_tail_enamel',tail,center+n*.017,basis,.010,aqua,.004))
    eye=ellipsoid('Fish_eye',center+basis@Vector((-.065,-.040,.015)),(.010,.004,.010),navy,24,16);eye.rotation_euler=basis.to_euler();parts.append(eye)
    # Short closed pin and catch are joined to the backplate and touch fur.
    rail=[hit+u*t+n*.006 for t in (-.052,.060)]
    parts.append(tube('Fish_brooch_back_pin',rail,.004,gold,10))
    parts.append(tube('Fish_pin_catch',[rail[-1],rail[-1]+n*.018,center+u*.055],.004,gold,10))
    return parts

def catmull(points,steps=12,closed=False):
    ps=[Vector(p) for p in points];out=[];count=len(ps) if closed else len(ps)-1
    for i in range(count):
        p0=ps[(i-1)%len(ps)] if closed else ps[max(0,i-1)];p1=ps[i];p2=ps[(i+1)%len(ps)];p3=ps[(i+2)%len(ps)] if closed else ps[min(len(ps)-1,i+2)]
        for j in range(steps):
            t=j/steps;out.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    if not closed:out.append(ps[-1])
    return out

def cloud_backpack(surface,cat):
    blue=material('Cloud_bag_sky_blue_plush',(.44,.70,.94),'felt')
    strapmat=material('Cloud_bag_textile_straps',(.32,.59,.85),'felt')
    ivory=material('Cloud_bag_ivory_piping',(.92,.91,.82),'satin')
    gold=material('Cloud_bag_zipper_metal',(.72,.66,.48),'polished')
    zc=-.27;hit,_,_,_=surface.tree.ray_cast(Vector((CX,2,zc)),Vector((0,-1,0)),4);yb=hit.y
    raw=[(0,.30),(.12,.27),(.15,.17),(.27,.16),(.34,.08),(.33,-.08),(.25,-.17),(.12,-.18),(0,-.21),(-.12,-.18),(-.25,-.17),(-.33,-.08),(-.34,.08),(-.27,.16),(-.15,.17),(-.12,.27)]
    outline=catmull(raw,10,True);n=len(outline);m=36;vs=[];uv=[];fs=[]
    for i in range(m+1):
        phi=math.pi*i/m;r=math.sin(phi);depth=.115*math.cos(phi)
        for j,p in enumerate(outline):
            x=CX+p.x*r;z=zc+p.y*r;y=yb+.075-.35*(z-zc)
            h,_,_,_=surface.tree.ray_cast(Vector((x,2,z)),Vector((0,-1,0)),4)
            if h is not None:
                c=math.cos(phi)
                seam=h.y+.044
                if c>=0:y=seam+.155*max(0,1-r*r)**.62
                else:y=seam*(1-abs(c))+(h.y+.018)*abs(c)
            vs.append((x,y,z));uv.append((j/n*1.5,i/m))
    for i in range(m):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    parts=[mesh('Cloud_closed_padded_backpack',vs,fs,blue,uv)]
    def bag_seam(p,extra=0):
        x=CX+p.x;z=zc+p.y;h,_,_,_=surface.tree.ray_cast(Vector((x,2,z)),Vector((0,-1,0)),4)
        return Vector((x,(h.y if h is not None else yb)+.044+extra,z))
    perimeter=[bag_seam(p) for p in outline];perimeter.append(perimeter[0])
    parts.append(tube('Cloud_bag_perimeter_piping',perimeter,.008,ivory,10))
    # Zip follows the upper seam and ends in a small linked pull tab.
    zippts=[bag_seam(p,.009) for p in outline[-45:]+outline[:46]]
    parts.append(tube('Cloud_bag_top_zip',zippts,.004,gold,8))
    pull=zippts[-1]+Vector((.008,.016,-.02))
    ring=[pull+Vector((.012*math.cos(TAU*i/24),0,.018*math.sin(TAU*i/24))) for i in range(25)]
    parts.append(tube('Cloud_zipper_pull_ring',ring,.003,gold,8))
    tab=bevel_box('Cloud_zipper_pull_tab',pull+Vector((0,.002,-.038)),(.032,.012,.055),ivory,.012);parts.append(tab)
    for sign in (-1,1):
        def anchor(dz):
            xx=CX+sign*.23;zz=zc+dz
            h,_,_,_=surface.tree.ray_cast(Vector((xx,2,zz)),Vector((0,-1,0)),4)
            return Vector((xx,h.y+.020,zz))
        # Each strap belongs to one shoulder and one foreleg. The old path
        # crossed the lateral head ruff and formed two horizontal body hoops.
        # Descend close to the chest, pass outside the foreleg root, and rise
        # toward the same side's lower pack anchor.
        def side(y,z):
            h,_,_,_=surface.tree.ray_cast(Vector((CX+sign*2,y,z)),Vector((-sign,0,0)),4)
            return h+Vector((sign*.007,0,0))
        def chest(x,z):
            h,_,_,_=surface.tree.ray_cast(Vector((CX+sign*x,-2,z)),Vector((0,1,0)),4)
            return h+Vector((0,-.010,0))
        anchors=[anchor(.14),side(.13,-.18),side(-.10,-.12),side(-.45,-.18),
                 chest(.40,-.29),chest(.34,-.40),chest(.30,-.52),
                 surface.point(sign*.82,-.61,.012),
                 surface.point(sign*1.70,-.53,.012),
                 surface.point(sign*2.50,-.46,.012),
                 anchor(-.14)]
        # The canonical outer surface includes a thick shoulder ruff. Route
        # the returning webbing just under that fur envelope, not outside the
        # whole animal as an exposed waist belt. The short chest section and
        # the bag attachment tabs remain visible. This is shallow fur overlap,
        # not a disconnected strap or a path through the torso core.
        fur_offsets=[.018,.008,.006,.012,.012,.012,.012,-.075,-.075,-.070,.018]
        path=catmull(anchors,12);v=[];uv=[];faces=[];knum=16
        for i,p in enumerate(path):
            tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized();out=Vector((p.x-CX,p.y-CY,0)).normalized();across=tangent.cross(out).normalized()
            # Project the shoulder arch against the actual fur contour.
            if 0<i<=6*12:
                # A complete shoulder arch remains visible and follows the
                # actual body. It is not hidden piecewise inside the ruff.
                q=math.atan2(p.x-CX,-(p.y-CY));ray=Vector((math.sin(q),-math.cos(q),0))
                h,normal,_,_=surface.tree.ray_cast(Vector((CX,CY,p.z))+ray*2,-ray,4)
                if h is not None:p=Vector((h.x,h.y,p.z))+ray*.018
            # Move the complete ribbon cross section to the fur envelope.
            # Clamping each individual surface vertex collapsed inner/outer
            # faces into the same plane and produced dark z-fighting seams.
            probes=[p+across*w for w in (-.027,0,.027)]
            seg=min(len(fur_offsets)-2,i//12);fraction=min(1,(i-seg*12)/12)
            clearance=fur_offsets[seg]*(1-fraction)+fur_offsets[seg+1]*fraction
            if 6*12<i<len(path)-1:
                # Use the actual fur surface here, not the radially dilated
                # clearance envelope used for fully visible collar bands.
                q=math.atan2(p.x-CX,-(p.y-CY));ray=Vector((math.sin(q),-math.cos(q),0))
                h,_,_,_=surface.tree.ray_cast(Vector((CX,CY,p.z))+ray*2,-ray,4)
                if h is not None:p=Vector((h.x,h.y,p.z))+out*clearance
            for j in range(knum):
                a=TAU*j/knum;w=p+across*(.027*math.sin(a))+out*(.006*math.cos(a))
                v.append(tuple(w));uv.append((j/knum*.15,i/(len(path)-1)*3))
        for i in range(len(path)-1):
            for j in range(knum):faces.append((i*knum+j,i*knum+(j+1)%knum,(i+1)*knum+(j+1)%knum,(i+1)*knum+j))
        faces.extend([tuple(range(knum-1,-1,-1)),tuple((len(path)-1)*knum+j for j in range(knum))])
        strap=mesh('Cloud_connected_shoulder_strap_'+str(sign),v,faces,strapmat,uv)
        active(strap);sub=strap.modifiers.new('Smooth_webbing_edges','SUBSURF');sub.levels=1
        bpy.ops.object.modifier_apply(modifier=sub.name);parts.append(strap)
        for dz in (.14,-.14):
            loc=anchor(dz);parts.append(bevel_box('Cloud_backstrap_attachment',loc,(.065,.025,.046),strapmat,.010))
    return parts

def head_ring_point(surface,q,z,extra=.012):
    d=Vector((math.sin(q),-math.cos(q),0))
    hit,normal,_,_=surface.tree.ray_cast(Vector((CX,CY,z))+d*2,-d,4)
    if hit is None:raise RuntimeError('Head ring missed canonical surface')
    return hit+d*extra

def leaf_mesh(name,start,end,normal,width,mat):
    start,end,normal=Vector(start),Vector(end),Vector(normal).normalized()
    axis=(end-start).normalized();cross=axis.cross(normal).normalized();vs=[];uv=[];fs=[];nt,nc=20,16
    for i in range(nt+1):
        t=i/nt;p=start.lerp(end,t);bulge=math.sin(math.pi*t)
        for j in range(nc):
            a=TAU*j/nc
            v=p+cross*(width*bulge*math.sin(a))+normal*(.012*bulge*math.cos(a)+.010*bulge)
            vs.append(tuple(v));uv.append((t,j/nc))
    for i in range(nt):
        for j in range(nc):fs.append((i*nc+j,i*nc+(j+1)%nc,(i+1)*nc+(j+1)%nc,(i+1)*nc+j))
    return mesh(name,vs,fs,mat,uv)

def laurel_crown(surface,cat):
    gold=material('Laurel_soft_gold',(.90,.63,.22),'polished');vein=material('Laurel_highlight_ridge',(.97,.79,.40),'polished')
    def point(q):return head_ring_point(surface,q,.51+.055*math.cos(q),.014)
    path=[point(TAU*i/256) for i in range(257)];parts=[tube('Continuous_fitted_laurel_stem',path,.009,gold,12)]
    for sign in (-1,1):
        for i in range(7):
            q=sign*(.07+.18*i);p=point(q);radial=Vector((math.sin(q),-math.cos(q),0))
            _,n,_,_=surface.tree.ray_cast(p+radial,-radial,2)
            n=n.normalized();tangent=(point(q+sign*.012)-p).normalized()
            up=n.cross(tangent).normalized()
            if up.z<0:up=-up
            for side in (-1,1):
                start=p+tangent*(side*.012)
                direction=(tangent*.65+up*(side*.70)).normalized()
                end=start+direction*(.145-.007*i)+n*.010
                parts.append(leaf_mesh('Laurel_attached_leaf',start,end,n,.034,gold))
                pts=[start.lerp(end,t)+n*(.022*math.sin(math.pi*t)) for t in np.linspace(0,1,16)]
                parts.append(tube('Laurel_leaf_central_vein',pts,.0023,vein,6))
    return parts

def fitted_hat_shell(surface,cat,profile,mat,name,ax=-.025,ay=-.09,z0=.52):
    n=128;contact=[]
    for j in range(n):
        q=TAU*j/n;dx,dy=math.sin(q),-math.cos(q)
        d=Vector((dx,dy,ax*dx+ay*dy)).normalized()
        h,_,_,_=surface.tree.ray_cast(Vector((CX,CY,z0)),d,2)
        if h is None:raise RuntimeError('Hat contact missed')
        contact.append(tuple(h))
    contact=np.asarray(contact)
    for _ in range(4):contact=.5*contact+.25*np.roll(contact,1,axis=0)+.25*np.roll(contact,-1,axis=0)
    vs=[];fs=[];uv=[];center=np.array((CX,CY,z0))
    for i,(rad,height) in enumerate(profile):
        for j,c in enumerate(contact):
            v=center+(c-center)*rad;v[2]+=height
            vs.append(tuple(v));uv.append((j/n,i/(len(profile)-1)))
    for i in range(len(profile)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    pole=len(vs);vs.append((CX,CY,z0+profile[-1][1]+.002));uv.append((.5,1))
    for j in range(n):fs.append(((len(profile)-1)*n+j,(len(profile)-1)*n+(j+1)%n,pole))
    hat=mesh(name,vs,fs,mat,uv);active(hat)
    sub=hat.modifiers.new('Smooth_sewn_crown','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
    solid=hat.modifiers.new('Open_hat_cavity_and_inner_lining','SOLIDIFY');solid.thickness=.012;solid.offset=-1;bpy.ops.object.modifier_apply(modifier=solid.name)
    tree=__import__('mathutils.bvhtree',fromlist=['BVHTree']).BVHTree.FromPolygons([v.co for v in hat.data.vertices],[list(f.vertices) for f in hat.data.polygons])
    moved=[]
    for v in cat.data.vertices:
        x,y,z=v.co
        if z<z0+ax*(x-CX)+ay*(y-CY)+.03:continue
        h,_,_,_=tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),4)
        if h is not None and z>h.z-.038:
            threshold=h.z-.038;v.co.z=threshold+.012*math.tanh((z-threshold)/.012);moved.append(v.index)
    cat.data.update();cat['compressedCoveredVertices']=moved
    return hat,contact

def sailor_hat(surface,cat):
    white=material('Sailor_white_fine_cotton',(.93,.94,.91),'felt')
    navy=material('Sailor_navy_grosgrain',(.016,.038,.10),'felt')
    seam=material('Sailor_cotton_topstitch',(.77,.83,.85))
    profile=[(.985,-.010),(1.018,-.010),(1.025,.012),(1.026,.040),(1.033,.055),(1.062,.160),(1.063,.180),(1.045,.185),(1.022,.164),(.99,.110),(.95,.158),(.90,.225),(.74,.292),(.53,.333),(.30,.354),(.10,.363)]
    hat,contact=fitted_hat_shell(surface,cat,profile,white,'Sailor_continuous_crown_and_turned_cuff');parts=[hat]
    # The band lies directly on the sewn cuff; open center, no under-cap disk.
    n=len(contact);vs=[];fs=[];uv=[];c=Vector((CX,CY,.52))
    for j,p in enumerate(contact):
        p=Vector(p);d=p-c
        for k,(rad,h) in enumerate([(1.029,.006),(1.034,.046)]):vs.append(tuple(c+d*rad+Vector((0,0,h))));uv.append((j/n,k))
    for j in range(n):a=j*2;b=((j+1)%n)*2;fs.append((a,b,b+1,a+1))
    band=mesh('Navy_sewn_lower_band',vs,fs,navy,uv);active(band);solid=band.modifiers.new('Band_thickness','SOLIDIFY');solid.thickness=.004;bpy.ops.object.modifier_apply(modifier=solid.name);parts.append(band)
    rim=[c+(Vector(p)-c)*1.060+Vector((0,0,.177)) for p in contact];rim.append(rim[0]);parts.append(tube('Sailor_cuff_top_rolled_stitch',rim,.004,seam,8))
    # Small front anchor, fixed to the cuff face.
    front=c+(Vector(contact[0])-c)*1.060+Vector((0,-.005,.112));s=.07
    circle=[front+Vector((.016*math.cos(TAU*i/32),-.002,.045+.016*math.sin(TAU*i/32))) for i in range(33)]
    parts.append(tube('Sailor_anchor_eye',circle,.0045,navy,8))
    parts.append(tube('Sailor_anchor_shank',[front+Vector((0,0,.031)),front+Vector((0,0,-.045))],.005,navy,8))
    parts.append(tube('Sailor_anchor_stock',[front+Vector((-.025,0,.016)),front+Vector((.025,0,.016))],.0045,navy,8))
    curve=[front+Vector((s*.65*math.sin(t),0,-.012-s*.46*math.cos(t))) for t in np.linspace(-math.pi/2,math.pi/2,32)]
    parts.append(tube('Sailor_anchor_curved_flukes',curve,.0055,navy,8))
    for sign in (-1,1):
        p=c+(Vector(contact[n//2])-c)*1.03+Vector((sign*.020,.010,.018));v=[];faces=[];uv=[]
        for i in range(25):
            t=i/24;x=p.x+sign*.09*t;z=p.z-.26*t
            h,_,_,_=surface.tree.ray_cast(Vector((x,2,z)),Vector((0,-1,0)),4)
            yy=max(p.y+.015*math.sin(math.pi*t),h.y+.025 if h is not None else p.y)
            for j in range(12):
                a=TAU*j/12;v.append((x+.035*math.sin(a),yy+.006*math.cos(a),z+sign*.008*math.sin(a)));uv.append((j/12,t))
        for i in range(24):
            for j in range(12):faces.append((i*12+j,i*12+(j+1)%12,(i+1)*12+(j+1)%12,(i+1)*12+j))
        faces.extend([tuple(range(11,-1,-1)),tuple(288+j for j in range(12))]);parts.append(mesh('Sailor_rear_ribbon_'+str(sign),v,faces,navy,uv))
    return parts

def star_glasses(surface,cat):
    lilac=material('Lilac_translucent_acetate_frame',(.53,.30,.73),'polished')
    hinge=material('Glasses_silver_hinge',(.75,.76,.78),'polished')
    glass=material('Very_clear_lilac_lenses',(.68,.51,.80),'polished')
    bsdf=glass.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Alpha'].default_value=.075;bsdf.inputs['Roughness'].default_value=.08
    glass.surface_render_method='DITHERED';glass.use_transparency_overlap=False
    parts=[];eyes=[];lens_planes={}
    def front(x,z,offset=.032):
        h,_,_,_=surface.tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
        if h is None:raise RuntimeError('Eyeglass surface missed')
        return Vector((x,h.y-offset,z))
    for sign in (-1,1):
        xc=CX+sign*.220;zc=.225;raw=[]
        probe=[front(xc+dx,zc+dz,0).y for dx in np.linspace(-.12,.12,7) for dz in np.linspace(-.07,.07,5)]
        plane_y=min(probe)-.025
        lens_planes[sign]=plane_y
        def lens_point(x,z,offset=0):return Vector((x,plane_y+offset,z))
        for k in range(10):
            a=math.pi/2+TAU*k/10;r=.205 if k%2==0 else .127
            raw.append((xc+r*math.cos(a),zc+r*math.sin(a)))
        smooth=catmull(raw,6,True);path=[lens_point(p.x,p.y) for p in smooth];path.append(path[0])
        parts.append(tube('Star_frame_'+str(sign),path,.010,lilac,12))
        # Transparent lenses remain separate; baking them into the opaque
        # frame would hide the two original eyes.
        center=lens_point(xc,zc,.003);vs=[tuple(center)]+[tuple(lens_point(p.x,p.y,.003)) for p in smooth]
        faces=[(0,1+i,1+(i+1)%len(smooth)) for i in range(len(smooth))]
        lens=mesh('Lens_'+str(sign),vs,faces,glass);lens['keepTransparent']=True;parts.append(lens)
        # Continuous temples hinge on outer frame points and follow the skull.
        start=lens_point(xc+sign*.181,zc+.05);side=surface.point(sign*1.10,.28,.022)
        anchors=[start,start.lerp(side,.40),side,surface.point(sign*1.5,.275,.024),surface.point(sign*1.85,.255,.024),surface.point(sign*1.97,.205,.018)]
        rail=catmull(anchors,12)
        parts.append(tube('Curved_glasses_temple_'+str(sign),rail,.012,lilac,12))
        parts.append(ellipsoid('Glasses_hinge_'+str(sign),start,(.013,.015,.014),hinge,24,16))
    bridge=[Vector((CX-.025+.050*i/32,lens_planes[-1]*(1-i/32)+lens_planes[1]*i/32,.288+.018*math.sin(math.pi*i/32))) for i in range(33)]
    parts.append(tube('Glasses_connected_nose_bridge',bridge,.009,lilac,12))
    for sign in (-1,1):
        p=front(CX+sign*.054,.264,.018);parts.append(ellipsoid('Glasses_nosepad_'+str(sign),p,(.013,.014,.022),lilac,24,16))
        parts.append(tube('Glasses_nosepad_arm_'+str(sign),[Vector((CX+sign*.025,lens_planes[sign],.288)),p],.004,lilac,8))
    return parts

def raindrop_cape(surface,cat):
    aqua=material('Cape_pale_aqua_woven_cloth',(.43,.75,.84),'felt')
    trim=material('Cape_ivory_sewn_edge',(.86,.91,.87),'felt')
    pearl=material('Cape_pearly_raindrop_clasp',(.86,.92,.96),'polished')
    def ztop(q):return -.135-.105*math.cos(q)
    shoulder=np.array([surface.radius(TAU*i/256,ztop(TAU*i/256)) for i in range(256)])
    for _ in range(10):shoulder=.5*shoulder+.25*np.roll(shoulder,1)+.25*np.roll(shoulder,-1)
    def top_radius(q):
        a=(q%TAU)/TAU*256;i=int(a);t=a-i;return shoulder[i]*(1-t)+shoulder[(i+1)%256]*t
    def point(u,t):
        gap=.020+.82*math.sin(math.pi*t/2)**1.1
        q=gap+(TAU-2*gap)*u
        length=.34+.035*(1-math.cos(q))
        z=ztop(q)-length*t+.014*math.cos(5*q+.4)*t*t
        fold=(.022*math.sin(7*q+.35)+.010*math.sin(11*q-.2))*(t**1.4)
        r=max(surface.radius(q,z)+.022,top_radius(q)*(1-.025*t)+.022+.040*t+fold)
        return Vector((CX+r*math.sin(q),CY-r*math.cos(q),z))
    n,m=192,56;vs=[];fs=[];uv=[]
    for i in range(n+1):
        for j in range(m+1):vs.append(tuple(point(i/n,j/m)));uv.append((i/n*3,j/m))
    for i in range(n):
        for j in range(m):k=i*(m+1)+j;fs.append((k,k+m+1,k+m+2,k+1))
    cloak=mesh('Continuous_open_front_draped_cape',vs,fs,aqua,uv);active(cloak)
    solid=cloak.modifiers.new('Cloth_two_faces_and_hem_thickness','SOLIDIFY');solid.thickness=.010;solid.offset=0;bpy.ops.object.modifier_apply(modifier=solid.name)
    collar,attach=collar_band(surface,cat,aqua,width=.052,offset=.012,name='Cape_connected_soft_collar')
    parts=[cloak,collar]
    hem=[point(i/192,1) for i in range(193)];parts.append(tube('Cape_rounded_stitched_hem',hem,.006,trim,8))
    for u in (0,1):parts.append(tube('Cape_front_opening_sewn_edge',[point(u,j/56) for j in range(57)],.005,trim,8))
    center=attach(0,-.040,.035)
    shape=[]
    for i in range(64):
        a=TAU*i/64
        x=.053*math.sin(a)*(1-.40*max(0,math.cos(a)))
        z=.073*math.cos(a)
        shape.append((x,z))
    parts.append(profile_plate('Pearl_raindrop_clasp',shape,center,Matrix.Identity(3),.027,pearl,.010))
    parts.append(tube('Cape_clasp_back_bridge',[attach(-.035,0,.025),attach(.035,0,.025)],.006,trim,8))
    return parts

def main():
    p=argparse.ArgumentParser();p.add_argument('--slug',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--bake',action='store_true');p.add_argument('--views',default='front,left,right,back,top,perspective');p.add_argument('--resolution',type=int,default=640)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
    cat=import_base();original=np.array([tuple(v.co) for v in cat.data.vertices]);surface=Surface(cat)
    factories={'cloud-scarf':scarf,'bell-collar':bell_collar,'pearl-bow':pearl_bow,'star-moon-clip':star_moon_clip,'honey-neck-warmer':honey_neck_warmer,'mint-earmuffs':mint_earmuffs,'cherry-bow':cherry_bow,'fish-brooch':fish_brooch,'cloud-backpack':cloud_backpack}
    factories['laurel-crown']=laurel_crown
    factories['sailor-hat']=sailor_hat
    factories['star-glasses']=star_glasses
    factories['aurora-scarf']=lambda s,c:scarf(s,c,'aurora-scarf')
    from fitted_botanical import build_lily
    factories['lily-garland']=lambda s,c:build_lily(s,c,head_ring_point,leaf_mesh,catmull)
    from fitted_night_cap import build_night_cap
    factories['night-voyage-cap']=lambda s,c:build_night_cap(s,c,fitted_hat_shell,profile_plate)
    from fitted_cape import build_cape
    factories['raindrop-cape']=lambda s,c: build_cape(s,c,profile_plate)
    parts=factories[a.slug](surface,cat);camera=stage(a.resolution)
    extras=[o for o in parts if o.get('keepTransparent')]
    garment=join_bake([o for o in parts if o not in extras],out,a.slug,a.bake,analytical_light=a.slug in ('raindrop-cape','cloud-scarf','aurora-scarf','night-voyage-cap','cloud-backpack'))
    report=save_export(cat,garment,out,a.slug,original,extras)
    render_views(camera,out,a.views);print(json.dumps(report))

if __name__=='__main__':main()
