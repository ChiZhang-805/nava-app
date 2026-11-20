import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const out=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/mobile-layout/navigation-${engine}`;
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
  const home=page.locator('.option-two-home');
  const hint=page.locator('.home-record-shortcut-hint');
  const initialDepth=await page.evaluate(()=>history.state.depth);
  const visiblePlaceholders=page.locator('.journal-experience, [data-page-skeleton]').filter({visible:true});

  const holdPage=async (pattern, action, verifyWhileWaiting) => {
    let release;
    const pause=new Promise(resolve=>{release=resolve;});
    const delay=async route=>{await pause;await route.continue().catch(()=>{});};
    await page.route(pattern,delay);
    try {
      const requested=page.waitForRequest(pattern);
      await action();
      await requested;
      await verifyWhileWaiting();
    } finally { release(); await page.unroute(pattern,delay); }
  };
  const assertHomeHeld=async()=>{
    await expect(home).toBeVisible();
    await expect(page.locator('.bottom-nav [data-tab="today"]')).toHaveAttribute('aria-current','page');
    await expect(page).toHaveURL(/#tab=today$/);
    expect(await page.evaluate(()=>history.state.depth)).toBe(initialDepth);
    await expect(visiblePlaceholders).toHaveCount(0);
  };
  await holdPage('**/src/features/RecordsScreen.tsx*',()=>page.locator('.bottom-nav [data-tab="record"]').click(),assertHomeHeld);
  await tab('record');
  await expect(page.locator('.record-hub--explorer')).toBeVisible();
  await page.goBack(); await tab('today');
  const categories=['mood','sleep','exercise','diet','focus','face'];
  const sizeIndex=[320,375,390,430].indexOf(width);
  const module=categories[(sizeIndex+(locale==='en'?4:0))%categories.length];
  await hint.click();
  await holdPage('**/journal/js/app.js*',()=>home.locator(`[data-health-module="${module}"]`).click(),async()=>{
    await expect(page.locator('.journal-experience.is-staged')).toBeAttached();
    await assertHomeHeld();
  });
  const journal=page.locator('.phone-frame > .journal-experience:not(.is-staged) iframe');
  await expect(journal).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[#&]module=${module}(?:&|$)`));
  await expect(page.frameLocator('.journal-experience iframe').locator('#loading')).toBeHidden();
  const dimensions=await journal.evaluate(frame=>({frame:frame.getBoundingClientRect().toJSON(),shell:frame.closest('.phone-frame').getBoundingClientRect().toJSON()}));
  expect(Math.abs(dimensions.frame.height-dimensions.shell.height)).toBeLessThan(1);
  await page.goBack();await tab('today');
  await hint.click();
  await holdPage('**/journal/js/app.js*',()=>home.locator('[data-health-module="mood"]').click(),async()=>{
    await page.locator('.bottom-nav [data-tab="profile"]').evaluate(button=>button.click());
    await tab('profile');
    await expect(page.locator('.journal-experience')).toHaveCount(0);
  });
  await expect(page.locator('.bottom-nav [data-tab="profile"]')).toHaveAttribute('aria-current','page');
  await page.goBack();await tab('today');
  record(`record-preparation-${module}-and-cancellation`);

  const dockSizes=()=>page.locator('.bottom-nav .nav-button').evaluateAll(buttons=>buttons.map(button=>{
    const glyph=button.querySelector('.figma-nav-icon, .figma-nav-ai-chat');
    return {width:glyph.offsetWidth??glyph.getBoundingClientRect().width,target:button.offsetWidth};
  }));
  const homeDock=await dockSizes();
  const tabs=['record','trends','profile'];
  for(const id of tabs){await page.locator(`.bottom-nav [data-tab="${id}"]`).click();await tab(id);
    if(id!=='trends')continue;
    await expect(page.locator('.growth-task-card').last()).toBeVisible();
    const growthDock=await dockSizes();
    expect(homeDock.every((glyph,i)=>Math.abs(glyph.width-growthDock[i].width)<1 && glyph.target>=44)).toBe(true);
    const lastGeometry=await page.locator('.app-content--trends').evaluate(scroller=>{
      scroller.scrollTop=scroller.scrollHeight;
      const last=scroller.querySelector('.growth-task-card:last-of-type');
      const finalCard=[...scroller.querySelectorAll('.growth-task-card')].at(-1) ?? last;
      const dock=document.querySelector('.bottom-nav .ai-nav-button');
      return {gap:dock.getBoundingClientRect().top-finalCard.getBoundingClientRect().bottom,
        remaining:scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop};
    });
    expect(lastGeometry.remaining).toBeLessThan(1.5);
    expect(lastGeometry.gap).toBeGreaterThanOrEqual(12);
    expect(lastGeometry.gap).toBeLessThanOrEqual(20);
    record('growth-end-gap-and-dock-size');
  }
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
