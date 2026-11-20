import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
import {createServer} from 'vite';
const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/chat-stickers';
await mkdir(output,{recursive:true});
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#d9eff7;color:#25345a}.phone-frame{height:100dvh;position:relative;overflow:hidden}#open{margin:40px;font:inherit;padding:12px}#chosen{position:absolute;top:130px;left:30px}</style></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{LocaleProvider}from'/src/i18n.tsx';import Picker from'/src/components/ChatStickerPicker.tsx';import{encodeChatSticker}from'/src/services/chatStickers.ts';
function Fixture(){const[open,setOpen]=React.useState(false),[choice,setChoice]=React.useState('');return React.createElement('main',{className:'phone-frame'},React.createElement('button',{id:'open',onClick:()=>setOpen(true)},'表情'),React.createElement('output',{id:'chosen'},choice),React.createElement(Picker,{open,onClose:()=>setOpen(false),onSelect:sticker=>{window.selections=(window.selections||0)+1;setChoice(encodeChatSticker(sticker.id));setOpen(false)}}));}
createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:5295,strictPort:true},plugins:[{name:'sticker-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__stickers'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});}}]});
await server.listen();const results=[];
try{
 for(const [engine,type]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();
  try{
   for(const [width,height,locale]of[[320,568,'zh'],[430,932,'zh'],[375,812,'en']]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(locale=>localStorage.setItem('nava.locale.v1',locale),locale);
    await page.goto('http://127.0.0.1:5295/__stickers');
    await page.locator('#open').click();
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    await expect(page.locator('.chat-sticker-choice')).toHaveCount(12);
    await expect.poll(()=>page.locator('.chat-sticker-choice img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
    const geometry=await dialog.evaluate(element=>({width:element.getBoundingClientRect().width,bottom:element.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,layer:getComputedStyle(element.parentElement).backgroundColor,minButton:Math.min(...Array.from(element.querySelectorAll('.chat-sticker-choice'),button=>button.getBoundingClientRect().height))}));
    assert.equal(geometry.overflow,false);assert.ok(geometry.bottom<=height+1);assert.ok(geometry.minButton>=44);assert.equal(geometry.layer,'rgba(0, 0, 0, 0)');
    await page.screenshot({path:`${output}/${engine}-${width}-${locale}.png`});
    const categoryCounts={mood:10,company:7,daily:8,reply:5},seen=new Set();
    for(const [category,count]of Object.entries(categoryCounts)){
     await page.locator(`[data-sticker-category="${category}"]`).click();
     await expect(page.locator(`[data-sticker-category="${category}"]`)).toHaveAttribute('aria-pressed','true');
     await expect(page.locator('.chat-sticker-choice')).toHaveCount(count);
     await expect.poll(()=>page.locator('.chat-sticker-choice img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
     for(const id of await page.locator('.chat-sticker-choice').evaluateAll(buttons=>buttons.map(button=>button.dataset.stickerId)))seen.add(id);
    }
    assert.equal(seen.size,30,'every bundled sticker is reachable through a category');
    await page.locator('[data-sticker-category="common"]').click();
    await page.locator('[data-sticker-id="hug"]').click();
    await expect(page.locator('#chosen')).toHaveText('[nava-sticker:hug]');assert.equal(await page.evaluate(()=>selections),1);await expect(dialog).toHaveCount(0);
    await page.locator('#open').click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);assert.equal(await page.evaluate(()=>selections),1);
    await page.locator('#open').click();await expect(dialog).toBeVisible();await page.locator('[data-sticker-category="daily"]').click();
    await page.screenshot({path:`${output}/${engine}-${width}-${locale}-daily.png`});
    await page.locator('[data-sticker-id="water"]').click();await expect(page.locator('#chosen')).toHaveText('[nava-sticker:water]');assert.equal(await page.evaluate(()=>selections),2);
    assert.deepEqual(errors,[]);results.push({engine,width,height,locale,...geometry,categories:categoryCounts,reachableStickers:seen.size});await page.close();
   }
  }finally{await browser.close();}
 }
 await writeFile(`${output}/report.json`,JSON.stringify({passed:true,results,scope:'Real reusable React picker and bundled local SVGs; no production messages sent.'},null,2));console.log(JSON.stringify({passed:true,cases:results.length}));
}finally{await server.close();}
