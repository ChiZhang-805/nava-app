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
      const quarterButtons = [...frame.querySelectorAll(".profile-quarter-header nav button")];
      const rowStyle = firstRow ? getComputedStyle(firstRow) : null;
      const headerStyle = activeHeaderButton ? getComputedStyle(activeHeaderButton) : null;
      return {
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        headerBackground: headerStyle?.backgroundColor,
        quarterButtonBackgrounds: quarterButtons.map((button) => getComputedStyle(button).backgroundColor),
        quarterButtonShadows: quarterButtons.map((button) => getComputedStyle(button).boxShadow),
        rowBackground: rowStyle?.backgroundColor,
        heatmapWidth: heatmap?.getBoundingClientRect().width ?? 0,
        viewportWidth: frame.getBoundingClientRect().width,
        moduleHeights: Array.from(frame.querySelectorAll(".profile-overview > .section-card"), (node) => node.getBoundingClientRect().height),
      };
    });
    assert.ok(overview.horizontalOverflow <= 1, `${width}x${height} horizontal overflow ${overview.horizontalOverflow}`);
    assert.equal(overview.headerBackground, "rgba(0, 0, 0, 0)", `${width}x${height} header action has a background`);
    assert.deepEqual(overview.quarterButtonBackgrounds, ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"], `${width}x${height} quarter arrows must not have backgrounds`);
    assert.deepEqual(overview.quarterButtonShadows, ["none", "none"], `${width}x${height} quarter arrows must not have shadows`);
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

    const skeletonPage = await context.newPage();
    skeletonPage.on("pageerror", (error) => report.errors.push(`${width}x${height} skeleton: ${error.message}`));
    await skeletonPage.goto(`${base}?demo=1&qa=skeleton#tab=profile`, { waitUntil: "networkidle" });
    if (await skeletonPage.locator(".launch-sequence").isVisible()) await skeletonPage.locator(".launch-sequence").click();
    await expect(skeletonPage.locator(".page-skeleton--profile")).toBeVisible({ timeout: 20000 });
    if (await skeletonPage.locator(".completion-celebration-layer").count()) await skeletonPage.keyboard.press("Escape");
    await expect(skeletonPage.locator(".page-skeleton-profile-quarter-day")).toHaveCount(98);
    await expect(skeletonPage.locator(".page-skeleton-profile-entry-row")).toHaveCount(7);
    const skeletonGeometry = await skeletonPage.locator(".phone-frame").evaluate((frame) => {
      const content = frame.querySelector(".app-content");
      return {
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        moduleHeights: Array.from(frame.querySelectorAll(".page-skeleton--profile > .section-card"), (node) => node.getBoundingClientRect().height),
        scrollbarWidth: content ? getComputedStyle(content).scrollbarWidth : "",
      };
    });
    assert.ok(skeletonGeometry.horizontalOverflow <= 1, `${width}x${height} profile skeleton horizontal overflow`);
    assert.equal(skeletonGeometry.scrollbarWidth, "none", `${width}x${height} profile skeleton must hide scrollbar chrome`);
    assert.equal(skeletonGeometry.moduleHeights.length, overview.moduleHeights.length, `${width}x${height} profile skeleton module count mismatch`);
    skeletonGeometry.moduleHeights.forEach((height, index) => {
      assert.ok(Math.abs(height - overview.moduleHeights[index]) <= 3, `${width}x${height} profile skeleton module ${index + 1} height mismatch: ${height} vs ${overview.moduleHeights[index]}`);
    });
    await skeletonPage.screenshot({ path: `${output}/profile-skeleton-${width}x${height}.png`, fullPage: true });
    await skeletonPage.close();

    for (const subpage of subpages) {
      await page.evaluate((next) => { location.hash = `tab=profile&view=${next}`; }, subpage);
      await expect(page.locator(`.profile-subpage[data-profile-view="${subpage}"]`)).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".bottom-nav")).toHaveCount(0);
      await expect(page.locator(".figma-app-header h1")).not.toBeEmpty();
      const routeGeometry = await page.locator(".phone-frame").evaluate((frame) => ({
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        contentOverflow: Math.max(0, (frame.querySelector(".app-content")?.scrollWidth ?? 0) - (frame.querySelector(".app-content")?.clientWidth ?? 0)),
        verticalOverflow: Math.max(0, (frame.querySelector(".app-content")?.scrollHeight ?? 0) - (frame.querySelector(".app-content")?.clientHeight ?? 0)),
        scrollbarWidth: frame.querySelector(".app-content") ? getComputedStyle(frame.querySelector(".app-content")).scrollbarWidth : "",
      }));
      assert.ok(routeGeometry.horizontalOverflow <= 1, `${width}x${height} ${subpage} frame overflow`);
      assert.ok(routeGeometry.contentOverflow <= 1, `${width}x${height} ${subpage} content overflow`);
      assert.equal(routeGeometry.scrollbarWidth, "none", `${width}x${height} ${subpage} must hide scrollbar chrome`);
      if (["skin", "health", "watch", "privacy", "account"].includes(subpage) || (subpage === "personal" && height >= 844)) {
        assert.ok(routeGeometry.verticalOverflow <= 1, `${width}x${height} ${subpage} must fit one screen, overflow ${routeGeometry.verticalOverflow}`);
      }
      if (subpage === "personal") {
        await expect(page.locator(".profile-bmi-summary")).toBeVisible();
        await expect(page.locator(".profile-personal-field")).toHaveCount(7);
        const fields = await page.locator(".profile-personal-field").evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          const control = node.querySelector("input, select, .profile-bmi-summary");
          const controlRect = control?.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, controlX: controlRect?.x ?? 0, controlWidth: controlRect?.width ?? 0, controlHeight: controlRect?.height ?? 0 };
        }));
        assert.ok(fields.every((field) => Math.abs(field.x - fields[0].x) <= 1 && Math.abs(field.width - fields[0].width) <= 1), `${width}x${height} personal fields must be one full-width row each`);
        assert.ok(fields.every((field, index) => index === 0 || field.y >= fields[index - 1].y + fields[index - 1].height), `${width}x${height} personal fields must stack vertically`);
        assert.ok(fields.every((field) => Math.abs(field.controlX - fields[0].controlX) <= 1 && Math.abs(field.controlWidth - fields[0].controlWidth) <= 1), `${width}x${height} personal controls must share one width`);
        assert.ok(fields.every((field) => Math.abs(field.controlHeight - fields[0].controlHeight) <= 2), `${width}x${height} BMI and personal controls must share one height: ${JSON.stringify(fields)}`);
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
      if (["health", "watch"].includes(subpage)) {
        await expect(page.locator(".profile-device-orb")).toHaveCount(1);
        await expect(page.locator(".profile-subpage-actions")).toHaveCount(0);
        await expect(page.locator(".profile-device-facts > div")).toHaveCount(3);
        const statusLine = await page.locator(".profile-device-status").evaluate((node) => ({
          overflow: node.scrollWidth - node.clientWidth,
          whiteSpace: getComputedStyle(node).whiteSpace,
        }));
        assert.ok(statusLine.overflow <= 1 && statusLine.whiteSpace === "nowrap", `${width}x${height} ${subpage} status must stay on one line`);
        await page.locator(".profile-device-orb").click();
        await expect(page.locator(".profile-device-status")).toContainText(subpage === "health" ? "同步完成" : "手表快照已更新", { timeout: 5000 });
        if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
      }
      if (subpage === "privacy") {
        await expect(page.locator(".profile-policy-list article")).toHaveCount(4);
        await expect(page.locator('.profile-privacy-card .action-button')).toHaveCount(0);
        await page.locator(".nava-more-trigger").click();
        await expect(page.locator('.app-utility-popover button').filter({ hasText: "导出我的数据" })).toHaveCount(1);
        await page.keyboard.press("Escape");
      }
      if (subpage === "account") {
        await expect(page.locator(".profile-security-entries > button")).toHaveCount(7);
        const securityRows = await page.locator(".profile-security-entries > button").evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }));
        assert.ok(securityRows.every((row) => Math.abs(row.x - securityRows[0].x) <= 1 && Math.abs(row.width - securityRows[0].width) <= 1), `${width}x${height} account entries must be one full-width row each`);
        assert.ok(securityRows.every((row, index) => index === 0 || row.y >= securityRows[index - 1].y + securityRows[index - 1].height), `${width}x${height} account entries must stack vertically`);
        await expect(page.locator(".profile-account-danger-actions .action-button")).toHaveCount(2);
        await expect(page.locator(".profile-account-danger-actions .action-button").last()).toHaveText("注销账号");
        await expect(page.locator(".profile-account-danger-actions .action-button").last().locator("svg")).toHaveCount(0);
        await expect(page.locator(".profile-account-actions-card")).toHaveCount(0);
        await page.locator(".profile-security-entries > button").first().click();
        await expect(page.locator(".profile-security-sheet")).toBeVisible();
        await expect(page.locator('.profile-security-sheet input[type="password"]')).toHaveCount(2);
        await page.locator('.profile-security-sheet input[type="password"]').nth(0).fill("123456");
        await page.locator('.profile-security-sheet input[type="password"]').nth(1).fill("654321");
        await page.locator(".profile-security-save").click();
        await expect(page.locator(".profile-security-sheet .error-text")).toContainText("不一致");
        await page.locator(".profile-security-sheet header button").click();
        await expect(page.locator(".profile-security-sheet")).toHaveCount(0);
        await page.locator(".profile-security-entries > button").nth(1).click();
        await expect(page.locator(".profile-security-sheet")).toContainText("使用现有验证码流程");
        await expect(page.locator(".profile-security-save")).toContainText("退出并进入找回流程");
        await page.locator(".profile-security-sheet header button").click();
        if (width === 390) {
          for (const [index, expected] of [[4, "尚未配置平台授权"], [5, "尚未配置平台授权"], [6, "需正式 iPhone 客户端"]]) {
            await page.locator(".profile-security-entries > button").nth(index).click();
            await expect(page.locator(".profile-security-save")).toBeDisabled();
            await expect(page.locator(".profile-security-save")).toContainText(expected);
            if (index === 6) {
              await expect(page.locator(".profile-security-info p")).toHaveCount(0);
              await page.screenshot({ path: `${output}/profile-account-gesture-${width}x${height}.png`, fullPage: true });
            }
            await page.locator(".profile-security-sheet header button").click();
          }
        }
        await expect(page.locator(".profile-security-note")).not.toContainText("不一致");
      }
      if (subpage === "personal" || (width === 390 && ["skin", "health", "watch", "privacy", "account"].includes(subpage))) {
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
