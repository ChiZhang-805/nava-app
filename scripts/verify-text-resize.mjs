import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {applyProjectPublicEnv} from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const out=`Q:/NAVA-Workspace/Build/TestRuns/mobile-layout/text-resize-${engine}`;await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5285,strictPort:true},logLevel:'silent'});await server.listen();
const browser=await ({chromium,webkit}[engine]).launch();const results=[];
try {
 for(const locale of ['en','zh'])for(const width of [320,390,430])for(const route of ['today','profile','profile&view=account','ai']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale','en');localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));});
  await context.addInitScript(locale=>localStorage.setItem('nava.locale',locale),locale);
  await context.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
  const page=await context.newPage();await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=${route}`,{waitUntil:'networkidle'});
  if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();
  // Stress text independently of viewport zoom. This is not native Dynamic Type.
  await page.evaluate(()=>{
   const sizes=[...document.querySelectorAll('.phone-frame *')].filter(e=>e instanceof HTMLElement && ([...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())||e.matches('input,textarea'))).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);
   for(const [e,size]of sizes)e.style.fontSize=`${size*2}px`;
  });
  if(route==='today') {
   await expect(page.locator('.home-widget-grid')).toHaveClass(/is-large-text/);
   const cards=page.locator('.home-health-widget');
   for(let i=0;i<await cards.count();i++) {
    await cards.nth(i).scrollIntoViewIfNeeded();
    expect(await cards.nth(i).evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(3);
    expect(await cards.nth(i).locator('strong').evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(3);
   }
   await page.locator('.home-widget-grid').evaluate(e=>e.scrollTop=0);
   const first=page.locator('.home-health-widget[data-home-widget-position="1"]');
   const id=await first.getAttribute('data-home-widget');
   await first.focus();await first.press('Shift+Enter');await first.press('ArrowDown');
   await expect(page.locator(`.home-health-widget[data-home-widget="${id}"]`)).toHaveAttribute('data-home-widget-position','2');
   await page.keyboard.press('Escape');
   await page.locator('.home-widget-grid').evaluate(e=>e.scrollTop=0);
  }
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.phone-frame button,.phone-frame input,.phone-frame h1')].filter(e=>e.getClientRects().length&&e.textContent?.trim()&&e.scrollWidth>e.clientWidth+3&&getComputedStyle(e).textOverflow!=='ellipsis').map(e=>({class:e.className,text:e.textContent?.trim().slice(0,60),overflow:e.scrollWidth-e.clientWidth})));
  await page.screenshot({path:`${out}/${locale}-${width}-${route.replaceAll('&','-')}.png`,animations:'disabled'});results.push({locale,width,route,overflow});await context.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify({scope:'Synthetic 200% text stress; not iOS Dynamic Type',engine,results},null,2));expect(results.filter(r=>r.overflow.length)).toEqual([]);console.log(JSON.stringify({passed:true,engine,states:results.length}));
}finally{await browser.close();await server.close();}
