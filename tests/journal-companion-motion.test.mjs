import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({__fluffyModules:{}});
vm.runInContext(readFileSync('public/journal/js/companion-motion.js','utf8'),context);
const {Controller,pose}=context.__fluffyModules['companion-motion.js'];

test('rapid retargeting preserves position/velocity and settles without overshoot',()=>{
 const c=new Controller();let previous=0;
 for(let i=0;i<1200;i++){
  const target=i<600?(Math.floor(i/11)%2):0;
  const value=c.step(1/60,{listen:target}).listen;
  assert.ok(value>=0&&value<=1);
  assert.ok(Math.abs(value-previous)<.065,'no single-frame pose jump');previous=value;
  const before=c.channels.listen.velocity;
  c.step(0,{listen:1-target});assert.equal(c.channels.listen.velocity,before);
 }
 assert.ok(previous<1e-6);
});

test('60 Hz and 120 Hz transitions arrive at the same pose',()=>{
 const a=new Controller(),b=new Controller();
 for(let i=0;i<60;i++)a.step(1/60,{talk:1});
 for(let i=0;i<120;i++)b.step(1/120,{talk:1});
 assert.ok(Math.abs(a.values().talk-b.values().talk)<1e-12);
});

test('all companion states preserve resting head/body proportions and bound gestures',()=>{
 for(const scene of ['entry','review'])for(const values of [{},{listen:1},{think:1},{talk:1,wave:1,nod:1},{greet:1}]){
  for(let t=0;t<30;t+=1/60){
   const p=pose(scene,t,values);
   assert.equal(p.headSleep,scene==='review'?.71:0);
   assert.equal(p.sleep,scene==='review'?.82:0);
   assert.ok(p.pawLift>=0&&p.pawLift<=.85);
   assert.ok(p.headLift>=-2&&p.headLift<=9);
   assert.ok(Math.abs(p.headTilt)<=.11);
   assert.ok(Math.abs(p.tailSwing)<=6.8);
   assert.ok(p.mouthTalk>=0&&p.mouthTalk<=2);
  }
 }
});

test('reduced motion stays identical across time, state changes and petting',()=>{
 for(const scene of ['entry','review']){
  const still=pose(scene,0,{}, {reduced:true});
  for(const time of [1,4,13,99])assert.deepEqual(pose(scene,time,{listen:1,talk:1,wave:1,greet:1},{reduced:true,pet:1}),still);
 }
});

test('idle has a visible tail arc and speaking includes a rest between gestures',()=>{
 for(const scene of ['entry','review']){
  assert.ok(Math.abs(pose(scene,2,{}).tailSwing-pose(scene,5,{}).tailSwing)>2);
  assert.ok(pose(scene,1.5,{talk:1,wave:1}).pawLift>.7);
  assert.equal(pose(scene,4,{talk:1,wave:1}).pawLift,0);
 }
});
