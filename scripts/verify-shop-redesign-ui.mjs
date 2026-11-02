// Isolated real-component integration, explicit test catalog/RPC responses.
// One browser/context at a time; no production accounts, purchases, or AI calls.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const out = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/shop-redesign';
await mkdir(out, { recursive: true });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import ReactDOM from 'react-dom/client';
import {LocaleProvider} from '/src/i18n.tsx';import Shop from '/src/features/PointsShopExperience.tsx';
import '/src/styles/global.css';import '/src/styles/figma-v2.css';
function Fixture(){const [view,setView]=React.useState('points-shop');return React.createElement('main',{style:{height:'100dvh',width:'100%',overflow:'hidden'}},React.createElement(Shop,{user:{id:'10000000-0000-4000-8000-000000000001'},view,onViewChange:setView,onHome:()=>setView(null)}));}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5251, strictPort: true }, plugins: [{ name: 'shop-test-only', configureServer(s) { s.middlewares.use(async (req,res,next) => { if(req.url !== '/__shop-fixture.html') return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html)); }); } }] });
await server.listen();const browser = await chromium.launch({headless:true});const results=[];
const viewports = [{width:320,height:568},{width:360,height:740},{width:375,height:812},{width:390,height:844},{width:430,height:932},{width:440,height:956}];
try {
 for (const viewport of viewports) for (const locale of ['zh','en']) for (const populated of [false,true]) {
  const context=await browser.newContext({viewport,locale:locale==='zh'?'zh-CN':'en-US',reducedMotion:'reduce',isMobile:true,hasTouch:true});
  try {
   const products=populated?[
     {id:'p1',slug:'notebook',name:locale==='zh'?'小猫陪伴手账本': 'Cat companion journal',description:'Test catalog only.\nLong product description '.repeat(12),point_price:120,image_urls:['https://shop-fixture.invalid/one','https://shop-fixture.invalid/two'],sold_out:false},
    {id:'p2',slug:'cat-charm',name:locale==='zh'?'NAVA 小猫挂件':'NAVA cat charm',description:'Test catalog only',point_price:200,image_urls:[],sold_out:true},
    {id:'p3',slug:'mug',name:locale==='zh'?'陶瓷杯':'Ceramic mug',description:'Test catalog only',point_price:90,image_urls:[],sold_out:false},
    {id:'p4',slug:'other',name:locale==='zh'?'测试长价格商品':'Test large points price',description:'Test catalog only',point_price:2147483647,image_urls:[],sold_out:false},
   ]:[];
   let cart=[]; let balance=500;let checkoutFail=false;let writes=0;
   await context.addInitScript(({locale})=>localStorage.setItem('nava.locale',locale),{locale});
   await context.route('https://shop-fixture.invalid/**',r=>r.fulfill({status:200,contentType:'image/png',path:'src/assets/figma/home-option2/home-mascot-v5.png'}));
   await context.route('**/*.supabase.co/**',async r=>{
    const name=new URL(r.request().url()).pathname.split('/').pop();let body;
    if(name==='reward_products')body=products;
    else if(name==='reward_cart_items')body=cart;
    else if(name==='nava_reward_points_balance')body=balance;
    else if(name==='nava_reward_card_state')body={balance,selectedCardId:'mint-growth',unlockedCardIds:['mint-growth','warm-companion','starlit-ideas']};
    else if(name==='nava_set_reward_cart_item') {writes++;const p=r.request().postDataJSON();cart=cart.filter(x=>x.product_id!==p.target_product);if(p.target_quantity)cart.push({product_id:p.target_product,quantity:p.target_quantity});body={};}
    else if(name==='nava_checkout_reward_cart') {if(checkoutFail){await r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'insufficient points'})});return;}balance-=cart.reduce((n,l)=>n+products.find(p=>p.id===l.product_id).point_price*l.quantity,0);cart=[];body={orderId:'order-fixture-001',totalPoints:120,balance,replayed:false};}
    else throw new Error('Unexpected request: '+name);
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
   page.on('console',m=>{if(m.type()==='error') console.error(m.text());});
   await page.goto('http://127.0.0.1:5251/__shop-fixture.html');
   try { await expect(page.locator('.points-shop-product-row')).toHaveCount(4); } catch(e) { console.error((await page.locator('body').innerText()).slice(0,1500)); throw e; }
   async function bounds(state){
    const metric=await page.locator('.points-shop-screen').evaluate(el=>({overflow:el.scrollWidth-el.clientWidth,children:[...el.querySelectorAll('.points-shop-product-row,.points-shop-detail,.points-shop-cart-list article,.points-shop-checkout')].map(n=>({width:n.clientWidth,overflow:n.scrollWidth-n.clientWidth,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))}));
    assert.ok(metric.overflow<=1,state+JSON.stringify(metric));assert.ok(metric.children.every(x=>x.overflow<=1&&x.left>=0&&x.right<=viewport.width+1),state+JSON.stringify(metric));
    await page.screenshot({path:out+'/'+locale+'-'+viewport.width+'-'+(populated?'items':'empty')+'-'+state+'.png'});
   }
   const cards=await page.locator('.points-shop-product-row').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom};}));
   assert.equal(cards[0].y,cards[1].y);assert.ok(cards[1].x>cards[0].x);assert.ok(cards[2].y>cards[0].bottom);
   await bounds('home');
   await page.locator('[data-category="study"]').click();
   await expect(page.locator('.points-shop-screen')).toHaveAttribute('data-shop-route','category');
   await expect(page.locator('.points-shop-product-row')).toHaveCount(populated?1:0);await bounds('category');
   if(!populated){await page.locator('.points-shop-empty button').click();await expect(page.locator('.points-shop-add:disabled')).toHaveCount(4);await page.locator('.points-shop-product-open').first().click();await expect(page.locator('.points-shop-detail footer button').first()).toBeDisabled();await bounds('detail');}
   else {
    await page.locator('.points-shop-search input').fill('zz_no_match');await expect(page.locator('.points-shop-product-row')).toHaveCount(0);await page.locator('.points-shop-search button').click();
    await page.locator('.points-shop-product-open').first().click();await bounds('detail');
    await page.locator('.points-shop-dots button').nth(1).click();await expect(page.locator('.points-shop-dots button').nth(1)).toHaveAttribute('aria-current','true');
    await page.locator('.points-shop-detail footer button').first().click();await expect(page.locator('.points-shop-cart-shortcut > span')).toHaveText('1');
    await page.locator('.home-experience-back').click();await expect(page.locator('.points-shop-header h1')).toHaveText(locale==='zh'?'积分商城':'Points shop');
    await page.locator('.points-shop-add').nth(2).click();await expect(page.locator('.points-shop-cart-shortcut > span')).toHaveText('2');
   }
   await page.locator('.points-shop-cart-shortcut').click();await bounds('cart');
   if(!populated){
    const centered=await page.locator('.points-shop-screen').evaluate(screen=>{const header=screen.querySelector('.points-shop-header').getBoundingClientRect(),cart=screen.querySelector('.points-shop-cart').getBoundingClientRect(),empty=screen.querySelector('.points-shop-cart > .points-shop-empty').getBoundingClientRect(),style=getComputedStyle(screen),contentBottom=screen.getBoundingClientRect().bottom-parseFloat(style.paddingBottom);return{headerBottom:header.bottom,cartTop:cart.top,cartBottom:cart.bottom,contentBottom,emptyCenter:(empty.top+empty.bottom)/2,availableCenter:(cart.top+cart.bottom)/2};});
    assert.ok(centered.cartTop>=centered.headerBottom&&centered.cartBottom<=centered.contentBottom+1&&Math.abs(centered.emptyCenter-centered.availableCenter)<2,`empty cart group must be centered in the usable content area ${JSON.stringify(centered)}`);
   }
   if(populated){
    const cartLayout=await page.locator('.points-shop-screen').evaluate(screen=>{const cart=screen.querySelector('.points-shop-cart').getBoundingClientRect(),list=screen.querySelector('.points-shop-cart-list'),items=[...list.querySelectorAll('article')].map(itemElement=>{const item=itemElement.getBoundingClientRect(),thumb=itemElement.querySelector('.points-shop-cart-thumb').getBoundingClientRect(),copy=itemElement.querySelector('.points-shop-cart-copy').getBoundingClientRect(),quantity=itemElement.querySelector('.points-shop-quantity').getBoundingClientRect();return{item,thumb,copy,quantity};}),checkout=screen.querySelector('.points-shop-checkout').getBoundingClientRect(),button=screen.querySelector('.points-shop-checkout button').getBoundingClientRect(),style=getComputedStyle(screen),contentBottom=screen.getBoundingClientRect().bottom-parseFloat(style.paddingBottom);return{cart,items,checkout,button,contentBottom,listOverflow:getComputedStyle(list).overflowY};});
    assert.equal(cartLayout.items.length,2);
    await expect(page.locator('.points-shop-cart-copy').first().locator('strong')).toHaveText(locale==='zh'?'小猫陪伴手账本':'Cat companion journal');
    assert.ok(cartLayout.items.every(({item})=>item.height<=104),`cart items must stay compact ${JSON.stringify(cartLayout)}`);
    assert.ok(cartLayout.items.every(({thumb,copy,quantity})=>thumb.right<=copy.left&&copy.right<=quantity.left),`cart content and quantity must share one horizontal row ${JSON.stringify(cartLayout)}`);
    assert.ok(cartLayout.items.every(({item,quantity})=>Math.abs((item.top+item.bottom-quantity.top-quantity.bottom)/2)<=2),`quantity controls must be vertically centered with their products ${JSON.stringify(cartLayout)}`);
    assert.ok(cartLayout.checkout.height<=76&&cartLayout.button.height<=50,`checkout bar must stay compact ${JSON.stringify(cartLayout)}`);
    assert.ok(Math.abs(cartLayout.checkout.bottom-cartLayout.cart.bottom)<=1&&cartLayout.checkout.bottom<=cartLayout.contentBottom+1,`checkout bar must remain at the bottom of the usable cart area ${JSON.stringify(cartLayout)}`);
    assert.equal(cartLayout.listOverflow,'auto');
    const submitCheckout=async()=>{await page.getByRole('button',{name:locale==='zh'?'使用这张卡片':'Choose Card',exact:true}).click();await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();};
    checkoutFail=true;await page.locator('.points-shop-checkout button').click();await submitCheckout();await expect(page.getByRole('alert')).toContainText(locale==='zh'?'积分不足':'enough points');await expect(page.locator('.points-shop-cart-list article')).toHaveCount(2);
    checkoutFail=false;await page.locator('.points-shop-checkout button').click();await submitCheckout();await expect(page.getByRole('dialog',{name:locale==='zh'?'订单已完成':'Order placed'})).toBeVisible({timeout:20000});await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();await expect(page.locator('.points-shop-cart-list article')).toHaveCount(0);
    // A stock change after adding must not strand a sold-out cart line.
    cart=[{product_id:'p2',quantity:2}];await page.reload();await expect(page.locator('.points-shop-product-row')).toHaveCount(4);await page.locator('.points-shop-cart-shortcut').click();await expect(page.locator('.points-shop-checkout button')).toBeDisabled();await page.getByRole('button',{name:locale==='zh'?'移除不可购买商品':'Remove unavailable item'}).click();await expect(page.locator('.points-shop-cart-list article')).toHaveCount(0);
    assert.equal(writes,3);
   }else assert.equal(writes,0);
   assert.deepEqual(errors,[]);results.push({viewport,locale,populated,passed:true});
  }finally{await context.close();}
 }
 await writeFile(out+'/results.json',JSON.stringify({passed:true,scope:'Component UI and explicit RPC fixtures, not a production purchase',results},null,2));console.log(JSON.stringify({passed:true,cases:results.length,out}));
}finally{await browser.close();await server.close();}
