import {chromium,webkit} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {IPHONE_PREVIEW_DEVICES} from '../src/constants/iphonePreviewDevices.ts';
import {journalLayout} from '../public/journal/js/nava-layout.js';

const engine=process.env.NAVA_JOURNAL_ENGINE==='webkit'||process.argv.includes('--webkit')?'webkit':'chromium';
const out=`Q:/NAVA-Workspace/Build/TestRuns/journal-integration/responsive-${engine}`;mkdirSync(out,{recursive:true});
const devices=[...IPHONE_PREVIEW_DEVICES.map(d=>({id:d.id,width:d.logicalWidth,height:d.logicalHeight,top:d.calibration.safeTop,bottom:34})),
 {id:'compact-320',width:320,height:568,top:20,bottom:0},
 {id:'se-375',width:375,height:667,top:20,bottom:0},
 {id:'plus-414',width:414,height:736,top:20,bottom:0},
 {id:'mini-x-375',width:375,height:812,top:50,bottom:34},
 {id:'xr-max-414',width:414,height:896,top:48,bottom:34},
 {id:'boundary-360',width:360,height:740,top:48,bottom:34}];
// Continuous width/height sweep validates the rule, not a hard-coded model name.
for(let width=320;width<=480;width++)for(const height of [480,568,667,740,812,844,896,956,1040]){
 const l=journalLayout(width,height,68,34);assert.ok(l.scale*393<=width+.01);assert.ok(l.scale>=width/393*.94);assert.ok(l.contentHeight>=l.scale*852);
}
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'});
const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));let stored=[];
await page.exposeFunction('saveRecord',record=>{const value={...record,version:1};stored.push(value);return value;});
const inputs={mood:{mood:'放松',reason:'完成今天的工作',notes:'明天继续'},food:{foods:'鸡肉米饭',portion:'一碗',calories:'520',protein:'30',carbs:'65',fat:'15'},sport:{activity:'散步',durationMinutes:'30',notes:'公园里走了一圈'},sleep:{bedtime:'23:00',wakeTime:'07:00',quality:'精神不错'},face:{feeling:'精神还好',eyeArea:'没有明显阴影',skinAppearance:'自然光下肤色均匀'},focus:{task:'阅读',durationMinutes:'0.1',notes:'读完一页'}};
async function capture(frame,category,scene){
 if(scene==='celebrate'){
  // Completion now owns a full-screen sibling canvas; the old phone-wrap is
  // deliberately hidden. Inspect the visible replacement, not its predecessor.
  for(const d of devices){
   await page.setViewportSize({width:d.width,height:d.height});
   await page.evaluate(d=>window.journalViewport(d.height,d.top,d.bottom),d);await page.waitForTimeout(70);
   const garden=await frame.locator('.celebration-garden').boundingBox();
   const button=await frame.locator('.scene-continue').boundingBox();
   assert.deepEqual(garden,{x:0,y:0,width:d.width,height:d.height});
   assert.ok(button&&button.width>=44&&button.height>=44&&button.y>=d.top&&button.y+button.height<=d.height-d.bottom+1);
   await page.screenshot({path:`${out}/${category}-${scene}-${d.id}.png`});
   results.push({category,scene,...d,passed:true});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.journalViewport(844,0,0));
  return;
 }
 const pixels=await frame.evaluate(()=>{
  const canvas=document.querySelector('#actor-canvas'),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let dark=0;
  for(let i=0;i<data.length;i+=4)if(data[i+3]>100&&data[i]<100&&data[i+2]>data[i]+10)dark++;
  return dark;
 });
 assert.ok(pixels>5000,`Mascot texture missing: ${category} ${scene}, ${pixels} dark pixels`);
 for(const d of devices){
  await page.setViewportSize({width:d.width,height:d.height});
  await page.evaluate(d=>window.journalViewport(d.height,d.top,d.bottom),d);await page.waitForTimeout(70);
  await frame.evaluate(()=>document.querySelector('.stage').scrollTop=0);
  const host=await page.locator('.journal-experience iframe').boundingBox();assert.ok(Math.abs(host.height-d.height)<1&&Math.abs(host.width-d.width)<1);
  const geometry=await frame.evaluate(({scene,d})=>{
   const root=document.documentElement,stage=document.querySelector('.stage'),bg=document.querySelector(scene==='celebrate'?'#green-bg':'.cream-bg'),r=bg.getBoundingClientRect();
   const screen=document.querySelector('#screen').getBoundingClientRect();
   const nav=document.querySelector(scene==='review'?'.review-home':'#back');const n=nav?.getBoundingClientRect();
   return {bg:[r.x,r.y,r.width,r.height],opacity:Number(getComputedStyle(bg).opacity),overflow:root.scrollWidth>innerWidth+1||stage.scrollWidth>innerWidth+1,left:screen.left,right:screen.right,scroll:stage.scrollHeight>stage.clientHeight+1,navTop:n?.y,safe:scene==='celebrate'||(n?.y>=d.top-1)};
  },{scene,d});
  assert.deepEqual(geometry.bg,[0,0,d.width,d.height]);assert.equal(geometry.opacity,1);assert.equal(geometry.overflow,false);assert.ok(geometry.left>=-1&&geometry.right<=d.width+1);assert.ok(geometry.safe,`${d.id} navigation overlaps safe area`);
  await page.screenshot({path:`${out}/${category}-${scene}-${d.id}.png`});
  const button=frame.locator(scene==='entry'?'#confirm-entry':scene==='review'?'.review-chat':'#primary');
  await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();assert.ok(b.width>=44&&b.height>=44);
  assert.ok(b.y>=0&&b.y+b.height<=d.height-d.bottom+1,`${d.id} ${category} ${scene} action is not reachable above safe area`);
  if(geometry.scroll)await page.screenshot({path:`${out}/${category}-${scene}-${d.id}-scrolled.png`});
  results.push({category,scene,...d,scroll:geometry.scroll,passed:true});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.journalViewport(844,0,0));
}
try{
 for(const category of (process.env.NAVA_JOURNAL_CATEGORY?[process.env.NAVA_JOURNAL_CATEGORY]:Object.keys(inputs))){
  stored=[];
  await page.route('**/__journal-responsive',route=>route.fulfill({contentType:'text/html',body:`<link rel='stylesheet' href='/src/styles/global.css'><link rel='stylesheet' href='/src/styles/figma-v2.css'><link rel='stylesheet' href='/src/features/journal-experience.css'><div id='root'><div class='nava-app-stage'><div class='phone-frame phone-frame--journal'><div class='safe-top'></div><main class='app-content app-content--record'><div class='screen-panel'><section class='journal-experience'><iframe src='/journal/index.html'></iframe></section></div></main></div></div></div><script>window.addEventListener('load',()=>{const c=new MessageChannel();window.journalViewport=(visibleHeight,safeTop,safeBottom)=>c.port1.postMessage({type:'viewport',visibleHeight,safeTop,safeBottom});c.port1.onmessage=async({data})=>{let result=null;if(data.method==='save')result=await window.saveRecord(data.payload.record);if(data.method==='ai'){c.port1.postMessage({id:data.id,error:'Explicit offline UI fixture'});return;}c.port1.postMessage({id:data.id,result});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'${category}',locale:'zh',records:[],settings:{['fluffy-first-guide-${category}']:true},nativePhotos:false}},location.origin,[c.port2]);});</script>`}));
  await page.goto('http://localhost:5173/__journal-responsive');const frame=page.frames().find(f=>f.url().includes('/journal/'));
  await frame.waitForSelector('#screen[data-scene="entry"]');await frame.waitForFunction(()=>document.querySelector('#loading').hidden);await frame.waitForTimeout(500);
  await capture(frame,category,'entry');
  for(const [key,value]of Object.entries(inputs[category])){
   if(['bedtime','wakeTime'].includes(key)){for(const [part,number]of value.split(':').entries()){await frame.locator(`.time-part[data-key="${key}"][data-part="${part}"]`).click();await frame.locator(`#sleep-time-option-${Number(number)}`).click();}}
   else if(await frame.locator(`#field-${key}`).count())await frame.locator(`#field-${key}`).fill(value);
  }
  if(category==='food')await frame.locator('.choice-pill[data-value="午餐"]').click();
  // A smaller visual viewport models keyboard occlusion; actual iOS keyboard remains a device check.
  await page.setViewportSize({width:320,height:568});await page.evaluate(()=>window.journalViewport(280,20,0));await page.waitForTimeout(100);
  const text=frame.locator('input:not([type=hidden]),textarea').filter({visible:true}).first();
  if(await text.count()){await text.focus();await text.scrollIntoViewIfNeeded();const t=await text.boundingBox();assert.ok(t.y>=0&&t.y+t.height<=281,'Focused input hidden behind simulated keyboard');}
  await frame.locator('#confirm-entry').scrollIntoViewIfNeeded();let b=await frame.locator('#confirm-entry').boundingBox();assert.ok(b.y+b.height<=281);
  await page.screenshot({path:`${out}/${category}-keyboard-320.png`});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.journalViewport(844,0,0));
  await frame.locator('#confirm-entry').click();
  if(category==='focus'){await frame.waitForSelector('.celebration-garden:not([hidden])',{timeout:20000});}
  else{await frame.waitForSelector('#screen[data-scene="record"]');await frame.waitForTimeout(8000);await capture(frame,category,'record');await frame.waitForFunction(()=>!document.querySelector('#primary').disabled);await frame.locator('#primary').click();await frame.waitForSelector('.celebration-garden:not([hidden])');}
  await frame.waitForTimeout(5100);await capture(frame,category,'celebrate');await frame.locator('#primary').click();await frame.waitForSelector('#screen[data-scene="review"]');await capture(frame,category,'review');
  assert.equal(stored.length,1);console.log(`${category}: ${devices.length} portrait profiles and keyboard geometry passed`);
 }
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync(`${out}/results.json`,JSON.stringify({profiles:devices.length,checks:results.length,widthSweep:1449,results,errors,ai:'Offline UI fixture; real provider acceptance is separate',realIPhone:false},null,2));
}finally{await browser.close();}
