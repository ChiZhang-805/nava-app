"""v259 cloth refinement from the immutable v258 editable accessory source.
Native GLB coordinates throughout design math: Y up, front +Z, body X=-.20.
Run Blender --background --factory-startup --python this.py -- [--cloud-only]
All other catalog meshes/Basis geometry are preserved. Bell stacking targets
are refitted against the new cloth surfaces; base bell stays byte-coordinate equal.
"""
import bpy,bmesh,math,json,sys,argparse
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,default=OUT/('nava-accessories-editable.blend' if (OUT/'nava-accessories-editable.blend').exists() else 'source-v258.blend'))
parser.add_argument('--envelope',type=Path,default=OUT/'surface-envelope.json')
parser.add_argument('--output-blend',type=Path,default=OUT/'candidate.blend')
parser.add_argument('--output-glb',type=Path,default=OUT/'candidate.glb')
parser.add_argument('--cloud-only',action='store_true')
parser.add_argument('--refit-existing-collar',action='store_true',help='Refit bell stacking layers after deliberately changing cloth design parameters; otherwise preserve an already fitted v259 collar when rebuilding a v259 source.')
opt=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
PI=math.pi
def xyz(v):return Vector((v.x,v.z,-v.y))
def zup(v):return Vector((v[0],-v[2],v[1]))
def clamp(x,a=0,b=1):return max(a,min(b,x))
def smooth(x):x=clamp(x);return x*x*(3-2*x)
bpy.ops.wm.open_mainfile(filepath=str(opt.source.resolve()))
groups={o.name:o for o in bpy.context.scene.objects if o.name.startswith('accessory-')}
preserve_fitted_collar=not opt.refit_existing_collar and all(str(groups[n].get('fitRevision','')).startswith('v259') for n in ['accessory-cloud-scarf','accessory-honey-neck-warmer','accessory-aurora-scarf'])
materials={m.name:m for m in bpy.data.materials}
E=json.loads(opt.envelope.read_text());H=E['heights'];N=len(E['angles']);G=E['radius']['Body']
G=[[max(row[(k+d)%N] for d in range(-2,3)) for k in range(N)] for row in G]
def radial(q,y,margin=.023):
 yy=clamp((y-H[0])/.01,0,len(H)-1.00001);j=int(yy);v=yy-j;kk=q%(2*PI)/(2*PI)*N;k=int(kk);u=kk-k
 return ((1-v)*((1-u)*G[j][k%N]+u*G[j][(k+1)%N])+v*((1-u)*G[j+1][k%N]+u*G[j+1][(k+1)%N]))+margin
def point(q,y,extra=0):
 r=radial(q,y)+extra;return Vector((-.2+r*math.sin(q),y,.25+r*math.cos(q)))
cloth_mats={}
PALETTE_FALLBACK={
 'cloud-knit blue':(.39,.72,.96,1),'cloud-knit highlight':(.67,.88,1,1),'cloud-knit lower stitch':(.26,.58,.85,1),
 'honey knitted yarn':(.94,.55,.16,1),'honey yarn highlights':(1,.75,.32,1),'honey woven recess':(.75,.36,.075,1),
 'aqua glass enamel':(.12,.78,.85,1),'iridescent lilac':(.67,.52,.98,1),'ice blue satin':(.42,.83,.99,1)}
def mat(prefix):
 if prefix in cloth_mats:return cloth_mats[prefix]
 src=next((m for n,m in materials.items() if n.startswith(prefix)),None)
 if src:
  m=src.copy();base=tuple(src.get('clothBase',src.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value))
 else:
  m=bpy.data.materials.new(prefix);m.use_nodes=True;base=PALETTE_FALLBACK[prefix]
 m.name=prefix+' v259 cloth'
 m.node_tree.nodes.clear();bsdf=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
 m['clothBase']=base;bsdf.inputs['Base Color'].default_value=(1,1,1,1);bsdf.inputs['Roughness'].default_value=.95
 vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='clothVolume';m.node_tree.links.new(vc.outputs['Color'],bsdf.inputs['Base Color'])
 cloth_mats[prefix]=m;return m
def mesh(name,verts,faces,material,parent,shades=None,weights=None):
 data=bpy.data.meshes.new(name);data.from_pydata([zup(p) for p in verts],[],faces);data.update()
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.parent=parent;data.materials.append(material)
 for p in data.polygons:p.use_smooth=True
 col=data.color_attributes.new(name='clothVolume',type='FLOAT_COLOR',domain='POINT')
 for i,c in enumerate(col.data):
  s=shades[i] if shades else 1;base=material['clothBase'];c.color=tuple(min(1,base[k]*s) for k in range(3))+(1,)
 data.color_attributes.active_color=col
 # These helper arrays drive coherent deformation of fabric, edging and tassels.
 ob['clothVertexT']=weights if weights else [0.0]*len(verts)
 return ob
def tube(name,pts,radius,material,g,cyclic=False,weights=None,shade=.98,sides=10):
 pts=[Vector(p) for p in pts];vs=[];fs=[];ss=[];ts=[]
 for i,p in enumerate(pts):
  tan=(pts[(i+1)%len(pts)]-pts[(i-1)%len(pts)]).normalized() if cyclic else (pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
  a=tan.cross(Vector((0,1,0)) if abs(tan.y)<.9 else Vector((1,0,0))).normalized();b=tan.cross(a).normalized()
  for k in range(sides):
   q=2*PI*k/sides;vs.append(p+radius*(math.cos(q)*a+math.sin(q)*b));ss.append(shade*(.9+.1*math.cos(q)));ts.append(weights[i] if weights else 0)
 for i in range(len(pts) if cyclic else len(pts)-1):
  j=(i+1)%len(pts)
  for k in range(sides):l=(k+1)%sides;fs.append((i*sides+k,i*sides+l,j*sides+l,j*sides+k))
 if not cyclic:fs.extend([tuple(range(sides-1,-1,-1)),tuple((len(pts)-1)*sides+k for k in range(sides))])
 return mesh(name,vs,fs,material,g,ss,ts)
def center_y(q):
 # Drape is not horizontal: low front and back, asymmetric folded shoulder.
 return -.215-.062*max(0,math.cos(q))**2-.048*max(0,-math.cos(q))**2+.027*math.sin(2*q+.4)+.018*math.sin(3*q-.6)
def height(q,h=.083):
 dq=math.atan2(math.sin(q-3.7),math.cos(q-3.7))
 return h*(1+.10*math.sin(q-.3)+.07*math.cos(3*q+.4)-.13*math.exp(-(dq/.30)**2))
def local_crease(q,s):
 valley=0.0;ridge=0.0
 for qc,slope,amp,width in [(-.65,3.1,1.0,.28),(.35,-3.5,.85,.22),(3.45,3.7,.85,.32)]:
  dq=math.atan2(math.sin(q-qc),math.cos(q-qc))
  fade=math.exp(-(dq/width)**2)
  valley+=amp*fade*math.exp(-((s-slope*dq)/.21)**2)
  ridge+=amp*fade*math.exp(-((s-slope*dq-.33)/.30)**2)
 return valley,ridge
def wrap_point(q,a,h=.083):
 sy=math.sin(a);cc=math.cos(a);s=math.copysign(abs(sy)**.72,sy);c=math.copysign(abs(cc)**.58,cc);hh=height(q,h)
 y=center_y(q)+hh*s+.004*math.sin(q*3+s*2)*(1-s*s)
 # Two broad, nonparallel folds pass round the wrap. The back is finished too.
 fold=(.5+.5*math.cos(.82*PI*s+.68*math.sin(2*q)+.22*math.sin(3*q)))
 crease,ridge=local_crease(q,s)
 extra=.034+.027*(.90+.10*math.sin(q)+.08*math.sin(3*q))*c+max(0,c)*(.009*fold+.004*math.sin(q*5+.8*s)**2-.018*crease+.030*ridge)
 local=radial(q,y);support=max(radial(q,center_y(q)+hh*j/6) for j in range(-6,7))
 r=.72*support+.28*local+extra
 p=Vector((-.2+r*math.sin(q),y,.25+r*math.cos(q)))
 # Tonal yarn variation follows physical rounded folds; no cast shadow or AO.
 shade=.76+.15*max(0,c)+.045*fold*max(0,c)+.035*s+max(0,c)*(-.16*crease+.13*ridge)
 return p,clamp(shade,.64,1.08)
def wrap(g,material,h=.083):
 vs=[];fs=[];ss=[];nt=192;na=40
 for i in range(nt):
  q=2*PI*i/nt
  for k in range(na):p,c=wrap_point(q,2*PI*k/na,h);vs.append(p);ss.append(c)
 for i in range(nt):
  for k in range(na):fs.append((i*na+k,i*na+(k+1)%na,((i+1)%nt)*na+(k+1)%na,((i+1)%nt)*na+k))
 return mesh('soft draped folded knit wrap',vs,fs,material,g,ss)
def tail_center(t,q0,q1,end):
 y=-.252+(end+.252)*t+.014*math.sin(2*PI*t)
 q=q0+(q1-q0)*t+.060*math.sin(2*PI*t)
 # Raised fold leaves the collar, returns softly, then lifts at the hem.
 extra=.060+.045*math.sin(PI*t)**2+.025*t*t
 return q,y,extra
def tail_point(t,a,q0,q1,end,width):
 q,y,extra=tail_center(t,q0,q1,end);u=math.sin(a);c=math.cos(a)
 # Rounded end and soft taper, never a long rectangular board.
 w=width*(1-.12*t)*(.84+.16*math.sin(PI*clamp(t/.10)) if t<.10 else 1)
 if t>.92:w*=math.sqrt(max(.035,1-((t-.92)/.085)**2))
 twist=-.17+.42*smooth(t)
 side=u*w/2;yy=y+side*math.sin(twist)
 qq=q+side*math.cos(twist)/max(.2,radial(q,yy))
 # Longitudinal folds make a soft W cross section, with enough cloth thickness.
 ridge=.009*math.cos(1.35*PI*u+.28*math.sin(PI*t))*(.5+.5*math.sin(PI*t))
 extra+=.021*c+ridge+.010*u*math.sin(twist)
 p=point(qq,yy,extra)
 shade=.84+.10*c+.11*math.cos(1.35*PI*u+.28*math.sin(PI*t))+.025*math.sin(PI*t)
 return p,clamp(shade,.64,1.08)
def tail(g,material,q0=.48,q1=.64,end=-.605,width=.185):
 vs=[];fs=[];ss=[];ts=[];nt=64;na=36
 for i in range(nt+1):
  t=i/nt
  for j in range(na):p,c=tail_point(t,2*PI*j/na,q0,q1,end,width);vs.append(p);ss.append(c);ts.append(t)
 for i in range(nt):
  for j in range(na):fs.append((i*na+j,i*na+(j+1)%na,(i+1)*na+(j+1)%na,(i+1)*na+j))
 fs.extend([tuple(range(na-1,-1,-1)),tuple(nt*na+j for j in range(na))])
 return mesh('soft S curved folded scarf tail',vs,fs,material,g,ss,ts)
def attachment_fold(g,material,qc,h):
 # A real closed soft fold crosses the tail root and lies into the wrap at
 # both sides. It is not a floating trim tube or a painted-on crease.
 vs=[];fs=[];ss=[];n=48;m=20
 for j in range(1,m):
  lat=-PI/2+PI*j/m
  for k in range(n):
   a=2*PI*k/n;q=qc+.110*math.cos(lat)*math.cos(a)
   y=center_y(q)-.018+.068*math.cos(lat)*math.sin(a)-.30*(q-qc)
   s=clamp((y-center_y(q))/height(q,h),-.98,.98);p,c=wrap_point(q,math.asin(s),h)
   d=Vector((math.sin(q),0,math.cos(q)));p+=d*(.004+.017*math.sin(lat))
   vs.append(p);ss.append(.82+.18*max(0,math.sin(lat))+.035*math.sin(a))
 for j in range(m-2):
  for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 for side in [-1,1]:
  y=center_y(qc)-.018;p,c=wrap_point(qc,math.asin((y-center_y(qc))/height(qc,h)),h)
  p+=Vector((math.sin(qc),0,math.cos(qc)))*(.004+.017*side);idx=len(vs);vs.append(p);ss.append(.82+.18*max(0,side))
  off=0 if side<0 else (m-2)*n
  for k in range(n):fs.append((idx,off+(k+1)%n,off+k) if side<0 else (idx,off+k,off+(k+1)%n))
 return mesh('soft diagonal attachment cover fold',vs,fs,material,g,ss)
STYLES={
 'accessory-cloud-scarf':('cloud-knit blue','cloud-knit highlight','cloud-knit lower stitch'),
 'accessory-honey-neck-warmer':('honey knitted yarn','honey yarn highlights','honey woven recess'),
 'accessory-aurora-scarf':('aqua glass enamel','iridescent lilac','ice blue satin')}
active=['accessory-cloud-scarf'] if opt.cloud_only else list(STYLES)
for id in active:
 g=groups[id]
 for o in list(g.children_recursive):bpy.data.objects.remove(o,do_unlink=True)
 base,light,detail=[mat(n) for n in STYLES[id]];h=.083 if 'honey' not in id else .088
 wrap(g,base,h)
 # Fine rolled edges follow the drape. They are not rigid contrasting piping.
 for a in []:
  pts=[wrap_point(2*PI*i/192,a,h)[0] for i in range(192)]
  tube('soft rolled knit edge',pts,.006,base,g,True,shade=1.02)
 if 'honey' in id:
  for k in range(52):
   q=2*PI*k/52;pts=[wrap_point(q+.006*math.sin(a*2),a,h)[0]+Vector((math.sin(q),0,math.cos(q)))*.003 for a in [-1.1+i*2.2/12 for i in range(13)]]
   tube('soft honey knitted rib',pts,.0034,light,g,shade=.92,sides=6)
 else:
  tails=[(.48,.64,-.605,.185)] if 'cloud' in id else [(.55,.77,-.54,.16),(.28,.33,-.47,.145)]
  attachment_fold(g,base,.49,h)
  for ti,pars in enumerate(tails):
   tm=base if ti==0 else light;tail(g,tm,*pars)
   # Broad fold over the attachment visually joins tail to wrap.
   q0,q1,end,width=pars
   for side in [-1,1]:
    aa=PI/2 if side==1 else -PI/2
    pts=[tail_point(t,aa,q0,q1,end,width)[0]+Vector((math.sin(q0),0,math.cos(q0)))*.003 for t in [i/48 for i in range(49)]]
    tube('rounded tail selvedge',pts,.0045,base,g,weights=[i/48 for i in range(49)],shade=.96)
   if 'cloud' in id:
    for k in range(5):
     a=math.asin((k-2)/2.6);start=tail_point(.94,a,*pars)[0];q,y,extra=tail_center(1,*pars[:3]);p=Vector(start);p.y-=.036+.006*(k%2);p.x+=.008*math.sin(k);p.z+=.009
     tube('soft rounded tassel bundle',[start,start.lerp(p,.5)+Vector((.003,0,.006)),p],.009,base,g,weights=[.94,.97,1],shade=.99,sides=12)
 # Fine stitches are all-round, follow cloth flow, and remain subordinate to folds.
 for k in range(78):
  q=2*PI*k/78
  for a in [-.47,.34]:
   p0=wrap_point(q-.010,a+.13,h)[0];p1=wrap_point(q,a-.10,h)[0];p2=wrap_point(q+.010,a+.13,h)[0]
   outward=Vector((math.sin(q),0,math.cos(q)))*.003
   tube('soft yarn V stitch',[p0+outward,p1+outward,p2+outward],.0025,base,g,shade=1.19,sides=6)
 g['fitRevision']='v259 draped volume cloth with secondary tail shapes'
 g['clothMotion']='cloth_relax/cloth_lift additive weights 0..1; fixed attachment; endpoints zero'
 # Keep per-material draw calls bounded. Preserve deformation t in point attribute.
 for o in g.children_recursive:
  if o.type!='MESH':continue
  attr=o.data.attributes.new('clothT','FLOAT','POINT')
  for d,t in zip(attr.data,o['clothVertexT']):d.value=t
  del o['clothVertexT']
 by={}
 for o in g.children_recursive:
  if o.type=='MESH':by.setdefault(o.data.materials[0].name,[]).append(o)
 for name,obs in by.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0]
  if len(obs)>1:bpy.ops.object.join()
  obs[0].name='v259 '+name+' | '+id.removeprefix('accessory-')
 # Stacking basis forms and cloth motions share native coordinates. Cloth
 # motion deltas remain additive with each fitted stacking shape.
 for o in g.children_recursive:
  if o.type!='MESH':continue
  W=o.matrix_world.copy();inv=W.inverted();o.shape_key_add(name='Basis')
  for rank in [1,2,3]:
   key=o.shape_key_add(name='stack_'+str(rank))
   for s,d in zip(o.data.vertices,key.data):
    p=xyz(W@s.co);y=p.y-.035*rank
    if y<-.56:y=-.56+(y+.56)*(.16/(.16+.035*rank))
    q=math.atan2(p.x+.2,p.z-.25);r=math.hypot(p.x+.2,p.z-.25)+.025*rank+max(0,radial(q,y)-radial(q,p.y))
    d.co=inv@zup((-.2+r*math.sin(q),y,.25+r*math.cos(q)))
  for name in ['cloth_relax','cloth_lift']:
   key=o.shape_key_add(name=name)
   for i,(s,d) in enumerate(zip(o.data.vertices,key.data)):
    p=xyz(W@s.co);t=o.data.attributes['clothT'].data[i].value;w=smooth((t-.20)/.80);q=math.atan2(p.x+.2,p.z-.25)
    radialdir=Vector((math.sin(q),0,math.cos(q)));tandir=Vector((math.cos(q),0,-math.sin(q)))
    delta=(radialdir*.013+tandir*.018)*w if name=='cloth_relax' else (radialdir*.030+Vector((0,.010,0)))*w
    d.co=inv@zup(p+delta)
  o.data.attributes.remove(o.data.attributes['clothT'])
# Refit layers against earlier whole garments; all 14 untouched Basis meshes
# are preserved. Bell's stacking layers are permitted to clear the new drape.
neck=sorted([g for g in groups.values() if g.get('stackGroup')=='neckwear'],key=lambda g:g['stackOrder'])
for rank in [1,2,3]:
 for gi,g in enumerate(neck):
  if gi==0:continue
  if preserve_fitted_collar and g.name=='accessory-bell-collar':continue
  pts=[];faces=[]
  for prior in neck[:gi]:
   for o in prior.children_recursive:
    if o.type!='MESH':continue
    for lower in range(rank):
     src=o.data.vertices if lower==0 else o.data.shape_keys.key_blocks['stack_'+str(lower)].data
     off=len(pts);pts.extend(xyz(o.matrix_world@v.co) for v in src);faces.extend(tuple(off+i for i in p.vertices) for p in o.data.polygons)
  tree=BVHTree.FromPolygons(pts,faces)
  # The entire current garment supplies one inner support surface. A shared
  # radial translation field preserves thickness: clamping each vertex to the
  # preceding garment individually would flatten both cloth sides together.
  ownpts=[];ownfaces=[]
  for o in g.children_recursive:
   if o.type!='MESH':continue
   key=o.data.shape_keys.key_blocks['stack_'+str(rank)];off=len(ownpts)
   ownpts.extend(xyz(o.matrix_world@v.co) for v in key.data)
   ownfaces.extend(tuple(off+i for i in p.vertices) for p in o.data.polygons)
  own=BVHTree.FromPolygons(ownpts,ownfaces)
  for o in g.children_recursive:
   if o.type!='MESH':continue
   inv=o.matrix_world.inverted();key=o.data.shape_keys.key_blocks['stack_'+str(rank)]
   for v in key.data:
    p=xyz(o.matrix_world@v.co);q=math.atan2(p.x+.2,p.z-.25);d=Vector((math.sin(q),0,math.cos(q)));r=math.hypot(p.x+.2,p.z-.25);shift=0
    for dy in [-.006,0,.006]:
     c=Vector((-.2,p.y+dy,.25));hit,n,idx,dist=tree.ray_cast(c+d*2,-d,2)
     inner,nn,ii,rd=own.ray_cast(c,d,2)
     if hit is not None:shift=max(shift,2-dist+.020-(rd if inner is not None else r))
    if shift>0:v.co=inv@zup((-.2+(r+shift)*d.x,p.y,.25+(r+shift)*d.z))
for g in groups.values():
 for o in g.children_recursive:
  if o.type=='MESH' and o.data.shape_keys:
   for key in o.data.shape_keys.key_blocks:key.value=0.0
bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
opt.output_blend.parent.mkdir(parents=True,exist_ok=True);opt.output_glb.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(opt.output_blend.resolve()))
bpy.ops.export_scene.gltf(filepath=str(opt.output_glb.resolve()),export_format='GLB',export_extras=True,export_animations=False,export_yup=True,export_all_vertex_colors=True)
print('DONE',opt.output_glb,flush=True)
