import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium,webkit,expect} from '@playwright/test';

const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-daily-completion';
await mkdir(output,{recursive:true});
// Real React bridge + real journal iframe; only server persistence is replaced.
const service=`const key='daily-completion-fixture-records';
export async function loadJournal(){return{records:JSON.parse(localStorage.getItem(key)||'[]'),settings:Object.fromEntries(['mood','food','sport','sleep','face','focus'].map(c=>['fluffy-first-guide-'+c,true]))};}
export async function saveJournal(record){window.saveCalls=(window.saveCalls||0)+1;if(window.failSave)throw Error('Fixture save failed');const records=(await loadJournal()).records,old=records.find(r=>r.id===record.id),saved={...record,version:(old?.version||0)+1,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};localStorage.setItem(key,JSON.stringify([saved,...records.filter(r=>r.id!==record.id)]));return saved;}
export async function deleteJournal(){} export async function saveJournalSettings(){} export async function journalAI(){throw Error('Offline fixture');}`;
const fixture=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import JournalExperience from'/src/features/JournalExperience.tsx';import{LocaleProvider}from'/src/i18n';
function Fixture(){const[module,setModule]=useState('mood'),[locale,setLocale]=useState('en');window.changeModule=setModule;window.changeLanguage=setLocale;return React.createElement(JournalExperience,{user:{id:'daily-completion-fixture-user'},module,locale,skin:'glacier-mist',onSaved:()=>window.savedCallbacks=(window.savedCallbacks||0)+1,onExit:()=>{}});};createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));`;
const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:5321,strictPort:true},plugins:[{name:'daily-completion-fixture',enforce:'pre',resolveId(source,importer){if(source==='/__daily-fixture.js')return'\0daily-fixture';if(source.endsWith('/services/journal')&&importer?.includes('JournalExperience.tsx'))return'\0daily-journal-service';},load(id){if(id==='\0daily-fixture')return fixture;if(id==='\0daily-journal-service')return service;}}]});
await server.listen();
const html=await server.transformIndexHtml('/daily-check','<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;overflow:hidden}.journal-experience{--journal-safe-top:68px!important;--journal-safe-bottom:34px!important}</style><div id="root"></div><script type="module" src="/__daily-fixture.js"></script></html>');
const results=[],errors=[];
async function frameReady(page,category,lang){let frame;await expect.poll(async()=>{frame=page.frames().find(f=>f.url().includes('/journal/')&&(!category||new URL(f.url()).searchParams.get('category')===category));return frame?await frame.evaluate(lang=>Boolean(window.FluffyDebug?.animation.ready)&&(!lang||window.NavaJournal?.initial.locale===lang),lang).catch(()=>false):false;},{timeout:15000}).toBe(true);return frame;}
async function stageRecord(frame,category,id){
 await frame.evaluate(({category,id})=>{const d=window.FluffyDebug,Store=__fluffyModules['journal-store.js'],C=__fluffyModules['catalog.js'];d.openEntry(category);const data={mood:{mood:'开心'},food:{meal:'早餐',foods:'米饭'},sport:{activity:'散步',durationMinutes:20},sleep:{bedtime:'23:00',wakeTime:'07:00',quality:'还不错'},face:{feeling:'还不错'},focus:{task:'阅读',durationMinutes:25}}[category];const record={id,category,data,createdAt:new Date().toISOString(),recordDate:Store.dayKey()};record.displayRows=C.rows(record);d.state.record=record;d.animation.setRecord(record);d.navigate('record',{transition:false});d.animation.playing=false;d.animation.time=d.animation.maximum();d.continueGate.enteredAt=performance.now()-3000;d.animation.render();},{category,id});
}
try{
 for(const[engine,type]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();
  try{
   const context=await browser.newContext({viewport:{width:430,height:932},reducedMotion:'reduce'});
   await context.addInitScript(()=>{window.FLUFFY_TEST=true;});
   const page=await context.newPage();await page.addLocatorHandler(page.locator('.cold-feedback-layer'),async()=>{await page.locator('.cold-feedback-layer button').last().click();});page.on('pageerror',e=>errors.push(e.message));await page.route('**/daily-check',r=>r.fulfill({contentType:'text/html',body:html}));
   await page.goto('http://127.0.0.1:5321/daily-check');let frame=await frameReady(page);
   await stageRecord(frame,'mood','first');await page.evaluate(()=>{window.failSave=true;});await frame.locator('#primary').click();
   await expect.poll(()=>page.evaluate(()=>window.saveCalls)).toBe(1);await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.continueGate.locked)).toBe(false);
   assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.scene),'record');assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('nava:journal-completion:'))),false);
   await page.evaluate(()=>{window.failSave=false;});await frame.locator('#primary').click();await expect(frame.locator('.celebration-garden:not([hidden])')).toBeVisible();
   await frame.evaluate(()=>document.fonts.ready);const font=await frame.locator('#primary-label').evaluate(el=>{const s=getComputedStyle(el);return{family:s.fontFamily,weight:s.fontWeight,axis:s.fontVariationSettings,loaded:document.fonts.check('600 26px NavaNunito')};});
   assert.match(font.family,/NavaNunito/);assert.equal(font.weight,'600');assert.equal(font.axis,'normal');assert.equal(font.loaded,true);
   assert.match(await frame.locator('.garden-backdrop').getAttribute('src'),/scene-09.webp/);await page.screenshot({path:`${output}/${engine}-430-en-first-starry.png`});
   // Completion is presentation only; Continue must not perform a second save.
   await frame.evaluate(()=>{const d=window.FluffyDebug;d.animation.time=d.animation.maximum();d.animation.render();});await frame.locator('#primary').click();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('review');assert.equal(await page.evaluate(()=>window.saveCalls),2);
   for(const[module,category]of[['mood','mood'],['diet','food'],['exercise','sport'],['sleep','sleep'],['face','face'],['focus','focus']]){
    await page.evaluate(module=>window.changeModule(module),module);frame=await frameReady(page,category);
    await stageRecord(frame,category,`later-${category}`);await frame.locator('#primary').click();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('review');assert.equal(await frame.locator('.celebration-garden:not([hidden])').count(),0);
   }
   await page.reload();frame=await frameReady(page);await stageRecord(frame,'mood','restarted');await frame.locator('#primary').click();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('review');
   // A cleared local receipt cannot replay against same-day acknowledged cloud history.
   await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('nava:journal-completion:'))localStorage.removeItem(key);});await page.reload();frame=await frameReady(page);await stageRecord(frame,'mood','history-guard');await frame.locator('#primary').click();await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('review');
   results.push({engine,firstAfterFailure:true,sixCategoriesShareOneReceipt:true,continueDoesNotResave:true,restartSuppressed:true,knownCloudHistorySuppresses:true,font});
   // Different first-category records still get one page. All share rounded Continue.
   for(const category of ['food','sport','sleep','face','focus']){
    await page.evaluate(()=>{localStorage.removeItem('daily-completion-fixture-records');for(const key of Object.keys(localStorage))if(key.startsWith('nava:journal-completion:'))localStorage.removeItem(key);});await page.reload();frame=await frameReady(page);await stageRecord(frame,category,`fresh-${category}`);await frame.locator('#primary').click();await expect(frame.locator('.celebration-garden:not([hidden])')).toBeVisible();assert.equal(await frame.locator('#primary-label').evaluate(el=>getComputedStyle(el).fontWeight),'600');
   }
   // Compact Chinese completion with full safe area and a reachable button.
   await page.setViewportSize({width:320,height:568});await frame.evaluate(()=>{const d=window.FluffyDebug;d.animation.time=d.animation.maximum();d.animation.render();});await frame.locator('#primary').click();await page.evaluate(()=>{localStorage.removeItem('daily-completion-fixture-records');for(const key of Object.keys(localStorage))if(key.startsWith('nava:journal-completion:'))localStorage.removeItem(key);});await page.reload();await frameReady(page);await page.evaluate(()=>window.changeLanguage('zh'));frame=await frameReady(page,undefined,'zh');await stageRecord(frame,'face','compact');await frame.locator('#primary').click();await expect(frame.locator('.celebration-garden:not([hidden])')).toBeVisible();
   const action=await frame.locator('#primary').boundingBox();assert.ok(action.height>=44&&action.y+action.height<=568-34);await page.screenshot({path:`${output}/${engine}-320-zh-first-lavender.png`});
   results.push({engine,allSixFirstCategories:true,compactSafeArea:true});
   // Artwork failure must not discard a committed entry or expose a green page.
   await page.evaluate(()=>{localStorage.removeItem('daily-completion-fixture-records');for(const key of Object.keys(localStorage))if(key.startsWith('nava:journal-completion:'))localStorage.removeItem(key);});
   await page.route('**/journal/assets/completion/scene-09.webp',route=>route.abort());
   await page.reload();frame=await frameReady(page);await stageRecord(frame,'mood','missing-art');await frame.locator('#primary').click();
   await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.scene)).toBe('review');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('daily-completion-fixture-records')).some(r=>r.id==='missing-art')),true);
   assert.equal(await frame.locator('#green-bg').evaluate(el=>getComputedStyle(el).opacity),'0');
   assert.equal(await frame.locator('.celebration-garden:not([hidden])').count(),0);
   results.push({engine,failedArtworkKeepsSavedReview:true});await context.close();
  }finally{await browser.close();}
 }
 assert.deepEqual(errors,[]);
}catch(error){errors.push(error.stack??String(error));throw error;}finally{await writeFile(`${output}/report.json`,JSON.stringify({passed:errors.length===0,results,errors,scope:'Real React save bridge and iframe; local mock server persistence, no production writes or native iOS claim'},null,2));await server.close();}
console.log(JSON.stringify({passed:true,results,output}));
