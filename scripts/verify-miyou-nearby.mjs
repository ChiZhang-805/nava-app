// Real isolated SQL, simulated native bridge. Radio discovery is compiled on macOS.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
import { createMiyouTestDb, testUsers } from './miyou-test-db.mjs';
applyProjectPublicEnv(process.cwd());
const { db, rpc, nearby } = await createMiyouTestDb();
const [a,b] = testUsers;
await rpc(b,'join',{name:'附近的朋友'});
const peer = await nearby(b,'start');
const server = await createServer({ logLevel:'silent', server:{host:'127.0.0.1',port:0}, plugins:[{
 name:'nearby-fixture', resolveId(id){if(id==='virtual:nearby')return '\0nearby';},
 load(id){if(id==='\0nearby')return `
 import React from 'react';import{createRoot}from'react-dom/client';import{registerPlugin}from'@capacitor/core';
 const listeners={};window.calls={watch:0,stop:0};
 window.emit=(event,data={})=>(listeners[event]||[]).forEach(fn=>fn(data));
 registerPlugin('NavaNearby',{web:()=>({
   watchShake:async()=>{window.calls.watch++;return{available:true}},
   start:async({token})=>{window.activeToken=token;return{started:true}},
   stop:async()=>{window.calls.stop++},
   addListener:async(event,fn)=>{(listeners[event]??=[]).push(fn);return{remove:async()=>{listeners[event]=listeners[event].filter(f=>f!==fn)}}}
 })});
 const {default:Nearby}=await import('/src/features/MiyouNearby.tsx');
 window.root=createRoot(document.getElementById('root'));
 window.root.render(React.createElement(React.StrictMode,null,React.createElement(Nearby,{zh:true,onInvited:()=>{window.invited=true;window.root.unmount()}})));
 `;},
 configureServer(vite){vite.middlewares.use('/__nearby',async(req,res)=>{
  res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__nearby','<!doctype html><html><body><div id="root"></div><script type="module" src="/@id/virtual:nearby"></script></body></html>'));
 });}
}]});
await server.listen();
const browser=await chromium.launch();
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/rest/v1/rpc/nava_miyou_nearby',async route=>{
  const {action,payload}=route.request().postDataJSON();
  try{await route.fulfill({json:await nearby(a,action,payload)});}
  catch(e){await route.fulfill({status:400,json:{message:e.message}});}
 });
 await page.goto(`${server.resolvedUrls.local[0]}__nearby`);
 await expect.poll(()=>page.evaluate(()=>window.calls?.watch)).toBeGreaterThan(0);
 await page.evaluate(()=>window.emit('shake'));
 await expect(page.getByRole('button',{name:'停止查找'})).toBeVisible();
 await page.evaluate(token=>window.emit('peers',{tokens:[token]}),peer.token);
 await expect(page.getByText('附近的朋友',{exact:true})).toBeVisible();
 // A failed first session is not remembered as permanent refusal.
 await page.evaluate(()=>window.emit('failed'));
 await expect(page.getByRole('button',{name:'开始查找'})).toBeEnabled();
 await expect.poll(async()=>(await db.query('select count(*)::int n from public.miyou_nearby where user_id=$1',[a])).rows[0].n).toBe(0);
 await page.getByRole('button',{name:'开始查找'}).click();
 await expect(page.getByRole('button',{name:'停止查找'})).toBeVisible();
 await page.evaluate(token=>window.emit('peers',{tokens:[token]}),peer.token);
 await expect(page.getByText('附近的朋友',{exact:true})).toBeVisible();
 // Background stops discovery; foreground re-arms shake instead of auto-advertising.
 const before=await page.evaluate(()=>window.calls.watch);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByRole('button',{name:'开始查找'})).toBeVisible();
 await expect.poll(async()=>(await db.query('select count(*)::int n from public.miyou_nearby where user_id=$1',[a])).rows[0].n).toBe(0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>page.evaluate(()=>window.calls.watch)).toBeGreaterThan(before);
 await page.evaluate(()=>window.emit('shake'));
 await expect(page.getByRole('button',{name:'停止查找'})).toBeVisible();
 await page.evaluate(token=>window.emit('peers',{tokens:[token]}),peer.token);
 await page.getByRole('button',{name:'加好友',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.invited)).toBe(true);
 const request=(await rpc(b,'state')).friends[0];
 assert.equal(request.status,'pending');assert.equal(request.incoming,true);assert.equal(request.pet,null);
 await expect.poll(async()=>(await db.query('select count(*)::int n from public.miyou_nearby where user_id=$1',[a])).rows[0].n).toBe(0);
 assert.deepEqual(errors,[]);
 console.log('Nearby: shake, discovery, refusal retry, background/resume, explicit invitation and cleanup passed. Native radio mocked.');
} finally {await browser.close();await server.close();await db.close();}
