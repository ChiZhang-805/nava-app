import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/app-skins";
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), passed: false, results: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5248, strictPort: true }, logLevel: "silent" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const skins = ["glacier-mist", "violet-dusk", "sky-ripple"];
const recordModules = ["sleep", "exercise", "mood", "focus", "diet", "face"];

async function initialize(context) {
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: { "fluffy-first-guide-sleep": true, "fluffy-first-guide-sport": true, "fluffy-first-guide-mood": true, "fluffy-first-guide-focus": true, "fluffy-first-guide-food": true, "fluffy-first-guide-face": true } } }));
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
  });
}

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce", locale: "zh-CN" });
    await initialize(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(`${width}x${height}: ${error.message}`));
    await page.goto(`${base}?demo=1#tab=profile`, { waitUntil: "networkidle" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".app-skin-option")).toHaveCount(3);
    for (const skin of skins) {
      if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
      await page.locator(`.profile-skin-card .app-skin-option--${skin}`).click({ force: true });
      await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
      await expect(page.locator(`.profile-skin-card .app-skin-option--${skin}`)).toHaveAttribute("aria-checked", "true");
      const geometry = await page.locator(".phone-frame").evaluate((frame) => ({
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        skin: frame.getAttribute("data-app-skin"),
        navVisible: Boolean(frame.querySelector(".bottom-nav")),
      }));
      assert.ok(geometry.horizontalOverflow <= 1, `${width} ${skin} horizontal overflow ${geometry.horizontalOverflow}`);
      assert.ok(geometry.navVisible, `${width} ${skin} navigation missing`);
      report.results.push({ viewport: `${width}x${height}`, ...geometry });
      if (width === 390) await page.screenshot({ path: `${output}/${skin}-profile-${width}x${height}.png` });
    }
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "sky-ripple");
    await page.locator(".nava-more-trigger").first().click();
    await page.locator(".more-menu-skin").click();
    await expect(page.locator('.app-utility-popover [role="radiogroup"]')).toBeVisible();
    await page.locator(".app-utility-popover .app-skin-option--violet-dusk").click();
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "violet-dusk");
    const journalModules = width === 390 ? recordModules : ["sleep"];
    for (const module of journalModules) {
      await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
      await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 30000 });
      const journal = page.frameLocator(".journal-experience iframe");
      const expectedCategory = module === "exercise" ? "sport" : module === "diet" ? "food" : module;
      await expect(journal.locator("html")).toHaveAttribute("data-app-skin", "violet-dusk", { timeout: 20000 });
      await expect(journal.locator("html")).toHaveAttribute("data-record-module", expectedCategory, { timeout: 20000 });
      if (width === 390) await page.screenshot({ path: `${output}/violet-dusk-${module}-${width}x${height}.png` });
    }
    await page.evaluate(() => { location.hash = "tab=record"; });
    await expect(page.locator('.record-hub')).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "violet-dusk");
    if (width === 390) await page.screenshot({ path: `${output}/violet-dusk-records-${width}x${height}.png` });
    await page.evaluate(() => { location.hash = "tab=today"; });
    await expect(page.locator(".option-two-home")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "violet-dusk");
    if (width === 390) await page.screenshot({ path: `${output}/violet-dusk-home-${width}x${height}.png` });
    if (width === 390) {
      await page.evaluate(() => { location.hash = "tab=profile"; });
      await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
      await page.locator(".profile-skin-card .app-skin-option--sky-ripple").click({ force: true });
      for (const module of recordModules) {
        await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
        await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 30000 });
        const journal = page.frameLocator(".journal-experience iframe");
        const expectedCategory = module === "exercise" ? "sport" : module === "diet" ? "food" : module;
        await expect(journal.locator("html")).toHaveAttribute("data-app-skin", "sky-ripple", { timeout: 20000 });
        await expect(journal.locator("html")).toHaveAttribute("data-record-module", expectedCategory, { timeout: 20000 });
        await page.screenshot({ path: `${output}/sky-ripple-${module}-${width}x${height}.png` });
      }
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("Three skins, both switchers, persistence, shared routes and four portrait sizes passed.");
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
