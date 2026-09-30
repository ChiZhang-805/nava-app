import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/Build/TestRuns/cold-start';await mkdir(out,{recursive:true});
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {LocaleProvider,useLocale} from '/src/i18n.tsx';
import {ColdStartHub} from '/src/features/ColdStartExperience.tsx';import Journal from '/src/features/JournalExperience.tsx';import Onboarding from '/src/features/OnboardingScreen.tsx';
import '/src/styles/global.css';import '/src/styles/figma-v2.css';
const user={id:'10000000-0000-4000-8000-000000000001'};
const answers={gender:'male',ageGroup:'25_34',occupation:'employee',hobbies:['reading'],sleepDuration:'7_8h',exerciseDuration:'1_2h',dietPreferences:['none'],essentialConsent:true,healthDataConsent:false,aiPersonalizationConsent:false};
function Fixture(){const{locale}=useLocale();const q=new URLSearchParams(location.search);const [done,setDone]=React.useState(false);return React.createElement('main',{style:{height:'100dvh',width:'100%',overflow:'hidden'}},done?'SAVED':q.get('mode')==='onboarding'?React.createElement(Onboarding,{user,mode:q.get('first')==='1'?'first':'review',status:{completed:q.get('first')!=='1',answers:q.get('first')==='1'?{}:answers,source:'remote',version:3,completedAt:'2026-09-27T00:00:00Z'},onComplete:v=>{window.onboardingSaved=v;setDone(true)}}):q.get('mode')==='hub'?React.createElement(ColdStartHub,{userId:user.id,onHome:()=>{},onStart:()=>{},onHealth:()=>{}}):React.createElement(Journal,{user,module:q.get('module')||'sleep',locale,forceGuide:q.get('force')==='1',onSaved:()=>{window.saves=(window.saves||0)+1},onExit:()=>{window.exited=true}}));}
createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:5268,strictPort:true},plugins:[{name:'cold-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__cold.html'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});}}]});await server.listen();
const browser=await chromium.launch();const report=[];
async function chooseSleepTime(frame,key,hour,minute){
 for(const [part,number] of [hour,minute].entries()){
  await frame.locator(`.time-part[data-key="${key}"][data-part="${part}"]`).click();
  await frame.locator(`#sleep-time-option-${Number(number)}`).click();
 }
}
async function fillGuideStep(frame,module,key,en){
 if(key==='sleepRange'){await chooseSleepTime(frame,'bedtime','23','30');await chooseSleepTime(frame,'wakeTime','07','00');return;}
 if(key==='photo'){await frame.locator('#photo-preview').evaluate(node=>node.classList.add('has-image'));return;}
 if(key==='meal'){await frame.locator('.choice-pill').first().click();return;}
 const values={quality:en?'A little tired':'有一点困',mood:en?'Calm':'平静',reason:en?'Finished one task':'完成了一件事',foods:en?'Rice and vegetables':'米饭和蔬菜',portion:en?'One bowl':'一碗',activity:en?'Walking':'散步',durationMinutes:'15',notes:en?'Felt steady':'状态平稳',feeling:en?'A little tired':'有一点困',eyeArea:en?'Looks rested':'看起来较放松',task:en?'Read one page':'读完一页'};
 const input=frame.locator(`#field-${key}`);await input.fill(values[key]||'Test');
}
async function assertGuideSpotlight(frame,key){
 const backdrop=frame.locator('#cold-guide-backdrop');
 await expect(backdrop).toHaveAttribute('data-guide-holes','1');
 await expect(frame.locator('[data-guide-hole]')).toHaveCount(1);
 if(key==='sleepRange'){
  await expect(frame.locator('.time-range-field')).toHaveClass(/cold-guide-target/);
  await expect(frame.locator('[data-guide-hole]')).toHaveAttribute('data-guide-hole','time-group');
  const geometry=await frame.locator('#screen').evaluate(screen=>{
   const root=screen.getBoundingClientRect(),scaleX=root.width/screen.clientWidth,scaleY=root.height/screen.clientHeight,field=screen.querySelector('.time-range-field'),control=field.querySelector('.time-range-line'),title=field.querySelector('.field-header'),next=field.nextElementSibling?.querySelector('.field-header'),card=screen.querySelector('#record-card').getBoundingClientRect(),hole=screen.querySelector('[data-guide-hole]').getBBox();
   const content={left:Math.min(title.getBoundingClientRect().left,control.getBoundingClientRect().left),top:title.getBoundingClientRect().top,right:Math.max(title.getBoundingClientRect().right,control.getBoundingClientRect().right),bottom:control.getBoundingClientRect().bottom};
   return{content:{left:(content.left-root.left)/scaleX,top:(content.top-root.top)/scaleY,right:(content.right-root.left)/scaleX,bottom:(content.bottom-root.top)/scaleY},card:{left:(card.left-root.left)/scaleX,right:(card.right-root.left)/scaleX},nextTop:next?(next.getBoundingClientRect().top-root.top)/scaleY:null,hole:{x:hole.x,y:hole.y,width:hole.width,height:hole.height}};
  });
  assert.ok(Math.abs(geometry.hole.x-(geometry.card.left+geometry.content.left)/2)<1.5,'sleep spotlight left edge must bisect the card-to-control gap');
  assert.ok(Math.abs(geometry.hole.x+geometry.hole.width-(geometry.content.right+geometry.card.right)/2)<1.5,'sleep spotlight right edge must bisect the control-to-card gap');
  const topPadding=geometry.content.top-geometry.hole.y,bottomPadding=geometry.hole.y+geometry.hole.height-geometry.content.bottom;
  assert.ok(topPadding>=4&&Math.abs(topPadding-bottomPadding)<1.5,'sleep spotlight must keep equal title/control breathing room');
  assert.ok(geometry.nextTop!=null&&Math.abs((geometry.hole.y+geometry.hole.height)-(geometry.content.bottom+geometry.nextTop)/2)<1.5,'sleep spotlight bottom must bisect the gap before the next title');
  return;
 }
 if(key==='photo'){
  await expect(frame.locator('#photo-preview')).toHaveClass(/cold-guide-target/);
  await expect(frame.locator('[data-guide-hole]')).toHaveAttribute('data-guide-hole','control');
  return;
 }
 if(key==='confirm'){
  await expect(frame.locator('#confirm-entry')).toHaveClass(/cold-guide-target/);
  await expect(frame.locator('[data-guide-hole]')).toHaveAttribute('data-guide-hole','control');
  return;
 }
 const field=frame.locator(`[data-field="${key}"]`);
 await expect(field).toHaveClass(/cold-guide-target/);
 await expect(field).toHaveClass(/cold-guide-field-group/);
 await expect(frame.locator(`#field-${key}`)).not.toHaveClass(/cold-guide-target/);
 await expect(field.locator('.field-name')).not.toHaveClass(/cold-guide-target/);
 await expect(frame.locator('[data-guide-hole]')).toHaveAttribute('data-guide-hole','field-group');
 const geometry=await frame.locator('#screen').evaluate((screen,fieldKey)=>{
  const root=screen.getBoundingClientRect(),scaleX=root.width/screen.clientWidth,scaleY=root.height/screen.clientHeight,field=screen.querySelector(`[data-field="${fieldKey}"]`),input=screen.querySelector(`#field-${fieldKey}`);
  const partsFor=node=>{const ownInput=node.querySelector('input, textarea, select'),control=ownInput.closest('.input-wrap')||(ownInput.type==='hidden'?node.querySelector('.choice-group'):ownInput);return{control,boxes:[node.querySelector('.field-header'),control].map(part=>part.getBoundingClientRect())};};
  const current=partsFor(field),content={left:Math.min(...current.boxes.map(r=>r.left)),top:Math.min(...current.boxes.map(r=>r.top)),right:Math.max(...current.boxes.map(r=>r.right)),bottom:Math.max(...current.boxes.map(r=>r.bottom))};
  const fields=[...screen.querySelectorAll('#entry-form .field')].filter(node=>node.getClientRects().length),index=fields.indexOf(field),neighbor=index<fields.length-1?partsFor(fields[index+1]).boxes:null;
  const nextTop=neighbor?Math.min(...neighbor.map(r=>r.top)):null,card=screen.querySelector('#record-card').getBoundingClientRect(),hole=screen.querySelector('[data-guide-hole]').getBBox(),panel=screen.querySelector('.entry-panel').getBoundingClientRect();
  const expected={x:((card.left+content.left)/2-root.left)/scaleX,right:((content.right+card.right)/2-root.left)/scaleX};
  return{content:{x:(content.left-root.left)/scaleX,y:(content.top-root.top)/scaleY,right:(content.right-root.left)/scaleX,bottom:(content.bottom-root.top)/scaleY},expected,nextTop:nextTop==null?null:(nextTop-root.top)/scaleY,hole:{x:hole.x,y:hole.y,width:hole.width,height:hole.height},fieldWidth:field.getBoundingClientRect().width/scaleX,controlWidth:current.control.getBoundingClientRect().width/scaleX,panelWidth:panel.width/scaleX};
 },key);
 assert.ok(Math.abs(geometry.hole.x-geometry.expected.x)<1.5,`${key} spotlight left edge must bisect the card-to-control gap`);
 assert.ok(Math.abs(geometry.hole.x+geometry.hole.width-geometry.expected.right)<1.5,`${key} spotlight right edge must bisect the control-to-card gap`);
 const topPadding=geometry.content.y-geometry.hole.y,bottomPadding=geometry.hole.y+geometry.hole.height-geometry.content.bottom;
 assert.ok(topPadding>=4,`${key} spotlight must leave visible space above the title`);
 assert.ok(Math.abs(topPadding-bottomPadding)<1.5,`${key} spotlight must use equal top and bottom breathing room`);
 if(geometry.nextTop!=null)assert.ok(Math.abs((geometry.hole.y+geometry.hole.height)-(geometry.content.bottom+geometry.nextTop)/2)<1.5,`${key} spotlight bottom must bisect the gap before the next title`);
 assert.ok(Math.abs(geometry.fieldWidth-geometry.panelWidth)<3,`${key} guide must preserve the normal full-width field ${JSON.stringify(geometry)}`);
 assert.ok(Math.abs(geometry.controlWidth-geometry.panelWidth)<3,`${key} guide must preserve the normal full-width control ${JSON.stringify(geometry)}`);
}
async function finishGuide(frame,module,en){
 const guide=frame.locator('#cold-guide');
 for(let count=0;count<8&&await guide.isVisible();count+=1){
  await expect(guide).toHaveAttribute('data-speech-ready','true');
  const key=await guide.getAttribute('data-step');
  await assertGuideSpotlight(frame,key);
  if(key==='confirm'){await frame.locator('#confirm-entry').click();break;}
  await expect(guide).toHaveAttribute('data-ready','false');
  await fillGuideStep(frame,module,key,en);
  await expect(guide).toHaveAttribute('data-ready','true');
  await guide.evaluate(node=>node.click());
 }
 await expect(guide).toBeHidden();
}
try{
 for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]].filter(([w])=>!process.env.NAVA_TEST_WIDTH||w===Number(process.env.NAVA_TEST_WIDTH)))for(const lang of ['zh','en']){
  const en=lang==='en', context=await browser.newContext({viewport:{width,height},locale:en?'en-US':'zh-CN',hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await context.addInitScript(lang=>localStorage.setItem('nava.locale',lang),lang);
  let rows=[],prefs={},saves=0,profileWrites=0,failSave=false,failProfile=false;const errors=[];
  await context.route('**/*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();let result;
   if(name==='journal_entries')result=rows;
   else if(name==='journal_preferences'){if(req.method()==='POST')prefs=req.postDataJSON().settings;result={settings:prefs};}
   else if(name==='profiles'){if(req.method()==='POST'){if(failProfile){await route.fulfill({status:400,json:{message:'Isolated profile failure'}});return;}profileWrites++;result=req.postDataJSON();assert.equal(result.onboarding_answers.coldStart.goal,'sleep');assert.equal(result.health_data_consent,false);assert.equal(result.ai_personalization_consent,false);}else result={id:'10000000-0000-4000-8000-000000000001',onboarding_answers:{coldStart:{goal:'sleep',challenge:'routine'}}};}
   else if(name==='nava_save_journal_entry_v2'){
    if(failSave){await route.fulfill({status:400,json:{message:'Isolated save failure'}});return;}
    const r=req.postDataJSON().p_record;saves++;result={id:r.id,user_id:'10000000-0000-4000-8000-000000000001',category:r.category,record_date:r.recordDate,fields:r.data,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),version:1,source:'manual',estimated:false,focus:r.focus};rows=[result];
   }else {await route.fulfill({status:401,json:{message:'Isolated no provider session'}});return;}
   await route.fulfill({json:result});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:5268/__cold.html';
  await page.goto(url+'?mode=onboarding',{waitUntil:'domcontentloaded',timeout:60000});const onboard=page.frameLocator('iframe');
  await expect(onboard.locator('#screen')).toHaveAttribute('data-step','summary',{timeout:30000});
  await onboard.locator('#next').click();await expect(onboard.locator('#screen')).toHaveAttribute('data-step','goal');
  await expect(page.locator('.cold-start-screen')).toHaveCount(0);
  await expect(onboard.locator('#next')).toBeDisabled();
  for(const stage of ['goal','challenge','permissions']){
    await expect(onboard.locator('#screen')).toHaveAttribute('data-step',stage);
    await onboard.locator('#language').click();await expect(onboard.locator('#language-menu')).toBeVisible();await onboard.locator('#language').press('Escape');
    if(stage==='goal')await onboard.locator('[data-option=sleep]').click();
    if(stage==='challenge')await onboard.locator('[data-option=routine]').click();
    if(stage==='permissions')assert.equal(await onboard.getByRole('checkbox').first().getAttribute('aria-checked'),'false');
    await page.screenshot({path:`${out}/original-${stage}-${lang}-${width}.png`});
    await expect(onboard.locator('#next')).toBeInViewport();
    const overlap=await onboard.locator('.paper-content').evaluate(c=>{const caption=c.querySelector('.sheet-caption').getBoundingClientRect(),opts=c.querySelector('.options').getBoundingClientRect();return opts.bottom>caption.top;});assert.equal(overlap,false,stage+' caption overlap');
    if(stage==='challenge'){
      const optionRows=await onboard.locator('.challenge .option').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
      assert.equal(optionRows.length,5,'challenge must show five choices');
      assert.equal(new Set(optionRows.map(row=>Math.round(row.x))).size,1,'challenge choices must share one column');
      assert.equal(new Set(optionRows.map(row=>Math.round(row.width))).size,1,'challenge choices must share one width');
      assert.ok(optionRows.every((row,index)=>index===0||row.y>optionRows[index-1].y+optionRows[index-1].height),'challenge choices must occupy separate rows');
      const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('nava.first-notes.draft.v1.10000000-0000-4000-8000-000000000001')));assert.equal(draft.step,'challenge');
    }
    await onboard.locator('#next').click();
  }
  await expect(onboard.locator('#screen')).toHaveAttribute('data-step','summary');assert.equal(profileWrites,0);
  await onboard.locator('#next').click();await expect(page.locator('main').first()).toContainText('SAVED');assert.equal(profileWrites,1);
  if(process.env.NAVA_NOTEBOOK_ONLY==='1'){assert.deepEqual(errors,[]);report.push({width,height,lang,profileWrites});await context.close();console.log('Notebook passed',width,lang);continue;}
  await page.goto(url+'?mode=hub');await expect(page.locator('.cold-progress')).toContainText(en?'0 days':'0 天');
  await page.getByRole('button',{name:en?'See an example weekly report':'看看未来的周报',exact:true}).click();
  await expect(page.locator('.cold-example')).toBeVisible();await page.screenshot({path:`${out}/sample-${lang}-${width}.png`});assert.equal(saves,0);
  await page.goto(url+'?module=sleep');const frame=page.frameLocator('iframe');
  await expect(frame.locator('#cold-guide')).toBeVisible({timeout:30000});
  await expect(frame.locator('.cold-guide-target')).toHaveCount(1);
  await expect(frame.locator('.time-range-field')).toHaveClass(/cold-guide-target/);
  await expect(frame.locator('.time-endpoint').first()).not.toHaveClass(/cold-guide-target/);
  await expect(frame.locator('#cold-guide-backdrop')).toBeVisible();
  await expect(frame.locator('#cold-guide-backdrop')).toHaveAttribute('data-guide-holes','1');
  await expect(frame.locator('#actor-canvas')).toHaveClass(/cold-guide-cat/);
  await expect(frame.locator('#entry-bubble')).toHaveClass(/cold-guide-speaker/);
  await expect(frame.locator('#cold-guide-skip')).toHaveCount(0);
  await expect(frame.locator('#entry-bubble')).not.toContainText(/\d+\/\d+/);
  await expect(frame.locator('#cold-guide')).toHaveAttribute('data-ready','false');
  await frame.locator('#cold-guide').evaluate(node=>node.click());
  await expect(frame.locator('#cold-guide')).toHaveAttribute('data-step','sleepRange');
  await page.screenshot({path:`${out}/guide-${lang}-${width}.png`});
  await finishGuide(frame,'sleep',en);
  assert.equal(saves,0);
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
  await page.frameLocator('iframe').locator('#entry-more').click();
  if(width===390&&lang==='zh')await page.emulateMedia({reducedMotion:'no-preference'});
  await page.frameLocator('iframe').locator('[data-action=guide]').click();await expect(page.frameLocator('iframe').locator('#cold-guide')).toBeVisible();
  if(width===390&&lang==='zh'){
   const regression=page.frameLocator('iframe'),guide=regression.locator('#cold-guide');
   const tapGuide=async()=>{const box=await guide.boundingBox();assert.ok(box,'guide must expose a touchable box');await page.touchscreen.tap(box.x+24,box.y+112);};
   await expect(guide).toHaveAttribute('data-speech-ready','false');
   await regression.locator('#screen').evaluate(screen=>{for(let frame=0;frame<24;frame+=1)screen.dataset.scene='entry';});
   await page.waitForTimeout(120);await expect(guide).toHaveAttribute('data-speech-ready','false');assert.ok((await regression.locator('#entry-bubble').innerText()).length>1,'typewriter must progress while animation repeats the same scene');
   await regression.locator('#screen').evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   await tapGuide();await expect(guide).toHaveAttribute('data-step','sleepRange');await expect(guide).toHaveAttribute('data-ready','false');
   await regression.locator('#screen').evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await expect(guide).toHaveAttribute('data-speech-ready','true');await chooseSleepTime(regression,'bedtime','23','30');await chooseSleepTime(regression,'wakeTime','07','00');await expect(guide).toHaveAttribute('data-ready','true');await expect(regression.locator('#entry-bubble')).toContainText('轻触屏幕继续');
   await tapGuide();await expect(guide).toHaveAttribute('data-step','quality');await expect(guide).toHaveAttribute('data-ready','false');await expect(regression.locator('#entry-bubble')).not.toContainText(/\d+\/\d+/);
   await page.emulateMedia({reducedMotion:'reduce'});
  }
  if(width===390){
   await page.evaluate(()=>{localStorage.removeItem('nava.first-notes.draft.v1.10000000-0000-4000-8000-000000000001');localStorage.removeItem('nava.cold-start.draft.v1.10000000-0000-4000-8000-000000000001');});
   await page.goto(url+'?mode=onboarding&first=1');const notes=page.frameLocator('iframe');
   await expect(notes.locator('#screen')).toHaveAttribute('data-step','welcome',{timeout:30000});await notes.locator('#next').click();
   for(const key of ['gender','role','age','interests','sleep','exercise','diet']){
    await expect(notes.locator('#screen')).toHaveAttribute('data-step',key);await notes.locator('[data-question='+key+']').first().click();
    if(key==='interests'){await page.screenshot({path:`${out}/original-interests-${lang}.png`});}
    if(['interests','diet'].includes(key))await notes.locator('#next').click();
   }
   await expect(notes.locator('#screen')).toHaveAttribute('data-step','goal');await notes.locator('[data-option=sleep]').click();await notes.locator('#next').click();await notes.locator('[data-option=routine]').click();await expect(notes.locator('[data-option=routine]')).toHaveAttribute('aria-checked','true');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nava.first-notes.draft.v1.10000000-0000-4000-8000-000000000001')||'null')?.profile?.coldStart?.challenge||JSON.parse(localStorage.getItem('nava.cold-start.draft.v1.10000000-0000-4000-8000-000000000001')||'null')?.challenge||'')).toBe('routine');
   await page.reload();await expect(notes.locator('#screen')).toHaveAttribute('data-step','challenge',{timeout:30000});await expect(notes.locator('[data-option=routine]')).toHaveAttribute('aria-checked','true');
   await notes.locator('#language').click();await notes.getByRole('menuitem',{name:en?'Previous page':'上一页'}).click();await notes.locator('[data-option=mood]').click();await notes.locator('#next').click();await expect(notes.locator('#next')).toBeDisabled();await expect(notes.locator('[data-option=routine]')).toHaveCount(0);
   await notes.locator('#language').click();await notes.getByRole('menuitem',{name:en?'Previous page':'上一页'}).click();await notes.locator('[data-option=sleep]').click();await notes.locator('#next').click();await notes.locator('[data-option=routine]').click();await notes.locator('#next').click();
   await notes.locator('[data-consent=healthConsent]').click();await notes.locator('[data-consent=healthConsent]').click();await notes.locator('#next').click();
   failProfile=true;await notes.locator('#next').click();await expect(page.getByRole('alert')).toBeVisible();assert.equal(profileWrites,1);failProfile=false;
   await page.getByRole('button',{name:en?'Retry':'重试',exact:true}).click();await expect(notes.locator('#screen')).toHaveAttribute('data-step','summary',{timeout:30000});await notes.locator('#next').click();await expect(page.locator('main').first()).toContainText('SAVED');assert.equal(profileWrites,2);
   for(const [module,key] of [['mood','mood'],['diet','photo'],['exercise','activity'],['face','photo'],['focus','task']]){
   rows=[];await page.goto(url+'?module='+module+'&force=1');const guided=page.frameLocator('iframe');await expect(guided.locator('#cold-guide')).toBeVisible({timeout:30000});
   if(key==='photo'){
    await expect(guided.locator('#photo-preview')).toHaveClass(/cold-guide-target/);await expect(guided.locator('#cold-guide-backdrop')).toHaveAttribute('data-guide-holes','1');
   }else{
    await expect(guided.locator(`[data-field="${key}"]`)).toHaveClass(/cold-guide-target/);await expect(guided.locator('#field-'+key)).not.toHaveClass(/cold-guide-target/);await expect(guided.locator(`[data-field="${key}"] .field-name`)).not.toHaveClass(/cold-guide-target/);await expect(guided.locator('#cold-guide-backdrop')).toHaveAttribute('data-guide-holes','1');
   }
   await page.screenshot({path:`${out}/guide-${module}-${lang}.png`});
    if(module==='mood'){await guided.locator('#field-mood').focus();await page.setViewportSize({width,height:480});await expect(guided.locator('#field-mood')).toBeInViewport();await page.screenshot({path:`${out}/keyboard-${lang}.png`});await page.setViewportSize({width,height});}
    await expect(guided.locator('#cold-guide-skip')).toHaveCount(0);await finishGuide(guided,module,en);
    if(module==='focus')await expect(guided.locator('#field-durationMinutes')).toHaveValue('15');
    await expect(guided.locator('#cold-guide')).toBeHidden();assert.equal(saves,1);
   }
  }
  assert.deepEqual(errors,[]);report.push({width,height,lang,saves,profileWrites});await context.close();console.log('Passed',width,lang);
 }
 await writeFile(out+(process.env.NAVA_NOTEBOOK_ONLY==='1'?'/notebook-report.json':process.env.NAVA_TEST_WIDTH?'/report-'+process.env.NAVA_TEST_WIDTH+'.json':'/report.json'),JSON.stringify(report,null,2));
}finally{await browser.close();await server.close();}
