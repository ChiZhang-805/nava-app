import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const output=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-feedback/${engine}`;
await mkdir(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5293,strictPort:true}});
await server.listen();
const browser=await ({chromium,webkit}[engine]).launch();
const errors=[],results=[];
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1&category=face"></iframe><script>window.requests=[];addEventListener('load',()=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>{requests.push(data.method);channel.port1.postMessage({id:data.id,error:'Offline test fixture'});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'face',locale:'zh',records:[],settings:{'fluffy-first-guide-face':true}}},location.origin,[channel.port2]);});</script>`;
try {
 const page=await browser.newPage({reducedMotion:'no-preference'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__record-feedback',r=>r.fulfill({contentType:'text/html',body:fixture}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.goto(`${server.resolvedUrls.local[0]}__record-feedback`);
 await expect.poll(()=>page.frames().some(f=>f.url().includes('/journal/'))).toBe(true);
 const frame=page.frames().find(f=>f.url().includes('/journal/'));
 await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready);
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
  await page.setViewportSize({width,height});
  await frame.evaluate(()=>{
   const d=window.FluffyDebug;
   d.openEntry('face');d.fillForm({feeling:'有点疲惫',eyeArea:'黑眼圈很重',skinAppearance:'',notes:''});
   return d.confirmManual();
  });
  await frame.waitForFunction(()=>window.FluffyDebug.animation.scene==='record');
  await frame.evaluate(()=>{const a=window.FluffyDebug.animation;a.playing=false;a.time=2.2;a.render();});
  // A real hit on a non-control part of the screen reveals the whole record.
  await frame.locator('#record-subtitle').click({force:true});
  const revealed=await frame.evaluate(()=>{
   const d=window.FluffyDebug,a=d.animation;
   return {time:a.time,returnEnd:a.paperReturnEnd,mode:a.metrics.paperMode,rows:a.rows,scene:a.scene,saved:a.saved,gateLocked:d.continueGate.locked,cardHidden:document.getElementById('record-card').hidden,notebookHidden:document.getElementById('record-notebook').hidden};
  });
  assert.equal(revealed.time,revealed.returnEnd,JSON.stringify(revealed));assert.equal(revealed.mode,'reading');
  assert.deepEqual(revealed.rows.map(row=>row.value),['有点疲惫','黑眼圈很重']);
  assert.equal(revealed.scene,'record');assert.equal(revealed.saved,false);assert.equal(revealed.gateLocked,false);
  assert.equal(revealed.cardHidden,false);assert.equal(revealed.notebookHidden,false);
  await page.screenshot({path:`${output}/${width}-revealed.png`});
  // Finish the entire sleeping animation; both paper and data must still be visible.
  const completed=await frame.evaluate(()=>{
   const a=window.FluffyDebug.animation;a.time=a.maximum();a.render();
   return {mode:a.metrics.paperMode,rows:a.metrics.paperRows,cardHidden:document.getElementById('record-card').hidden,notebookHidden:document.getElementById('record-notebook').hidden,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(completed.cardHidden,false);assert.equal(completed.notebookHidden,false);assert.equal(completed.mode,'reading');
  assert.equal(completed.rows.length,2);assert.equal(completed.overflow,false);
  await page.screenshot({path:`${output}/${width}-complete.png`});
  results.push({width,height,revealed,completed});
 }
 // A longer record stays readable after completion instead of losing its last fields.
 await frame.evaluate(()=>{
  const d=window.FluffyDebug,a=d.animation;
  const record={...d.state.record,category:'food',data:{meal:'午餐',foods:'米饭、鸡肉、西兰花和南瓜',portion:'一碗饭，一份蔬菜',calories:520,protein:25,carbs:55,fat:16,notes:'今天慢慢吃饭，感觉很满足。'}};
  record.displayRows=__fluffyModules['catalog.js'].rows(record);d.state.record=record;
  a.setRecord(record);a.setScene('record',0,false);a.revealRecord();a.time=a.maximum();a.render();
  const notebook=document.getElementById('record-notebook');notebook.scrollTop=notebook.scrollHeight;notebook.dispatchEvent(new Event('scroll'));a.render();
 });
 const long=await frame.evaluate(()=>{const a=window.FluffyDebug.animation;return {max:a.paperLayout.maxScroll,scroll:a.paperScroll,last:a.metrics.paperRows.at(-1)?.label};});
 assert.ok(long.max>0);assert.equal(long.scroll,long.max);assert.equal(long.last,'Notes');
 await page.screenshot({path:`${output}/430-long-record-end.png`});
 // Functional back button must edit the record, not be swallowed by tap-to-reveal.
 await frame.locator('#back').click();
 await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('entry');
 // The iframe's one shared sheet has a transparent, non-blurring backdrop and a drag handle.
 const openSheet=()=>frame.evaluate(()=>{
  window.sheetTest??={actions:0,closes:0};
  document.getElementById('back').focus();
  window.FluffyDebug.showSheet('记录方式',root=>{
   const field=document.createElement('input');field.id='sheet-test-input';field.setAttribute('aria-label','测试输入');root.append(field);
   const action=document.createElement('button');action.id='sheet-test-action';action.textContent='继续编辑';action.className='sheet-action';action.onclick=()=>window.sheetTest.actions++;root.append(action);
  },()=>window.sheetTest.closes++);
 });
 await openSheet();
 const sheetStyle=await frame.evaluate(()=>{
  const layer=getComputedStyle(document.getElementById('sheet-layer')),sheet=document.getElementById('sheet');
  return {background:layer.backgroundColor,blur:layer.backdropFilter,webkitBlur:layer.webkitBackdropFilter,animation:getComputedStyle(sheet).animationName,closeGlyph:document.querySelector('#sheet-close svg')!==null};
 });
 assert.equal(sheetStyle.background,'rgba(0, 0, 0, 0)');
 assert.ok(!sheetStyle.blur||sheetStyle.blur==='none');assert.ok(!sheetStyle.webkitBlur||sheetStyle.webkitBlur==='none');
 assert.equal(sheetStyle.animation,'sheet-up');assert.equal(sheetStyle.closeGlyph,false);
 await frame.locator('#sheet-test-input').fill('草稿保留');
 const nativeSelection=await frame.evaluate(()=>{
  const title=document.getElementById('sheet-title'),input=document.getElementById('sheet-test-input');
  const menu=target=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});target.dispatchEvent(event);return event.defaultPrevented;};
  const select=target=>{const event=new Event('selectstart',{bubbles:true,cancelable:true});target.dispatchEvent(event);return event.defaultPrevented;};
  input.setSelectionRange(0,2);
  return {text:getComputedStyle(title).userSelect||getComputedStyle(title).webkitUserSelect,input:getComputedStyle(input).userSelect||getComputedStyle(input).webkitUserSelect,textMenuBlocked:menu(title),inputMenuBlocked:menu(input),textSelectionBlocked:select(title),inputSelectionBlocked:select(input),selection:input.value.slice(input.selectionStart,input.selectionEnd)};
 });
 assert.deepEqual(nativeSelection,{text:'none',input:'text',textMenuBlocked:true,inputMenuBlocked:false,textSelectionBlocked:true,inputSelectionBlocked:false,selection:'草稿'});
 await frame.locator('#sheet-test-action').click();
 assert.equal(await frame.evaluate(()=>sheetTest.actions),1);
 const dragHandle=async distance=>{
  const box=await frame.locator('#sheet-close').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+distance,{steps:6});await page.mouse.up();
 };
 await dragHandle(18);
 await expect.poll(()=>frame.evaluate(()=>getComputedStyle(document.getElementById('sheet')).transform)).toBe('none');
 assert.equal(await frame.locator('#sheet-layer').isVisible(),true,'short drags rebound without clicking to dismiss');
 assert.equal(await frame.locator('#sheet-test-input').inputValue(),'草稿保留');
 await page.screenshot({path:`${output}/430-sheet.png`});
 await dragHandle(95);
 await expect.poll(()=>frame.locator('#sheet-layer').isVisible()).toBe(false);
 assert.deepEqual(await frame.evaluate(()=>sheetTest),{actions:1,closes:1});
 assert.equal(await frame.evaluate(()=>document.activeElement.id),'back');
 await openSheet();await frame.locator('#sheet-close').press('Enter');
 await expect.poll(()=>frame.locator('#sheet-layer').isVisible()).toBe(false);
 await openSheet();await frame.locator('#sheet-close').press('Escape');
 await expect.poll(()=>frame.locator('#sheet-layer').isVisible()).toBe(false);
 // Reopening during the exit must cancel the old close timer, not close the new sheet.
 await openSheet();await frame.locator('#sheet-close').press('Escape');await openSheet();
 await frame.waitForTimeout(280);assert.equal(await frame.locator('#sheet-layer').isVisible(),true);
 await frame.evaluate(()=>{window.FluffyDebug.closeSheet();window.FluffyDebug.animation.reducedMotion=true;document.body.classList.add('reduce-motion');});
 await openSheet();
 assert.equal(await frame.evaluate(()=>getComputedStyle(document.getElementById('sheet')).animationName),'none');
 await frame.locator('#sheet-close').press('Escape');
 assert.equal(await frame.locator('#sheet-layer').isVisible(),false);
 assert.equal(await page.evaluate(()=>requests.includes('save')),false);
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/report.json`,JSON.stringify({engine,passed:true,results,long,sheetStyle,nativeSelection,sheetInteractions:['input and functional button','short drag rebound','long drag dismiss','focus restore','Enter close','Escape close','reopen cancels stale timer','reduced motion'],errors,scope:'Real browser interaction with local offline bridge; no production writes. Browser WebKit is not a native iOS keyboard test.'},null,2));
 console.log(JSON.stringify({engine,passed:true,viewports:results.length,long,sheets:true,nativeSelection}));
} finally {await browser.close();await server.close();}
