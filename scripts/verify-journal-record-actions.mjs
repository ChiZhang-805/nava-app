import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const output=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-record-actions/${engine}`;
await mkdir(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:engine==='webkit'?5303:5302,strictPort:true}});
await server.listen();const browser=await({chromium,webkit}[engine]).launch();
const results=[],errors=[];
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1&category=face"></iframe><script>window.requests=[];window.failSave=true;addEventListener('load',()=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>{requests.push(data);const saving=data.method==='save';channel.port1.postMessage({id:data.id,...(saving?(failSave?{error:'Offline save fixture'}:{result:{...data.payload.record,version:1,showDailyCompletion:true}}):{error:'Offline conversation fixture'})});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'face',locale:'zh',records:[],settings:{'fluffy-first-guide-face':true}}},location.origin,[channel.port2]);});</script>`;
try {
 const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__record-actions',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto(`${server.resolvedUrls.local[0]}__record-actions`);
 await expect.poll(()=>page.frames().some(f=>f.url().includes('/journal/'))).toBe(true);const frame=page.frames().find(f=>f.url().includes('/journal/'));await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready);
 for(const [width,height] of [[320,568],[375,667],[430,932]])for(const lang of ['zh','en'])for(const safe of [false,true]) {
  await page.setViewportSize({width,height});
  await frame.evaluate(({lang,safe})=>{
   window.NavaJournal.viewport({safeTop:safe?68:0,safeBottom:safe?34:0});__fluffyModules['entry-i18n.js'].setLanguage(lang);
   const d=window.FluffyDebug,date=__fluffyModules['journal-store.js'].dayKey();d.openEntry('face');
   const record={id:crypto.randomUUID(),category:'face',recordDate:date,createdAt:new Date().toISOString(),data:{feeling:'有点疲惫',eyeArea:'黑眼圈很重'},displayRows:[{label:lang==='zh'?'自己的感受':'My feeling',value:lang==='zh'?'有点疲惫':'A little tired'},{label:lang==='zh'?'眼周观察':'Eye area',value:lang==='zh'?'黑眼圈很重':'Noticeable dark circles'}]};
   d.state.record=record;d.animation.setRecord(record);d.navigate('record',{transition:false});d.animation.playing=false;d.animation.time=2.2;d.animation.render();
  },{lang,safe});
  const pet=await frame.locator('#pet').boundingBox();
  for(const phase of ['writing','complete']) {
   if(phase==='complete')await frame.evaluate(()=>{const a=window.FluffyDebug.animation;a.revealRecord();a.time=a.maximum();a.render();});
   const layout=await frame.evaluate(()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    const a=window.FluffyDebug.animation,button=rect('primary'),paper=rect('record-card'),notebook=rect('record-notebook');
    return{button,paper,notebook,scroll:document.querySelector('.stage').scrollTop,scrollable:document.querySelector('.stage').scrollHeight>document.querySelector('.stage').clientHeight+1,rows:a.rows.length,viewport:a.paperLayout.viewportHeight,clip:a.metrics.paperClip,scene:a.scene,saved:a.saved};
   });
   assert.ok(layout.button.height>=44);assert.ok(layout.button.bottom<=height-(safe?34:0)+1,JSON.stringify({width,height,lang,safe,phase,layout}));
   assert.ok(layout.paper.bottom+8<=layout.button.y,JSON.stringify({width,lang,safe,phase,layout}));assert.equal(layout.scroll,0);assert.equal(layout.scrollable,false);assert.equal(layout.rows,2);assert.equal(layout.saved,false);assert.deepEqual(await frame.locator('#pet').boundingBox(),pet,'cat anchor must not move');
   if(phase==='complete'){assert.ok(layout.notebook.bottom<=layout.paper.bottom+1);assert.ok(layout.viewport>=80);await page.screenshot({path:`${output}/${width}-${lang}-${safe?'safe':'plain'}-complete.png`});}
   results.push({width,height,lang,safe,phase,...layout});
  }
  // Every real field remains reachable inside the paper without moving Continue or the cat.
  await frame.evaluate(()=>{const d=window.FluffyDebug,a=d.animation;d.state.record.displayRows=[...d.state.record.displayRows,{label:'Notes',value:'A long note with all its words preserved. '.repeat(12)}];a.setRecord(d.state.record);a.time=a.maximum();a.render();const n=document.getElementById('record-notebook');n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event('scroll'));a.render();});
  const tail=await frame.evaluate(()=>{const a=window.FluffyDebug.animation,n=document.getElementById('record-notebook');return{scroll:a.paperScroll,max:a.paperLayout.maxScroll,last:a.metrics.paperRows.at(-1)?.label,lastRule:a.metrics.paperRows.at(-1)?.rules.at(-1),clip:a.metrics.paperClip[1],nativeMax:n.scrollHeight-n.clientHeight,rows:a.rows.length};});
  assert.equal(tail.rows,3);assert.ok(tail.max>0);assert.ok(Math.abs(tail.scroll-tail.max)<=1);assert.equal(tail.last,'Notes');assert.ok(tail.lastRule<=tail.clip+1);assert.ok(Math.abs(tail.nativeMax-tail.max)<=1);assert.deepEqual(await frame.locator('#pet').boundingBox(),pet);
 }
 // Saving errors keep the full notebook and action available; only a successful
 // application acknowledgment enters the saved celebration.
 await frame.evaluate(()=>{const d=window.FluffyDebug;d.continueGate.enteredAt=performance.now()-3000;d.animation.render();});
 await frame.locator('#primary').click();await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.method==='save').length)).toBe(1);
 await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.continueGate.locked)).toBe(false);assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.scene),'record');assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.saved),false);await expect(frame.locator('#record-notebook')).toBeVisible();
 await page.evaluate(()=>{failSave=false;});await frame.locator('#primary').click();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('celebrate');assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.saved),true);
 assert.deepEqual(errors,[]);console.log(`${engine}: ${results.length} record writing/completion layouts, long-note tails and acknowledged-save paths passed`);
} finally {await writeFile(`${output}/results.json`,JSON.stringify({engine,results,errors,nativeIOS:false},null,2));await browser.close();await server.close();}
