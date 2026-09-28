// Local-only demo shell, never public authentication bypass or production writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/Build/TestRuns/cold-start';await mkdir(out,{recursive:true});
const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:5269,strictPort:true}});await server.listen();
const browser=await chromium.launch();const results=[];
try{
 for(const [width,height] of [[360,740],[375,812],[390,844],[430,932],[1440,1080]]){
  const context=await browser.newContext({viewport:{width,height},locale:'zh-CN',hasTouch:width<700,isMobile:width<700});
  await context.route('**/rest/v1/journal_entries*',route=>route.fulfill({json:[]}));
  await context.route('**/rest/v1/journal_preferences*',route=>route.fulfill({json:{settings:{}}}));
  await context.addInitScript(()=>{sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale','zh');localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,completedAt:new Date().toISOString(),version:3,answers:{},source:'local'}));});
  const page=await context.newPage();
  await page.addLocatorHandler(page.locator('.completion-celebration-layer'),async()=>{await page.frameLocator('.completion-celebration-layer iframe').getByRole('button',{name:/Continue|继续/}).click();});
  await page.goto('http://127.0.0.1:5269/?demo=1#tab=today&view=getting-started');
  await expect(page.locator('.cold-start-header')).toBeVisible({timeout:30000});
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  const geometry=await page.evaluate(()=>{
   const s=document.querySelector('.cold-start-screen'),h=document.querySelector('.cold-start-header').getBoundingClientRect(),f=document.querySelector('.cold-primary').getBoundingClientRect(),p=document.querySelector('.phone-frame').getBoundingClientRect(),d=document.querySelector('.nava-device-cutout')?.getBoundingClientRect();return {overflow:s.scrollWidth-s.clientWidth,header:h.top,cutout:d?.bottom??null,footer:f.bottom,bottom:p.bottom};
  });
  assert.ok(geometry.overflow<=1);assert.ok(geometry.footer<geometry.bottom-10);if(width>700)assert.ok(geometry.header>geometry.cutout+5,JSON.stringify(geometry));
  await page.screenshot({path:`${out}/shell-hub-${width}.png`});
  await page.locator('.cold-start-header').getByRole('button',{name:'更多选项'}).click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'带我记录一次',exact:true}).click();await expect(page.frameLocator('.journal-experience iframe').locator('#cold-guide')).toBeVisible({timeout:30000});
  await page.screenshot({path:`${out}/shell-guide-${width}.png`});
  results.push({width,height,geometry});await context.close();
 }
 await writeFile(out+'/shell-report.json',JSON.stringify(results,null,2));console.log('Cold-start shell: five viewports passed.');
}finally{await browser.close();await server.close();}
