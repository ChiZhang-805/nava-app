import { spawnSync } from 'node:child_process';
import { randomUUID,randomBytes } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {IPHONE_PREVIEW_DEVICES} from '../src/constants/iphonePreviewDevices.ts';
const project='wxteapvwagvhhtrjrbim',url=`https://${project}.supabase.co`;
const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw Error('Secure credentials unavailable');
const keys=JSON.parse(r.stdout),admin=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false}});
const email=`journal-ui-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
let id,browser;
const output='Q:/NAVA-Workspace/Build/TestRuns/journal-integration/live';mkdirSync(output,{recursive:true});
const backgrounds=[];
async function checkDesktop(page,frame,scene){
 await page.setViewportSize({width:1440,height:1040});
 for(const device of IPHONE_PREVIEW_DEVICES){
  await page.getByTestId('nava-preview-device-select').selectOption(device.id);await page.waitForTimeout(120);
  const size=await frame.evaluate(()=>({width:innerWidth,height:innerHeight,content:document.querySelector('.stage').clientHeight,nav:document.querySelector('.review-header')?.getBoundingClientRect().y}));
  assert.equal(size.width,device.logicalWidth);assert.equal(size.height,device.logicalHeight);assert.ok(Math.abs(size.content-size.height)<=1,'Desktop preview scale must not reduce logical journal height');
  if(scene==='recap')assert.ok(size.nav>=device.calibration.safeTop-1);
  await page.screenshot({path:`${output}/desktop-${scene}-${device.id}.png`});
 }
 await page.setViewportSize({width:390,height:844});
}
async function checkBackgrounds(page,frame,scene){
 for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  const host=await page.locator('.journal-experience iframe').boundingBox();
  assert.ok(Math.abs(host.x)<1&&Math.abs(host.y)<1&&Math.abs(host.width-width)<1&&Math.abs(host.height-height)<1,`Journal must fill ${width}x${height}`);
  assert.equal(await page.locator('.phone-frame--journal').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
  const backdrop=await frame.evaluate(()=>{
   const green=document.getElementById('green-bg');
   const e=Number(getComputedStyle(green).opacity)>.99?green:document.querySelector('.cream-bg');
   const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,green:e===green,parent:e.parentElement.className};
  });
  assert.deepEqual([backdrop.x,backdrop.y,backdrop.width,backdrop.height],[0,0,width,height]);
  assert.equal(backdrop.parent,'stage');assert.equal(backdrop.green,scene==='great-job');
  backgrounds.push({scene,width,height,fullViewport:true});
  await page.screenshot({path:`${output}/background-${scene}-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});
}
try{
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw Error('Temporary account setup failed');id=created.data.user.id;
 const p=await admin.from('profiles').upsert({id,username:'Journal verification',ai_personalization_consent:true,health_data_consent:true,onboarding_completed_at:new Date().toISOString(),onboarding_version:2});if(p.error)throw Error('Temporary profile setup failed');
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'});
 await page.addInitScript(()=>localStorage.setItem('nava.locale','zh'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ai=[];page.on('response',async response=>{if(response.url().endsWith('/journal-assistant'))ai.push({status:response.status(),body:await response.json().catch(()=>null)});});
 await page.goto(`${process.env.NAVA_LIVE_URL||'http://localhost:5173/'}#tab=record&module=mood`);
 await page.locator('input[autocomplete="username"]').fill(email,{timeout:45000});
 await page.locator('input[type="password"]').fill(password);
 await page.locator('button[type="submit"]').click();
 await page.waitForSelector('.journal-experience iframe',{timeout:60000});
 const frame=page.frames().find(f=>f.url().includes('/journal/'));
 await frame.waitForSelector('#screen[data-scene="entry"]',{timeout:40000});
 await frame.locator('#field-mood').fill('平静');await frame.locator('#field-reason').fill('完成一次功能检查');await frame.locator('#field-notes').fill('继续保持');
 await frame.locator('#confirm-entry').click();await frame.waitForSelector('#screen[data-scene="record"]');
 await frame.waitForFunction(()=>!document.querySelector('#primary').disabled);await frame.locator('#primary').click();await frame.waitForSelector('#screen[data-scene="celebrate"]',{timeout:40000});
 await frame.waitForFunction(()=>!document.querySelector('#primary').disabled);await frame.locator('#primary').click();await frame.waitForSelector('#screen[data-scene="review"]');
 for(let i=0;i<90&&!ai.length;i++)await page.waitForTimeout(1000);
 assert.ok(ai.some(x=>x.status===200),'Recap must actually call the deployed AI');
 const saved=await admin.from('journal_entries').select('id,category,fields').eq('user_id',id);assert.equal(saved.data.length,1);assert.equal(saved.data[0].fields.mood,'平静');
 await page.screenshot({path:`${output}/authenticated-mood-recap.png`});
 await checkBackgrounds(page,frame,'recap');
 await checkDesktop(page,frame,'recap');
 await page.reload();await page.waitForSelector('.journal-experience iframe',{timeout:40000});const restored=page.frames().find(f=>f.url().includes('/journal/'));await restored.waitForSelector('#screen[data-scene="review"]',{timeout:40000});assert.ok((await restored.locator('#screen').innerText()).includes('平静'));
 // Exercise the actual file chooser -> Bailian -> editable fields route using an existing synthetic meal.
 await page.goto(`${process.env.NAVA_LIVE_URL||'http://localhost:5173/'}#tab=record&module=diet`);await page.waitForSelector('.journal-experience iframe',{timeout:40000});
 const food=page.frames().find(f=>f.url().includes('/journal/'));await food.waitForSelector('#screen[data-scene="entry"]',{timeout:40000});
 await food.locator('.choice-pill[data-value="早餐"]').click();
 await food.locator('#photo-library').setInputFiles('Q:/NAVA-Workspace/Build/TestRuns/nava-account-history-20260913/synthetic-images/2026-09-13-breakfast.png');
 for(let i=0;i<100&&!ai.some(x=>x.body?.provider==='bailian');i++)await page.waitForTimeout(1000);
 assert.ok(ai.some(x=>x.status===200&&x.body?.provider==='bailian'),'Photo route must actually call Bailian');
 await food.waitForFunction(()=>Boolean(document.querySelector('#field-foods')?.value?.trim()),{timeout:10000});
 await page.screenshot({path:`${output}/authenticated-food-analysis.png`});
 await checkBackgrounds(page,food,'entry');
 await food.locator('#confirm-entry').click();await food.waitForSelector('#screen[data-scene="record"]');
 await food.waitForTimeout(10000);await page.screenshot({path:`${output}/authenticated-food-writing.png`});
 await checkBackgrounds(page,food,'writing');
 await food.waitForFunction(()=>!document.querySelector('#primary').disabled);await food.locator('#primary').click();await food.waitForSelector('#screen[data-scene="celebrate"]',{timeout:30000});
 await food.waitForTimeout(4500);await page.screenshot({path:`${output}/authenticated-food-great-job.png`});
 await checkBackgrounds(page,food,'great-job');
 await checkDesktop(page,food,'great-job');
 const meals=await admin.from('journal_entries').select('category,fields,estimated').eq('user_id',id).eq('category','food');
 assert.equal(meals.data.length,1);assert.equal(meals.data[0].fields.meal,'早餐');assert.ok(meals.data[0].fields.foods);assert.equal(meals.data[0].estimated,true);
 assert.equal(errors.length,0,errors.join('\n'));
 writeFileSync(`${output}/result.json`,JSON.stringify({realPasswordLogin:true,cloudSave:true,reloadRestored:true,photoConfirmedAndSaved:true,backgrounds,textAI:ai.filter(x=>x.body?.provider==='deepseek').map(x=>x.body.model),visionAI:ai.filter(x=>x.body?.provider==='bailian').map(x=>x.body.model),errors},null,2));
 console.log('Real app login, cloud save/reload, DeepSeek recap and Bailian photo route passed.');
}finally{await browser?.close();if(id){const result=await admin.auth.admin.deleteUser(id);if(result.error)throw Error('Temporary account cleanup failed');}console.log('Temporary UI account removed.');}
