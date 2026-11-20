import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium',output=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-tone/${engine}`;await mkdir(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:engine==='webkit'?5299:5298,strictPort:true}});await server.listen();const browser=await({chromium,webkit}[engine]).launch();const results=[],errors=[];
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1&category=focus"></iframe><script>window.requests=[];window.pendingTasks=[];addEventListener('load',()=>{const channel=new MessageChannel();window.reply=(id,error)=>channel.port1.postMessage({id,error,result:{}});channel.port1.onmessage=({data})=>{requests.push(data);if(data.method==='settings'&&data.payload?.key==='fluffy-six-tasks-v1'){pendingTasks.push(data.id);return;}channel.port1.postMessage({id:data.id,result:data.method==='ai'?{choices:[{message:{content:'我在呢。'},finish_reason:'stop'}]}:{}});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'focus',locale:'zh',records:[],settings:{'fluffy-first-guide-focus':true}}},location.origin,[channel.port2]);});</script>`;
try{
 const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/__journal-tone',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto(`${server.resolvedUrls.local[0]}__journal-tone`);await expect.poll(()=>page.frames().some(f=>f.url().includes('/journal/'))).toBe(true);const frame=page.frames().find(f=>f.url().includes('/journal/'));await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready);
 for(const width of [320,430])for(const lang of ['zh','en']){
  await page.setViewportSize({width,height:width===320?568:932});
  await frame.evaluate(lang=>{__fluffyModules['entry-i18n.js'].setLanguage(lang);const d=window.FluffyDebug;d.openEntry('focus');d.animation.playing=false;d.animation.render();},lang);
  for(const key of ['ready','thinking','canceled','save-failed']){
   await frame.evaluate(key=>window.FluffyDebug.bubble(key,key==='save-failed'),key);
   const value=await frame.evaluate(()=>{const b=document.getElementById('entry-bubble'),s=getComputedStyle(b),c=document.createElement('canvas').getContext('2d');c.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;const width=b.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);return{text:b.textContent,lines:b.textContent.split('\n').length,overflow:b.textContent.split('\n').some(line=>c.measureText(line).width>width+2)};});
   assert.ok(value.lines<=2);assert.equal(value.overflow,false,JSON.stringify({width,lang,key,value}));results.push({width,lang,key,...value});
  }
  await page.screenshot({path:`${output}/${width}-${lang}-feedback.png`});
 }
 await frame.evaluate(()=>{const d=window.FluffyDebug;__fluffyModules['entry-i18n.js'].setLanguage('zh');d.openEntry('focus');d.fillForm({task:'读三页书',durationMinutes:25});d.saveTaskLater();d.saveTaskLater();});
 await expect.poll(()=>page.evaluate(()=>pendingTasks.length)).toBe(1);assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.scene),'entry');assert.equal(await frame.evaluate(()=>__fluffyModules['journal-store.js'].tasks().length),0);
 await page.evaluate(()=>reply(pendingTasks.shift(),'暂时无法保存待办。'));await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.state.taskSaving)).toBe(false);assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.scene),'entry');assert.equal(await frame.evaluate(()=>__fluffyModules['journal-store.js'].tasks().length),0);
 await frame.evaluate(()=>{window.FluffyDebug.saveTaskLater();});await expect.poll(()=>page.evaluate(()=>pendingTasks.length)).toBe(1);await page.evaluate(()=>reply(pendingTasks.shift()));await expect.poll(()=>page.evaluate(()=>requests.some(r=>r.method==='exit'&&r.payload.destination==='tasks'))).toBe(true);assert.equal(await frame.evaluate(()=>__fluffyModules['journal-store.js'].tasks().length),1);
 await frame.evaluate(()=>{const d=window.FluffyDebug;d.navigate('review');d.review.open('focus','2026-11-20');});await expect.poll(()=>page.evaluate(()=>requests.some(r=>r.method==='ai'&&r.payload.payload.purpose==='review-conversation'))).toBe(true);
 const request=await page.evaluate(()=>requests.find(r=>r.method==='ai'&&r.payload.payload.purpose==='review-conversation').payload.payload);assert.equal(request.replyLanguage,'zh');assert.match(request.conversationTurnId,/focus:2026-11-20:/);assert.equal(request.response_format,undefined);
 assert.deepEqual(errors,[]);console.log(`${engine}: ${results.length} bilingual bubble layouts, persistence acknowledgments, and explicit conversation purpose passed`);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({engine,results,errors,nativeIOS:false},null,2));await browser.close();await server.close();}
