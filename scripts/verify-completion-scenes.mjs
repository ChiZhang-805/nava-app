// Presentation fixtures, never production account writes or provider calls.
import { chromium, webkit } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IPHONE_PREVIEW_DEVICES } from '../src/constants/iphonePreviewDevices.ts';
const engine=process.env.NAVA_SCENES_ENGINE==='webkit'?'webkit':'chromium';
const base=process.env.NAVA_SCENES_URL||'http://127.0.0.1:5173/';
const out=`Q:/NAVA-Workspace/Build/TestRuns/celebration-scenes/${engine}`;
mkdirSync(out,{recursive:true});
const dims=[...IPHONE_PREVIEW_DEVICES.map(d=>({id:d.id,width:d.logicalWidth,height:d.logicalHeight,top:d.calibration.safeTop,bottom:34})),
 {id:'compact',width:320,height:568,top:20,bottom:0},{id:'se',width:375,height:667,top:20,bottom:0},
 ...[[360,740],[375,812],[390,844],[430,932]].map(([width,height])=>({id:`${width}-${height}`,width,height,top:48,bottom:34}))];
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 for(let i=1;i<=9;i++){
  const scene=String(i).padStart(2,'0');
  await page.route('**/__completion-check',route=>route.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style><iframe src="${new URL('journal/completion.html',base)}"></iframe><script>window.addEventListener('load',()=>{const channel=new MessageChannel();window.viewport=v=>channel.port1.postMessage({type:'viewport',safeTop:v.top,safeBottom:v.bottom});window.dismissed=0;channel.port1.onmessage=({data})=>{if(data.type==='continue')window.dismissed++;};document.querySelector('iframe').contentWindow.postMessage({type:'nava-completion-connect',scene:'${scene}',locale:'zh',safeTop:48,safeBottom:34},location.origin,[channel.port2]);});</script>`}));
  const loadStarted=Date.now();
  await page.goto(new URL('__completion-check',base).href);
  const frame=page.frames().find(f=>f.url().includes('completion.html'));
  await frame.waitForSelector('.celebration-garden');
  const readyMs=Date.now()-loadStarted;
  assert.ok(readyMs<1500,`Scene ${scene} took ${readyMs}ms to reveal on the local cold-load gate`);
  assert.ok(await frame.evaluate(()=>[...document.images].every(img=>img.complete&&img.naturalWidth)),'The scene must reveal only after its background and actor are ready');
  await frame.waitForSelector('[data-ink="finished"]');
  await frame.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth));
  const title=await frame.locator('#garden-title').evaluate(e=>[...e.querySelectorAll('path')].map(p=>getComputedStyle(p).strokeDashoffset));
  const cat1=hash(await frame.locator('.garden-actor').screenshot());
  await page.waitForTimeout(450);
  const cat2=hash(await frame.locator('.garden-actor').screenshot());
  // Check live native image independently of moving environmental decoration.
  assert.notEqual(cat1,cat2,`Scene ${scene} actor must animate`);
  assert.ok(title.every(v=>Math.abs(parseFloat(v))<.0001),JSON.stringify(title));
  assert.deepEqual(title,await frame.locator('#garden-title').evaluate(e=>[...e.querySelectorAll('path')].map(p=>getComputedStyle(p).strokeDashoffset)),'Title must stop writing');
  for(const d of dims){
   await page.setViewportSize({width:d.width,height:d.height});await page.evaluate(d=>window.viewport(d),d);await page.waitForTimeout(35);
   const geometry=await frame.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    const b=document.querySelector('.scene-continue'),r=b.getBoundingClientRect();
    const style=getComputedStyle(b);
    return {root:rect('.celebration-garden'),bg:rect('.garden-backdrop'),title:rect('#garden-title'),text:rect('.garden-message'),cat:rect('.garden-actor'),button:rect('.scene-continue'),hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overflow:document.documentElement.scrollWidth>innerWidth,points:/积分|\bXP\b|\+\s*\d/.test(document.body.innerText),arrow:getComputedStyle(b,'::after').content,buttonStyle:{backgroundColor:style.backgroundColor,borderWidth:style.borderWidth,outlineWidth:style.outlineWidth,boxShadow:style.boxShadow,fontSize:style.fontSize}};
   });
   assert.equal(geometry.overflow,false);assert.equal(geometry.points,false);assert.ok(geometry.hit);
   assert.equal(geometry.root.width,d.width);assert.equal(geometry.root.height,d.height);
   assert.ok(geometry.bg.x<=.5&&geometry.bg.y<=.5&&geometry.bg.right>=d.width-.5&&geometry.bg.bottom>=d.height-.5,JSON.stringify({scene,d,geometry}));
   assert.ok(geometry.button.height>=44&&geometry.button.bottom<=d.height-d.bottom-10);
   assert.ok(geometry.button.width<=d.width*.77&&geometry.button.width>=d.width*.74,JSON.stringify({scene,d,button:geometry.button}));
   assert.deepEqual({...geometry.buttonStyle,fontSize:undefined},{backgroundColor:'rgb(121, 189, 164)',borderWidth:'0px',outlineWidth:'0px',boxShadow:'none',fontSize:undefined});
   assert.ok(Math.abs(parseFloat(geometry.buttonStyle.fontSize)-Math.min(27,Math.max(23,d.width*.06)))<.02,JSON.stringify({scene,d,buttonStyle:geometry.buttonStyle}));
   assert.ok(geometry.title.y>=d.top-1&&geometry.text.bottom<geometry.cat.y&&geometry.cat.bottom<geometry.button.y,JSON.stringify({scene,d,geometry}));
   assert.ok(['none','normal'].includes(geometry.arrow));
   await page.screenshot({path:`${out}/${scene}-${d.id}.png`});results.push({scene,device:d.id,...geometry});
  }
  await frame.locator('.scene-continue').click();await page.waitForFunction(()=>window.dismissed===1);
  console.log(`Scene ${scene}: ${dims.length} sizes, ${readyMs}ms atomic reveal + animation + handwriting + Continue`);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
 const reduced=page.frames().find(f=>f.url().includes('completion.html'));
 await reduced.waitForSelector('[data-ink="finished"]');
 assert.equal(await reduced.locator('.garden-breeze').evaluate(e=>getComputedStyle(e).display),'none');
 assert.deepEqual(errors,[]);
 writeFileSync(`${out}/results.json`,JSON.stringify({passed:true,engine,results,scope:'UI fixtures only; no production account or physical iPhone test'},null,2));
 console.log(JSON.stringify({passed:true,engine,scenes:9,dimensions:dims.length,screenshots:results.length,out}));
}catch(e){await page.screenshot({path:`${out}/failure.png`});throw e;}finally{await browser.close();}
