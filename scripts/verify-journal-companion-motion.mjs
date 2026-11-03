import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const output=`Q:/NAVA-Workspace/Build/TestRuns/journal-companion-motion/${engine}`;
await mkdir(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5286,strictPort:true}});await server.listen();
const browser=await ({chromium,webkit}[engine]).launch();
const results=[],errors=[];
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1&category=mood"></iframe><script>addEventListener('load',()=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>channel.port1.postMessage({id:data.id,error:'Offline animation fixture'});document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'mood',locale:'zh',records:[],settings:{'fluffy-first-guide-mood':true}}},location.origin,[channel.port2]);});</script>`;
try{
 const page=await browser.newPage({reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__motion',r=>r.fulfill({contentType:'text/html',body:fixture}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.goto(`${server.resolvedUrls.local[0]}__motion`);
 const frame=page.frames().find(f=>f.url().includes('/journal/'));
 await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready);
 for(const [width,height]of [[320,568],[360,740],[375,812],[390,844],[430,932]]){
  await page.setViewportSize({width,height});
  for(const scene of ['entry','review']){
   await frame.evaluate(scene=>{
    const d=window.FluffyDebug,a=d.animation;
    if(scene==='review'){d.openReview('mood');d.review.cancel(false);d.review.queue=[];}
    else d.openEntry('mood');
    a.reducedMotion=false;a.playing=false;a.entrySpeechUntil=0;
    // Render exact controlled states, with no microphone, AI call or record write.
    a.callbacks.onRender=()=>{};
   },scene);
   for(const mode of ['idle','listen','think','talk','wave','nod','idle-return']){
    const result=await frame.evaluate(({scene,mode})=>{
     const a=window.FluffyDebug.animation;
     const c=scene==='entry'?a.entryMotion:a.reviewMotion;
     const targets={listen:mode==='listen'?1:0,think:mode==='think'?1:0,talk:['talk','wave','nod'].includes(mode)?1:0,wave:mode==='wave'?1:0,nod:mode==='nod'?1:0};
     for(let i=0;i<60;i++)c.step(1/60,targets);
     a.idle=mode==='nod'?3.7:1.5;a.render();
     const data=a.ctx.getImageData(0,0,786,1704).data;
     let count=0,minX=786,minY=1704,maxX=0,maxY=0;
     for(let y=0;y<1704;y+=2)for(let x=0;x<786;x+=2)if(data[(y*786+x)*4+3]>128){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
     return {scene,mode,count,bounds:[minX,minY,maxX,maxY],armLength:a.actor.lastArmLength,pose:a.metrics.companionPose,renderer:a.metrics.renderer,renderMs:a.metrics.renderMs,overflow:document.documentElement.scrollWidth>innerWidth+1};
    },{scene,mode});
    assert.ok(result.count>5000);assert.ok(result.armLength<45);
    assert.equal(result.overflow,false);assert.ok(result.bounds[0]>0&&result.bounds[2]<784);
    assert.equal(result.pose.headSleep,scene==='review'?.71:0);
    await page.screenshot({path:`${output}/${width}-${scene}-${mode}.png`});results.push({width,height,...result});
   }
   const still=await frame.evaluate(()=>{
    const a=window.FluffyDebug.animation;a.reducedMotion=true;a.idle=0;a.render();const first=a.canvas.toDataURL();
    a.idle=25;a.render();return first===a.canvas.toDataURL();
   });assert.equal(still,true,'reduced motion must be actually static');
  }
 }
 // Exercise actual tick target selection, including a fast interruption of a visible reply.
 await frame.evaluate(()=>{const d=window.FluffyDebug;d.openEntry('mood');const a=d.animation;a.reducedMotion=false;a.playing=true;a.entrySpeechUntil=0;a.entryMode='listening';});
 await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.entryMotion.values().listen)).toBeGreaterThan(.95);
 await frame.evaluate(()=>{const a=window.FluffyDebug.animation;a.entryMode='thinking';});
 await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.entryMotion.values().think)).toBeGreaterThan(.95);
 await frame.evaluate(()=>{const d=window.FluffyDebug;d.animation.entryMode='idle';d.state.phase='idle';d.bubble('这是一条新的动画测试对白');});
 await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.entryMotion.values().talk)).toBeGreaterThan(.9);
 await frame.evaluate(()=>{document.getElementById('screen').dataset.guideMotion='speaking';window.FluffyDebug.animation.entryMode='listening';});
 await expect.poll(()=>frame.evaluate(()=>window.FluffyDebug.animation.entryMotion.values().talk)).toBeLessThan(.05);
 await frame.evaluate(()=>{delete document.getElementById('screen').dataset.guideMotion;window.FluffyDebug.cancelWork(false);});
 assert.equal(await frame.evaluate(()=>window.FluffyDebug.animation.entrySpeechUntil),0,'cancelled reply must not resume on return to idle');
 const continuity=await frame.evaluate(async()=>{
  const a=window.FluffyDebug.animation;a.setScene('review');a.reviewMode='rest';a.reducedMotion=false;
  const samples=[];
  for(let i=0;i<100;i++){
   if(i%12===0)a.reviewMode=['rest','listen','think','talk'][Math.floor(i/12)%4];
   await new Promise(resolve=>requestAnimationFrame(resolve));
   samples.push({lift:a.metrics.companionPose.headLift,tilt:a.metrics.companionPose.headTilt});
  }
  return samples.slice(1).reduce((max,p,i)=>({lift:Math.max(max.lift,Math.abs(p.lift-samples[i].lift)),tilt:Math.max(max.tilt,Math.abs(p.tilt-samples[i].tilt))}),{lift:0,tilt:0});
 });assert.ok(continuity.lift<2.5&&continuity.tilt<.055,JSON.stringify(continuity));
 // The CPU fallback must retain the same visible head and bounded limb geometry.
 const fallback=await frame.evaluate(()=>{const a=window.FluffyDebug.animation;a.playing=false;a.actor.mesh?.dispose();a.actor.mesh=null;a.render();return {renderer:a.metrics.renderer,armLength:a.actor.lastArmLength,hasCPU:!!a.actor.cpu};});
 assert.equal(fallback.hasCPU,true);assert.ok(fallback.armLength<45);
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/report.json`,JSON.stringify({engine,states:results.length,passed:true,results,fallback,continuity,errors,scope:'Local synthetic states; no production writes or real microphone/AI'},null,2));
 console.log(JSON.stringify({engine,states:results.length,passed:true,fallback}));
}finally{await browser.close();await server.close();}
