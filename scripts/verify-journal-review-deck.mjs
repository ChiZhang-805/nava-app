import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const output=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-review-deck/${engine}`;await mkdir(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:engine==='webkit'?5297:5296,strictPort:true}});await server.listen();
const browser=await({chromium,webkit}[engine]).launch();const results=[],errors=[];
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1&category=face"></iframe><script>window.requests=[];addEventListener('load',()=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>{requests.push(data.method);channel.port1.postMessage({id:data.id,error:'Offline test fixture'});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'face',locale:'zh',records:[],settings:{'fluffy-first-guide-face':true,'fluffy-first-guide-mood':true,'fluffy-first-guide-sport':true,'fluffy-first-guide-food':true,'fluffy-first-guide-sleep':true,'fluffy-first-guide-focus':true}}},location.origin,[channel.port2]);});</script>`;
const fields={mood:{mood:'有一点低落，但也松了一口气',intensity:6,reason:'完成了一件挂心的事，想慢慢歇一会儿。',reasonTags:'工作、学习、家庭、社交'},food:{meal:'午餐',foods:'米饭、鸡胸肉和西兰花',portion:'半碗米饭',calories:520,protein:25,carbs:55,fat:16,mealTime:'12:15',selfAssessment:'吃得健康'},sport:{activity:'户外慢跑',durationMinutes:30,intensity:'适中',recovery:'有点累',steps:4500,startTime:'17:30',endTime:'18:00'},sleep:{bedtime:'23:00',wakeTime:'07:00',quality:'还有点困，但比昨天精神'},face:{feeling:'有点疲惫，但精神还不错',eyeArea:'黑眼圈比较明显',skinAppearance:'脸颊稍微有些泛红',captureMode:'素颜'},focus:{task:'认真读完论文的方法部分',durationMinutes:25}};
try{
 const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(8000);page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message)});await page.route('**/__review-deck',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto(`${server.resolvedUrls.local[0]}__review-deck`);await expect.poll(()=>page.frames().some(f=>f.url().includes('/journal/'))).toBe(true);const frame=page.frames().find(f=>f.url().includes('/journal/'));await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready,null,{timeout:30000});
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]){
  await page.setViewportSize({width,height});
  for(const lang of ['zh','en'])for(const category of Object.keys(fields)){console.log(engine,width,lang,category);
   await frame.evaluate(({category,data,lang})=>{
    const date='2026-11-20';window.NavaJournal.initial.records=Array.from({length:5},(_,i)=>({id:`${category}-${i}`,category,createdAt:`2026-11-${20-i}T12:00:00+08:00`,recordDate:`2026-11-${20-i}`,data:{...data},focus:category==='focus'?{elapsedMs:(i+1)*300000,plannedMs:1500000,startedAt:`2026-11-${20-i}T08:00:00+08:00`}:null}));
    __fluffyModules['entry-i18n.js'].setLanguage(lang);const d=window.FluffyDebug;d.navigate('review');d.review.open(category,date);d.animation.playing=false;d.animation.render();
   },{category,data:fields[category],lang});
   await expect(frame.locator('.review-deck-dot')).toHaveCount(4);
   const cat=await frame.locator('#review-pet').boundingBox();
   for(let index=0;index<4;index++){
    await frame.locator('.review-deck-dot').nth(index).click();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.review.deck.index)).toBe(index);
    await expect.poll(()=>frame.evaluate(index=>Math.abs(document.getElementById('review-deck').scrollLeft-index*document.getElementById('review-deck').clientWidth),index)).toBeLessThan(2);
    const layout=await frame.evaluate(index=>{
     const slide=document.querySelectorAll('.review-slide')[index],note=slide.querySelector('.review-slide-note'),box=slide.getBoundingClientRect(),n=note.getBoundingClientRect(),prior=note.previousElementSibling.getBoundingClientRect(),action=document.getElementById('review-chat').getBoundingClientRect(),dots=document.querySelector('.review-deck-dots').getBoundingClientRect();
     return{box:{top:box.top,bottom:box.bottom},note:n.bottom,prior:prior.bottom,noteTop:n.top,action:{top:action.top,bottom:action.bottom},dots:{top:dots.top,bottom:dots.bottom},overflow:document.documentElement.scrollWidth>innerWidth+1,scroll:document.scrollingElement.scrollHeight>innerHeight+1,selection:getComputedStyle(slide).userSelect||getComputedStyle(slide).webkitUserSelect};
    },index);
    assert.equal(layout.overflow,false,JSON.stringify({width,category,lang,index,layout}));assert.equal(layout.scroll,false,'document vertical scroll');assert.ok(layout.note<=layout.box.bottom+1,JSON.stringify({width,category,lang,index,layout}));assert.ok(layout.prior<=layout.noteTop+1,JSON.stringify({width,category,lang,index,layout}));assert.ok(layout.box.bottom<=layout.dots.top+1);assert.ok(layout.dots.bottom<=layout.action.top+1);assert.ok(layout.action.bottom<=height+1);assert.equal(layout.selection,'none');
    assert.deepEqual(await frame.locator('#review-pet').boundingBox(),cat,'cat must not move with deck');results.push({width,height,category,lang,index,...layout});
    if((width===320||width===430)&&lang==='zh')await page.screenshot({path:`${output}/${width}-${category}-${index}.png`});
   }
  }
 }
 // Native mouse drag, keyboard, reduced motion and full-entry sheet are separate from saves.
 await frame.locator('#review-deck').focus();await frame.locator('#review-deck').press('Home');await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.review.deck.index)).toBe(0);
 await frame.locator('#review-deck').press('ArrowRight');await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.review.deck.index)).toBe(1);
 await frame.evaluate(()=>window.FluffyDebug.review.deck.go(0,true));const b=await frame.locator('#review-deck').boundingBox();await page.mouse.move(b.x+b.width*.85,b.y+b.height*.55);await page.mouse.down();await page.mouse.move(b.x+b.width*.15,b.y+b.height*.55,{steps:12});await page.mouse.up();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.review.deck.index)).toBe(1);
 await frame.evaluate(()=>window.FluffyDebug.review.deck.go(3,true));await frame.locator('.review-slide-record').first().click();await expect(frame.locator('#sheet-layer')).toBeVisible();await frame.locator('#sheet-close').press('Enter');await expect(frame.locator('#sheet-layer')).toBeHidden();
 await page.emulateMedia({reducedMotion:'reduce'});await frame.evaluate(()=>window.FluffyDebug.review.deck.go(2));assert.equal(await frame.evaluate(()=>document.querySelector('.review-deck-dot span').getAnimations().length),0);
 // Empty and single-entry states are intentional cards, including long original descriptions.
 for(const category of Object.keys(fields))for(const count of [0,1]){
  await frame.evaluate(({category,count,data})=>{window.NavaJournal.initial.records=count?[{id:'single',category,createdAt:'2026-11-20T12:00:00+08:00',recordDate:'2026-11-20',data}]:[];window.FluffyDebug.review.open(category,'2026-11-20');},{category,count,data:fields[category]});
  assert.equal(await frame.locator('.review-slide').count(),4);assert.equal(await frame.evaluate(()=>window.FluffyDebug.review.view.records.length),count);await page.screenshot({path:`${output}/${category}-${count?'single':'empty'}.png`});
 }
 // Native safe-area contract: simulate the dimensions provided by the actual app bridge.
 for(const [width,height] of [[320,568],[430,932]]) {
  await page.setViewportSize({width,height});
  await frame.evaluate(data=>{window.NavaJournal.initial.records=[0,1].map(i=>({id:'safe-'+i,category:'face',recordDate:'2026-11-20',createdAt:'2026-11-20T12:00:00+08:00',data}));window.NavaJournal.viewport({safeTop:68,safeBottom:34});window.FluffyDebug.review.open('face','2026-11-20');},fields.face);
  for(let index=0;index<4;index++) {
   await frame.evaluate(index=>window.FluffyDebug.review.deck.go(index,true),index);
   const safe=await frame.evaluate(index=>{const slide=document.querySelectorAll('.review-slide')[index],note=slide.querySelector('.review-slide-note'),a=document.getElementById('review-chat').getBoundingClientRect();return{bottom:a.bottom,note:note.getBoundingClientRect().bottom,panel:slide.getBoundingClientRect().bottom};},index);
   assert.ok(safe.bottom<=height-34+1,JSON.stringify({width,index,safe}));assert.ok(safe.note<=safe.panel+1,JSON.stringify({width,index,safe}));
  }
  await page.screenshot({path:`${output}/${width}-native-safe-area.png`});
 }
 await frame.evaluate(()=>window.NavaJournal.viewport({safeTop:0,safeBottom:0}));
 // New optional form controls can stay blank, be selected, then explicitly cleared.
 await frame.evaluate(()=>{const d=window.FluffyDebug;d.openEntry('mood');d.fillForm({mood:'平静',intensity:'',reasonTags:''});});
 assert.equal(await frame.locator('#field-intensity').inputValue(),'');await frame.locator('.field-rating input[type="range"]').fill('7');assert.equal(await frame.locator('#field-intensity').inputValue(),'7');await frame.locator('.field-rating-clear').click();assert.equal(await frame.locator('#field-intensity').inputValue(),'');
 assert.equal(await page.evaluate(()=>requests.includes('save')),false,'review and paging cannot save records');assert.deepEqual(errors,[]);console.log(`${engine}: ${results.length} review card layouts + interaction/empty/single/optional fields passed`);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({engine,results,errors,nativeIOS:false},null,2));await browser.close();await server.close();}
