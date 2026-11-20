import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat-images';
await mkdir(output,{recursive:true});applyProjectPublicEnv(process.cwd());
const imagePath='Q:/NAVA-Workspace/NAVA-App/Build/Release-Staging/feedback-wardrobe/src/assets/figma/home-option2/home-mascot-v5.png';
function setup(supabase){
 const s={owner:'00000000-0000-4000-8000-000000000001',live:[],calls:[],uploads:[],kinds:['generic'],failVision:false,hold:false};
 supabase.auth.getSession=async()=>({data:{session:{access_token:'local-fixture'}},error:null});
 Object.defineProperty(supabase,'storage',{value:{from:bucket=>({upload:async(path,file)=>{if(bucket!=='diet-photos')throw Error('Unexpected private bucket');s.uploads.push({bucket,path,name:file.name});return{error:null}}})}});
 Object.defineProperty(supabase,'functions',{value:{invoke:async(name,options)=>{
  const body=options.body;s.calls.push({name,body:structuredClone(body)});
  if(name==='ai-extract-data'||name==='face-analyze')throw Error('Images must not auto-extract text or score faces');
  if(body.purpose==='chat-images'){
   if(s.hold)await new Promise(resolve=>{s.release=resolve});
   if(s.failVision)return{data:null,error:{context:new Response(JSON.stringify({error:'Vision unavailable fixture'}),{status:503})}};
   return{error:null,data:{schemaVersion:'nava.chat-images.v1',provider:'local-fixture',modelVersion:'not-a-real-model',canAutoSave:false,images:body.images.map((image,index)=>({id:image.id,kinds:[s.kinds[index]||'generic'],summary:`Observation ${index+1}`,observations:['Visible fixture subject'],uncertainties:[],confidence:.9}))}};
  }
  if(name==='diet-extract')return{error:null,data:{items:[{name:'Food fixture',calories:120,weight_g:80}],confidence:.9,modelVersion:'local-fixture'}};
  return{error:null,data:new Response(`event: done\ndata: ${JSON.stringify({reply:'I can discuss the supported observations. Nothing has been saved.'})}\n\n`,{headers:{'Content-Type':'text/event-stream'}})};
 }}});
 supabase.from=table=>{
  if(table==='profiles')return{select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:s.owner,health_data_consent:true,ai_personalization_consent:false,onboarding_completed_at:new Date().toISOString(),onboarding_version:3},error:null})})})};
  if(table==='ai_conversation_archives')return{select:()=>{const q={eq:()=>q,order:()=>q,limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null})};return q;}};
  if(table!=='ai_conversations')throw Error(`Forbidden record write: ${table}`);
  return{
   select:()=>{const filters={};const q={eq:(k,v)=>{filters[k]=v;return q},order:()=>q,range:async()=>({data:s.live,error:null}),maybeSingle:async()=>({data:s.live.find(m=>m.id===filters.id)||null,error:null})};return q},
   insert:payload=>({select:()=>({single:async()=>{const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...payload};s.live.push(row);return{data:row,error:null}}})}),
  };
 };
 return s;
}
const fixture=`import React from'react';import{createRoot}from'react-dom/client';import{LocaleProvider}from'/src/i18n.tsx';import AIScreen from'/src/features/AIScreen.tsx';import{supabase}from'/src/services/supabaseClient.ts';
window.fixture=(${setup.toString()})(supabase);window.images=await import('/src/services/chatImages.ts');const root=createRoot(document.getElementById('root'));window.renderChat=(active=true)=>root.render(React.createElement(LocaleProvider,null,React.createElement(AIScreen,{user:{id:window.fixture.owner},speechEnabled:false,active})));window.renderChat();`;
const server=await createServer({server:{host:'127.0.0.1',port:5318,strictPort:true},logLevel:'silent',plugins:[{name:'image-fixture',resolveId:id=>id==='/__images.js'?'\0image-fixture.js':undefined,load:id=>id==='\0image-fixture.js'?fixture:undefined}]});await server.listen();
const html=await server.transformIndexHtml('/image-check','<html><head><style>body{margin:0}.phone-frame{height:100vh;position:relative}.chat-list{height:70vh;overflow:auto}.chat-message-row{display:flex}.chat-photo-preview{max-width:100px}button{min-height:40px}input{font-size:16px}.chat-attachment-input{display:none}</style></head><body><div class="phone-frame"><div id="root"></div></div><script type="module" src="/__images.js"></script></body></html>');
const report={passed:false,scope:'Actual AIScreen, canvas compression and client services with fully mocked transport; fixture images, no real vision evidence or account writes.',results:[],errors:[]};
async function addPhoto(page){await page.getByRole('button',{name:'Add attachment',exact:true}).click();const chooser=page.waitForEvent('filechooser');await page.getByRole('menuitem',{name:'Photo library',exact:true}).click();await(await chooser).setFiles(imagePath);}
try{
 for(const[engine,type]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();
  try{
   for(const[kinds,expectedDiet]of[[['generic'],0],[['fitness'],0],[['face'],0],[['food','generic'],1],[['food','food'],0]]){
    const page=await browser.newPage({viewport:{width:390,height:844},locale:'en-US'});page.on('pageerror',error=>report.errors.push(error.message));
    await page.route('**/image-check*',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('http://127.0.0.1:5318/image-check?demo=0');
    await expect(page.locator('.chat-composer')).toBeVisible();await page.evaluate(kinds=>{window.fixture.kinds=kinds},kinds);
    const caption='Does this picture fit my question?';await page.locator('.chat-input-shell input').fill(caption);
    for(let index=0;index<kinds.length;index++)await addPhoto(page);
    await expect(page.locator('.chat-input-shell input')).toHaveValue(caption);await page.locator('.chat-send-button').click();
    await expect.poll(()=>page.evaluate(()=>window.fixture.calls.filter(call=>call.body.stream).length)).toBe(1);
    await expect(page.locator('.chat-photo-grid img')).toHaveCount(kinds.length);
    const result=await page.evaluate(()=>{
     const s=window.fixture,vision=s.calls.find(call=>call.body.purpose==='chat-images'),reply=s.calls.find(call=>call.body.stream);
     return{visionCaption:vision.body.message,replyCaption:reply.body.message,analysisCount:reply.body.imageAnalysis.images.length,diet:s.calls.filter(call=>call.name==='diet-extract').length,uploads:s.uploads.length,extraction:s.calls.filter(call=>call.name==='ai-extract-data').length,stored:s.live.map(m=>m.content),dataType:reply.body.dataType};
    });
    assert.equal(result.visionCaption,caption);assert.equal(result.replyCaption,caption);assert.equal(result.analysisCount,kinds.length);assert.equal(result.diet,expectedDiet);assert.equal(result.uploads,expectedDiet);assert.equal(result.extraction,0);
    assert(!result.stored.some(content=>/data:image|blob:|https?:/.test(content)),'Raw images/URLs must never enter message rows');
    if(kinds.length===2&&expectedDiet===0)await expect(page.locator('.chat-media-notice')).toContainText('one photo at a time');
    await page.screenshot({path:`${output}/${engine}-${kinds.join('-')}.png`});report.results.push({engine,kinds,...result});await page.close();
   }
   const page=await browser.newPage({viewport:{width:390,height:844},locale:'en-US'});await page.route('**/image-check*',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('http://127.0.0.1:5318/image-check?demo=0');await expect(page.locator('.chat-composer')).toBeVisible();
   const compression=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=2000;const context=canvas.getContext('2d');context.fillStyle='#1584a3';context.fillRect(0,0,4000,2000);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const photos=Array.from({length:4},(_,index)=>({id:`photo-${index}`,file:new File([blob],'large.png',{type:'image/png'})}));
    const output=await window.images.prepareChatImages(photos);let total=0;const sizes=[];
    for(const item of output){const image=new Image();image.src=item.dataUrl;await image.decode();const bytes=atob(item.dataUrl.split(',')[1]).length;total+=bytes;sizes.push([image.naturalWidth,image.naturalHeight,bytes]);}
    let badRejected=false;try{await window.images.prepareChatImages([{id:'bad',file:new File(['not an image'],'bad.png',{type:'image/png'})}])}catch{badRejected=true;}
    return{sizes,total,badRejected};
   });assert(compression.sizes.every(([w,h,bytes])=>Math.max(w,h)<=1600&&bytes<=1024*1024));assert(compression.total<=3*1024*1024);assert(compression.badRejected);
   await page.evaluate(()=>{window.fixture.failVision=true});await page.locator('.chat-input-shell input').fill('Keep my caption');await addPhoto(page);await page.locator('.chat-send-button').click();
   await expect(page.locator('.chat-input-shell input')).toHaveValue('Keep my caption');await expect(page.locator('.chat-pending-photos img')).toHaveCount(1);assert.equal(await page.evaluate(()=>window.fixture.calls.filter(call=>call.body.stream).length),0);
   await page.evaluate(()=>{window.fixture.failVision=false;window.fixture.hold=true});await page.locator('.chat-send-button').click();await expect.poll(()=>page.evaluate(()=>typeof window.fixture.release)).toBe('function');await page.evaluate(()=>{window.renderChat(false)});await page.waitForTimeout(30);await page.evaluate(()=>window.fixture.release());await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>window.fixture.calls.filter(call=>call.body.stream).length),0,'Late image analysis must not send after leaving chat');assert.equal(await page.evaluate(()=>window.fixture.live.filter(m=>m.role==='user').length),0);
   report.results.push({engine,compression,errorKeepsDraft:true,lateAnalysisDiscarded:true});await page.close();
  }finally{await browser.close();}
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.errors.push(error.stack??String(error))}
finally{await server.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}
if(!report.passed)throw Error(report.errors.join('\n'));console.log('Chat images: both engines passed per-image routing, original caption, compression, explicit meal drafts, retry and stale-result checks.');
