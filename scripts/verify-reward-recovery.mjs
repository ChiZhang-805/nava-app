import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';

const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/completion-recovery';
await mkdir(output, { recursive: true });
const before = process.argv.includes('--before');
const fixture = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import RewardCelebration from '/src/components/RewardCelebration.tsx';import '/src/styles/app-skins.css';
function Fixture(){const[show,setShow]=useState(false),[taps,setTaps]=useState(0);return React.createElement('div',{className:'phone-frame','data-app-skin':new URLSearchParams(location.search).get('skin')||'glacier-mist',style:{position:'relative',height:'100dvh',width:'100%',background:'var(--skin-page-background)',color:'var(--skin-ink)',overflow:'hidden'}},
React.createElement('main',{style:{padding:'70px 24px'}},React.createElement('h1',null,'Saved progress'),React.createElement('p',null,'The record is already saved. The celebration is optional.'),React.createElement('button',{id:'trigger',onClick:()=>setShow(true)},'Celebrate'),React.createElement('button',{id:'underlying',onClick:()=>setTaps(v=>v+1)},'Continue using the page'),React.createElement('p',{id:'taps'},taps)),
show&&React.createElement(RewardCelebration,{sceneOverride:'03',locale:'en',onDismiss:()=>{window.dismissed=(window.dismissed||0)+1;setShow(false)}}))};
createRoot(document.getElementById('root')).render(React.createElement(Fixture));`;
const server = await createServer({server:{host:'127.0.0.1',port:5317,strictPort:true},logLevel:'silent',plugins:[{name:'reward-fixture',resolveId:id=>id==='/__reward-fixture.js'?'\0reward-fixture.js':undefined,load:id=>id==='\0reward-fixture.js'?fixture:undefined}]});
await server.listen();
const html = await server.transformIndexHtml('/reward-check','<html><head><style>html,body{margin:0}button{padding:14px;margin:8px 0;display:block;font-size:16px}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/__reward-fixture.js"></script></body></html>');
const report={passed:false,scope:'Real RewardCelebration and journal completion iframe interactions in browser; local presentation fixtures, no ledger writes or native-iOS claim.',results:[],errors:[]};
try{
 for(const[engine,type]of(before?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]])){
  const browser=await type.launch();
  try{
   for(const skin of before?['violet-dusk']:['glacier-mist','violet-dusk','sky-ripple']){
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.route('**/reward-check*',route=>route.fulfill({contentType:'text/html',body:html}));
    // Hold decoding after the document has loaded: a repeatable slow-asset case
    // that exercises the actual parent/child MessageChannel handshake.
    await page.addInitScript(()=>{
     const original=HTMLImageElement.prototype.decode;
     HTMLImageElement.prototype.decode=function(){const image=this;return new Promise(resolve=>{window.releaseDecode=()=>original.call(image).catch(()=>{}).then(resolve)});};
    });
    await page.goto(`http://127.0.0.1:5317/reward-check?skin=${skin}`);
    await page.locator('#trigger').click();
    if(before){
     await expect(page.locator('.completion-celebration-layer[data-ready="true"]')).toBeVisible({timeout:7000});
     const green=await page.locator('.completion-celebration-layer').evaluate(el=>getComputedStyle(el).backgroundColor);
     assert.equal(green,'rgb(229, 241, 220)');
     await page.screenshot({path:`${output}/before-green-blank.png`});
     report.results.push({engine,skin,blankGreenReproduced:true,background:green});
    }else{
     await page.locator('#underlying').click();
     await expect(page.locator('#taps')).toHaveText('1');
     await expect(page.locator('.completion-celebration-layer')).toHaveCount(0,{timeout:6500});
     assert.equal(await page.evaluate(()=>window.dismissed),1);
     await page.screenshot({path:`${output}/${engine}-${skin}-slow-stays-on-page.png`});
     report.results.push({engine,skin,slowAssetsDoNotCoverPage:true,loadingDoesNotLockPage:true,dismissedOnce:true});
    }
    await page.close();
   }
   if(!before){
    const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',error=>report.errors.push(error.message));
    await page.route('**/reward-check*',route=>route.fulfill({contentType:'text/html',body:html}));
    await page.goto('http://127.0.0.1:5317/reward-check?skin=violet-dusk');
    await page.locator('#trigger').focus();
    await page.locator('#trigger').press('Enter');
    await expect(page.locator('.completion-celebration-layer[data-ready="true"]')).toBeVisible();
    assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
    const frame=page.frameLocator('iframe');
    assert.equal(await frame.locator('.celebration-garden').evaluate(el=>!el.hidden&&[...el.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0)),true);
    await frame.locator('.garden-message').click();
    await expect(frame.locator('.celebration-garden')).toHaveAttribute('data-revealed','true');
    await page.screenshot({path:`${output}/${engine}-ready-composition.png`});
    await frame.locator('.scene-continue').click();
    await expect(page.locator('.completion-celebration-layer')).toHaveCount(0);
    await expect(page.locator('#trigger')).toBeFocused();
    assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
    assert.equal(await page.evaluate(()=>window.dismissed),1);
    // Broken scene artwork must not expose its fallback green canvas either.
    await page.route('**/journal/assets/completion/scene-03-cat-laptop.png',route=>route.abort());
    await page.locator('#trigger').click();
    await expect(page.locator('.completion-celebration-layer')).toHaveCount(0,{timeout:6500});
    assert.equal(await page.evaluate(()=>window.dismissed),2);
    await page.screenshot({path:`${output}/${engine}-failed-art-stays-on-page.png`});
    report.results.push({engine,readyOnlyAfterDecoded:true,continueWorks:true,focusRestored:true,brokenAssetsDismiss:true});
    await page.close();
   }
  }finally{await browser.close();}
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.errors.push(error.stack??String(error));}
finally{await server.close();await writeFile(`${output}/${before?'before-':''}report.json`,JSON.stringify(report,null,2));}
if(!report.passed)throw new Error(report.errors.join('\n'));
console.log(before?'Reproduced blank green completion fallback.':'Completion slow/failure/ready interactions passed in Chromium and WebKit across three skins.');
