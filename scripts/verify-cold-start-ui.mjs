import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/Build/TestRuns/cold-start';await mkdir(out,{recursive:true});
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {LocaleProvider,useLocale} from '/src/i18n.tsx';
import {ColdStartSetup,ColdStartHub} from '/src/features/ColdStartExperience.tsx';import Journal from '/src/features/JournalExperience.tsx';import Onboarding from '/src/features/OnboardingScreen.tsx';
import '/src/styles/global.css';import '/src/styles/figma-v2.css';
const user={id:'10000000-0000-4000-8000-000000000001'};
const answers={gender:'male',ageGroup:'25_34',occupation:'employee',hobbies:['reading'],sleepDuration:'7_8h',exerciseDuration:'1_2h',dietPreferences:['none'],essentialConsent:true,healthDataConsent:false,aiPersonalizationConsent:false};
function Fixture(){const{locale}=useLocale();const q=new URLSearchParams(location.search);const [done,setDone]=React.useState(false);return React.createElement('main',{style:{height:'100dvh',width:'100%',overflow:'hidden'}},done?'SAVED':q.get('mode')==='setup'?React.createElement(ColdStartSetup,{busy:false,error:null,onBack:()=>{},onDraft:()=>{},onSave:v=>{window.setupSaved=v;setDone(true)}}):q.get('mode')==='onboarding'?React.createElement(Onboarding,{user,mode:'review',status:{completed:true,answers,source:'remote',version:3,completedAt:'2026-09-27T00:00:00Z'},onComplete:v=>{window.onboardingSaved=v;setDone(true)}}):q.get('mode')==='hub'?React.createElement(ColdStartHub,{userId:user.id,onHome:()=>{},onStart:()=>{},onHealth:()=>{}}):React.createElement(Journal,{user,module:q.get('module')||'sleep',locale,forceGuide:q.get('force')==='1',onSaved:()=>{window.saves=(window.saves||0)+1},onExit:()=>{window.exited=true}}));}
createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:5268,strictPort:true},plugins:[{name:'cold-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__cold.html'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});}}]});await server.listen();
const browser=await chromium.launch();const report=[];
try{
 for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]])for(const lang of ['zh','en']){
  const en=lang==='en', context=await browser.newContext({viewport:{width,height},locale:en?'en-US':'zh-CN',hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await context.addInitScript(lang=>localStorage.setItem('nava.locale',lang),lang);
  let rows=[],prefs={},saves=0,profileWrites=0,failSave=false;const errors=[];
  await context.route('**/*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();let result;
   if(name==='journal_entries')result=rows;
   else if(name==='journal_preferences'){if(req.method()==='POST')prefs=req.postDataJSON().settings;result={settings:prefs};}
   else if(name==='profiles'){if(req.method()==='POST'){profileWrites++;result=req.postDataJSON();assert.equal(result.onboarding_answers.coldStart.goal,'sleep');assert.equal(result.health_data_consent,false);assert.equal(result.ai_personalization_consent,false);}else result={id:'10000000-0000-4000-8000-000000000001',onboarding_answers:{coldStart:{goal:'sleep',challenge:'routine'}}};}
   else if(name==='nava_save_journal_entry_v2'){
    if(failSave){await route.fulfill({status:400,json:{message:'Isolated save failure'}});return;}
    const r=req.postDataJSON().p_record;saves++;result={id:r.id,user_id:'10000000-0000-4000-8000-000000000001',category:r.category,record_date:r.recordDate,fields:r.data,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),version:1,source:'manual',estimated:false,focus:r.focus};rows=[result];
   }else {await route.fulfill({status:401,json:{message:'Isolated no provider session'}});return;}
   await route.fulfill({json:result});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:5268/__cold.html';
  await page.goto(url+'?mode=setup');
  await page.getByRole('button',{name:en?'Sleep better':'睡得更好',exact:true}).click();
  await page.screenshot({path:`${out}/goals-${lang}-${width}.png`});
  await page.getByRole('button',{name:en?'Continue':'继续',exact:true}).click();
  await page.getByRole('button',{name:en?'An irregular routine':'作息不太规律',exact:true}).click();
  await page.screenshot({path:`${out}/question-${lang}-${width}.png`});
  await page.getByRole('button',{name:en?'Continue':'继续',exact:true}).click();
  assert.equal(await page.getByRole('checkbox').first().isChecked(),false);
  await expect(page.locator('.cold-primary')).toBeInViewport();
  await page.getByRole('button',{name:en?'More options':'更多选项'}).click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
  await page.screenshot({path:`${out}/consent-${lang}-${width}.png`});
  await page.locator('.cold-primary').click();assert.equal(await page.evaluate(()=>window.setupSaved.goal),'sleep');
  await page.goto(url+'?mode=hub');await expect(page.locator('.cold-progress')).toContainText(en?'0 days':'0 天');
  await page.getByRole('button',{name:en?'See an example weekly report':'看看未来的周报',exact:true}).click();
  await expect(page.locator('.cold-example')).toBeVisible();await page.screenshot({path:`${out}/sample-${lang}-${width}.png`});assert.equal(saves,0);
  await page.goto(url+'?module=sleep');const frame=page.frameLocator('iframe');
  await expect(frame.locator('#cold-guide')).toBeVisible({timeout:30000});await frame.locator('#cold-guide-next').click();
  await expect(frame.locator('.cold-guide-target')).toBeVisible();
  for(const key of ['bedtime','wakeTime']){
   for(const [part,number] of (key==='bedtime'?['23','30']:['07','00']).entries()){
    await frame.locator('.time-part[data-key="'+key+'"][data-part="'+part+'"]').click();await frame.locator('#sleep-time-option-'+Number(number)).click();
   }
   await frame.locator('#cold-guide-next').click();
  }
  await frame.locator('#field-quality').fill(en?'A little tired':'有一点困');
  await page.screenshot({path:`${out}/guide-${lang}-${width}.png`});
  await frame.locator('#cold-guide-next').click();await frame.locator('#cold-guide-next').click();
  assert.equal(saves,0);await frame.locator('#confirm-entry').click();
  await expect(frame.locator('#screen')).toHaveAttribute('data-scene','record');await expect(frame.locator('#primary')).toBeEnabled({timeout:30000});
  if(width===390){failSave=true;await frame.locator('#primary').click();await page.waitForTimeout(700);assert.equal(saves,0);await expect(frame.locator('#screen')).toHaveAttribute('data-scene','record');failSave=false;}
  await frame.locator('#primary').click();await expect(frame.locator('#screen')).toHaveAttribute('data-scene','celebrate');assert.equal(saves,1);
  await expect(frame.locator('#primary')).toBeEnabled({timeout:20000});await frame.locator('#primary').click();
  await expect(page.locator('.cold-feedback-layer')).toBeVisible();await expect(page.locator('.cold-fact').first()).toContainText('23:30');
  await page.screenshot({path:`${out}/feedback-${lang}-${width}.png`});
  await page.locator('.cold-primary').click();await expect(page.locator('.cold-feedback-layer')).toHaveCount(0);assert.equal(saves,1);
  await page.goto(url+'?module=sleep');await expect(page.locator('.journal-loading')).toHaveCount(0,{timeout:30000});await expect(page.frameLocator('iframe').locator('#cold-guide')).toBeHidden();
  rows=[];
  await page.goto(url+'?module=sleep');await expect(page.locator('.journal-loading')).toHaveCount(0,{timeout:30000});await expect(page.frameLocator('iframe').locator('#cold-guide')).toBeHidden();
  await page.frameLocator('iframe').locator('#entry-more').click();await page.frameLocator('iframe').locator('[data-action=guide]').click();await expect(page.frameLocator('iframe').locator('#cold-guide')).toBeVisible();
  if(width===390){
   for(const [module,key] of [['mood','mood'],['diet','meal'],['exercise','activity'],['face','feeling'],['focus','task']]){
    rows=[];await page.goto(url+'?module='+module+'&force=1');const guided=page.frameLocator('iframe');await expect(guided.locator('#cold-guide')).toBeVisible({timeout:30000});await guided.locator('#cold-guide-next').click();await expect(guided.locator('#field-'+key).locator('..')).toHaveClass(/cold-guide-target/);await page.screenshot({path:`${out}/guide-${module}-${lang}.png`});
    if(module==='focus'){await guided.locator('#field-task').fill('Read a page');await guided.locator('#cold-guide-next').click();await guided.locator('.cold-focus-presets button').filter({hasText:/^15$/}).click();await expect(guided.locator('#field-durationMinutes')).toHaveValue('15');}
    if(module==='mood'){await page.setViewportSize({width,height:480});await guided.locator('#field-mood').fill(en?'Calm':'平静');await expect(guided.locator('#field-mood')).toBeInViewport();await page.screenshot({path:`${out}/keyboard-${lang}.png`});await page.setViewportSize({width,height});}
    await guided.locator('#cold-guide-skip').click();await expect(guided.locator('#cold-guide')).toBeHidden();assert.equal(saves,1);
   }
   await page.goto(url+'?mode=onboarding');const onboard=page.frameLocator('iframe');await expect(onboard.locator('#screen')).toHaveAttribute('data-step','summary',{timeout:30000});await expect(onboard.locator('#next')).toBeEnabled();await onboard.locator('#next').click();await expect(page.locator('.cold-start-screen')).toBeVisible();assert.equal(profileWrites,0);
   await page.getByRole('button',{name:en?'Sleep better':'睡得更好',exact:true}).click();await page.locator('.cold-primary').click();await page.getByRole('button',{name:en?'An irregular routine':'作息不太规律',exact:true}).click();await page.locator('.cold-primary').click();await page.locator('.cold-primary').click();await expect(page.locator('main').first()).toContainText('SAVED');assert.equal(profileWrites,1);
  }
  assert.deepEqual(errors,[]);report.push({width,height,lang,saves,profileWrites});await context.close();console.log('Passed',width,lang);
 }
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
}finally{await browser.close();await server.close();}
