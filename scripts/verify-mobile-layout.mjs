import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const engine = process.env.NAVA_LAYOUT_ENGINE || 'chromium';
const safe = process.env.NAVA_LAYOUT_SAFE === '1';
const keyboardOnly = process.env.NAVA_KEYBOARD_ONLY === '1';
const output = `Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/mobile-layout/${engine}${safe ? '-safe' : ''}${keyboardOnly ? '-keyboard' : ''}${process.env.NAVA_LAYOUT_WIDTH ? `-width-${process.env.NAVA_LAYOUT_WIDTH}` : ''}`;
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
const keyboardRoutes = new Set(['chat','profile-personal','profile-account','profile-details','today-todos','points-shop-category-all','admin-console']);
const report = { engine, startedAt:new Date().toISOString(), results:[], errors:[] };
async function setup(context, signedIn, skin = 'glacier-mist') {
  await context.route('**/*.supabase.co/**', route => route.fulfill({ json: route.request().url().includes('journal_preferences') ? {settings:{}} : [] }));
  await context.addInitScript(({signedIn,skin})=>{
    if(signedIn)sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');
    localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
    localStorage.setItem('nava.app-skin.v1:00000000-0000-4000-8000-000000000001',skin);
    // Model iOS's visual-only keyboard resize without resizing the layout viewport.
    const vv = window.visualViewport;
    let simulatedHeight;
    let simulatedScale;
    let simulatedOffset;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'height');
    const scaleDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'scale');
    const topDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'offsetTop');
    Object.defineProperty(vv,'height',{get:()=>simulatedHeight ?? descriptor.get.call(vv)});
    Object.defineProperty(vv,'scale',{get:()=>simulatedScale ?? scaleDescriptor.get.call(vv)});
    Object.defineProperty(vv,'offsetTop',{get:()=>simulatedOffset ?? topDescriptor.get.call(vv)});
    window.layoutKeyboard = (height,scale,offset) => { simulatedHeight=height; simulatedScale=scale; simulatedOffset=offset; vv.dispatchEvent(new Event('resize')); };
  },{signedIn,skin});
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
  const panned = name.startsWith('profile-details') ? 48 : 0;
  const visibleBottom = visibleHeight + panned;
  // Model the transient scale above one that iOS can report during focus.
  await page.evaluate(({h,top})=>window.layoutKeyboard(h,1.2,top),{h:visibleHeight,top:panned});
  await page.waitForTimeout(350);
  const inputRect=await input.boundingBox();
  const failures=[];
  if(inputFontSize<16)failures.push(`editable control font-size ${inputFontSize}px can trigger iOS focus zoom`);
  const keyboardState=await page.evaluate(()=>({open:document.documentElement.dataset.keyboardOpen,scale:document.documentElement.dataset.viewportScale}));
  if(keyboardState.open!=='true')failures.push('keyboard viewport state was not activated while visual viewport scale exceeded one');
  if(!inputRect||inputRect.y<panned-1||inputRect.y+inputRect.height>visibleBottom+2)failures.push('focused input behind keyboard');
  const canvas = await page.locator('.nava-app-stage').evaluate(stage=>({height:stage.getBoundingClientRect().height,background:getComputedStyle(stage).backgroundImage,scroll:window.scrollY}));
  if(canvas.height<height-1||canvas.background==='none'||Math.abs(canvas.scroll)>1) failures.push('keyboard displaced or exposed the background canvas');
  if(name==='profile-details'&&inputRect){
    const bottomGap=visibleBottom-inputRect.y-inputRect.height;
    if(bottomGap<10||bottomGap>15) failures.push(`last profile field to keyboard gap is ${bottomGap}px`);
    await page.screenshot({path:`${output}/${width}x${height}-${name}-focused.png`});
  }
  const uncovered = locator => locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return Boolean(hit&&(e.contains(hit)||hit.contains(e)));});
  if(!await uncovered(input))failures.push('focused input covered by another layer');
  if(action){
    await action.scrollIntoViewIfNeeded();
    const r=await action.boundingBox();
    const actionHit=await action.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {tag:hit?.tagName??null,className:typeof hit?.className==='string'?hit.className:null};});
    report.results.push({name:`${name}-keyboard-action`,width,height,actionRect:r,actionHit,failures:[]});
    if(!r||r.y<panned||r.y+r.height>visibleBottom+2)failures.push('action behind keyboard');
    if(!await uncovered(action))failures.push('action covered by another layer');
  }
  if(name.startsWith('sign')||name==='reset'){
    const overlaps=await page.locator('.auth-form-region').evaluate(root=>{
      const form=root.querySelector('form'),consent=root.querySelector('.auth-consent');
      const fields=[...root.querySelectorAll('.field,.auth-submit,.auth-secondary-links')].map(e=>e.getBoundingClientRect());
      return Boolean(consent?.getClientRects().length&&consent.getBoundingClientRect().top<form.getBoundingClientRect().bottom-1)
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
  report.results.push({name:`${name}-keyboard`,width,height,visibleHeight,inputRect,inputFontSize,keyboardState,canvas,failures});
  await page.evaluate(()=>window.layoutKeyboard(undefined,undefined));
  await input.blur();
  await page.waitForTimeout(100);
  const restored=await page.locator('.phone-frame,.auth-screen').first().boundingBox();
  if(!restored||Math.abs(restored.height-height)>2)failures.push('shell height did not restore');
}
try {
 for(const [width,height] of sizes){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
  const sizeIndex = sizes.findIndex(([w,h])=>w===width&&h===height);
  await setup(context,true,['violet-dusk','sky-ripple','glacier-mist'][sizeIndex%3]);
  const page=await context.newPage();
  await safeArea(page);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`${base}?demo=1&qa=admin-console#tab=today`,{waitUntil:'networkidle'});await ready(page);
  for(const [name,route] of routes){
    if(keyboardOnly&&!keyboardRoutes.has(name))continue;
    await page.evaluate(route=>{location.hash=`tab=${route}`;},route);
    await expect(page.locator('.phone-frame')).toBeVisible();
    await page.waitForTimeout(180);
    await ready(page);
    if(!keyboardOnly){await inspect(page,name,width,height);await lastControl(page,name,width,height);}
    if(name==='records'&&!keyboardOnly){
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
    if(name==='profile-details'){
      await expect(page.locator('.advanced-profile-form > button').last()).toHaveClass('advanced-profile-save');
      await keyboard(page,'profile-details-mid',width,height,page.locator('.advanced-profile-screen textarea').first());
      await keyboard(page,name,width,height,page.locator('[data-profile-end-field]'),page.locator('.advanced-profile-save'));
    }
    if(name==='today-todos')await keyboard(page,name,width,height,page.locator('.today-todo-steps textarea'),page.locator('.today-todo-submit'));
    if(name==='points-shop-category-all')await keyboard(page,name,width,height,page.locator('.points-shop-search input'));
    if(name==='admin-console'){
      await page.locator('[data-admin-action="notices"]').click();
      await keyboard(page,'admin-notice',width,height,page.locator('.admin-notice-message textarea'),page.locator('.admin-form-card button[type="submit"]'));
    }
    if(name==='profile-account'){
      await page.getByRole('button',{name:/修改密码/}).click();
      await expect(page.locator('.profile-security-sheet')).toBeVisible();
      await inspect(page,'password-dialog',width,height);
      await keyboard(page,'password-dialog',width,height,page.locator('.profile-security-sheet input').last(),page.locator('.profile-security-save'));
      await page.locator('.profile-security-sheet > header > button').click();
      await page.getByRole('button',{name:'注销账号',exact:true}).click();
      await keyboard(page,'delete-confirmation',width,height,page.locator('.account-delete-sheet input'));
      await page.locator('.account-delete-sheet > header > button').click();
    }
  }
  const module=['mood','sleep','exercise','diet','focus','face'][sizeIndex];
  await page.evaluate(module=>location.hash=`tab=record&module=${module}&view=editor`,module);
  const journal=page.locator('.journal-experience:not(.is-staged) iframe');
  await expect(journal).toBeVisible();
  const journalFrame=page.frameLocator('.journal-experience:not(.is-staged) iframe');
  if(await journalFrame.locator('.review-add-entry').isVisible())await journalFrame.locator('.review-add-entry').click();
  const journalField=journalFrame.locator('#screen[data-scene="entry"] :is(input:not([type="number"]):not([type="file"]):not([type="hidden"]):not([type="range"]), textarea):visible').last();
  await journalField.focus();
  const journalHeight=height-300, journalTop=36;
  await page.evaluate(({journalHeight,journalTop})=>window.layoutKeyboard(journalHeight,1,journalTop),{journalHeight,journalTop});
  await expect(journalFrame.locator('.stage')).toHaveCSS('height',`${journalHeight}px`);
  await expect.poll(async()=>{
    const rect=await journalField.boundingBox();
    return Boolean(rect&&rect.y>=journalTop-1&&rect.y+rect.height<=journalTop+journalHeight+1);
  }).toBe(true);
  expect((await journal.boundingBox()).height).toBe(height);
  await page.screenshot({path:`${output}/${width}x${height}-journal-${module}-keyboard.png`});
  report.results.push({name:`journal-${module}-keyboard`,width,height,failures:[]});
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
      await auth.locator('.auth-mode-icon').click();await auth.locator('.auth-forgot').click();
    }
    await inspect(auth,mode,width,height,'.auth-screen');
    await keyboard(auth,mode,width,height,auth.locator('.auth-form input').last(),auth.locator('.auth-submit'));
  }
  await authContext.close();
  const recoveryContext=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
  await setup(recoveryContext,true);
  const recovery=await recoveryContext.newPage();
  await safeArea(recovery);
  await recovery.goto(`${base}?demo=1&auth=recovery`,{waitUntil:'domcontentloaded'});await ready(recovery);
  await expect(recovery.locator('.auth-backdrop')).toBeAttached();
  await keyboard(recovery,'recovery-link',width,height,recovery.locator('input[autocomplete="new-password"]').last(),recovery.locator('.auth-submit'));
  await recoveryContext.close();
  console.log(`${engine} ${width}x${height} complete`);
 }
} finally {
 report.finishedAt=new Date().toISOString();report.failed=report.results.filter(r=>r.failures.length);
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
 await browser.close();await server.close();
 console.log(JSON.stringify({states:report.results.length,failures:report.failed.map(r=>({name:r.name,size:[r.width,r.height],failures:r.failures})),errors:report.errors}));
}
if(report.failed.length||report.errors.length)process.exitCode=1;
