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
const profileLayerSamples = [];

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
    await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".profile-quarter-card")).toBeVisible();
    await expect(page.locator(".profile-nav-row")).toHaveCount(7);
    if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
    await page.locator('.profile-nav-row[data-profile-target="skin"]').click();
    await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".app-skin-option")).toHaveCount(3);
    for (const skin of skins) {
      if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
      await page.locator(`.profile-skin-card .app-skin-option--${skin}`).click({ force: true });
      await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
      await expect(page.locator(`.profile-skin-card .app-skin-option--${skin}`)).toHaveAttribute("aria-checked", "true");
      await expect(page.locator(".profile-skin-card .app-skin-palette b")).toHaveCount(9);
      const skinRoutePaint = await page.evaluate(() => {
        const paint = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
        };
        return {
          header: paint(".figma-app-header"),
          shell: paint(".profile-skin-card"),
          choices: [...document.querySelectorAll(".profile-skin-card .app-skin-option")].map((element) => {
            const style = getComputedStyle(element);
            return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
          }),
          palette: [...document.querySelectorAll(".profile-skin-card .app-skin-palette b")].map((element) => getComputedStyle(element).backgroundColor),
        };
      });
      assert.ok(skinRoutePaint.header && skinRoutePaint.shell, `${width} ${skin} should theme the skin route chrome`);
      assert.equal(new Set(skinRoutePaint.choices).size, 3, `${width} ${skin} should show three independently coloured option cards`);
      assert.ok(new Set(skinRoutePaint.palette).size >= 7, `${width} ${skin} should expose the three palettes instead of repeated placeholders`);
      const geometry = await page.locator(".phone-frame").evaluate((frame) => ({
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        skin: frame.getAttribute("data-app-skin"),
        navVisible: Boolean(frame.querySelector(".bottom-nav")),
      }));
      assert.ok(geometry.horizontalOverflow <= 1, `${width} ${skin} horizontal overflow ${geometry.horizontalOverflow}`);
      assert.equal(geometry.navVisible, false, `${width} ${skin} subpage navigation should be hidden`);
      report.results.push({ viewport: `${width}x${height}`, ...geometry, skinRoutePaint });
      if (width === 390) await page.screenshot({ path: `${output}/${skin}-profile-${width}x${height}.png` });
      if (width === 390) {
        await page.evaluate(() => { location.hash = "tab=profile"; });
        await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".bottom-nav")).toBeVisible();
        const layers = await page.evaluate(() => {
          const paint = (selector, pseudo = null) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const style = getComputedStyle(element, pseudo);
            return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
          };
          return {
            header: paint(".figma-app-header"),
            account: paint(".profile-overview-account"),
            quarter: paint(".profile-quarter-card"),
            entries: paint(".profile-entry-card"),
            dock: paint(".bottom-nav"),
            orb: paint(".ai-nav-orb"),
          };
        });
        assert.ok(Object.values(layers).every(Boolean), `${skin} should expose every themed profile layer`);
        profileLayerSamples.push({ skin, layers });
        report.results.push({ viewport: `${width}x${height}`, skin, profileLayers: layers });
        await page.screenshot({ path: `${output}/${skin}-profile-overview-${width}x${height}.png` });
        await page.locator('.profile-nav-row[data-profile-target="skin"]').click();
        await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
        await page.evaluate(() => { location.hash = "tab=profile&view=health"; });
        await expect(page.locator('.profile-device-experience[data-profile-view="health"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
        await expect(page.locator(".profile-device-orb")).toBeVisible();
        const deviceFlattening = await page.evaluate(() => {
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const isPaintless = (element) => {
            const style = getComputedStyle(element);
            return transparent(style.backgroundColor)
              && style.backgroundImage === "none"
              && style.boxShadow === "none"
              && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((value) => parseFloat(value) === 0);
          };
          return {
            stage: isPaintless(document.querySelector(".profile-device-stage")),
            facts: isPaintless(document.querySelector(".profile-device-facts")),
            factRows: [...document.querySelectorAll(".profile-device-facts > div")].every(isPaintless),
          };
        });
        assert.ok(Object.values(deviceFlattening).every(Boolean), `${skin} device page must keep its stage and rows on one unsegmented surface`);
        await page.screenshot({ path: `${output}/${skin}-health-${width}x${height}.png` });
        await page.evaluate(() => { location.hash = "tab=profile&view=account"; });
        await expect(page.locator('.profile-subpage[data-profile-view="account"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".profile-security-entries > button")).toHaveCount(7);
        await expect(page.locator(".profile-account-security-card > .section-heading")).toHaveCount(0);
        await expect(page.locator(".profile-security-note")).toHaveCount(0);
        await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
        const accountFlattening = await page.evaluate(() => {
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const isPaintless = (element) => {
            const style = getComputedStyle(element);
            return transparent(style.backgroundColor)
              && style.backgroundImage === "none"
              && style.boxShadow === "none"
              && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((value) => parseFloat(value) === 0);
          };
          return {
            group: isPaintless(document.querySelector(".profile-security-entries")),
            rows: [...document.querySelectorAll(".profile-security-entries > button")].every(isPaintless),
          };
        });
        assert.ok(Object.values(accountFlattening).every(Boolean), `${skin} account list must not restore nested cards, row backgrounds, or dividers`);
        if (width === 390) {
          await page.locator(".profile-security-entries > button").first().click();
          await expect(page.locator(".profile-security-sheet")).toBeVisible();
          const skinSheet = await page.evaluate(() => {
            const frame = document.querySelector(".phone-frame").getBoundingClientRect();
            const sheet = document.querySelector(".profile-security-sheet").getBoundingClientRect();
            const closeStyle = getComputedStyle(document.querySelector(".profile-security-sheet > header > button"));
            return {
              centerX: Math.abs((sheet.left + sheet.width / 2) - (frame.left + frame.width / 2)),
              centerY: Math.abs((sheet.top + sheet.height / 2) - (frame.top + frame.height / 2)),
              closeTransparent: ["transparent", "rgba(0, 0, 0, 0)"].includes(closeStyle.backgroundColor) && closeStyle.backgroundImage === "none",
            };
          });
          assert.ok(skinSheet.centerX <= 1 && skinSheet.centerY <= 2 && skinSheet.closeTransparent, `${skin} security sheet must stay centered with a backgroundless close action`);
          await page.screenshot({ path: `${output}/${skin}-account-password-${width}x${height}.png` });
          await page.locator(".profile-security-sheet > header > button").click();
        }
        await page.screenshot({ path: `${output}/${skin}-account-${width}x${height}.png` });
        await page.evaluate(() => { location.hash = "tab=profile&view=skin"; });
        await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
      }
    }
    await page.locator(".figma-app-header > .figma-header-action").first().click();
    await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible();
    await expect(page.locator(".bottom-nav")).toBeVisible();
    if (width === 390) await page.screenshot({ path: `${output}/sky-ripple-profile-overview-${width}x${height}.png` });
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
      await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible({ timeout: 20000 });
      if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
      await page.locator('.profile-nav-row[data-profile-target="skin"]').click();
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
  const uniqueLayerPaints = new Set(profileLayerSamples.map(({ layers }) => Object.values(layers).join(";")));
  assert.equal(uniqueLayerPaints.size, skins.length, "each skin should produce a distinct full-profile palette");
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("Three skins, both switchers, persistence, shared routes and four portrait sizes passed.");
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
