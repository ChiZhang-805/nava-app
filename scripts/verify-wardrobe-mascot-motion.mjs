import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {applyProjectPublicEnv} from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const output=process.env.NAVA_WARDROBE_EVIDENCE_DIR?`${process.env.NAVA_WARDROBE_EVIDENCE_DIR}/motion`:'Q:/NAVA-Workspace/Build/TestRuns/wardrobe-mascot-motion';await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5261,strictPort:true},logLevel:'silent'});await server.listen();
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const actions=[['wave',3200],['yarn',5000],['stretch',3500]],report={passed:false,sizes:[],errors:[]};
async function open(width,height,reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion});
 await context.addInitScript(()=>{sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}))});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.clock.install();
 await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=profile&view=wardrobe`,{waitUntil:'networkidle'});
 if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();
 const character=page.locator('.mascot-wardrobe-character');await expect(character).toHaveAttribute('data-renderer','ready',{timeout:30000});
 await page.locator('.mascot-wardrobe').evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})))});
 return{context,page,character,stage:page.locator('.mascot-wardrobe-preview'),canvas:page.locator('.mascot-wardrobe-turntable')};
}
try{
 for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]]){
  const v=await open(width,height);await v.page.clock.pauseAt(await v.page.evaluate(()=>Date.now()));
  const item={viewport:`${width}x${height}`,actions:[]};
  for(const [id,duration] of actions){
   const before=await v.stage.screenshot();await v.character.click();await expect(v.character).toHaveAttribute('data-motion',id);
   await v.page.clock.runFor(duration*.43);
   assert.match(await v.character.evaluate(e=>e.style.transform),/^translate3d\(0(?:px)?, 0(?:px)?, 0(?:px)?\)$/);
   const during=await v.stage.screenshot({path:`${output}/${id}-${width}x${height}.png`});assert.equal(before.equals(during),false);
   await v.page.clock.runFor(duration);await expect(v.character).toHaveAttribute('data-motion','rest');
   assert.equal(before.equals(await v.stage.screenshot()),true,`${width}/${id}: exact rest`);item.actions.push(id);
  }
  if(width===390){
   await v.page.getByRole('tab',{name:'饰品'}).click();await v.page.locator('.mascot-wardrobe-item').filter({hasText:'云蓝围巾'}).click();
   await expect(v.canvas).toHaveAttribute('data-worn-model','accessory-cloud-scarf',{timeout:30000});await v.page.clock.runFor(50);
   await v.character.focus();await v.page.keyboard.press('ArrowRight');await v.page.keyboard.press('ArrowRight');await v.character.evaluate(e=>e.blur());
   await v.page.clock.runFor(50);const before=await v.stage.screenshot();await v.character.click();await v.page.clock.runFor(1500);
   await v.page.locator('.mascot-wardrobe-item').filter({hasText:'雾紫贝雷帽'}).click();
   await expect(v.canvas).toHaveAttribute('data-worn-model','accessory-mist-beret',{timeout:30000});
   await expect(v.character).toHaveAttribute('data-motion','wave');await v.page.clock.runFor(3500);
   await expect(v.character).toHaveAttribute('data-motion','rest');await expect(v.canvas).toHaveAttribute('data-angle','30');
   assert.equal(before.equals(await v.stage.screenshot()),false,'changed accessory is retained after motion');
   await v.character.click();await v.page.clock.runFor(2000);await v.page.emulateMedia({reducedMotion:'reduce'});await v.page.clock.runFor(50);
   await expect(v.character).toHaveAttribute('data-motion','rest');await expect(v.character).toBeDisabled();
   item.switchDuringMotion='latest model preserves motion time and yaw';item.reducedMotion='restored';
  }
  report.sizes.push(item);await v.context.close();console.log(JSON.stringify(item));
 }
 const reduced=await open(390,844,'reduce');await expect(reduced.character).toBeDisabled();await reduced.character.evaluate(e=>e.click());await expect(reduced.character).toHaveAttribute('data-motion','rest');await reduced.context.close();
 assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.errors.push(error.stack??String(error))}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close()}
if(!report.passed)throw new Error(report.errors.join('\n'));
