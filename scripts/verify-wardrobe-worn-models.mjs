import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const base = option("--base-url", "http://127.0.0.1:5278/").replace(/\/?$/, "/");
const output = resolve(option("--output", "Q:/NAVA-Workspace/Build/TestRuns/wardrobe-full-worn-v261/app-review"));
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(base)) throw new Error("Worn-model review only runs against localhost");
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile("scripts/mascot-models/meshy/accessory-catalog-v1.json", "utf8"));
const report = { passed: false, base, models: [], viewports: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
await context.addInitScript(() => {
  sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
  localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
});
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));

const face = async (character, canvas, degrees) => {
  await character.focus();
  await page.keyboard.press("Home");
  for (let angle = 0; angle < degrees; angle += 15) await page.keyboard.press("ArrowRight");
  await expect(canvas).toHaveAttribute("data-angle", String(degrees));
  await character.evaluate((element) => element.blur());
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};

try {
  await page.goto(`${base}?demo=1#tab=profile&view=wardrobe`, { waitUntil: "domcontentloaded" });
  const character = page.locator(".mascot-wardrobe-character");
  const canvas = page.locator(".mascot-wardrobe-turntable");
  const preview = page.locator(".mascot-wardrobe-preview");
  await character.waitFor({ timeout: 30000 });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  await expect(character).toHaveAttribute("data-renderer", "ready", { timeout: 90000 });
  await page.getByRole("tab", { name: "饰品" }).click();

  for (const item of catalog.accessories) {
    const card = page.locator(".mascot-wardrobe-item").filter({ hasText: item.zh });
    await card.click();
    await expect(canvas).toHaveAttribute("data-accessories", item.id);
    await expect(canvas).toHaveAttribute("data-worn-model", item.id, { timeout: 90000 });
    await expect(page.locator('.mascot-wardrobe-item[data-selected="true"]')).toHaveCount(1);
    const front = await canvas.screenshot();
    assert.ok(front.length > 1000, `${item.slug} rendered an empty canvas`);
    const screenshots = [];
    for (const angle of [0, 90, 180, 270]) {
      await face(character, canvas, angle);
      const file = `${item.slug}-${String(angle).padStart(3, "0")}.png`;
      await preview.screenshot({ path: resolve(output, file) });
      screenshots.push(file);
    }
    await face(character, canvas, 0);
    const seam = await canvas.screenshot();
    await character.focus();
    for (let count = 0; count < 24; count++) await page.keyboard.press("ArrowRight");
    await character.evaluate((element) => element.blur());
    await expect(canvas).toHaveAttribute("data-angle", "0");
    assert.ok(seam.equals(await canvas.screenshot()), `${item.slug} changed across the 360-degree seam`);
    const beforeAction = await canvas.screenshot();
    await character.click();
    await expect(character).toHaveAttribute("data-motion", "rest", { timeout: 5000 });
    assert.ok(beforeAction.equals(await canvas.screenshot()), `${item.slug} did not return to its exact action endpoint`);
    report.models.push({ id: item.id, slug: item.slug, screenshots, seam: "identical", actionEndpoint: "identical" });
  }
  for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const geometry = await page.evaluate(() => {
      const preview = document.querySelector(".mascot-wardrobe-preview").getBoundingClientRect();
      const action = document.querySelector(".mascot-wardrobe-action button").getBoundingClientRect();
      return { overflowX: document.documentElement.scrollWidth - innerWidth, previewBottom: preview.bottom, actionBottom: action.bottom, height: innerHeight };
    });
    assert.ok(geometry.overflowX <= 1 && geometry.actionBottom <= geometry.height + 1);
    const file = `viewport-${width}x${height}.png`;
    await page.screenshot({ path: resolve(output, file) });
    report.viewports.push({ width, height, file, geometry });
  }
  report.passed = report.models.length === 17 && report.viewports.length === 4 && report.errors.length === 0;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}

if (!report.passed) throw new Error(report.errors.join("\n"));
console.log(`Complete worn-model review passed: ${report.models.length} models, four angles each, exact 360 seam and click-action endpoints.`);
