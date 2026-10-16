import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = process.env.NAVA_WARDROBE_EVIDENCE_DIR ? `${process.env.NAVA_WARDROBE_EVIDENCE_DIR}/turntable` : "Q:/NAVA-Workspace/Build/TestRuns/wardrobe-turntable";
await mkdir(output, { recursive: true });
const service = await readFile("src/services/mascotWardrobe.ts", "utf8");
const items = [...service.matchAll(/id: "([^"]+)", category: "(skin|accessory)", zh: "([^"]+)"/g)].map(([, id, category, name]) => ({ id, category, name }));
const server = await createServer({ server: { host: "127.0.0.1", port: 5276, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const base = server.resolvedUrls.local[0];
const report = { passed: false, viewports: [], catalog: [], boundaries: [], errors: [] };
const pauses = new Set();

async function open(width = 390, height = 844, setup) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: "zh-CN" });
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
  });
  if (setup) await setup(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${base}?demo=1#tab=profile&view=wardrobe`, { waitUntil: "domcontentloaded" });
  await page.locator(".mascot-wardrobe-character").waitFor({ timeout: 20000 });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  return { context, page, character: page.locator(".mascot-wardrobe-character"), canvas: page.locator(".mascot-wardrobe-turntable") };
}

async function ready(view) { await expect(view.character).toHaveAttribute("data-renderer", "ready", { timeout: 30000 }); }
async function face(view, degrees) {
  await view.character.focus();
  await view.page.keyboard.press("Home");
  for (let angle = 0; angle < degrees; angle += 15) await view.page.keyboard.press("ArrowRight");
  await expect(view.canvas).toHaveAttribute("data-angle", String(degrees));
  await view.character.evaluate((element) => element.blur());
}
async function pauseAssets(context) {
  let resume;
  const wait = new Promise((resolve) => { resume = resolve; });
  pauses.add(resume);
  await context.route("**/*.glb", async (route) => { await wait; await route.continue().catch(() => {}); });
  return () => { pauses.delete(resume); resume(); };
}
async function lose(view) {
  await view.canvas.locator("xpath=self::*[@data-engine]").waitFor({ state: "attached" });
  await view.canvas.evaluate((canvas) => {
    window.__qaContextExtension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    window.__qaContextExtension.loseContext();
  });
  await expect(view.character).toHaveAttribute("data-renderer", "unavailable");
}
async function restore(view) {
  await view.page.evaluate(() => window.__qaContextExtension.restoreContext());
}

try {
  for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
    const view = await open(width, height); await ready(view);
    await face(view, 0);
    const still = await view.canvas.screenshot();
    for (const angle of [45, 90, 135, 180, 225, 270, 315]) {
      await face(view, angle);
      await view.page.screenshot({ path: `${output}/${width}x${height}-${angle}.png` });
      assert.equal(still.equals(await view.canvas.screenshot()), false, `view ${angle} must differ from the front`);
    }
    await view.character.focus();
    for (let count = 0; count < 3; count++) await view.page.keyboard.press("ArrowRight");
    await view.character.evaluate((element) => element.blur());
    await expect(view.canvas).toHaveAttribute("data-angle", "0");
    assert.ok(still.equals(await view.canvas.screenshot()), "0 and 360 must return identical canvas pixels");
    await view.page.screenshot({ path: `${output}/${width}x${height}-0.png` });
    const geometry = await view.page.evaluate(() => {
      const character = document.querySelector(".mascot-wardrobe-character").getBoundingClientRect();
      const summary = document.querySelector(".mascot-wardrobe-look-summary").getBoundingClientRect();
      const action = document.querySelector(".mascot-wardrobe-action button").getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, characterBottom: character.bottom, summaryTop: summary.top, actionBottom: action.bottom, height: innerHeight };
    });
    assert.ok(geometry.overflow <= 1 && geometry.characterBottom <= geometry.summaryTop && geometry.actionBottom <= geometry.height);
    const bounds = await view.character.boundingBox();
    const x = bounds.x + bounds.width * .3, y = bounds.y + bounds.height * .6;
    await view.page.mouse.move(x, y); await view.page.mouse.down(); await view.page.mouse.move(x + 115, y, { steps: 30 }); await view.page.mouse.up();
    assert.notEqual(await view.canvas.getAttribute("data-angle"), "0");
    await expect(view.character).toHaveAttribute("data-motion", "rest");
    const afterDrag = await view.canvas.screenshot();
    await view.character.click(); await expect(view.character).toHaveAttribute("data-motion", "bubble");
    await expect(view.character).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
    assert.ok(afterDrag.equals(await view.canvas.screenshot()), "action at a rotated angle returns to the same renderer frame");
    report.viewports.push({ width, height, seam: "identical", dragThenTap: "passed", geometry });
    await view.context.close();
  }

  const catalog = await open(); await ready(catalog);
  for (const category of ["skin", "accessory"]) {
    await catalog.page.getByRole("tab", { name: category === "skin" ? "皮肤" : "饰品" }).click();
    let previous = null;
    for (const item of items.filter((item) => item.category === category)) {
      if (category === "accessory" && previous) await catalog.page.locator(".mascot-wardrobe-item").filter({ hasText: previous.name }).click();
      await catalog.page.locator(".mascot-wardrobe-item").filter({ hasText: item.name }).click();
      await expect(catalog.canvas).toHaveAttribute(category === "skin" ? "data-skin" : "data-accessories", item.id);
      for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
        await face(catalog, angle);
        await catalog.page.locator(".mascot-wardrobe-preview").screenshot({ path: `${output}/${item.id}-${angle}.png` });
      }
      report.catalog.push({ id: item.id, angles: 8 });
      previous = item;
    }
    if (category === "skin") await catalog.page.locator(".mascot-wardrobe-item").filter({ hasText: "奶霜" }).click();
  }
  for (const item of items.filter((item) => item.category === "accessory").slice(0, -1)) await catalog.page.locator(".mascot-wardrobe-item").filter({ hasText: item.name }).click();
  for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
    await face(catalog, angle);
    await catalog.page.screenshot({ path: `${output}/all-accessories-${angle}.png` });
  }
  await catalog.context.close();

  let release;
  const lost = await open(390, 844, async (context) => { release = await pauseAssets(context); });
  await lose(lost); release();
  await lost.page.waitForLoadState("networkidle");
  await expect(lost.character).toHaveAttribute("data-renderer", "unavailable");
  assert.equal(await lost.canvas.evaluate((canvas) => canvas.getContext("webgl2").isContextLost()), true);
  await expect(lost.character.locator("img")).toHaveCount(1);
  await restore(lost); await ready(lost);
  report.boundaries.push("context lost while loading stays unavailable until restored");
  await lost.context.close();

  const early = await open(390, 844, async (context) => { release = await pauseAssets(context); });
  await lose(early); await restore(early);
  await expect(early.character).toHaveAttribute("data-renderer", "loading");
  release(); await ready(early);
  report.boundaries.push("early restoration does not announce ready before models load");
  await early.context.close();

  const cancelled = await open(390, 844, async (context) => { release = await pauseAssets(context); });
  await cancelled.canvas.locator("xpath=self::*[@data-engine]").waitFor({ state: "attached" });
  await cancelled.canvas.evaluate((canvas) => { window.__qaOldContext = canvas.getContext("webgl2"); });
  await cancelled.page.evaluate(() => { location.hash = "tab=profile"; });
  await expect(cancelled.canvas).toHaveCount(0);
  await expect.poll(() => cancelled.page.evaluate(() => window.__qaOldContext.isContextLost())).toBe(true);
  release();
  report.boundaries.push("leaving during loading immediately releases the detached WebGL context");
  await cancelled.context.close();

  const fallback = await open(390, 844, async (context) => {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.startsWith("webgl") ? null : original.call(this, type, ...args); };
    });
  });
  await expect(fallback.character).toHaveAttribute("data-renderer", "unavailable");
  await expect(fallback.character.locator("img")).toHaveCount(1);
  await expect(fallback.page.locator(".mascot-wardrobe-motion-hint")).not.toContainText("转身");
  await fallback.character.click(); await expect(fallback.character).toHaveAttribute("data-motion", "bubble");
  await expect(fallback.character).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
  report.boundaries.push("WebGL unavailable preserves the existing static art and click actions");
  await fallback.context.close();
  report.passed = report.errors.length === 0;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  for (const release of pauses) release();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}
if (!report.passed) throw new Error(report.errors.join("\n"));
console.log(`Wardrobe turntable passed: four viewports, ${report.catalog.length} variants × eight angles, exact 360 seam, drag/tap and ${report.boundaries.length} failure boundaries.`);
