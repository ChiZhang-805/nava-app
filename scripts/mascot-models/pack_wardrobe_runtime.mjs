// Runtime packaging: lossless 4K cat image, one shared texture download,
// meshopt geometry/animation compression, full cat geometry in every GLB.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire('Q:/NAVA-Workspace/Tools/mascot-modeling/package.json');
const { NodeIO, Format } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, meshopt, textureCompress } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const root='Q:/NAVA-Workspace/Build/Assets/Mascot/wardrobe-v3';
const manifest=JSON.parse(await readFile(new URL('./wardrobe-production.json',import.meta.url),'utf8'));
const slugs=process.argv.slice(2).length?process.argv.slice(2):['base',...manifest.items.map(x=>x.slug)];
const out=path.join(root,'runtime-v1');await mkdir(out,{recursive:true});
function align(bytes){const b=Buffer.alloc(Math.ceil(bytes.length/4)*4);Buffer.from(bytes).copy(b);return b;}
for(const slug of slugs){
 const input=path.join(root,'rigged-v1',slug,`${slug}.glb`);
 const doc=await io.read(input);
 // Blender actions start at frame 1; normalize their sampled times to 0 seconds.
 const shifted=new Set();
 for(const animation of doc.getRoot().listAnimations()) for(const sampler of animation.listSamplers()) {
   const input=sampler.getInput();if(shifted.has(input))continue;
   shifted.add(input);const times=input.getArray();const first=times[0];
   if(first>0) input.setArray(Float32Array.from(times,t=>t-first));
 }
 const cat=doc.getRoot().listNodes().find(n=>n.getName()==='NAVA_Canonical_Cat');
 if(!cat)throw new Error('Missing canonical cat '+slug);
 const catTexture=cat.getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture();
 catTexture.setName('canonical-cat-v9').setURI('canonical-cat-v9.webp');
 for(const tex of doc.getRoot().listTextures()) if(tex!==catTexture) tex.setName('accessory-'+tex.getName());
 await doc.transform(dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',lossless:true,effort:60,pattern:/^canonical-cat-v9/}),textureCompress({encoder:sharp,targetFormat:'webp',quality:94,effort:60,resize:[1024,1024],pattern:/^accessory-/}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeTexcoord:16}));
 const result=await io.writeJSON(doc,{format:Format.GLTF,basename:slug});
 const {json,resources}=result;
 // Keep the generated JSON as a packaging diagnostic, outside product sources.
 await writeFile(path.join(out,`${slug}-pack.json`),JSON.stringify(json,null,2));
 const uri=json.buffers[0].uri;
 if(!uri||!resources[uri])throw new Error('Expected real geometry buffer at index 0');
 const pieces=[align(resources[uri])];let offset=pieces[0].length;
 delete json.buffers[0].uri;
 for(const im of json.images??[]){
   if(im.uri==='canonical-cat-v9.webp'){
     await writeFile(path.join(out,im.uri),resources[im.uri]);continue;
   }
   const bytes=resources[im.uri];if(!bytes)throw new Error('Missing image '+im.uri);
   const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
   im.bufferView=view;im.mimeType=im.mimeType??'image/webp';delete im.uri;
   const padded=align(bytes);pieces.push(padded);offset+=padded.length;
 }
 json.buffers[0].byteLength=offset;
 const jt=Buffer.from(JSON.stringify(json));const j=Buffer.alloc(Math.ceil(jt.length/4)*4,0x20);jt.copy(j);
 const bin=Buffer.concat(pieces);const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
 const glb=Buffer.concat([header,j,bh,bin]);await writeFile(path.join(out,`${slug}.glb`),glb);
 console.log(JSON.stringify({slug,inputBytes:(await readFile(input)).length,outputBytes:glb.length,sharedTexture:'canonical-cat-v9.webp',actions:json.animations?.map(a=>a.name),externalBuffers:json.buffers.slice(1)}));
}
