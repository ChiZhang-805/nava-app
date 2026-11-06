// Real components/services against isolated HTTP fixtures. No production account writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
applyProjectPublicEnv(process.cwd());
const out = "Q:/NAVA-Workspace/Build/TestRuns/admin-catalog";
await mkdir(out, { recursive: true });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import ReactDOM from 'react-dom/client';import {LocaleProvider} from '/src/i18n.tsx';
import Admin from '/src/features/AdminConsole.tsx';import Shop from '/src/features/PointsShopExperience.tsx';
import '/src/styles/global.css';import '/src/styles/figma-v2.css';import '/src/styles/shared-overlays.css';
function Fixture(){const [view,setView]=React.useState('points-shop');return React.createElement('main',{style:{height:'100dvh',width:'100%',overflow:'hidden'}},location.hash==='#shop'?React.createElement(Shop,{user:{id:'10000000-0000-4000-8000-000000000001'},view,onViewChange:setView,onHome:()=>{}}):React.createElement(Admin,{user:{id:'10000000-0000-4000-8000-000000000001'},onHome:()=>{}}));}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server = await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 5264, strictPort: true }, plugins: [{ name: "admin-fixture", configureServer(s) { s.middlewares.use(async (req, res, next) => { if (!req.url?.startsWith("/__admin.html")) return next(); res.setHeader("Content-Type", "text/html"); res.end(await s.transformIndexHtml(req.url, html)); }); } }] });
await server.listen();
const browser = await chromium.launch();
const report = [];
async function geometry(page) {
  return page.evaluate(() => {
    const screen = document.querySelector(".admin-console-screen");
    const form = document.querySelector(".admin-notice-layout .admin-form-card");
    const textarea = form?.querySelector("textarea");
    return { overflow: screen.scrollWidth-screen.clientWidth, font: textarea ? getComputedStyle(textarea).fontSize : null,
      formBottom: form?.getBoundingClientRect().bottom, textareaHeight: textarea?.getBoundingClientRect().height,
      height: innerHeight, homeBackground: getComputedStyle(document.querySelector(".home-experience-back")).backgroundColor };
  });
}
try {
  for (const viewport of [{width:320,height:568},{width:360,height:740},{width:375,height:812},{width:390,height:844},{width:430,height:932}]) for (const lang of ["zh","en"]) {
    const zh=lang==="zh";
    const context=await browser.newContext({viewport,locale:zh?"zh-CN":"en-US",hasTouch:true,isMobile:true});
    await context.addInitScript(lang=>localStorage.setItem("nava.locale",lang),lang);
    const calls=[],errors=[],products=[],cartRows=[];
    const control={failSave:false,failDelete:false};
    await context.route("**/*.supabase.co/**",async route=>{
      const url=new URL(route.request().url()),name=url.pathname.split("/").pop();
      const args=route.request().method()==="POST" && !url.pathname.includes("storage")?route.request().postDataJSON():null;
      let body;
      if(url.pathname.includes("/storage/v1/object/public/")) { await route.fulfill({path:"src/assets/shop/points-cards/mint-growth.webp",contentType:"image/webp"});return; }
      if(url.pathname.includes("/storage/v1/object/reward-products/")){body={Key:name};}
      else if(name==="nava_is_admin")body=true;
      else if(name==="nava_admin_list_reward_products_v2" || name==="reward_products")body=products;
      else if(["nava_admin_list_notification_batches","nava_admin_list_accounts"].includes(name))body=[];
      else if(name==="reward_cart_items")body=cartRows;
      else if(name==="nava_set_reward_cart_item"){assert.equal(args.target_quantity,0);cartRows.length=0;body={};calls.push({name,args});}
      else if(name==="nava_reward_card_state")body={balance:100,selectedCardId:"mint-growth",unlockedCardIds:["mint-growth","warm-companion","starlit-ideas"]};
      else if(name==="nava_admin_save_reward_product_v2"){
        calls.push({name,args});
        if(control.failSave){await route.fulfill({status:400,json:{message:"isolated save failure"}});return;}
        const p=args.product_data,id=p.id||"30000000-0000-4000-8000-000000000001";
        const item={...p,id,inventory_remaining:p.inventory,published:p.listing_status!=="unpublished",sold_out:false,updated_at:new Date().toISOString()};
        const i=products.findIndex(x=>x.id===id);if(i<0)products.push(item);else products[i]=item;
        body=id;
      }else if(name==="nava_admin_archive_reward_product"){
        calls.push({name,args});
        if(control.failDelete){await route.fulfill({status:400,json:{message:"isolated delete failure"}});return;}
        products.splice(products.findIndex(p=>p.id===args.product_id),1);body=args.product_id;
      }else{errors.push(`Unexpected request ${name}`);await route.abort();return;}
      await route.fulfill({status:200,json:body});
    });
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:5264/__admin.html");
    await expect(page.locator(".admin-console-actions > button")).toHaveCount(3, { timeout: 15000 });
    assert.equal((await geometry(page)).homeBackground,"rgba(0, 0, 0, 0)");
    await page.getByRole("button",{name:zh?"更多管理员操作":"More admin actions"}).click();
    assert.ok(await page.locator('[role=menuitem]').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:zh?"发布通知":"Publish notices",exact:true}).click();
    const notice=await geometry(page);assert.ok(notice.overflow<=1);assert.ok(notice.textareaHeight>=145);
    if(viewport.height>=740)assert.ok(Math.abs(notice.formBottom-(viewport.height-32))<=2,JSON.stringify(notice));
    await page.screenshot({path:`${out}/notice-${lang}-${viewport.width}.png`});
    await page.getByRole("button",{name:zh?"返回管理员首页":"Back to admin home"}).click();
    await page.screenshot({path:`${out}/overview-${lang}-${viewport.width}.png`});
    await page.getByRole("button",{name:zh?"商品管理":"Product management",exact:true}).click();
    await page.getByRole("button",{name:zh?"发布商品":"New product",exact:true}).click();
    const files=["mint-growth","warm-companion","starlit-ideas","lavender-reading","sunset-garden"].map(n=>`src/assets/shop/points-cards/${n}.webp`);
    await page.getByLabel(zh?"添加图片":"Add images",{exact:true}).setInputFiles(files);
    await expect(page.locator(".admin-image-slide")).toHaveCount(6);
    await expect(page.locator(".admin-product-editor fieldset")).toBeEnabled();
    // Use the explicit control for deterministic cross-engine pagination; touch momentum
    // varies with the host compositor and is covered separately by the carousel geometry.
    await page.getByRole("button",{name:zh?"下一张图片":"Next image"}).click();
    await expect(page.locator(".admin-gallery-navigation > span")).toHaveText("2 / 5");
    await expect.poll(()=>page.locator(".admin-image-carousel").evaluate(el=>Math.abs(el.scrollLeft/el.clientWidth-1))).toBeLessThan(.005).catch(async error=>{console.log(await page.locator(".admin-image-carousel").evaluate(el=>({width:el.clientWidth,left:el.scrollLeft,snap:getComputedStyle(el).scrollSnapType,children:[...el.children].map(c=>({width:c.clientWidth,snap:getComputedStyle(c).scrollSnapAlign,rect:c.getBoundingClientRect().toJSON()}))})));throw error;});
    assert.equal(await page.locator(".admin-image-carousel").evaluate(el=>{const box=el.getBoundingClientRect();return [...el.children].filter(child=>{const r=child.getBoundingClientRect();return Math.min(r.right,box.right)-Math.max(r.left,box.left)>2;}).length;}),1);
    for(let i=0;i<4;i++){await page.getByRole("button",{name:zh?"下一张图片":"Next image"}).click();await expect(page.locator(".admin-gallery-navigation > span")).toHaveText(i===3?(zh?"添加图片":"Add images"):`${i+3} / 5`);}
    await expect(page.getByRole("button",{name:zh?"下一张图片":"Next image"})).toBeDisabled();
    for(let i=0;i<5;i++){await page.getByRole("button",{name:zh?"上一张图片":"Previous image"}).click();await expect(page.locator(".admin-gallery-navigation > span")).toHaveText(`${5-i} / 5`);}
    await page.screenshot({path:`${out}/editor-top-${lang}-${viewport.width}.png`});
    const fields=zh?[["商品名称（中文）","小猫笔记本"],["商品英文名称","Cat notebook"],["商品品牌（中文）","纳瓦"],["商品英文品牌","NAVA"],["商品标识","cat-notebook"],["商品说明（中文）","把每个微小的灵感，写进轻柔的晨光里。"],["商品英文说明","A little home for the ideas that arrive with the morning light."]]:[["Product name · Chinese","小猫笔记本"],["Product name · English","Cat notebook"],["Brand · Chinese","纳瓦"],["Brand · English","NAVA"],["Product identifier","cat-notebook"],["Description · Chinese","把每个微小的灵感，写进轻柔的晨光里。"],["Description · English","A little home for the ideas that arrive with the morning light."]];
    for(const[label,text]of fields)await page.getByLabel(label,{exact:true}).fill(text);
    if(viewport.width===390){
      await page.setViewportSize({width:390,height:460});
      await page.getByLabel(fields[6][0],{exact:true}).focus();
      await page.getByLabel(fields[6][0],{exact:true}).scrollIntoViewIfNeeded();
      const box=await page.getByLabel(fields[6][0],{exact:true}).boundingBox();
      assert.ok(box.y>=0&&box.y+box.height<=460);assert.ok((await geometry(page)).overflow<=1);
      await page.setViewportSize(viewport);
    }
    await page.getByLabel(zh?"积分价格":"Points price",{exact:true}).fill("10");
    await page.getByLabel(zh?"库存":"Inventory",{exact:true}).fill("5");
    await page.getByLabel(zh?"上架状态":"Listing status",{exact:true}).selectOption("upcoming");
    await page.getByRole("button",{name:zh?"保存商品":"Save product"}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/editor-bottom-${lang}-${viewport.width}.png`});
    assert.ok((await geometry(page)).overflow<=1);
    control.failSave=true;
    await page.getByRole("button",{name:zh?"保存商品":"Save product"}).click();
    await expect(page.locator(".admin-console-toast")).toContainText("isolated save failure");
    await expect(page.locator(".admin-console-screen")).toHaveAttribute("data-admin-page","editor");
    control.failSave=false;
    await page.getByRole("button",{name:zh?"保存商品":"Save product"}).click();
    await expect(page.locator(".admin-console-screen")).toHaveAttribute("data-admin-page","products");
    assert.equal(calls.at(-1).args.product_data.image_urls.length,5);
    await expect(page.locator(".admin-product-list")).toContainText(zh?"待上架":"Coming soon");
    await page.screenshot({path:`${out}/products-${lang}-${viewport.width}.png`});
    const shop=await context.newPage();await shop.goto("http://127.0.0.1:5264/__admin.html?qa=admin-console#shop");
    await expect(shop.locator(".points-shop-product-copy")).toContainText(zh?"小猫笔记本":"Cat notebook");
    await expect(shop.locator(".points-shop-add")).toBeDisabled();
    await shop.locator(".points-shop-product-open").click();
    await expect(shop.locator(".points-shop-brand")).toHaveText(zh?"纳瓦":"NAVA");
    await expect(shop.locator(".points-shop-detail footer button").first()).toBeDisabled();
    await shop.close();
    await page.getByRole("button",{name:zh?"编辑小猫笔记本":"Edit Cat notebook",exact:true}).click();
    await expect(page.getByLabel(fields[1][0],{exact:true})).toHaveValue("Cat notebook");
    await page.getByLabel(fields[1][0],{exact:true}).fill("Cat notebook — second edition");
    await page.getByRole("button",{name:zh?"返回商品管理":"Back to products"}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button",{name:zh?"取消":"Cancel",exact:true}).click();
    await expect(page.getByLabel(fields[1][0],{exact:true})).toHaveValue("Cat notebook — second edition");
    await page.getByLabel(zh?"上架状态":"Listing status",{exact:true}).selectOption("unpublished");
    await page.getByRole("button",{name:zh?"保存商品":"Save product"}).click();
    await expect(page.locator(".admin-product-list")).toContainText(zh?"已下架":"Unpublished");
    assert.equal(calls.at(-1).args.product_data.id,"30000000-0000-4000-8000-000000000001");
    const deleteLabel=zh?"删除小猫笔记本":"Delete Cat notebook — second edition";
    await page.getByRole("button",{name:deleteLabel,exact:true}).click();
    await page.getByRole("button",{name:zh?"取消":"Cancel",exact:true}).click();
    assert.equal(products.length,1);
    control.failDelete=true;
    await page.getByRole("button",{name:deleteLabel,exact:true}).click();
    await page.getByRole("button",{name:zh?"删除商品":"Remove product",exact:true}).click();
    await expect(page.locator(".admin-console-toast")).toContainText("isolated delete failure");
    await expect(page.locator(".admin-product-list article")).toHaveCount(1);
    control.failDelete=false;
    await page.getByRole("button",{name:deleteLabel,exact:true}).click();
    await page.getByRole("button",{name:zh?"删除商品":"Remove product",exact:true}).click();
    await expect(page.locator(".admin-product-list article")).toHaveCount(0);
    cartRows.push({product_id:"30000000-0000-4000-8000-000000000001",quantity:2});
    const staleCart=await context.newPage();await staleCart.goto("http://127.0.0.1:5264/__admin.html#shop");
    await staleCart.getByRole("button",{name:zh?"购物车，共 2 件":"Cart, 2 items",exact:true}).click();
    await expect(staleCart.locator(".points-shop-cart-list")).toContainText(zh?"商品已下架或移除":"Item unlisted or removed");
    await expect(staleCart.locator(".points-shop-checkout button")).toBeDisabled();
    await staleCart.getByRole("button",{name:zh?"移除不可购买商品":"Remove unavailable item"}).click();
    await expect(staleCart.locator(".points-shop-cart .points-shop-empty")).toBeVisible();
    await staleCart.close();
    assert.deepEqual(errors,[]);
    report.push({viewport,lang,notice,saveCalls:calls.filter(c=>c.name.includes("save")).length,archiveCalls:calls.filter(c=>c.name.includes("archive")).length});
    await context.close();
  }
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(`Admin catalog UI: ${report.length} viewport/language groups passed.`);
} finally { await browser.close();await server.close(); }
