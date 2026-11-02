// Layout rules, not a list of phone model names. Intermediate widths catch
// breakpoints that a fixed device preset matrix cannot expose.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/Build/TestRuns/mobile-layout/sweep';
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5281,strictPort:true},logLevel:'silent'});await server.listen();
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
await page.addInitScript(()=>{
 sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');
 localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
});
const routes=['today','record','ai','trends','profile','today&view=calendar','today&view=points-shop-cards','today&view=today-todos','profile&view=personal'];
try{
 await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=today`);await page.waitForSelector('.phone-frame');
 for(const route of routes){
  await page.evaluate(r=>{location.hash=`tab=${r}`;},route);await page.waitForTimeout(350);
  for(let width=320;width<=480;width+=8)for(const height of [568,667,740,812,932,1040]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const measured=await page.locator('.phone-frame').evaluate(root=>{
    const r=root.getBoundingClientRect(),dock=root.querySelector('.bottom-nav');
    const buttons=dock?[...dock.querySelectorAll('button')].map(e=>e.getBoundingClientRect()):[];
    const active=root.querySelector('.app-content');
    return {overflow:root.scrollWidth-root.clientWidth,contentOverflow:active.scrollWidth-active.clientWidth,frameFits:Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1,dockOverlap:buttons.slice(1).some((b,i)=>b.left<buttons[i].right-.5),dockFits:buttons.every(b=>b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&b.top>=0)};
   });
   const passed=measured.overflow<=1&&measured.contentOverflow<=1&&measured.frameFits&&!measured.dockOverlap&&measured.dockFits;
   results.push({route,width,height,passed,...measured});
   if(!passed)await page.screenshot({path:`${out}/${route.replaceAll('&','-').replaceAll('=','-')}-${width}x${height}.png`});
  }
  console.log(`${route}: 126 intermediate viewport states`);
 }
}finally{
 const failed=results.filter(r=>!r.passed);
 await writeFile(`${out}/report.json`,JSON.stringify({scope:'Local synthetic data; no native iOS or Dynamic Type claim',results,failed,errors},null,2));
 console.log(JSON.stringify({states:results.length,failed:failed.length,errors}));
 if(failed.length||errors.length)process.exitCode=1;
 await browser.close();await server.close();
}
