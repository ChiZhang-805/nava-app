import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/profile-hub";
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), passed: false, results: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5253, strictPort: true }, logLevel: "silent" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const subpages = ["personal", "skin", "health", "watch", "privacy", "account"];

async function initialize(context) {
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: {} } }));
  await context.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
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
    if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
    await expect(page.locator(".profile-overview .profile-section-title svg, .profile-overview .profile-quarter-header h2 svg, .profile-overview .profile-entry-header svg")).toHaveCount(3);
    await expect(page.locator(".profile-entry-header h2")).toHaveText("快捷入口");
    const quarterCellCount = await page.locator(".profile-quarter-day").count();
    assert.ok(quarterCellCount >= 91 && quarterCellCount <= 98, `${width}x${height} unexpected quarter cell count ${quarterCellCount}`);
    await expect(page.locator(".profile-nav-row")).toHaveCount(7);
    await expect(page.locator(".bottom-nav")).toBeVisible();

    const overview = await page.locator(".phone-frame").evaluate((frame) => {
      const activeHeaderButton = frame.querySelector(".figma-header-action");
      const firstRow = frame.querySelector(".profile-nav-row");
      const heatmap = frame.querySelector(".profile-quarter-weeks");
      const rowStyle = firstRow ? getComputedStyle(firstRow) : null;
      const headerStyle = activeHeaderButton ? getComputedStyle(activeHeaderButton) : null;
      return {
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        headerBackground: headerStyle?.backgroundColor,
        rowBackground: rowStyle?.backgroundColor,
        heatmapWidth: heatmap?.getBoundingClientRect().width ?? 0,
        viewportWidth: frame.getBoundingClientRect().width,
      };
    });
    assert.ok(overview.horizontalOverflow <= 1, `${width}x${height} horizontal overflow ${overview.horizontalOverflow}`);
    assert.equal(overview.headerBackground, "rgba(0, 0, 0, 0)", `${width}x${height} header action has a background`);
    assert.equal(overview.rowBackground, "rgba(0, 0, 0, 0)", `${width}x${height} profile row has a background`);
    assert.ok(overview.heatmapWidth > 240, `${width}x${height} quarter heatmap is too narrow`);
    report.results.push({ viewport: `${width}x${height}`, ...overview });
    await page.screenshot({ path: `${output}/profile-overview-${width}x${height}.png`, fullPage: true });
    const lastRow = page.locator('.profile-nav-row[data-profile-target="account"]');
    await lastRow.scrollIntoViewIfNeeded();
    const bottomClearance = await page.evaluate(() => {
      const row = document.querySelector('.profile-nav-row[data-profile-target="account"]');
      const nav = document.querySelector(".bottom-nav");
      return row && nav ? nav.getBoundingClientRect().top - row.getBoundingClientRect().bottom : -1;
    });
    assert.ok(bottomClearance >= -1, `${width}x${height} final profile entry is blocked by bottom navigation (${bottomClearance}px)`);
    if (width === 360) await page.screenshot({ path: `${output}/profile-overview-bottom-${width}x${height}.png` });

    for (const subpage of subpages) {
      await page.evaluate((next) => { location.hash = `tab=profile&view=${next}`; }, subpage);
      await expect(page.locator(`.profile-subpage[data-profile-view="${subpage}"]`)).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".bottom-nav")).toHaveCount(0);
      await expect(page.locator(".figma-app-header h1")).not.toBeEmpty();
      const routeGeometry = await page.locator(".phone-frame").evaluate((frame) => ({
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        contentOverflow: Math.max(0, (frame.querySelector(".app-content")?.scrollWidth ?? 0) - (frame.querySelector(".app-content")?.clientWidth ?? 0)),
        verticalOverflow: Math.max(0, (frame.querySelector(".app-content")?.scrollHeight ?? 0) - (frame.querySelector(".app-content")?.clientHeight ?? 0)),
      }));
      assert.ok(routeGeometry.horizontalOverflow <= 1, `${width}x${height} ${subpage} frame overflow`);
      assert.ok(routeGeometry.contentOverflow <= 1, `${width}x${height} ${subpage} content overflow`);
      if (["personal", "skin"].includes(subpage)) {
        assert.ok(routeGeometry.verticalOverflow <= 1, `${width}x${height} ${subpage} must fit one screen, overflow ${routeGeometry.verticalOverflow}`);
      }
      if (subpage === "personal") {
        await expect(page.locator(".profile-bmi-summary")).toBeVisible();
        const saveGeometry = await page.locator(".profile-personal-save").evaluate((button) => {
          const card = button.closest(".profile-personal-card");
          return { buttonWidth: button.getBoundingClientRect().width, cardInnerWidth: card ? card.clientWidth - parseFloat(getComputedStyle(card).paddingLeft) - parseFloat(getComputedStyle(card).paddingRight) : 0 };
        });
        assert.ok(Math.abs(saveGeometry.buttonWidth - saveGeometry.cardInnerWidth) <= 2, `${width}x${height} personal save must span the card`);
      }
      if (subpage === "skin") {
        await expect(page.locator(".profile-skin-card .app-skin-option")).toHaveCount(3);
        await expect(page.locator(".profile-skin-card .app-skin-poetry small")).toHaveCount(18);
        const cards = await page.locator(".profile-skin-card .app-skin-option").evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }));
        assert.ok(cards.every((card) => card.width >= width - 80), `${width}x${height} skin cards must be full-width rows`);
        assert.ok(cards.every((card, index) => index === 0 || card.y > cards[index - 1].y + cards[index - 1].height), `${width}x${height} skin cards must stack vertically`);
        assert.ok(cards.every((card) => card.height >= 100), `${width}x${height} skin cards must be tall enough`);
        const poemLines = await page.locator(".profile-skin-card .app-skin-poetry small").evaluateAll((nodes) => nodes.map((node) => ({
          horizontalOverflow: node.scrollWidth - node.clientWidth,
          rows: Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)),
        })));
        assert.ok(poemLines.every((line) => line.horizontalOverflow <= 1 && line.rows === 1), `${width}x${height} every skin poem line must remain a single line`);
      }
      if (width === 390 && ["personal", "skin", "account"].includes(subpage)) {
        await page.screenshot({ path: `${output}/profile-${subpage}-${width}x${height}.png`, fullPage: true });
      }
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("Profile overview, quarter activity, route-backed entry pages and four portrait sizes passed.");
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
