import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/wardrobe-v3/runtime/renderer';
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile('scripts/mascot-models/wardrobe-production.json','utf8'));
const server=await createServer({server:{host:'127.0.0.1',port:5297,strictPort:true},logLevel:'silent',plugins:[{name:'wardrobe-test-harness',configureServer(server){server.middlewares.use('/__wardrobe-check',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body style="margin:0;background:#dcecf9"><canvas style="display:block;width:640px;height:640px"></canvas></body></html>')})}}]});
await server.listen();
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:640,height:640},deviceScaleFactor:1,recordVideo:{dir:output,size:{width:640,height:640}}});
const page=await context.newPage(),report={passed:false,looks:[],errors:[],requests:[]};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('response',r=>{if(r.url().includes('.glb')||r.url().includes('canonical-cat-v9.jpg'))report.requests.push({url:new URL(r.url()).pathname,status:r.status()})});
try{
 await page.goto('http://127.0.0.1:5297/__wardrobe-check');
 await page.evaluate(async()=>{
  const {createWardrobeScene}=await import('/src/services/wardrobeScene.ts');
  window.wardrobe=await createWardrobeScene(document.querySelector('canvas'),new AbortController().signal);
  window.wardrobe.render();
 });
 const canvas=page.locator('canvas');
 for(const slug of ['base',...manifest.items.map(i=>i.slug)]){
  const id=slug==='base'?'none':'accessory-'+slug;
  const started=Date.now();
  await page.evaluate(id=>{window.wardrobe.setMotion(null,0);window.wardrobe.setAngle(0);window.wardrobe.setLook('skin-cream',id==='none'?[]:[id]);},id);
  await page.waitForFunction(id=>document.querySelector('canvas').dataset.wornModel===id,id,{timeout:30000});
  await page.evaluate(()=>window.wardrobe.render());
  const before=await canvas.screenshot({path:`${output}/${slug}-front.png`});
  const entry={slug,firstSwitchMs:Date.now()-started,actions:[]};
  for(const [motion,at] of [['wave',.48],['yarn',.43],['stretch',.5]]){
   await page.evaluate(([m,t])=>window.wardrobe.setMotion(m,t),[motion,at]);
   const during=await canvas.screenshot({path:`${output}/${slug}-${motion}.png`});
   assert.equal(before.equals(during),false,slug+'/'+motion+' must articulate');
   await page.evaluate(()=>window.wardrobe.setMotion(null,0));
   const after=await canvas.screenshot();
   assert.equal(before.equals(after),true,slug+'/'+motion+' exact still recovery');
   entry.actions.push(motion);
  }
  await page.evaluate(()=>{window.wardrobe.setAngle(90);window.wardrobe.render()});
  await canvas.screenshot({path:`${output}/${slug}-side.png`});
  report.looks.push(entry);console.log(JSON.stringify(entry));
 }
 // Exercise reuse of parsed models after catalog traversal.
 report.warmSwitchMs=[];
 for(const id of ['accessory-lily-garland','accessory-night-voyage-cap','accessory-lily-garland']){
  report.warmSwitchMs.push(await page.evaluate(async id=>{
   const start=performance.now();window.wardrobe.setLook('skin-cream',[id]);
   await new Promise(done=>{function check(){if(document.querySelector('canvas').dataset.wornModel===id){window.wardrobe.render();done()}else requestAnimationFrame(check)}check()});
   return performance.now()-start;
  },id));
 }
 await page.evaluate(()=>{window.wardrobe.setAngle(0);window.wardrobe.setLook('skin-cream',['accessory-bell-collar']);window.wardrobe.setLook('skin-cream',['accessory-raindrop-cape']);});
 await page.waitForFunction(()=>document.querySelector('canvas').dataset.wornModel==='accessory-raindrop-cape');
 await page.evaluate(()=>window.wardrobe.render());
 await canvas.screenshot({path:`${output}/cape-final.png`});
 // Record actual wall-clock playback, including paw contact and release.
 for(const [motion,duration] of [['wave',3200],['yarn',5000],['stretch',3500]]){
  await page.evaluate(async([motion,duration])=>{
   await new Promise(done=>{let start;function tick(now){start??=now;const t=Math.min(1,(now-start)/duration);window.wardrobe.setMotion(motion,t);if(t<1)requestAnimationFrame(tick);else done()}requestAnimationFrame(tick)});
   window.wardrobe.setMotion(null,0);
  },[motion,duration]);
 }
 // Fresh scene, empty model cache: paused prefetch and foreground requests share
 // one download. A slow older request cannot replace the latest selected look.
 const slow=await context.newPage();
 let release,requests=0;
 const gate=new Promise(resolve=>{release=resolve});
 await slow.route('**/bell-collar.glb',async route=>{requests++;await gate;await route.continue()});
 await slow.goto('http://127.0.0.1:5297/__wardrobe-check');
 await slow.evaluate(async()=>{const {createWardrobeScene}=await import('/src/services/wardrobeScene.ts');window.wardrobe=await createWardrobeScene(document.querySelector('canvas'),new AbortController().signal);window.wardrobe.render()});
 const beforeDelay=await slow.locator('canvas').screenshot();
 await slow.evaluate(()=>{window.wardrobe.prefetch(['accessory-bell-collar']);window.wardrobe.setLook('skin-cream',['accessory-bell-collar'])});
 await slow.waitForTimeout(150);
 assert.equal(await slow.locator('canvas').getAttribute('data-worn-model'),'none');
 assert.equal(beforeDelay.equals(await slow.locator('canvas').screenshot()),true,'slow request keeps current rendered cat');
 await slow.evaluate(()=>window.wardrobe.setLook('skin-cream',['accessory-raindrop-cape']));
 await slow.waitForFunction(()=>document.querySelector('canvas').dataset.wornModel==='accessory-raindrop-cape');
 release();await slow.waitForTimeout(700);
 assert.equal(await slow.locator('canvas').getAttribute('data-worn-model'),'accessory-raindrop-cape');
 assert.equal(requests,1,'prefetch + foreground share the in-flight request');
 await slow.route('**/fish-brooch.glb',route=>route.abort());
 await slow.evaluate(()=>window.wardrobe.setLook('skin-cream',['accessory-fish-brooch']));
 await slow.waitForFunction(()=>document.querySelector('canvas').dataset.modelError==='accessory-fish-brooch');
 assert.equal(await slow.locator('canvas').getAttribute('data-worn-model'),'accessory-raindrop-cape');
 await slow.evaluate(()=>window.wardrobe.dispose());await slow.close();
 report.loadingBoundaries={keepsCurrentOnSlowLoad:true,latestChoiceWins:true,inflightDeduplicated:true,errorRetainsCurrent:true};
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.passed=true;
}catch(error){report.errors.push(error.stack??String(error))}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await context.close();await browser.close();await server.close()}
if(!report.passed)throw new Error(report.errors.join('\n'));
