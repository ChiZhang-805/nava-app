import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const engine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
const output=`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/journal-feedback/${engine}/photo-spotlight`;
await mkdir(output,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5294,strictPort:true}});
await server.listen();
const browser=await ({chromium,webkit}[engine]).launch();
const results=[],errors=[];
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1&category=face"></iframe><script>window.requests=[];addEventListener('load',()=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>{requests.push(data.method);channel.port1.postMessage({id:data.id,result:data.method==='guide-state'?true:undefined});};document.querySelector('iframe').contentWindow.postMessage({type:'nava-journal-connect',initial:{category:'face',locale:'zh',forceGuide:true,records:[],settings:{'fluffy-reduced-motion':true}}},location.origin,[channel.port2]);});</script>`;
try {
 const page=await browser.newPage({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__photo-spotlight',r=>r.fulfill({contentType:'text/html',body:fixture}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.goto(`${server.resolvedUrls.local[0]}__photo-spotlight`);
 await expect.poll(()=>page.frames().some(f=>f.url().includes('/journal/'))).toBe(true);
 const frame=page.frames().find(f=>f.url().includes('/journal/'));
 await frame.waitForFunction(()=>window.FluffyDebug?.animation.ready && document.querySelector('#cold-guide:not([hidden])'));
 for(const [width,height] of [[320,568],[430,932]]) {
  await page.setViewportSize({width,height});
  for(const [shape,photoHeight] of [['long',1800],['ordinary',250]]) {
   await frame.evaluate(height=>{
    const photo=document.createElement('canvas');photo.width=400;photo.height=height;
    const ctx=photo.getContext('2d');
    for(let y=0;y<height;y+=100){ctx.fillStyle=y%200?'#7abacb':'#d6edf2';ctx.fillRect(0,y,400,100);ctx.fillStyle='#174d64';ctx.font='24px sans-serif';ctx.fillText(`Test photo ${y}`,20,y+48);}
    window.FluffyDebug.showPhoto(photo.toDataURL());
   },photoHeight);
   await frame.waitForFunction(()=>document.querySelector('#photo-preview img')?.complete);
   for(const position of shape==='long'?['top','middle','bottom','past-bottom']:['top']) {
    await frame.evaluate(position=>{
     const panel=document.getElementById('entry-panel'),photo=document.getElementById('photo-preview');
     const end=photo.offsetTop+photo.offsetHeight-panel.clientHeight;
     panel.scrollTop=position==='top'?0:position==='middle'?end/2:position==='bottom'?end:end+80;
     panel.dispatchEvent(new Event('scroll'));
    },position);
    await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await frame.evaluate(()=>{
     const screen=document.getElementById('screen'),root=screen.getBoundingClientRect(),scale=root.width/screen.clientWidth;
     const panel=document.getElementById('entry-panel'),p=panel.getBoundingClientRect(),photo=document.getElementById('photo-preview').getBoundingClientRect();
     const h=document.querySelector('[data-guide-hole]'),b=h.getBBox();
     const expected={left:Math.max(photo.left,p.left+panel.clientLeft*scale),top:Math.max(photo.top,p.top+panel.clientTop*scale),right:Math.min(photo.right,p.left+(panel.clientLeft+panel.clientWidth)*scale),bottom:Math.min(photo.bottom,p.top+(panel.clientTop+panel.clientHeight)*scale)};
     const toDesign=(n,axis)=> (n-(axis==='x'?root.left:root.top))/scale;
     const clip=document.querySelector('#cold-guide-backdrop clipPath rect');
     return {hole:{x:b.x,y:b.y,width:b.width,height:b.height},expected:{x:toDesign(expected.left,'x'),y:toDesign(expected.top,'y'),width:(expected.right-expected.left)/scale,height:(expected.bottom-expected.top)/scale},buttonTop:toDesign(document.getElementById('confirm-entry').getBoundingClientRect().top,'y'),photoBottom:toDesign(photo.bottom,'y'),clip:{height:Number(clip.getAttribute('height')),radius:Number(clip.getAttribute('rx'))},scroll:panel.scrollTop};
    });
    for(const edge of ['x','y','width','height']) assert.ok(Math.abs(geometry.hole[edge]-geometry.expected[edge])<1.5,`${width} ${shape} ${position}: ${edge} ${JSON.stringify(geometry)}`);
    assert.ok(geometry.hole.y+geometry.hole.height<geometry.buttonTop,'highlight must never reach the action button');
    assert.ok(geometry.hole.y+geometry.hole.height<=geometry.photoBottom+1,'highlight must stop at the actual photo end');
    assert.ok(geometry.clip.radius>0,'original photo corner outline is preserved');
    if(shape==='long' && position!=='past-bottom') assert.ok(geometry.clip.height>geometry.hole.height*3);
    await page.screenshot({path:`${output}/${width}-${shape}-${position}.png`});
    results.push({width,height,shape,position,...geometry});
   }
  }
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>requests.includes('save')),false);
 await writeFile(`${output}/report.json`,JSON.stringify({engine,passed:true,results,errors,scope:'Local synthetic photo geometry and real browser scrolling. No user photo uploads or production writes.'},null,2));
 console.log(JSON.stringify({engine,passed:true,cases:results.length}));
}finally{await browser.close();await server.close();}
