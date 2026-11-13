import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const out=`Q:/NAVA-Workspace/Build/TestRuns/App-Checks/mobile-layout/navigation-${engine}`;
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
const browser=await({chromium,webkit}[engine]).launch();
const results=[],errors=[];
try {
 for(const locale of ['zh','en']) for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(locale=>{
   sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale',locale);
   localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
  },locale);
  await context.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const open=async hash=>{await page.goto(`${server.resolvedUrls.local[0]}?demo=1#${hash}`,{waitUntil:'networkidle'});if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();};
  const record=name=>results.push({locale,width,height,name});
  const tab=async id=>{await expect(page).toHaveURL(new RegExp(`#tab=${id}$`));if(id==='ai')await expect(page.locator('.chat-composer')).toBeVisible();else await expect(page.locator(`.bottom-nav [data-tab="${id}"]`)).toHaveAttribute('aria-current','page');await expect(page.locator('.phone-frame > .app-content')).toBeVisible();record(`tab-${id}`);};
  await open('tab=today');await tab('today');
  const tabs=['record','trends','profile'];
  for(const id of tabs){await page.locator(`.bottom-nav [data-tab="${id}"]`).click();await tab(id);}
  const depth=await page.evaluate(()=>history.state.depth);
  await page.locator('.bottom-nav [data-tab="profile"]').click();
  expect(await page.evaluate(()=>history.state.depth)).toBe(depth);record('same-tab-no-history-duplication');
  await page.locator('.bottom-nav [data-tab="ai"]').click();await tab('ai');
  for(const id of ['profile','trends','record','today']){await page.goBack();await tab(id);}
  for(const id of [...tabs,'ai']){await page.goForward();await tab(id);}
  await page.reload({waitUntil:'networkidle'});if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();await tab('ai');
  await open('tab=today&view=notifications');
  await page.locator('.nava-more-trigger').click();await page.getByRole('menuitem',{name:/提醒设置|Reminder settings/}).click();
  await expect(page).toHaveURL(/view=reminder-settings/);record('notifications-to-settings');
  await page.getByRole('button',{name:/返回通知中心|Back to notifications/}).click();
  await expect(page).toHaveURL(/view=notifications/);record('settings-return-restores-history');
  await open('tab=today&view=reminder-settings');
  await page.getByRole('button',{name:/返回通知中心|Back to notifications/}).click();
  await expect(page).toHaveURL(/view=notifications/);record('direct-entry-back-fallback');
  for(const date of ['invalid','2026-02-30']){await open(`tab=today&view=day-${date}`);await expect(page.locator('[data-home-view="calendar"]')).toBeVisible();record('invalid-date-recovery');}
  await open('tab=unknown');await expect(page.locator('.bottom-nav [data-tab="today"]')).toHaveAttribute('aria-current','page');record('unknown-tab-recovery');
  await page.screenshot({path:`${out}/${locale}-${width}.png`,animations:'disabled'});
  await context.close();console.log(`${engine} ${locale} ${width} navigation passed`);
 }
 if(errors.length)throw new Error(errors.join('\n'));
}catch(error){process.exitCode=1;errors.push(String(error));}
finally{await writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({checks:results.length,errors}));await browser.close();await server.close();}
