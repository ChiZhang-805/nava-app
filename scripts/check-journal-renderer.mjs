import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'});
 await page.route('**/__renderer-check',r=>r.fulfill({contentType:'text/html',body:`<link rel='stylesheet' href='/src/styles/global.css'><link rel='stylesheet' href='/src/styles/figma-v2.css'><link rel='stylesheet' href='/src/features/journal-experience.css'><div id='root'><div class='nava-app-stage'><div class='phone-frame phone-frame--journal'><div class='safe-top'></div><main class='app-content app-content--record'><div class='screen-panel'><section class='journal-experience'><iframe src='/journal/index.html?debug=1'></iframe></section></div></main></div></div></div><script>addEventListener('load',()=>{const c=new MessageChannel();window.journalViewport=(visibleHeight,safeTop,safeBottom)=>c.port1.postMessage({type:'viewport',visibleHeight,safeTop,safeBottom});c.port1.onmessage=({data})=>c.port1.postMessage({id:data.id,result:null});document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'mood',locale:'zh',records:[],settings:{}}},location.origin,[c.port2]);});</script>`}));
 await page.goto('http://localhost:5173/__renderer-check');const frame=page.frames().find(f=>f.url().includes('/journal/'));
 await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready);await page.waitForTimeout(500);
 for(const [width,height]of [[402,874],[420,912],[320,568]]){
  await page.setViewportSize({width,height});await page.evaluate(height=>window.journalViewport(height,68,34),height);await page.waitForTimeout(80);
  await page.screenshot({path:`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/journal-integration/renderer-${width}.png`});
 }
 const inspect=()=>frame.evaluate(()=>{const a=window.FluffyDebug.animation,g=a.actor.mesh?.gl;const p=a.ctx.getImageData(220,400,340,200).data;let visible=0;for(let i=3;i<p.length;i+=4)if(p[i]>30)visible++;return {scene:a.scene,renderer:a.metrics.renderer,failure:a.actor.rendererFailure,mesh:!!g,visiblePixels:visible};});
 const before=await inspect();assert.ok(before.visiblePixels>10000,'Mascot head must be drawn');
 const forced=await frame.evaluate(()=>{const ext=window.FluffyDebug.animation.actor.mesh?.gl.getExtension('WEBGL_lose_context');ext?.loseContext();return !!ext;});
 if(forced)await frame.waitForFunction(()=>!window.FluffyDebug.animation.actor.mesh);
 await page.waitForTimeout(200);const after=await inspect();assert.ok(after.visiblePixels>10000,'Fallback must preserve the mascot');
 if(forced)assert.equal(after.mesh,false);
 writeFileSync('Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/journal-integration/renderer-result.json',JSON.stringify({before,after,forced,passed:true},null,2));
 console.log('Mascot layer and unavailable-GPU fallback verified.');
}finally{await browser.close();}
