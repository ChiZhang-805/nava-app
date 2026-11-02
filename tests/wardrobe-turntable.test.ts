import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { normalizeWardrobeAngle, wardrobeDragAngle, wardrobeFurPalettes } from '../src/services/wardrobeTurntable.ts';
import { readRuntimeGlb } from '../scripts/mascot-models/read-runtime-glb.mjs';

test('rotation remains continuous across the full-turn seam', () => {
  for (const angle of [0,360,-360,720]) assert.equal(normalizeWardrobeAngle(angle),0);
  assert.equal(normalizeWardrobeAngle(-.01),359.99);
  assert.equal(normalizeWardrobeAngle(NaN),0);
  assert.equal(wardrobeDragAngle(90,6,324),90);
  assert.ok(Math.abs(wardrobeDragAngle(90,6.01,324)-90.01)<1e-8);
});
test('all 18 full cats contain a canonical deforming body and share one unchanged original fur atlas', async () => {
  const folder=new URL('../src/assets/mascot/models/',import.meta.url);
  const atlas=readFileSync(new URL('canonical-cat-v9.jpg',folder));
  assert.equal(atlas.readUInt16BE(0),0xffd8);
  assert.equal(atlas.readUInt16BE(atlas.length-2),0xffd9);
  const files=['nava-wardrobe-cat.glb',...readdirSync(new URL('worn/',folder)).filter(f=>f.endsWith('.glb')).map(f=>'worn/'+f)];
  assert.equal(files.length,18);
  for(const file of files){
    const {json,bytes,readAccessor}=await readRuntimeGlb(new URL(file,folder));
    assert.ok(bytes.length<4_000_000,file+' mobile transfer budget');
    assert.equal(json.nodes.filter(n=>n.name==='NAVA_Canonical_Cat').length,1,file);
    assert.ok(json.skins?.length>=1,file);
    assert.equal(json.images.filter(i=>i.uri==='canonical-cat-v9.jpg').length,1,file);
    assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));
    for(const mesh of json.meshes)for(const p of mesh.primitives){
      assert.ok(p.attributes.JOINTS_0!==undefined && p.attributes.WEIGHTS_0!==undefined,file);
      if(json.materials[p.material].pbrMetallicRoughness?.baseColorTexture) assert.ok(p.attributes.TEXCOORD_0!==undefined,file);
      assert.equal(p.attributes.COLOR_0,undefined);
      for(const weights of readAccessor(p.attributes.WEIGHTS_0))assert.ok(Math.abs(weights.reduce((s,v)=>s+v,0)-1)<.02,file+' normalized skin');
    }
  }
  const service=readFileSync(new URL('../src/services/mascotWardrobe.ts',import.meta.url),'utf8');
  const skins=[...service.matchAll(/id: "(skin-[^"]+)", category: "skin"/g)].map(m=>m[1]);
  assert.deepEqual(Object.keys(wardrobeFurPalettes).sort(),skins.sort());
});
