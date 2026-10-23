"""Check actual exported cat coordinates and decoded albedo against canonical GLB."""
import argparse,hashlib,io,json,struct
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

BASE=Path('Q:/NAVA-Workspace/Build/Assets/Mascot/base-cat-v9-shadowless/nava-cat-base-v9-shadowless.glb')

def load(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    data=json.loads(raw[20:20+n]);start=20+n;size=struct.unpack_from('<I',raw,start)[0]
    return data,raw[start+8:start+8+size]

def transform(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
    x,y,z,w=node.get('rotation',[0,0,0,1]);r=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])
    m=np.eye(4);m[:3,:3]=r@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m

def read_accessor(doc,blob,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];width=np.dtype(dtype).itemsize*components
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',width)
    return np.ndarray((a['count'],components),dtype=dtype,buffer=blob,offset=offset,strides=(stride,np.dtype(dtype).itemsize)).copy()

def cat_data(path,canonical=False):
    doc,blob=load(path);found=[]
    def walk(i,parent):
        node=doc['nodes'][i];matrix=parent@transform(node)
        if 'mesh' in node and (canonical or node.get('name','').startswith('NAVA_Canonical_Cat')):
            found.append((node,matrix))
        for child in node.get('children',[]):walk(child,matrix)
    for root in doc['scenes'][doc.get('scene',0)]['nodes']:walk(root,np.eye(4))
    if len(found)!=1:raise ValueError(f'Expected one canonical cat mesh: {path}; got {len(found)}')
    node,matrix=found[0];points=[];pixels=[]
    for primitive in doc['meshes'][node['mesh']]['primitives']:
        p=read_accessor(doc,blob,primitive['attributes']['POSITION']);points.append((matrix@np.c_[p,np.ones(len(p))].T).T[:,:3])
        mat=doc['materials'][primitive['material']];texture=mat['pbrMetallicRoughness']['baseColorTexture']['index'];source=doc['textures'][texture]['source'];im=doc['images'][source]
        view=doc['bufferViews'][im['bufferView']];start=view.get('byteOffset',0);raw=blob[start:start+view['byteLength']]
        decoded=Image.open(io.BytesIO(raw)).convert('RGBA');pixels.append({'size':list(decoded.size),'sha256':hashlib.sha256(decoded.tobytes()).hexdigest()})
    return np.concatenate(points),pixels

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--covered',choices=['none','neck','hat','cape'],default='none');a=p.parse_args()
    original,textures=cat_data(BASE,True);current,current_textures=cat_data(a.input)
    # glTF world uses Y up. Convert to Blender coordinates only for spatial masks.
    x=original[:,0];z=original[:,1];y=-original[:,2];q=np.arctan2(x+.08,-(y+.28))
    allowed=np.zeros(len(x),dtype=bool)
    if a.covered=='hat':allowed=z>.54
    if a.covered=='neck':
        center=-.135-.105*np.cos(q)+.020*np.sin(2*q-.3)
        allowed=np.abs(z-center)<.145
    if a.covered=='cape':
        top=-.095-.145*np.cos(q)
        lobe=np.exp(-((np.abs(q)-.80)/.58)**2)
        hem=-.595-.060*lobe+.021*np.cos(6*q+.3)
        t=(top-z)/(top-hem)
        gap=.015+.63*np.maximum(0,t)**1.30
        allowed=(t>-.035)&(t<1)&(np.abs(q)>gap-.007)
    distances,_=cKDTree(current).query(original)
    unchanged=distances<=2e-6;outside=distances[~allowed]
    result={'input':str(a.input),'canonical':str(BASE),'catTexturePixelsIdentical':textures==current_textures,'sourceVertices':len(original),'exportVertices':len(current),'coordinateTolerance':2e-6,'retainedSourcePositionsAtTolerance':int(unchanged.sum()),'permittedCoveredRegion':a.covered,'changedOutsideCoveredRegion':int(((~unchanged)&(~allowed)).sum()),'maxOutsideDistance':float(outside.max()) if len(outside) else 0,'maxAnyDistance':float(distances.max()),'meaning':'Rest geometry and original decoded albedo only; does not validate rig deformation or visual quality.'}
    result['pass']=result['catTexturePixelsIdentical'] and result['changedOutsideCoveredRegion']==0
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result));assert result['pass'],result

if __name__=='__main__':main()
