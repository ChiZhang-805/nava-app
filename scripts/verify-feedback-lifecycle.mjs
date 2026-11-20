import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/product-feedback';
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
const results=[];
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
try { for(const [engine,type] of Object.entries({chromium,webkit})) {
 const browser=await type.launch();
 try { for(const motion of ['no-preference','reduce']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:motion});
  await context.addInitScript(()=>{
   window.FLUFFY_TEST=true;
   sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale','zh');
   localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
  });
  await context.route('**/*.supabase.co/**',r=>r.fulfill({json:[]}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const open=async hash=>page.goto(`${server.resolvedUrls.local[0]}?demo=1#${hash}`,{waitUntil:'domcontentloaded'});
  await open('tab=today');const hint=page.locator('.home-record-shortcut-hint');await expect(hint).toBeVisible();
  expect(await hint.evaluate(e=>getComputedStyle(e).animationName)).toBe(motion==='reduce'?'none':'home-shortcut-invitation');
  if(motion!=='reduce')expect(await hint.evaluate(e=>getComputedStyle(e).animationIterationCount)).toBe('3');
  await hint.focus();await page.waitForTimeout(12500);await expect(hint).toBeVisible();
  await page.locator('.option-two-menu-toggle').focus();await expect(hint).toBeHidden();
  // The existing swipe gesture must still work after the invitation disappears.
  const home=page.locator('.option-two-home');
  await home.dispatchEvent('pointerdown',{pointerId:4,isPrimary:true,clientX:180,clientY:550,pointerType:'touch'});
  await home.dispatchEvent('pointerup',{pointerId:4,isPrimary:true,clientX:180,clientY:350,pointerType:'touch'});
  await expect(page.locator('.option-two-health-menu')).toHaveAttribute('aria-hidden','false');await expect(hint).toBeVisible();
  await hint.click();await expect(page.locator('.option-two-health-menu')).toHaveAttribute('aria-hidden','true');

  // Hold a parser-blocking stylesheet: authenticated initial data should reach
  // the bridge while assets are still loading, not wait for iframe window.load.
  let release;const held=new Promise(resolve=>{release=resolve;});
  await context.route('**/journal/css/app.css?*',async r=>{await held;await r.continue();});
  await open('tab=record&module=face&view=editor');
  let iframe;
  try {
   await expect.poll(async()=>{iframe=page.frames().find(f=>f.url().includes('/journal/index.html'));return iframe?.evaluate(()=>window.NavaJournal?.initial.category);},{timeout:10000}).toBe('face');
  } finally {release();}
  await expect(page.locator('.journal-loading')).toHaveCount(0,{timeout:30000});
  const frame=page.frameLocator('.journal-experience iframe');
  await expect(frame.locator('#screen')).toHaveAttribute('data-scene','entry');
  // Test late/native results at the bridge contract; native system UI is a
  // separate XCTest boundary, never represented by this browser stub.
  await iframe.evaluate(()=>{
   window.NavaJournal.initial.nativePhotos=true;
   const call=window.NavaJournal.call;
   window.NavaJournal.call=(method,...args)=>method==='photo'?new Promise(resolve=>{window.resolvePhoto=resolve;}):call(method,...args);
  });
  const choose=async()=>{await frame.locator('#photo-preview').click();await frame.locator('#sheet-body').getByRole('button',{name:'选择照片',exact:true}).click();};
  await choose();await iframe.evaluate(()=>window.resolvePhoto(null));await expect(frame.locator('#sheet-layer')).toBeVisible();
  await frame.locator('#sheet-close').click();await choose();
  await iframe.evaluate(()=>window.NavaJournal.interrupt());
  await iframe.evaluate(base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));window.resolvePhoto(new File([bytes],'photo.png',{type:'image/png'}));},image);
  await expect(frame.locator('#photo-preview img')).toBeVisible();await expect(frame.locator('#sheet-layer')).toBeHidden();
  await choose();
  await iframe.evaluate(()=>{window.FluffyDebug.newEntry('face');});
  await iframe.evaluate(base64=>window.resolvePhoto(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'late.png',{type:'image/png'})),image);
  await page.waitForTimeout(150);await expect(frame.locator('#photo-preview img')).toHaveCount(0);

  await open('tab=ai');const draft=page.locator('.chat-input-shell input');await draft.fill('保留这段草稿');
  await page.getByRole('button',{name:'添加附件',exact:true}).click();
  let pending=page.waitForEvent('filechooser');await page.getByRole('menuitem',{name:'上传文件',exact:true}).click();let chooser=await pending;
  await chooser.setFiles([]);await expect(draft).toHaveValue('保留这段草稿');
  await page.getByRole('button',{name:'添加附件',exact:true}).click();pending=page.waitForEvent('filechooser');
  await page.getByRole('menuitem',{name:'上传文件',exact:true}).click();chooser=await pending;
  await chooser.setFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('My notes')});
  await expect(page.locator('.chat-pending-document')).toContainText('notes.txt');await expect(draft).toHaveValue('保留这段草稿');
  await page.getByRole('button',{name:'添加附件',exact:true}).click();pending=page.waitForEvent('filechooser');
  await page.getByRole('menuitem',{name:'上传照片',exact:true}).click();chooser=await pending;
  await chooser.setFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect(page.locator('.chat-pending-photos')).toBeVisible();await expect(draft).toHaveValue('保留这段草稿');
  await expect(page.locator('.chat-pending-document')).toHaveCount(0);
  await page.getByRole('button',{name:'添加附件',exact:true}).click();pending=page.waitForEvent('filechooser');
  await page.getByRole('menuitem',{name:'上传文件',exact:true}).click();chooser=await pending;
  await chooser.setFiles({name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('Another note')});
  await expect(page.locator('.chat-pending-document')).toContainText('replacement.txt');
  await expect(page.locator('.chat-pending-photos')).toHaveCount(0);
  await page.getByRole('button',{name:'添加附件',exact:true}).click();pending=page.waitForEvent('filechooser');
  await page.getByRole('menuitem',{name:'上传照片',exact:true}).click();chooser=await pending;
  await chooser.setFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect(page.locator('.chat-pending-photos')).toBeVisible();
  await page.getByRole('button',{name:'更多操作',exact:true}).click();
  await page.getByRole('menuitem',{name:'新会话',exact:true}).click();
  await expect(page.locator('.chat-pending-photos')).toHaveCount(0);
  await expect(page.locator('.chat-pending-document')).toHaveCount(0);await expect(draft).toHaveValue('');
  expect(errors).toEqual([]);results.push({engine,motion,passed:true,scope:'finite hint, reduced motion, parallel iframe startup, picker bridge lifecycle, browser files/photos'});
  await page.screenshot({path:`${out}/${engine}-${motion}-chat-attachments.png`});await context.close();console.log(engine,motion,'lifecycle passed');
 }}finally{await browser.close();}
}}finally{await writeFile(`${out}/lifecycle.json`,JSON.stringify(results,null,2));await server.close();}
