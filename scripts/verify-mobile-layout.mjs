import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const engine = process.env.NAVA_LAYOUT_ENGINE || 'chromium';
const safe = process.env.NAVA_LAYOUT_SAFE === '1';
const output = `Q:/NAVA-Workspace/Build/TestRuns/App-Checks/mobile-layout/${engine}${safe ? '-safe' : ''}${process.env.NAVA_LAYOUT_WIDTH ? `-width-${process.env.NAVA_LAYOUT_WIDTH}` : ''}`;
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: Number(process.env.NAVA_LAYOUT_PORT || 5279), strictPort: true }, logLevel: 'silent' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await ({ chromium, webkit }[engine]).launch();
const sizes = [[360,740],[375,812],[390,844],[430,932],[320,568],[375,667]].filter(([w])=>!process.env.NAVA_LAYOUT_WIDTH||w===Number(process.env.NAVA_LAYOUT_WIDTH));
const routes = [
  ['home','today'],['records','record'],['chat','ai'],['growth','trends'],['profile','profile'],
  ...['personal','skin','wardrobe','health','watch','privacy','account'].map(v=>[`profile-${v}`,`profile&view=${v}`]),
  ...['calendar',`day-${new Date().toLocaleDateString('en-CA')}`,'profile-details','notifications','reminder-settings','home-widgets','today-todos','admin-console','points-shop','points-shop-category-all','points-shop-product-preview','points-shop-cart','points-shop-cards','points-shop-add-card'].map(v=>[v,`today&view=${v}`]),
];
const report = { engine, startedAt:new Date().toISOString(), results:[], errors:[] };
async function setup(context, signedIn) {
  await context.route('**/*.supabase.co/**', route => route.fulfill({ json: route.request().url().includes('journal_preferences') ? {settings:{}} : [] }));
  await context.addInitScript(signedIn=>{
    if(signedIn)sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');
    localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
    // Model iOS's visual-only keyboard resize without resizing the layout viewport.
    const vv = window.visualViewport;
    let simulatedHeight;
    let simulatedScale;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'height');
    const scaleDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'scale');
    Object.defineProperty(vv,'height',{get:()=>simulatedHeight ?? descriptor.get.call(vv)});
    Object.defineProperty(vv,'scale',{get:()=>simulatedScale ?? scaleDescriptor.get.call(vv)});
    window.layoutKeyboard = (height,scale) => { simulatedHeight=height; simulatedScale=scale; vv.dispatchEvent(new Event('resize')); };
  },signedIn);
}
async function ready(page) {
  if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();
  if(await page.locator('.completion-celebration-layer').isVisible())await page.keyboard.press('Escape');
}
async function safeArea(page) {
  if(!safe)return;
  const session=await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:59,bottom:34,left:0,right:0,topMax:59,bottomMax:34,leftMax:0,rightMax:0}});
}
async function lastControl(page,name,width,height) {
  const root=page.locator('.phone-frame > .app-content');
  const candidates=root.locator('button:visible, input:visible, textarea:visible, a:visible').filter({hasNot:page.locator('[type="file"]')});
  const controls=await candidates.all();
  let target;
  for(const candidate of controls.reverse()){
    if(await candidate.evaluate(e=>!e.closest('.is-background,[aria-hidden="true"],[hidden]')&&e.getBoundingClientRect().width>5&&e.getBoundingClientRect().height>5)){target=candidate;break;}
  }
  if(!target)return;
  await target.scrollIntoViewIfNeeded();await page.waitForTimeout(80);
  const result=await target.evaluate(e=>{
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
    return {text:(e.textContent||e.getAttribute('placeholder')||e.getAttribute('aria-label')||e.tagName).slice(0,70),box:{x:r.x,y:r.y,bottom:r.bottom},reachable:r.top>=-1&&r.bottom<=innerHeight+1&&Boolean(hit&&(e.contains(hit)||hit.contains(e)))};
  });
  report.results.push({name:`${name}-last-control`,width,height,...result,failures:result.reachable?[]:['last control clipped or covered']});
  if(!result.reachable)await page.screenshot({path:`${output}/${width}x${height}-${name}-last-control.png`});
}
async function inspect(page,name,width,height,selector='.phone-frame') {
  await page.waitForTimeout(120);
  const geometry = await page.locator(selector).first().evaluate(root=>{
    const rect = e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const visible=e=>e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"],.is-background')&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
    const r=rect(root), viewport=window.visualViewport.height;
    const dock=root.querySelector('.bottom-nav');
    const buttons=dock?[...dock.querySelectorAll('button')].filter(visible).map(rect):[];
    const overflows=[root,...root.querySelectorAll('.app-content,.screen-panel,.profile-subpage,.home-experience,.chat-layout')].filter(visible).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,excess:e.scrollWidth-e.clientWidth}));
    const groups=[...root.querySelectorAll('.profile-stack,.growth-task-list,.record-hub,.profile-personal-card')].filter(visible).map(e=>{
      const boxes=[...e.children].filter(c=>visible(c)&&!['absolute','fixed'].includes(getComputedStyle(c).position)).map(rect);
      const gaps=boxes.slice(1).map((b,i)=>b.y-boxes[i].bottom).filter((g,i)=>boxes[i+1].y>boxes[i].y+2);
      return {class:e.className,gaps};
    });
    const editableSelector='textarea,select,[contenteditable="true"],input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="color"])';
    const undersizedEditables=[...root.querySelectorAll(editableSelector)].filter(visible).map(e=>({
      tag:e.tagName.toLowerCase(),type:e.getAttribute('type'),name:e.getAttribute('name'),fontSize:parseFloat(getComputedStyle(e).fontSize),box:rect(e),
    })).filter(e=>e.fontSize<16);
    return {frame:r,viewport,overflows,buttons,groups,undersizedEditables};
  });
  const failures=[];
  if(geometry.frame.x < -2 || geometry.frame.right>width+2)failures.push('frame outside screen');
  if(geometry.overflows.length)failures.push(`horizontal overflow: ${JSON.stringify(geometry.overflows)}`);
  if(geometry.undersizedEditables.length)failures.push(`editable controls below 16px: ${JSON.stringify(geometry.undersizedEditables)}`);
  for(let i=1;i<geometry.buttons.length;i++)if(geometry.buttons[i].x<geometry.buttons[i-1].right-1)failures.push('dock buttons overlap');
  for(const g of geometry.groups)if(g.gaps.some(v=>v < -2))failures.push(`sections overlap: ${g.class}`);
  const id=`${width}x${height}-${name}`;
  await page.screenshot({path:`${output}/${id}.png`});
  report.results.push({name, width,height,...geometry,failures});
  return failures;
}
async function keyboard(page,name,width,height,input,action) {
  await input.focus();
  const inputFontSize=await input.evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  const visibleHeight=height-300;
  // Model the transient scale above one that iOS can report during focus.
  await page.evaluate(h=>window.layoutKeyboard(h,1.2),visibleHeight);
  await page.waitForTimeout(350);
  await input.scrollIntoViewIfNeeded();
  const inputRect=await input.boundingBox();
  const failures=[];
  if(inputFontSize<16)failures.push(`editable control font-size ${inputFontSize}px can trigger iOS focus zoom`);
  const keyboardState=await page.evaluate(()=>({open:document.documentElement.dataset.keyboardOpen,scale:document.documentElement.dataset.viewportScale}));
  if(keyboardState.open!=='true')failures.push('keyboard viewport state was not activated while visual viewport scale exceeded one');
  if(!inputRect||inputRect.y<0||inputRect.y+inputRect.height>visibleHeight+2)failures.push('focused input behind keyboard');
  const uncovered = locator => locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return Boolean(hit&&(e.contains(hit)||hit.contains(e)));});
  if(!await uncovered(input))failures.push('focused input covered by another layer');
  if(action){
    await action.scrollIntoViewIfNeeded();
    const r=await action.boundingBox();
    const actionHit=await action.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {tag:hit?.tagName??null,className:typeof hit?.className==='string'?hit.className:null};});
    report.results.push({name:`${name}-keyboard-action`,width,height,actionRect:r,actionHit,failures:[]});
    if(!r||r.y<0||r.y+r.height>visibleHeight+2)failures.push('action behind keyboard');
    if(!await uncovered(action))failures.push('action covered by another layer');
  }
  if(name.startsWith('sign')||name==='reset'){
    const overlaps=await page.locator('.auth-form-region').evaluate(root=>{
      const form=root.querySelector('form'),consent=root.querySelector('.auth-consent');
      const fields=[...root.querySelectorAll('.field,.auth-submit,.auth-secondary-links')].map(e=>e.getBoundingClientRect());
      return Boolean(consent&&consent.getBoundingClientRect().top<form.getBoundingClientRect().bottom-1)
        || fields.slice(1).some((r,i)=>r.top<fields[i].bottom-1);
    });
    if(overlaps)failures.push('authentication fields or agreement overlap');
  }
  if(name==='chat'){
    await page.locator('.chat-attachment-trigger').click();
    const menu=await page.locator('.chat-attachment-menu').boundingBox();
    if(!menu||menu.y<0||menu.y+menu.height>visibleHeight+2)failures.push('attachment menu outside keyboard viewport');
    await page.locator('.chat-attachment-trigger').click();
  }
  await page.screenshot({path:`${output}/${width}x${height}-${name}-keyboard.png`});
  report.results.push({name:`${name}-keyboard`,width,height,visibleHeight,inputRect,inputFontSize,keyboardState,failures});
  await page.evaluate(()=>window.layoutKeyboard(undefined,undefined));
  await input.blur();
  await page.waitForTimeout(100);
  const restored=await page.locator('.phone-frame,.auth-screen').first().boundingBox();
  if(!restored||Math.abs(restored.height-height)>2)failures.push('shell height did not restore');
}
try {
 for(const [width,height] of sizes){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
  await setup(context,true);
  const page=await context.newPage();
  await safeArea(page);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?demo=1#tab=today`,{waitUntil:'networkidle'});await ready(page);
  for(const [name,route] of routes){
    await page.evaluate(route=>{location.hash=`tab=${route}`;},route);
    await expect(page.locator('.phone-frame')).toBeVisible();
    await page.waitForTimeout(180);
    await ready(page);
    await inspect(page,name,width,height);
    await lastControl(page,name,width,height);
    if(name==='records'){
      const menuButton=page.locator('.figma-app-header .nava-more-trigger');
      await menuButton.click();
      await expect(page.locator('.app-utility-popover')).toBeVisible();
      await inspect(page,'records-more-menu',width,height);
      await page.locator('.more-menu-language').click();
      await expect(page.locator('.app-utility-popover')).toBeVisible();
      await inspect(page,'records-language-menu',width,height);
      await page.keyboard.press('Escape');
    }
    if(name==='chat')await keyboard(page,name,width,height,page.locator('.chat-composer input:not([type="file"])'),page.locator('.chat-composer button[type="submit"]'));
    if(name==='profile-personal')await keyboard(page,name,width,height,page.locator('.profile-personal-card input').first());
    if(name==='profile-details')await keyboard(page,name,width,height,page.locator('.advanced-profile-screen textarea').last(),page.locator('.advanced-profile-save'));
    if(name==='today-todos')await keyboard(page,name,width,height,page.locator('.today-todo-steps textarea'),page.locator('.today-todo-submit'));
    if(name==='points-shop-category-all')await keyboard(page,name,width,height,page.locator('.points-shop-search input'));
    if(name==='profile-account'){
      await page.getByRole('button',{name:/修改密码/}).click();
      await expect(page.locator('.profile-security-sheet')).toBeVisible();
      await inspect(page,'password-dialog',width,height);
      await keyboard(page,'password-dialog',width,height,page.locator('.profile-security-sheet input').last(),page.locator('.profile-security-save'));
      await page.locator('.profile-security-sheet > header > button').click();
    }
  }
  await context.close();
  const authContext=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
  await setup(authContext,false);
  const auth=await authContext.newPage();
  await safeArea(auth);
  await auth.goto(base,{waitUntil:'networkidle'});await ready(auth);
  await expect(auth.locator('.auth-form')).toBeVisible();
  for(const mode of ['signIn','signUp','reset']){
    if(mode==='signUp')await auth.locator('.auth-mode-icon').click();
    if(mode==='reset'){
      await auth.locator('.auth-mode-icon').click();await auth.locator('.auth-forgot').click();await auth.locator('[data-recovery-option="reset"]').click();
    }
    await inspect(auth,mode,width,height,'.auth-screen');
    await keyboard(auth,mode,width,height,auth.locator('.auth-form input').last(),auth.locator('.auth-submit'));
  }
  await authContext.close();
  console.log(`${engine} ${width}x${height} complete`);
 }
} finally {
 report.finishedAt=new Date().toISOString();report.failed=report.results.filter(r=>r.failures.length);
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
 await browser.close();await server.close();
 console.log(JSON.stringify({states:report.results.length,failures:report.failed.map(r=>({name:r.name,size:[r.width,r.height],failures:r.failures})),errors:report.errors}));
}
if(report.failed.length||report.errors.length)process.exitCode=1;
