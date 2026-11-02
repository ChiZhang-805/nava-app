import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { wardrobeMascotMotions } from '../src/services/wardrobeMascotMotion.ts';
import { readRuntimeGlb } from '../scripts/mascot-models/read-runtime-glb.mjs';

test('all shipped cats articulate local joints with stationary roots and matching endpoints', async()=>{
 const root=new URL('../src/assets/mascot/models/',import.meta.url);
 const files=['nava-wardrobe-cat.glb',...readdirSync(new URL('worn/',root)).filter(f=>f.endsWith('.glb')).map(f=>'worn/'+f)];
 for(const file of files){
  const {json,readAccessor}=await readRuntimeGlb(new URL(file,root));
  assert.deepEqual(json.animations.map(a=>a.name).sort(),wardrobeMascotMotions.map(a=>a.clip).sort());
  for(const descriptor of wardrobeMascotMotions){
   const clip=json.animations.find(a=>a.name===descriptor.clip),moving=new Set();
   for(const channel of clip.channels){
    const sampler=clip.samplers[channel.sampler],times=readAccessor(sampler.input),values=readAccessor(sampler.output),name=json.nodes[channel.target.node].name;
    assert.ok(Math.abs(times[0][0])<1e-6);
    assert.ok(Math.abs(times.at(-1)[0]*1000-descriptor.durationMs)<.05);
    if(name!=='YarnBall')for(let i=0;i<values[0].length;i++)assert.ok(Math.abs(values[0][i]-values.at(-1)[i])<.0001,`${file}/${descriptor.id}/${name}: endpoint`);
    if(values.some(row=>row.some((v,i)=>Math.abs(v-values[0][i])>.003))){moving.add(name);assert.ok(!sampler.interpolation||sampler.interpolation==='LINEAR');}
   }
   assert.ok(moving.has('Head'),file+' head articulation');
   assert.ok([...moving].some(n=>n.startsWith('ForePaw')),file+' forepaw articulation');
   assert.ok(!moving.has('Root')&&!moving.has('Body'),file+' planted body');
   if(descriptor.id==='yarn')assert.ok(moving.has('YarnBall'),file+' ball trajectory');
  }
 }
});
