import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {applyProjectPublicEnv} from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/product-feedback';
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
const results=[],errors=[];
try {
for(const [engine,type] of Object.entries(process.env.NAVA_LAYOUT_ENGINE==='webkit'?{webkit}:process.env.NAVA_LAYOUT_ENGINE==='chromium'?{chromium}:{chromium,webkit})){
 const browser=await type.launch();
 try {for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale','zh');
   localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
  });
  await context.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const open=async hash=>{await page.goto(`${server.resolvedUrls.local[0]}?demo=1#${hash}`,{waitUntil:'domcontentloaded'});};
  await open('tab=today');
  await expect(page.locator('.home-health-widget')).toHaveCount(6);
  const headerGeometry=await page.evaluate(()=>{
   const rect=s=>document.querySelector(s).getBoundingClientRect();const a=rect('.option-two-scores'),b=rect('.option-two-menu-toggle'),c=rect('.home-widget-grid');
   return {leftDelta:a.left-c.left,rightDelta:b.right-c.right,centerDelta:a.top+a.height/2-b.top-b.height/2,gap:c.top-Math.max(a.bottom,b.bottom)};
  });
  expect(Math.abs(headerGeometry.leftDelta)).toBeLessThan(1);expect(Math.abs(headerGeometry.rightDelta)).toBeLessThan(1);expect(Math.abs(headerGeometry.centerDelta)).toBeLessThan(1);expect(Math.abs(headerGeometry.gap-16)).toBeLessThan(1);
  await page.locator('.home-record-shortcut-hint').click();await expect(page.locator('.option-two-health-menu')).toHaveAttribute('aria-hidden','false');
  await page.locator('.home-record-shortcut-hint').click();await expect(page.locator('.option-two-health-menu')).toHaveAttribute('aria-hidden','true');
  await expect(page.locator('.option-two-health-menu')).toHaveCSS('opacity','0');
  await page.screenshot({path:`${out}/${engine}-${width}-home.png`});
  if(process.env.NAVA_HOME_ONLY==='1'){
   const mascot=await page.locator('.option-two-life-stage').evaluate(node=>({bottom:parseFloat(getComputedStyle(node).bottom),width:node.getBoundingClientRect().width}));
   expect(mascot.bottom).toBe(width<=370||height<=760?52:62);
   expect(Math.abs(mascot.width-Math.min(width*.93,width<=370||height<=760?365:400))).toBeLessThan(1);
   results.push({engine,width,height,headerGeometry,mascot});await context.close();console.log(engine,width,'home alignment and unchanged mascot passed');continue;
  }
  await page.locator('.option-two-scores > button').first().click();await expect(page).toHaveURL(/#tab=record$/);
  await open('tab=today');await page.locator('.option-two-scores > button').nth(1).click();await expect(page).toHaveURL(/view=points-shop/);
  await open('tab=trends');await page.locator('.growth-level-details-toggle').click();await expect(page.locator('#growth-level-details')).toContainText('100 XP');await page.screenshot({path:`${out}/${engine}-${width}-levels.png`});
  await open('tab=today&view=profile-details');await page.locator('.advanced-profile-form > button.secondary-button').click();await expect(page.locator('.advanced-profile-screen')).toHaveCount(0);
  await open('tab=ai');await expect(page.getByText('瓦咪儿',{exact:true}).first()).toBeVisible();await expect(page.locator('.chat-avatar.assistant svg').first()).toBeVisible();
  await open('tab=record&module=focus&view=editor');
  const frame=page.frameLocator('.journal-experience iframe');
  await expect(frame.locator('#screen')).toHaveAttribute('data-scene','entry',{timeout:30000});await expect(frame.locator('#cold-guide')).toBeHidden();
  await frame.locator('#field-task').fill('阅读');await frame.locator('#field-task').press('Enter');await expect(frame.locator('#field-durationMinutes')).toBeFocused();
  await page.screenshot({path:`${out}/${engine}-${width}-entry.png`});
  await frame.locator('#entry-more').click();await frame.locator('[data-action=guide]').click();await expect(frame.locator('#cold-guide')).toBeVisible();await frame.locator('#cold-guide-skip').focus();await frame.locator('#cold-guide-skip').press('Enter');await expect(frame.locator('#cold-guide')).toBeHidden();
  await open('tab=record');
  await page.evaluate(()=>{const date=new Date(),day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');localStorage.setItem('nava.review.demo.journal.v1',JSON.stringify([{id:'feedback-face',category:'face',recordDate:day,data:{feeling:'精神还好',eyeArea:'没有明显阴影',skinAppearance:'自然光下肤色均匀'},createdAt:date.toISOString(),version:1}]));});
  await page.locator('[data-record-module=face]').click();
  await expect(frame.locator('#screen')).toHaveAttribute('data-scene','review',{timeout:30000});
  await page.screenshot({path:`${out}/${engine}-${width}-face-review.png`});
  await frame.locator('.review-face-details').click();await expect(frame.locator('#sheet-body')).toContainText('自然光下肤色均匀');await frame.locator('#sheet-close').click();
  await frame.locator('.review-add-entry').click();await expect(frame.locator('#screen')).toHaveAttribute('data-scene','entry');await frame.locator('#back').click();await expect(frame.locator('#screen')).toHaveAttribute('data-scene','review');
  await frame.locator('.review-add-entry').click();await frame.locator('#photo-preview').click();
  const chooserPromise=page.waitForEvent('filechooser');await frame.locator('#sheet-body').getByRole('button',{name:'选择照片',exact:true}).click();const chooser=await chooserPromise;
  await expect(frame.locator('#sheet-layer')).toBeVisible();await expect(frame.locator('#screen')).toHaveAttribute('data-scene','entry');
  await chooser.setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
  await expect(frame.locator('#sheet-layer')).toBeHidden();await expect(frame.locator('#photo-preview img')).toBeVisible();
  await frame.locator('#back').click();await frame.locator('#review-home').click();await expect(page).toHaveURL(/#tab=record$/);
  results.push({engine,width,height,checks:['home-actions','shortcut-discovery','level-details','profile-bottom-back','cat-avatar','optional-guide','enter-next','skip-with-keyboard','face-observations','new-entry-back','photo-picker','review-back']});
  await context.close();console.log(engine,width,'passed');
 }}finally{await browser.close();}
}
if(errors.length)throw Error(errors.join('\n'));
}finally{await writeFile(`${out}/report-${process.env.NAVA_LAYOUT_ENGINE||'both'}.json`,JSON.stringify({results,errors},null,2));await server.close();}
