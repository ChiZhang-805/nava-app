import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {applyProjectPublicEnv} from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const out=`Q:/NAVA-Workspace/Build/TestRuns/mobile-layout/overlays-${engine}`;await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5282,strictPort:true},logLevel:'silent'});await server.listen();
const browser=await({chromium,webkit}[engine]).launch();const results=[],errors=[];
try{
 for(const locale of ['zh','en'])for(const [width,height] of [[320,568],[360,740],[375,812],[390,844],[430,932]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(locale=>{
   sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale',locale);
   localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
   const createdAt='2026-01-01T12:00:00Z';
   localStorage.setItem('nava-ai-history:00000000-0000-4000-8000-000000000001',JSON.stringify([{id:'10000000-0000-4000-8000-000000000001',createdAt,dayKey:'2026-01-01',title:'Layout test / 布局检查',messages:[{id:'10000000-0000-4000-8000-000000000002',role:'assistant',content:'Local layout fixture. '.repeat(30),created_at:createdAt}]}]));
  },locale);
  await context.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(engine==='chromium'){
   const protocol=await context.newCDPSession(page);
   await protocol.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:59,bottom:34,topMax:59,bottomMax:34,left:0,right:0}});
  }
  const open=async route=>{await page.goto(`${server.resolvedUrls.local[0]}?demo=1&qa=weekly-ai#tab=${route}`,{waitUntil:'networkidle'});if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();};
  const check=async(name,selector,controls)=>{
   const root=page.locator(selector);await expect(root).toBeVisible();
   const geometry=await root.evaluate(e=>({overflow:e.scrollWidth-e.clientWidth,width:e.getBoundingClientRect().width}));
   const failures=[];if(geometry.overflow>2||geometry.width>width+2)failures.push('horizontal overflow');
   await expect(page.locator(controls).first()).toBeVisible();
   for(const locator of await page.locator(controls).all()){
    if(!await locator.isVisible())continue;
    await locator.scrollIntoViewIfNeeded();
    const accessible=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&hit&&(hit.contains(e)||e.contains(hit));});
    if(!accessible)failures.push(`covered control: ${(await locator.innerText()).slice(0,40)}`);
   }
   await page.screenshot({path:`${out}/${locale}-${width}-${name}.png`,animations:'disabled'});results.push({name,locale,width,height,geometry,failures});
  };
  await open('record');await page.getByRole('tab',{name:/本周报告|Weekly/}).click();
  await expect(page.locator('.weekly-share-button')).toBeEnabled();await page.locator('.weekly-share-button').click();
  await expect(page.locator('.report-share-content img')).toBeVisible();
  await check('weekly-share','.report-share-overlay','.report-share-sheet header button,.report-share-content label,.report-share-sheet footer button');
  await page.keyboard.press('Escape');await expect(page.locator('.report-share-overlay')).toHaveCount(0);
  await open('today&view=today-todos');await page.locator('.today-todo-more > button').click();await page.getByText(locale==='zh'?'切换日期':'Switch date',{exact:true}).click();
  await check('todo-date','.today-todo-date-overlay','.today-todo-date-overlay button,.today-todo-date-overlay input');
  await open('profile&view=account');
  for(const label of locale==='zh'?['修改密码','备用邮箱','备用手机号']:['Change password','Backup email','Backup phone']){
   await page.getByRole('button',{name:new RegExp(label)}).click();
   await check(`security-${label}`,'.profile-security-sheet','.profile-security-sheet input,.profile-security-sheet button');
   await page.locator('.profile-security-sheet > header > button').click();
  }
  await open('ai');await page.locator('.figma-app-header .nava-more-trigger').click();
  await page.getByRole('menuitem',{name:locale==='zh'?'历史':'History',exact:true}).click();
  await check('ai-history','.ai-history-sheet','.ai-history-sheet button');
  const closeHistory=page.locator('.ai-history-sheet > header button');
  await closeHistory.focus();await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.ai-history-delete').last()).toBeFocused();
  await page.keyboard.press('Tab');await expect(closeHistory).toBeFocused();
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('.ai-history-delete').first().click();
  await expect(page.locator('.ai-history-open')).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(page.locator('.ai-history-sheet')).toHaveCount(0);
  await expect(page.locator('.figma-app-header .nava-more-trigger')).toBeFocused();
  await page.locator('.figma-app-header .nava-more-trigger').click();
  await page.getByRole('menuitem',{name:locale==='zh'?'历史':'History',exact:true}).click();
  await page.locator('.ai-history-open').first().click();
  await check('ai-history-detail','.chat-layout','.chat-archive-return button');
  await context.close();console.log(`${engine} ${locale} ${width}: seven current dialog/archive states`);
 }
}finally{
 const failed=results.filter(r=>r.failures.length);await writeFile(`${out}/report.json`,JSON.stringify({results,failed,errors,scope:'Local synthetic data; no real share or account writes'},null,2));
 console.log(JSON.stringify({states:results.length,failed,errors}));if(failed.length||errors.length)process.exitCode=1;
 await browser.close();await server.close();
}
