// Actual shop + service boundary; all Supabase responses are isolated fixtures.
// Never signs into a real account or spends production points.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const out = "Q:/NAVA-Workspace/Build/TestRuns/card-gallery";
await mkdir(out, { recursive: true });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import ReactDOM from 'react-dom/client';
import {LocaleProvider} from '/src/i18n.tsx';import Shop from '/src/features/PointsShopExperience.tsx';
import '/src/styles/global.css';import '/src/styles/figma-v2.css';
function Fixture(){const [view,setView]=React.useState('points-shop-cards');return React.createElement('main',{style:{height:'100dvh',width:'100%',overflow:'hidden'}},React.createElement(Shop,{user:{id:'10000000-0000-4000-8000-000000000001'},view,onViewChange:setView,onHome:()=>setView(null)}));}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server = await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 5263, strictPort: true }, plugins: [{ name: "gallery-fixture", configureServer(s) { s.middlewares.use(async (req, res, next) => { if (req.url !== "/__gallery.html") return next(); res.setHeader("Content-Type", "text/html"); res.end(await s.transformIndexHtml(req.url, html)); }); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
const defaults = ["mint-growth", "warm-companion", "starlit-ideas"];

async function swipe(page, forward = true) {
  const rect = await page.locator(".points-card-gallery-track").boundingBox();
  const session = await page.context().newCDPSession(page);
  const start = rect.x + rect.width * (forward ? .87 : .13);
  const end = rect.x + rect.width * (forward ? .13 : .87);
  const y = rect.y + rect.height * .5;
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
    for (let i = 1; i <= 14; i++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start + (end - start) * i / 14, y }] });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await session.detach(); }
}

async function prepare(viewport, locale, balance = 20, allOwned = false) {
  const context = await browser.newContext({ viewport, locale: locale === "zh" ? "zh-CN" : "en-US", hasTouch: true, isMobile: true });
  await context.addInitScript(locale => localStorage.setItem("nava.locale", locale), locale);
  const state = { balance, selectedCardId: "mint-growth", unlockedCardIds: allOwned ? [...defaults, "lavender-reading", "seaside-studio", "sunset-garden"] : [...defaults] };
  const calls = [], errors = [];
  const control = { fail: false, delay: 0 };
  await context.route("**/*.supabase.co/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    let body;
    if (name === "reward_products" || name === "reward_cart_items") body = [];
    else if (name === "nava_reward_card_state") body = state;
    else if (name === "nava_unlock_reward_card_skin") {
      const args = route.request().postDataJSON(); calls.push(args);
      if (control.delay) await new Promise(resolve => setTimeout(resolve, control.delay));
      if (control.fail) { await route.fulfill({ status: 400, json: { message: "test network failure" } }); return; }
      if (!state.unlockedCardIds.includes(args.target_skin)) { state.unlockedCardIds.push(args.target_skin); state.balance -= 10; }
      state.selectedCardId = args.target_skin; body = state;
    } else { errors.push("Unexpected request " + name); await route.abort(); return; }
    await route.fulfill({ status: 200, json: body });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5263/__gallery.html");
  await expect(page.locator(".points-card-manager")).toBeVisible();
  return { context, page, state, calls, control, errors };
}

async function geometry(page) {
  // Wait until snapping has settled, not just when the selection crosses halfway.
  await expect.poll(() => page.locator(".points-card-gallery-track").evaluate(el => Math.abs(el.scrollLeft / el.clientWidth - Math.round(el.scrollLeft / el.clientWidth)))) .toBeLessThan(.005);
  const result = await page.evaluate(() => {
    const screen = document.querySelector(".points-shop-screen");
    const track = document.querySelector(".points-card-gallery-track").getBoundingClientRect();
    const cards = [...document.querySelectorAll(".points-card-gallery-art")].map(el => el.getBoundingClientRect());
    const visible = cards.filter(r => Math.min(r.right, track.right) - Math.max(r.left, track.left) > 2);
    const story = document.querySelector(".points-card-gallery-story");
    const price = document.querySelector(".points-card-gallery-price").getBoundingClientRect();
    const button = document.querySelector(".points-card-gallery-footer button").getBoundingClientRect();
    return { overflow: screen.scrollWidth - screen.clientWidth, visible: visible.length, storyLines: story.children.length,
      priceButtonGap: button.top - price.bottom, fontFamily: getComputedStyle(story).fontFamily,
      font: parseFloat(getComputedStyle(story).fontSize), card: visible[0]?.toJSON() };
  });
  assert.ok(result.overflow <= 1, JSON.stringify(result));
  assert.equal(result.visible, 1);
  assert.equal(result.storyLines, 5);
  assert.ok(Math.abs(result.priceButtonGap) <= 1, "Price must sit immediately above Add card: " + JSON.stringify(result));
  assert.ok(result.font >= 15);
  return result;
}

try {
  for (const viewport of [{width:320,height:568}, {width:360,height:740}, {width:375,height:812}, {width:390,height:844}, {width:430,height:932}]) {
    for (const locale of ["zh", "en"]) {
      const { context, page, calls, state, errors } = await prepare(viewport, locale);
      try {
        await page.locator(".points-card-manager-heading button").click();
        await expect(page.locator(".points-shop-screen")).toHaveAttribute("data-shop-route", "add-card");
        await expect(page.locator(".points-shop-header h1")).toHaveText(locale === "zh" ? "添加卡片" : "Add card");
        await expect(page.locator(".points-card-gallery-creator")).toContainText("张驰");
        await expect(page.locator(".points-card-gallery-price strong")).toHaveText("10 XP");
        const descriptions = [];
        for (const [index, id] of ["lavender-reading", "seaside-studio", "sunset-garden"].entries()) {
          if (index) await swipe(page);
          await expect(page.locator(".points-card-gallery")).toHaveAttribute("data-card-id", id);
          const metrics = await geometry(page);
          if (locale === "en") assert.match(metrics.fontFamily, /-apple-system/);
          descriptions.push(await page.locator(".points-card-gallery-story").innerText());
          await page.screenshot({path: `${out}/${locale}-${viewport.width}-${id}.png`});
        }
        assert.equal(new Set(descriptions).size, 3);
        await swipe(page, false);
        await expect(page.locator(".points-card-gallery")).toHaveAttribute("data-card-id", "seaside-studio");
        await page.locator(".points-card-gallery-footer button").click();
        await expect(page.locator(".points-card-wallet-list [role=radio]")).toHaveCount(4);
        assert.equal(calls.length, 1); assert.equal(calls[0].target_skin, "seaside-studio"); assert.equal(state.balance, 10);
        await expect(page.locator(".points-card-manager-summary strong")).toHaveText("10 XP");
        await page.locator(".points-card-manager-heading button").click();
        await expect(page.locator(".points-card-gallery-slide")).toHaveCount(2);
        await page.locator(".home-experience-back").click();
        await expect(page.locator(".points-card-manager")).toBeVisible();
        assert.deepEqual(errors, []);
        results.push({viewport, locale, touchSwipes: 3, singleVisibleCard: true, syncedDescriptions: true, target: calls[0].target_skin, fixtureBalance: state.balance});
      } finally { await context.close(); }
    }
  }

  const retry = await prepare({width:390,height:844}, "zh");
  try {
    const { page, calls, control, state } = retry;
    await page.locator(".points-card-manager-heading button").click();
    // Desktop pointer-drag and keyboard are supported in addition to real touch.
    const rect = await page.locator(".points-card-gallery-track").boundingBox();
    await page.mouse.move(rect.x + rect.width * .9, rect.y + 60); await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .1, rect.y + 60, {steps:12}); await page.mouse.up();
    await expect(page.locator(".points-card-gallery")).toHaveAttribute("data-card-id", "seaside-studio");
    await geometry(page);
    await page.locator(".points-card-gallery-track").focus(); await page.keyboard.press("ArrowRight");
    await expect(page.locator(".points-card-gallery")).toHaveAttribute("data-card-id", "sunset-garden");
    control.fail = true; control.delay = 650;
    await page.locator(".points-card-gallery-footer button").click();
    await expect(page.locator(".points-card-gallery-footer button")).toBeDisabled();
    await expect(page.getByRole("alert")).toBeVisible();
    assert.equal(state.balance, 20); assert.equal(state.unlockedCardIds.length, 3);
    await expect(page.locator(".points-card-gallery")).toHaveAttribute("data-card-id", "sunset-garden");
    control.fail = false;
    // Trigger twice in one tick: the mutation lock must emit only one retry.
    await page.locator(".points-card-gallery-footer button").evaluate(button => { button.click(); button.click(); });
    await expect(page.locator(".points-card-wallet-list [role=radio]")).toHaveCount(4);
    assert.equal(calls.length, 2); assert.equal(calls[0].request_key, calls[1].request_key); assert.equal(state.balance, 10);
    assert.deepEqual(retry.errors, []);
    results.push({failurePreservesState:true,retrySameKey:true,doubleClickOneMutation:true,mouseDrag:true,keyboard:true});
  } finally { await retry.context.close(); }

  const empty = await prepare({width:390,height:844}, "zh", 0);
  try {
    await empty.page.locator(".points-card-manager-heading button").click();
    await expect(empty.page.locator(".points-card-gallery-footer button")).toBeDisabled();
    await expect(empty.page.getByRole("status")).toHaveText("当前 0 积分，还差 10 积分");
    await swipe(empty.page); await geometry(empty.page);
    assert.equal(empty.calls.length, 0);
    await empty.page.screenshot({path:`${out}/zero-balance.png`});
    results.push({zeroBalanceBrowsing:true,noDeduction:true});
  } finally { await empty.context.close(); }

  const owned = await prepare({width:390,height:844}, "en", 0, true);
  try { await expect(owned.page.locator(".points-card-manager-heading button")).toHaveCount(0); assert.equal(owned.calls.length,0); results.push({allOwnedNoDuplicatePurchase:true}); }
  finally { await owned.context.close(); }
  await writeFile(`${out}/report.json`, JSON.stringify({passed:true,productionWrites:0,results},null,2));
  console.log(`Card gallery: ${results.length} scenarios passed; no production writes.`);
} finally { await browser.close(); await server.close(); }
