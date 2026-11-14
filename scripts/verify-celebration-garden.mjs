// Browser-only UI fixture: exercises actual entry/write/save/celebrate/recap handlers.
// It does not claim production writes, provider AI, or physical iPhone acceptance.
import { chromium, webkit, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IPHONE_PREVIEW_DEVICES } from '../src/constants/iphonePreviewDevices.ts';
const engine=process.env.NAVA_GARDEN_ENGINE==='webkit'?'webkit':'chromium';
const base=process.env.NAVA_GARDEN_URL||'http://127.0.0.1:5173/';
const out=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/celebration-garden/${engine}`;
mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(readFileSync('src/assets/mascot/animated/home-idle.webp')),hash(readFileSync('public/journal/assets/garden-cat.webp')),'Keep the original animated frames');
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'});
const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const dimensions=[...IPHONE_PREVIEW_DEVICES.map(d=>({id:d.id,width:d.logicalWidth,height:d.logicalHeight,top:d.calibration.safeTop,bottom:34})),
 {id:'compact',width:320,height:568,top:20,bottom:0},{id:'se',width:375,height:667,top:20,bottom:0},
 ...[[360,740],[375,812],[390,844],[430,932]].map(([width,height])=>({id:`${width}-${height}`,width,height,top:48,bottom:34}))];
const inputs={mood:{mood:'放松',reason:'完成今天的工作'},food:{foods:'鸡肉米饭',portion:'一碗'},sport:{activity:'散步',durationMinutes:'30',notes:'在公园走了一圈'},sleep:{quality:'精神不错'},face:{feeling:'精神还好'},focus:{task:'阅读',durationMinutes:'0.1'}};
let saveCount=0;
await page.exposeFunction('saveGardenRecord',record=>{saveCount++;return {...record,version:1};});
async function open(category,locale='zh'){
 console.log(`Checking ${category} (${locale})`);
 saveCount=0;
 await page.route('**/__garden-check',route=>route.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style><iframe src="${new URL('journal/index.html',base)}"></iframe><script>window.addEventListener('load',()=>{const c=new MessageChannel();window.viewport=(v)=>c.port1.postMessage({type:'viewport',visibleHeight:v.height,safeTop:v.top,safeBottom:v.bottom});c.port1.onmessage=async({data})=>{if(data.method==='ai'){c.port1.postMessage({id:data.id,error:'Explicit offline UI fixture'});return;}let result=null;if(data.method==='save')result=await window.saveGardenRecord(data.payload.record);c.port1.postMessage({id:data.id,result});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'${category}',locale:'${locale}',records:[],settings:{},nativePhotos:false}},location.origin,[c.port2]);});</script>`}));
 await page.goto(new URL('__garden-check',base).href);
 const frame=page.frames().find(f=>f.url().includes('/journal/'));
 await frame.waitForSelector('#screen[data-scene="entry"]');
 await frame.waitForFunction(()=>document.querySelector('#loading').hidden);
 for(const[key,value]of Object.entries(inputs[category]))if(await frame.locator(`#field-${key}`).count())await frame.locator(`#field-${key}`).fill(locale==='en'?'Feeling well':value);
 if(category==='food')await frame.locator('.choice-pill[data-value="午餐"]').click();
 if(category==='sleep')for(const[key,value]of [['bedtime','23:00'],['wakeTime','07:00']])for(const[part,number]of value.split(':').entries()){
   await frame.locator(`.time-part[data-key="${key}"][data-part="${part}"]`).click();await frame.locator(`#sleep-time-option-${Number(number)}`).click();
 }
 await frame.locator('#confirm-entry').click();
 if(category!=='focus'){
   await frame.waitForSelector('#screen[data-scene="record"]');
   await frame.waitForTimeout(2200);
   await frame.locator('#primary').click();
 }
 await frame.waitForSelector('.celebration-garden:not([hidden])',{timeout:30000});
 return frame;
}
try{
 const frame=await open('mood');
 await page.waitForTimeout(400);
 const ink1=await frame.locator('#garden-title').evaluate(c=>[...c.querySelectorAll('path')].map(p=>getComputedStyle(p).strokeDashoffset));
 await page.screenshot({path:`${out}/writing-start.png`});
 await page.waitForTimeout(1200);
 const ink2=await frame.locator('#garden-title').evaluate(c=>[...c.querySelectorAll('path')].map(p=>getComputedStyle(p).strokeDashoffset));assert.notDeepEqual(ink1,ink2,'Title must be written progressively');
 await frame.waitForSelector('[data-ink="finished"]');
 const finalInk=await frame.locator('#garden-title').evaluate(c=>[...c.querySelectorAll('path')].map(p=>getComputedStyle(p).strokeDashoffset));
 await frame.locator('.garden-actor img').evaluate(e=>e.style.backgroundColor='#fff');
 const cat1=hash(await frame.locator('.garden-actor img').screenshot());
 await page.waitForTimeout(1700);
 assert.notEqual(cat1,hash(await frame.locator('.garden-actor img').screenshot()),'Cat must continue animating after handwriting finishes');
 await frame.locator('.garden-actor img').evaluate(e=>e.style.backgroundColor='');
 assert.deepEqual(finalInk,await frame.locator('#garden-title').evaluate(c=>[...c.querySelectorAll('path')].map(p=>getComputedStyle(p).strokeDashoffset)),'Finished title must not loop');
 for(const d of dimensions){
   await page.setViewportSize({width:d.width,height:d.height});await page.evaluate(d=>window.viewport(d),d);await page.waitForTimeout(90);
   const geo=await frame.evaluate(()=>{
     const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
     const btn=document.querySelector('#primary'),r=btn.getBoundingClientRect();
     return {root:rect('.celebration-garden'),bg:rect('.garden-backdrop'),button:rect('#primary'),title:rect('#garden-title'),text:rect('.garden-message'),cat:rect('.garden-actor'),overflow:document.documentElement.scrollWidth>innerWidth,hit:btn.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),art:[...document.querySelectorAll('.celebration-garden img')].every(i=>i.complete&&i.naturalWidth>0),buttons:document.querySelectorAll('#primary').length};
   });
   assert.deepEqual(geo.root,{x:0,y:0,width:d.width,height:d.height,bottom:d.height,right:d.width});
   assert.ok(geo.bg.x<=.5&&geo.bg.y<=.5&&geo.bg.right>=d.width-.5&&geo.bg.bottom>=d.height-.5);assert.equal(geo.overflow,false);assert.ok(geo.art&&geo.hit);assert.equal(geo.buttons,1);
   assert.ok(geo.button.height>=44&&geo.button.bottom<=d.height-d.bottom-10);assert.ok(geo.title.y>=d.top);
   assert.ok(geo.title.bottom<=geo.text.y+1&&geo.text.bottom<=geo.cat.y+8&&geo.cat.bottom<=geo.button.y+1,JSON.stringify({d,geo}));
   await page.screenshot({path:`${out}/${d.id}.png`});results.push({id:d.id,...geo});
 }
 await frame.locator('#primary').click();await frame.waitForSelector('#screen[data-scene="review"]');
 await expect(frame.locator('.celebration-garden')).toBeHidden();assert.equal(saveCount,1);
 await page.setViewportSize({width:390,height:844});
 for(const category of Object.keys(inputs).filter(x=>x!=='mood')){
   const f=await open(category,category==='face'?'en':'zh');
   await f.waitForFunction(()=>!document.querySelector('#primary').disabled);
   await f.locator('#primary').click();await f.waitForSelector('#screen[data-scene="review"]');assert.equal(saveCount,1);
   results.push({category,confirmedSaves:saveCount,recap:true});
 }
 await page.emulateMedia({reducedMotion:'reduce'});const reduced=await open('mood');
 await reduced.waitForSelector('[data-ink="finished"]');assert.equal(await reduced.locator('.garden-breeze').evaluate(e=>getComputedStyle(e).display),'none');
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({passed:true,engine,results,errors,scope:'Browser fixture, no production data/AI writes'},null,2));
 console.log(JSON.stringify({passed:true,engine,dimensions:dimensions.length,flows:6,out}));
}catch(error){await page.screenshot({path:`${out}/failure.png`});throw error;}finally{await browser.close();}
