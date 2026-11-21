// Browser UI -> actual isolated PostgreSQL RPC. No fake frontend friend state.
import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { chromium,webkit,expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
import { createMiyouTestDb,testUsers } from './miyou-test-db.mjs';
applyProjectPublicEnv(process.cwd());
const out='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/miyou';await mkdir(out,{recursive:true});
const {db,rpc}=await createMiyouTestDb();
const a='00000000-0000-4000-8000-000000000001',b=testUsers[1];
await db.query('insert into auth.users(id) values($1)',[a]);
const server=await createServer({plugins:[{name:'isolated-miyou-test-peer',resolveId(id){if(id==='virtual:miyou-peer')return '\0miyou-peer';},load(id){if(id==='\0miyou-peer')return `import React from 'react';import{createRoot}from'react-dom/client';import Miyou from'/src/features/MiyouSpace.tsx';createRoot(document.getElementById('root')).render(React.createElement('div',{className:'phone-frame'},React.createElement(Miyou,{userId:'${b}',locale:'zh',onBack:()=>{}})));`;},configureServer(vite){
 vite.middlewares.use('/__miyou-peer',async(req,res)=>{
  const html=await vite.transformIndexHtml('/__miyou-peer',`<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>html,body,#root{margin:0;height:100%;font-family:system-ui}.phone-frame{height:100%;background:#e6effa}</style></head><body><div id="root"></div><script type="module" src="/@id/virtual:miyou-peer"></script></body></html>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });
}}],server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
const base=server.resolvedUrls.local[0];const results=[];
try {for(const [engine,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch();
 try {
  async function contextFor(user,width=390,height=844,locale='zh') {
   const context=await browser.newContext({viewport:{width,height},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
   await context.addInitScript(({locale})=>{
    sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale',locale);
    localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
    localStorage.setItem('nava.app-skin.v1:00000000-0000-4000-8000-000000000001','violet-dusk');
    const vv=window.visualViewport;
    let height;
    const native=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv),'height');
    Object.defineProperty(vv,'height',{get:()=>height??native.get.call(vv)});
    window.layoutKeyboard=value=>{height=value;vv.dispatchEvent(new Event('resize'));};
   },{locale});
   await context.route('**/rest/v1/rpc/nava_miyou',async route=>{
    const {action,payload}=route.request().postDataJSON();
    try{await route.fulfill({json:await rpc(user,action,payload)});}catch(error){await route.fulfill({status:400,json:{code:'P0001',message:error.message}});}
   });
   return context;
  }
  const first=await contextFor(a);const page=await first.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let peerContext;
  await page.goto(`${base}?demo=1#tab=today&view=friend-space`);
  if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();
  if(engine==='chromium'){
   await page.getByLabel('好友看到的名字').fill('小禾');await page.getByRole('button',{name:'进入咪友空间'}).click();
   await expect(page.getByRole('button',{name:'邀请好友',exact:true})).toBeVisible();
   await page.screenshot({path:`${out}/${engine}-empty.png`});
   peerContext=await contextFor(b);const peerPage=await peerContext.newPage();
   peerPage.on('pageerror',e=>errors.push(e.message));
   await peerPage.goto(`${base}__miyou-peer`);
   await peerPage.getByLabel('好友看到的名字').fill('阿澄').catch(async e=>{await peerPage.screenshot({path:`${out}/peer-failure.png`});console.error(errors,await peerPage.locator('body').innerText());throw e;});
   await peerPage.getByRole('button',{name:'进入咪友空间'}).click();
   await expect(peerPage.locator('.miyou-search')).toBeVisible();
   const code=(await rpc(b,'state')).me.code;
   await page.getByRole('button',{name:'添加好友',exact:true}).click();
   await page.getByLabel('好友的邀请码', {exact:true}).fill(code);await page.getByRole('button',{name:'发送好友请求'}).click();
   await expect(page.locator('.miyou-friend')).toContainText('阿澄');
   const link=(await rpc(b,'state')).friends[0].id;
   await peerPage.bringToFront();
   await expect(peerPage.locator('.miyou-friend')).toBeVisible({timeout:12000});
   await peerPage.locator('.miyou-friend').click();await peerPage.getByRole('button',{name:'接受',exact:true}).click();
   await expect(peerPage.locator('.miyou-composer')).toBeVisible();
   await page.reload();await page.locator('.miyou-friend').click();
   await expect(page.locator('.miyou-composer')).toBeVisible();
   await page.getByLabel('消息',{exact:true}).fill('今晚一起散步吧');await page.getByRole('button',{name:'发送',exact:true}).click();
   await expect(page.locator('.miyou-bubble')).toContainText('今晚一起散步吧');
   const sent=(await rpc(b,'messages',{linkId:link})).messages[0];
   await peerPage.bringToFront();
   await expect(peerPage.locator('.miyou-bubble').first()).toBeVisible({timeout:12000});
   await peerPage.locator('.miyou-bubble').first().click();
   await peerPage.getByLabel('消息',{exact:true}).fill('好呀，也陪云朵玩一会儿。');
   await peerPage.getByRole('button',{name:'发送',exact:true}).click();
   await expect(peerPage.getByLabel('消息',{exact:true})).toHaveValue('');
   assert.equal((await rpc(a,'messages',{linkId:link})).messages.at(-1).reply_id,sent.id);
   await page.bringToFront();
   await expect(page.locator('.miyou-bubble').last()).toContainText('好呀',{timeout:12000});
   // A dropped acknowledgement must retain the draft and retry the same request id.
   let drop=true;
   await page.route('**/rest/v1/rpc/nava_miyou',async route=>{
    const {action,payload}=route.request().postDataJSON();
    if(action==='send'&&drop){drop=false;await rpc(a,action,payload);await route.fulfill({status:503,json:{message:'network interruption'}});return;}
    await route.fallback();
   });
   await page.getByLabel('消息',{exact:true}).fill('断网重试也只有一条');await page.getByRole('button',{name:'发送',exact:true}).click();
   await expect(page.getByLabel('消息',{exact:true})).toHaveValue('断网重试也只有一条');
   await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();await page.getByRole('button',{name:'发送',exact:true}).click();
   await expect(page.getByLabel('消息',{exact:true})).toHaveValue('');
   assert.equal((await rpc(b,'messages',{linkId:link})).messages.filter(m=>m.body==='断网重试也只有一条').length,1);
   await page.locator('.miyou-pet-banner').click();await page.getByLabel('小猫名字',{exact:true}).fill('云朵');await page.getByRole('button',{name:'邀请一起养'}).click();
   await expect(page.locator('.miyou-adopt')).toContainText('等待好友加入');await peerPage.bringToFront();await peerPage.locator('.miyou-pet-banner').click();
   await expect(peerPage.getByRole('button',{name:'一起养',exact:true})).toBeVisible({timeout:12000});
   await peerPage.getByRole('button',{name:'一起养',exact:true}).click();
   await page.bringToFront();
   await expect(page.locator('.miyou-care-actions')).toBeVisible({timeout:12000});
   await page.locator('.miyou-care-actions').getByRole('button',{name:'喂食',exact:true}).click();
   await expect(page.locator('.miyou-catalog button')).toHaveCount(8);
   await page.locator('.miyou-catalog').getByRole('button',{name:/南瓜小食/}).click();
   await expect(page.locator('.miyou-active-item')).toHaveAttribute('alt','南瓜小食');
   assert.equal((await rpc(b,'pet',{linkId:link})).active.item_id,'pumpkin');
   await page.reload();await page.locator('.miyou-friend').click();await page.locator('.miyou-pet-banner').click();
   await expect(page.locator('.miyou-active-item')).toHaveAttribute('alt','南瓜小食');
   await db.query("insert into public.miyou_messages(link_id,sender_id,request_id,body,created_at) values ($1,$2,gen_random_uuid(),'昨天的问候',now()-interval '1 day'),($1,$2,gen_random_uuid(),'前天的问候',now()-interval '2 days')",[link,b]);
  }
  await peerContext?.close();await first.close();
  for(const [width,height] of [[320,568],[360,740],[375,812],[390,844],[430,932]]){
   const context=await contextFor(a,width,height);const p=await context.newPage();
   p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
   await p.goto(`${base}?demo=1#tab=today&view=friend-space`);if(await p.locator('.launch-sequence').isVisible())await p.locator('.launch-sequence').click();
   await expect(p.locator('.miyou-friend')).toBeVisible();await p.screenshot({path:`${out}/${engine}-${width}-list.png`});
   await p.locator('.miyou-friend').click();await expect(p.locator('.miyou-bubble').first()).toBeVisible();
   async function geometry(state){
    const metric=await p.locator('.miyou-space').evaluate(el=>{const r=el.getBoundingClientRect();const composer=el.querySelector('.miyou-chat-container:not([hidden]) .miyou-composer')?.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth-innerWidth,top:r.top,bottom:r.bottom,height:innerHeight,composer:composer?{top:composer.top,bottom:composer.bottom}:null};});
    assert.ok(metric.overflow<=1,JSON.stringify(metric));if(metric.composer)assert.ok(metric.composer.bottom<=height+1,JSON.stringify(metric));
    results.push({engine,width,height,state,...metric});
   }
   await expect(p.locator('.miyou-messages')).toContainText('昨天');
   await expect(p.locator('.miyou-messages')).toContainText('前天');
   await geometry('chat');await p.screenshot({path:`${out}/${engine}-${width}-chat.png`});
   for(const button of await p.locator('.miyou-header>.miyou-icon').all()){
    assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
   }
   await p.getByRole('button',{name:'表情',exact:true}).click();await expect(p.locator('.miyou-emoji button')).toHaveCount(24);await geometry('emoji');await p.screenshot({path:`${out}/${engine}-${width}-emoji.png`});
   await p.locator('.miyou-emoji button').first().click();await expect(p.getByLabel('消息',{exact:true})).toHaveValue('😊');
   await p.getByRole('button',{name:'表情',exact:true}).click();
   await p.locator('.miyou-pet-banner').click();await expect(p.locator('.miyou-active-item')).toHaveAttribute('alt','南瓜小食');
   await expect(p.locator('.miyou-keepers,.miyou-pet-speech,.miyou-care-status,.miyou-daily,.miyou-care-history,.miyou-growth-bar')).toHaveCount(0);
   await expect(p.locator('.miyou-care-actions strong')).toHaveText(['喂食','运动','休息']);
   await expect(p.locator('.miyou-pair img')).toHaveCount(2);
   await expect.poll(()=>p.locator('.miyou-pair img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
   const pair=await p.locator('.miyou-pair .miyou-avatar').evaluateAll(avatars=>avatars.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,radius:getComputedStyle(el).borderRadius};}));
   assert.ok(pair[1].left<pair[0].right&&pair[1].left>pair[0].left,JSON.stringify(pair));
   assert.ok(pair.every(a=>a.width===a.height&&a.radius==='50%'));
   const careBox=await p.locator('.miyou-care-actions').boundingBox();assert.ok(careBox.y+careBox.height<=height+1,JSON.stringify(careBox));
   await geometry('pet');await p.screenshot({path:`${out}/${engine}-${width}-pet.png`});
   await p.locator('.miyou-care-actions').getByRole('button',{name:'运动',exact:true}).click();await expect(p.locator('.miyou-catalog button')).toHaveCount(6);await expect(p.locator('.miyou-sheet>p')).toHaveCount(0);await p.screenshot({path:`${out}/${engine}-${width}-catalog.png`});
   await p.getByRole('button',{name:'关闭',exact:true}).click();await p.locator('.miyou-header').getByRole('button',{name:'返回',exact:true}).click();
   await expect(p.getByLabel('消息',{exact:true})).toHaveValue('😊');
   await p.getByLabel('消息',{exact:true}).focus();
   await p.evaluate(()=>window.layoutKeyboard(380));
   await expect(p.locator('html')).toHaveAttribute('data-keyboard-open','true');
   await expect.poll(async()=>{const box=await p.locator('.miyou-composer').boundingBox();return box.y+box.height;}).toBeLessThanOrEqual(381);
   const rect=await p.locator('.miyou-composer').boundingBox();assert.ok(rect.y+rect.height<=381,JSON.stringify(rect));
   await p.screenshot({path:`${out}/${engine}-${width}-keyboard.png`});
   await context.close();
  }
  const english=await contextFor(a,320,568,'en');const en=await english.newPage();
  en.on('pageerror',e=>errors.push(e.message));
  await en.goto(`${base}?demo=1#tab=today&view=friend-space`);
  if(await en.locator('.launch-sequence').isVisible())await en.locator('.launch-sequence').click();
  await en.locator('.miyou-friend').click();await en.locator('.miyou-pet-banner').click();
  for(const [label,count,key] of [['Food',8,'food'],['Play',6,'play'],['Rest',3,'rest']]){
   await en.locator('.miyou-care-actions').getByRole('button',{name:label,exact:true}).click();
   await expect(en.locator('.miyou-catalog button')).toHaveCount(count);
   await expect(en.locator('.miyou-sheet>p')).toHaveCount(0);
   if(key==='food')await expect(en.locator('.miyou-catalog strong').first()).toHaveText('Pumpkin');
   const names=await en.locator('.miyou-catalog strong').evaluateAll(items=>items.map(el=>{
    const range=document.createRange();range.selectNodeContents(el);const boxes=[...range.getClientRects()];const card=el.parentElement.getBoundingClientRect();
    return {name:el.textContent,lines:boxes.length,fits:boxes.every(r=>r.left>=card.left&&r.right<=card.right)};
   }));
   assert.ok(names.every(n=>n.lines===1&&n.fits),JSON.stringify(names));
   await en.screenshot({path:`${out}/${engine}-320-${key}-en.png`});
   results.push({engine,width:320,height:568,state:`${key}-en`,names});
   await en.getByRole('button',{name:'Close',exact:true}).click();
  }
  await english.close();
  // Real avatar reference from the SQL state, signed storage transport locally
  // isolated; the same RLS policy decides whether the signing request is allowed.
  const avatarPath=`${b}/avatar-current`;
  await db.query('insert into public.profiles(id,avatar_url) values($1,$2) on conflict(id) do update set avatar_url=excluded.avatar_url',[b,`storage://profile-avatars/${avatarPath}`]);
  await db.query("insert into storage.objects(bucket_id,name) values('profile-avatars',$1)",[avatarPath]);
  const custom=await contextFor(a,390,844);let signed=0,broken=false;
  await custom.route('**/storage/v1/object/sign/profile-avatars/**',async route=>{
    if(route.request().method()==='POST'){
      const allowed=await db.transaction(async tx=>{
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);await tx.exec('set local role authenticated');
        return (await tx.query('select name from storage.objects where name=$1',[avatarPath])).rows.length===1;
      });assert.ok(allowed);signed++;
      await route.fulfill({json:{signedURL:`/object/sign/profile-avatars/${avatarPath}?token=isolated-test`}});
    }else if(broken)await route.fulfill({status:404,body:''});
    else await route.fulfill({contentType:'image/png',body:await readFile(new URL('../public/assets/miyou/avatar-puppy.png',import.meta.url))});
  });
  const cp=await custom.newPage();await cp.goto(`${base}?demo=1#tab=today&view=friend-space`);
  if(await cp.locator('.launch-sequence').isVisible())await cp.locator('.launch-sequence').click();
  await cp.locator('.miyou-friend').click();await cp.locator('.miyou-pet-banner').click();
  await expect(cp.locator('.miyou-pair img').last()).toHaveAttribute('src',/storage\/v1\/object\/sign/);
  await expect.poll(()=>cp.locator('.miyou-pair img').last().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  assert.ok(signed>0);await cp.screenshot({path:`${out}/${engine}-390-custom-avatar.png`});
  broken=true;await cp.reload();if(await cp.locator('.launch-sequence').isVisible())await cp.locator('.launch-sequence').click();
  await cp.locator('.miyou-friend').click();await cp.locator('.miyou-pet-banner').click();
  await expect(cp.locator('.miyou-pair img').last()).toHaveAttribute('src',/assets\/miyou\/avatar-/);
  await custom.close();await db.query('delete from public.profiles where id=$1',[b]);await db.query('delete from storage.objects where name=$1',[avatarPath]);
  results.push({engine,state:'private-avatar-and-load-failure',signed});
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
}
await writeFile(`${out}/browser.json`,JSON.stringify({passed:true,production:false,database:'isolated PostgreSQL',results},null,2));console.log(`Miyou browser/database integration passed: ${results.length} layouts.`);
}finally {await server.close();await db.close();}
