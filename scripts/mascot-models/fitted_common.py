"""Shared canonical-cat geometry and export helpers. Blender 5.2, Z up, front -Y.

Clothing is authored against the actual cat surface. No independent cat reshaping.
"""
from pathlib import Path
import hashlib, json, math
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BASE = Path('Q:/NAVA-Workspace/Build/Assets/Mascot/base-cat-v9-shadowless/nava-cat-base-v9-shadowless.glb')
MATERIALS = Path('Q:/NAVA-Workspace/Build/Reference/Wardrobe-v3/materials')
CX, CY = -.08, -.28
TAU=math.tau

def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active=obj

def import_base():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(BASE)); bpy.context.view_layer.update()
    cat=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    active(cat); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    cat.name='NAVA_Canonical_Cat'; cat.visible_shadow=False
    return cat

def mesh(name,verts,faces,material,uv=None):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    ob=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(ob);ob.visible_shadow=False
    if material: data.materials.append(material)
    for p in data.polygons:p.use_smooth=True
    if uv is not None:
        layer=data.uv_layers.new(name='KnitFlow')
        for loop in data.loops:layer.data[loop.index].uv=uv[loop.vertex_index]
    return ob

class Surface:
    def __init__(self,cat):
        self.tree=BVHTree.FromPolygons([v.co for v in cat.data.vertices],[list(f.vertices) for f in cat.data.polygons])
        self.heights=np.linspace(-.76,.44,241);self.n=256
        self.r=np.zeros((len(self.heights),self.n))
        for i,z in enumerate(self.heights):
            for j in range(self.n):
                q=TAU*j/self.n;d=Vector((math.sin(q),-math.cos(q),0))
                hit,_,_,dist=self.tree.ray_cast(Vector((CX,CY,float(z)))+2*d,-d,4)
                self.r[i,j]=2-dist if hit else np.nan
        if np.isnan(self.r).any():raise RuntimeError('Missing radial body surface')
        # Fit to fur envelope, retaining the actual body silhouette. A small
        # angular max catches outward tips before cyclic smoothing.
        self.r=np.maximum.reduce([np.roll(self.r,k,axis=1) for k in range(-2,3)])
        for _ in range(3): self.r=.5*self.r+.25*np.roll(self.r,1,axis=1)+.25*np.roll(self.r,-1,axis=1)
    def radius(self,q,z):
        v=float(np.clip((z-self.heights[0])/(self.heights[-1]-self.heights[0])*(len(self.heights)-1),0,len(self.heights)-1.00001))
        i=int(v);v-=i;u=(q%TAU)/TAU*self.n;j=int(u);u-=j
        return float((1-v)*((1-u)*self.r[i,j]+u*self.r[i,(j+1)%self.n])+v*((1-u)*self.r[i+1,j]+u*self.r[i+1,(j+1)%self.n]))
    def point(self,q,z,offset=.025):
        r=self.radius(q,z)+offset
        return Vector((CX+r*math.sin(q),CY-r*math.cos(q),z))

def material(name,color,kind='matte',metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=.85 if kind in ('knit','felt','matte') else .3
    p.inputs['Metallic'].default_value=metal;p.inputs['Specular IOR Level'].default_value=.25
    n,l=m.node_tree.nodes,m.node_tree.links
    if kind=='felt':
        p.inputs['Sheen Weight'].default_value=.35
        tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=180;tex.inputs['Detail'].default_value=2
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(c*.78 for c in color)+(1,);ramp.color_ramp.elements[1].color=tuple(color)+(1,)
        l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.0012
        l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    if kind=='knit':
        p.inputs['Sheen Weight'].default_value=.22
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(MATERIALS/'fine-stockinette.png'),check_existing=True)
        uv=n.new('ShaderNodeUVMap');uv.uv_map='KnitFlow';l.new(uv.outputs[0],tex.inputs['Vector'])
        # Remap contrast so fine knit does not look like coarse dark rope.
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.04;ramp.color_ramp.elements[0].color=(.48,.48,.48,1)
        ramp.color_ramp.elements[1].position=.85;ramp.color_ramp.elements[1].color=(1,1,1,1)
        l.new(tex.outputs[0],ramp.inputs[0])
        mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=(*color,1)
        l.new(ramp.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],p.inputs['Base Color'])
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=.0015
        l.new(tex.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    return m

def tube(name,points,radius,mat,sides=10):
    ps=[Vector(p) for p in points];vs=[];fs=[];uv=[];arc=0
    for i,p in enumerate(ps):
        if i:arc+=(p-ps[i-1]).length
        tangent=(ps[min(i+1,len(ps)-1)]-ps[max(i-1,0)]).normalized()
        aa=tangent.cross(Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((1,0,0))).normalized();bb=tangent.cross(aa).normalized()
        rr=radius[i] if isinstance(radius,list) else radius
        for k in range(sides):
            t=TAU*k/sides;vs.append(tuple(p+rr*(math.cos(t)*aa+math.sin(t)*bb)));uv.append((k/sides*.1,arc*2))
    for i in range(len(ps)-1):
        for k in range(sides):fs.append((i*sides+k,i*sides+(k+1)%sides,(i+1)*sides+(k+1)%sides,(i+1)*sides+k))
    fs.extend([tuple(range(sides-1,-1,-1)),tuple((len(ps)-1)*sides+k for k in range(sides))])
    return mesh(name,vs,fs,mat,uv)

def ellipsoid(name,location,scale,mat,segments=40,rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=location)
    o=bpy.context.object;o.name=name;o.scale=scale;active(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);o.visible_shadow=False
    for p in o.data.polygons:p.use_smooth=True
    if o.data.uv_layers:o.data.uv_layers[0].name='KnitFlow'
    return o

def bevel_box(name,location,size,mat,bevel=.01):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    o=bpy.context.object;o.name=name;o.scale=size;active(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);o.visible_shadow=False
    mod=o.modifiers.new('Soft_finished_edges','BEVEL');mod.width=bevel;mod.segments=4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons:p.use_smooth=True
    return o

def collar_band(surface,cat,mat,width=.065,offset=-.015,name='Soft_collar'):
    def center(q):return -.12-.065*math.cos(q)+.008*math.sin(q)
    samples=np.array([max(surface.radius(TAU*i/256,center(TAU*i/256)+width*j/8) for j in range(-4,5))+offset for i in range(256)])
    for _ in range(12):samples=.5*samples+.25*np.roll(samples,1)+.25*np.roll(samples,-1)
    def radius(q):
        if offset>=0:return surface.radius(q,center(q))+offset
        u=(q%TAU)/TAU*256;i=int(u);u-=i
        return float(samples[i]*(1-u)+samples[(i+1)%256]*u)
    vs=[];uv=[];fs=[];n,m=192,24
    for i in range(n+1):
        q=TAU*i/n
        for j in range(m+1):
            a=TAU*j/m;z=center(q)+width*.5*math.sin(a)
            r=(surface.radius(q,z)+offset if offset>=0 else radius(q))+.009*math.cos(a)
            vs.append((CX+r*math.sin(q),CY-r*math.cos(q),z));uv.append((i/n*4,j/m*.3))
    for i in range(n):
        for j in range(m):k=i*(m+1)+j;fs.append((k,k+1,k+m+2,k+m+1))
    ob=mesh(name,vs,fs,mat,uv);moved=list(cat.get('compressedCoveredVertices',[]))
    for v in cat.data.vertices if offset<0 else []:
        x,y,z=v.co;q=math.atan2(x-CX,-(y-CY));t=(z-center(q))/(width*.5)
        if abs(t)>.99:continue
        r=math.hypot(x-CX,y-CY);inside=radius(q)-.009*math.sqrt(1-t*t)-.004
        if r>inside:
            v.co.x=CX+(x-CX)*inside/r;v.co.y=CY+(y-CY)*inside/r;moved.append(v.index)
    cat.data.update();cat['compressedCoveredVertices']=list(set(moved))
    def point(q,zoff=0,extra=0):return Vector((CX+(radius(q)+extra)*math.sin(q),CY-(radius(q)+extra)*math.cos(q),center(q)+zoff))
    return ob,point

def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()

def stage(res=640):
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=20;s.cycles.use_denoising=True
    s.world=bpy.data.worlds.new('All_round_soft_light');s.world.use_nodes=True
    n,l=s.world.node_tree.nodes,s.world.node_tree.links
    n['Background'].inputs[0].default_value=(.82,.89,1,1);n['Background'].inputs[1].default_value=.52
    camera_bg=n.new('ShaderNodeBackground');camera_bg.inputs[0].default_value=(.69,.81,.94,1)
    ray=n.new('ShaderNodeLightPath');mix=n.new('ShaderNodeMixShader')
    l.new(ray.outputs['Is Camera Ray'],mix.inputs[0]);l.new(n['Background'].outputs[0],mix.inputs[1]);l.new(camera_bg.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],n['World Output'].inputs[0])
    for name,pos,power in [('Front',(-3,-4,5),160),('Right',(4,-1,3),100),('Back',(0,4,4),130),('Left',(-4,1,2),65)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=5;d.use_shadow=False
        o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=pos;aim(o,(CX,CY,0))
    c=bpy.data.cameras.new('Reference_camera');c.type='ORTHO';c.ortho_scale=2.65
    camera=bpy.data.objects.new('Reference_camera',c);bpy.context.collection.objects.link(camera);s.camera=camera
    camera.location=(CX,CY-6,.175);aim(camera,(CX,CY,.025))
    s.render.resolution_x=res;s.render.resolution_y=res;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
    s.view_settings.view_transform='Standard';s.view_settings.look='None'
    return camera

def render_views(camera,out,views='front,left,right,back,top,perspective'):
    directions={'front':(0,-6,.15),'left':(6,0,.12),'right':(-6,0,.12),'back':(0,6,.15),'top':(0,-.001,6),'perspective':(-4,-6,2.1)}
    for view in views.split(','):
        camera.location=Vector((CX,CY,.025))+Vector(directions[view]);aim(camera,(CX,CY,.025))
        bpy.context.scene.render.filepath=str(out/f'{view}.png');bpy.ops.render.render(write_still=True)

def join_bake(objects,out,slug,bake=True,size=2048,analytical_light=False):
    active(objects[0])
    for ob in objects:ob.select_set(True)
    bpy.ops.object.join();o=bpy.context.object;o.name='Accessory_'+slug
    # Close construction seams before UV baking. This affects the accessory
    # only and keeps existing loop UV data; never weld the canonical cat.
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm,dist=1e-7,edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data);bm.free();o.data.update()
    # Keep flow UVs for knit material, use another UV for baked export.
    o.data.uv_layers.new(name='BakedUV');o.data.uv_layers.active_index=len(o.data.uv_layers)-1
    o.data.uv_layers.active.active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
    if not bake:return o
    if analytical_light:
        # Thin, double-sided fabric can receive self-hit artifacts in Cycles'
        # combined ray bake. Bake its all-around diffuse look as an emission
        # shader instead: continuous normal-based studio illumination, no
        # contact shadows. This remains a texture on the real curved mesh.
        for mat in set(o.data.materials):
            ns,ls=mat.node_tree.nodes,mat.node_tree.links
            bsdf=ns.get('Principled BSDF');output=ns.get('Material Output')
            if not bsdf:continue
            base=bsdf.inputs['Base Color']
            source=base.links[0].from_socket if base.is_linked else None
            geo=ns.new('ShaderNodeNewGeometry')
            normal=bsdf.inputs['Normal'].links[0].from_socket if bsdf.inputs['Normal'].is_linked else geo.outputs['Normal']
            total=ns.new('ShaderNodeValue');total.outputs[0].default_value=.77
            result=total.outputs[0]
            for direction,weight in [((-.4,-.6,.7),.20),((.6,.2,.6),.14),((-.5,.6,.3),.10)]:
                dot=ns.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector(direction).normalized();ls.new(normal,dot.inputs[0])
                pos=ns.new('ShaderNodeMath');pos.operation='MAXIMUM';pos.inputs[1].default_value=0;ls.new(dot.outputs['Value'],pos.inputs[0])
                mul=ns.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=weight;ls.new(pos.outputs[0],mul.inputs[0])
                add=ns.new('ShaderNodeMath');add.operation='ADD';ls.new(result,add.inputs[0]);ls.new(mul.outputs[0],add.inputs[1]);result=add.outputs[0]
            mix=ns.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
            if source:ls.new(source,mix.inputs[1])
            else:mix.inputs[1].default_value=base.default_value
            ls.new(result,mix.inputs[2])
            emission=ns.new('ShaderNodeEmission');ls.new(mix.outputs[0],emission.inputs[0]);ls.new(emission.outputs[0],output.inputs['Surface'])
    img=bpy.data.images.new(slug+'_baked',size,size,alpha=False)
    for m in set(o.data.materials):
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=img;m.node_tree.nodes.active=n
    s=bpy.context.scene;s.cycles.samples=32;s.render.bake.margin=20
    s.render.bake.use_pass_direct=True;s.render.bake.use_pass_indirect=True;s.render.bake.use_pass_color=True
    polished=any(m.node_tree.nodes.get('Principled BSDF') and m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value<.5 for m in set(o.data.materials))
    # Accessory colors are baked for the shadowless runtime. Adjacent fur and
    # staging meshes must not imprint occlusion/contact-ray artifacts in them.
    hidden=[(other,other.hide_render) for other in bpy.context.scene.objects if other.type=='MESH' and other!=o]
    for other,_ in hidden:other.hide_render=True
    bpy.ops.object.bake(type='EMIT' if analytical_light else 'COMBINED' if polished else 'DIFFUSE',uv_layer='BakedUV')
    for other,was_hidden in hidden:other.hide_render=was_hidden
    img.filepath_raw=str(out/f'{slug}-baked.png');img.file_format='PNG';img.save();img.pack()
    m=bpy.data.materials.new(slug+'_shadowless');m.use_nodes=True;n,l=m.node_tree.nodes,m.node_tree.links;n.clear()
    tex=n.new('ShaderNodeTexImage');tex.image=img;uv=n.new('ShaderNodeUVMap');uv.uv_map='BakedUV';l.new(uv.outputs[0],tex.inputs[0])
    em=n.new('ShaderNodeEmission');output=n.new('ShaderNodeOutputMaterial');l.new(tex.outputs[0],em.inputs[0]);l.new(em.outputs[0],output.inputs[0])
    o.data.materials.clear();o.data.materials.append(m)
    for p in o.data.polygons:p.material_index=0
    # Export only baked UV channel; removes flow overhead once evaluated.
    flow=o.data.uv_layers.get('KnitFlow')
    if flow:o.data.uv_layers.remove(flow)
    o.data.uv_layers.active_index=0
    return o

def save_export(cat,garment,out,slug,original,extras=()):
    current=np.asarray([tuple(v.co) for v in cat.data.vertices])
    changed=np.flatnonzero(np.any(current!=original,axis=1))
    allowed=set(cat.get('compressedCoveredVertices',[]))
    assert set(changed).issubset(allowed),'Cat changed outside deliberately compressed covered region'
    cat['canonicalBase']='v9';garment['wornAccessory']=slug
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/f'{slug}.blend'))
    active(cat);garment.select_set(True)
    for ob in extras:ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/f'{slug}.glb'),export_format='GLB',use_selection=True,export_animations=False,export_extras=True)
    report={'slug':slug,'canonicalBase':str(BASE),'baseSHA256':hashlib.sha256(BASE.read_bytes()).hexdigest(),'exactCatVertices':int(len(current)-len(changed)),'compressedCoveredVertices':int(len(changed)),'outsideCoveredRegionUnchanged':True,
            'triangles':sum(len(p.vertices)-2 for o in (cat,garment,*extras) for p in o.data.polygons),'fileBytes':(out/f'{slug}.glb').stat().st_size,'animation':'static','status':'visual_review_pending'}
    (out/'build.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report
