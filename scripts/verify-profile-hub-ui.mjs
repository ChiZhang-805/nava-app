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
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const subpages = ["personal", "skin", "wardrobe", "health", "watch", "privacy", "account"];

async function initialize(context) {
  const verifiedContacts = { email: null, phone: null };
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: {} } }));
  await context.route("**/functions/v1/security-contact-otp", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "verify") verifiedContacts[body.kind] = body.contact;
    await route.fulfill({ json: body.action === "send" ? { sent: true } : verifiedContacts });
  });
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
    await expect(page.locator(".profile-nav-row")).toHaveCount(8);
    await expect(page.locator(".bottom-nav")).toBeVisible();

    const overview = await page.locator(".phone-frame").evaluate((frame) => {
      const activeHeaderButton = frame.querySelector(".figma-header-action");
      const firstRow = frame.querySelector(".profile-nav-row");
      const heatmap = frame.querySelector(".profile-quarter-weeks");
      const quarterButtons = [...frame.querySelectorAll(".profile-quarter-header nav button")];
      const rowStyle = firstRow ? getComputedStyle(firstRow) : null;
      const headerStyle = activeHeaderButton ? getComputedStyle(activeHeaderButton) : null;
      const appHeader = frame.querySelector(":scope > .figma-app-header");
      const content = frame.querySelector(":scope > .app-content");
      const moduleTitles = [
        frame.querySelector(".profile-overview-account .profile-section-title"),
        frame.querySelector(".profile-quarter-header h2"),
        frame.querySelector(".profile-entry-header"),
      ];
      const moduleCards = [
        frame.querySelector(".profile-overview-account"),
        frame.querySelector(".profile-quarter-card"),
        frame.querySelector(".profile-entry-card"),
      ];
      return {
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        headerBackground: headerStyle?.backgroundColor,
        quarterButtonBackgrounds: quarterButtons.map((button) => getComputedStyle(button).backgroundColor),
        quarterButtonShadows: quarterButtons.map((button) => getComputedStyle(button).boxShadow),
        rowBackground: rowStyle?.backgroundColor,
        heatmapWidth: heatmap?.getBoundingClientRect().width ?? 0,
        viewportWidth: frame.getBoundingClientRect().width,
        moduleHeights: Array.from(frame.querySelectorAll(".profile-overview > .section-card"), (node) => node.getBoundingClientRect().height),
        appHeaderHeight: appHeader?.getBoundingClientRect().height ?? 0,
        contentPaddingTop: content ? parseFloat(getComputedStyle(content).paddingTop) : 0,
        titleMetrics: moduleTitles.map((title, index) => {
          const cardRect = moduleCards[index]?.getBoundingClientRect();
          const text = title?.querySelector("h2") ?? title;
          const icon = title?.querySelector("svg");
          const textRect = text?.getBoundingClientRect();
          const iconRect = icon?.getBoundingClientRect();
          const visualTop = Math.min(textRect?.top ?? Number.POSITIVE_INFINITY, iconRect?.top ?? Number.POSITIVE_INFINITY);
          return {
            topInset: Number.isFinite(visualTop) && cardRect ? visualTop - cardRect.top : -1,
            fontSize: text ? parseFloat(getComputedStyle(text).fontSize) : 0,
            fontWeight: text ? Number.parseFloat(getComputedStyle(text).fontWeight) : 0,
            iconSize: icon?.getBoundingClientRect().width ?? 0,
          };
        }),
        accountTitleBodyGap: (() => {
          const heading = frame.querySelector(".profile-overview-account .section-heading")?.getBoundingClientRect();
          const entry = frame.querySelector(".profile-account-entry")?.getBoundingClientRect();
          return heading && entry ? entry.top - heading.bottom : -1;
        })(),
        quickHeaderBorderBottom: getComputedStyle(frame.querySelector(".profile-entry-header")).borderBottomWidth,
        firstEntryBorderBottom: getComputedStyle(firstRow).borderBottomWidth,
        contentBottomGap: frame.querySelector(":scope > .bottom-nav").getBoundingClientRect().top - content.getBoundingClientRect().bottom,
        contentMarginBottom: parseFloat(getComputedStyle(content).marginBottom),
        contentPaddingBottom: parseFloat(getComputedStyle(content).paddingBottom),
        dock: (() => {
          const dock = frame.querySelector(":scope > .bottom-nav");
          const style = getComputedStyle(dock);
          const capsule = getComputedStyle(dock, "::before");
          return {
            background: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(Number.parseFloat),
            shadow: style.boxShadow,
            blur: style.backdropFilter || style.webkitBackdropFilter || "none",
            capsuleWidth: parseFloat(capsule.width),
            capsuleHeight: parseFloat(capsule.height),
          };
        })(),
      };
    });
    assert.ok(overview.horizontalOverflow <= 1, `${width}x${height} horizontal overflow ${overview.horizontalOverflow}`);
    assert.equal(overview.headerBackground, "rgba(0, 0, 0, 0)", `${width}x${height} header action has a background`);
    assert.deepEqual(overview.quarterButtonBackgrounds, ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"], `${width}x${height} quarter arrows must not have backgrounds`);
    assert.deepEqual(overview.quarterButtonShadows, ["none", "none"], `${width}x${height} quarter arrows must not have shadows`);
    assert.equal(overview.rowBackground, "rgba(0, 0, 0, 0)", `${width}x${height} profile row has a background`);
    assert.ok(overview.heatmapWidth > 240, `${width}x${height} quarter heatmap is too narrow`);
    assert.ok(overview.appHeaderHeight >= 48 && overview.appHeaderHeight <= 52.5, `${width}x${height} profile header must use the compact height contract`);
    assert.ok(overview.contentPaddingTop <= 7.5, `${width}x${height} profile first-module gap is too large`);
    overview.titleMetrics.forEach((metric, index) => {
      assert.ok(metric.topInset >= 8 && metric.topInset <= 18, `${width}x${height} profile module ${index + 1} title top inset ${metric.topInset}px is outside the recorded contract`);
      assert.ok(metric.fontSize >= 19, `${width}x${height} profile module ${index + 1} title is too small`);
      assert.ok(metric.fontWeight >= 750, `${width}x${height} profile module ${index + 1} title weight is too light`);
      assert.ok(metric.iconSize >= 20, `${width}x${height} profile module ${index + 1} icon is too small`);
    });
    assert.ok(Math.max(...overview.titleMetrics.map((metric) => metric.fontSize)) - Math.min(...overview.titleMetrics.map((metric) => metric.fontSize)) <= .25, `${width}x${height} profile module title sizes must match exactly`);
    assert.ok(Math.max(...overview.titleMetrics.map((metric) => metric.iconSize)) - Math.min(...overview.titleMetrics.map((metric) => metric.iconSize)) <= .25, `${width}x${height} profile module icon sizes must match exactly`);
    assert.ok(overview.accountTitleBodyGap >= 8 && overview.accountTitleBodyGap <= 14, `${width}x${height} account title needs a deliberate breathing gap before identity content`);
    assert.equal(parseFloat(overview.quickHeaderBorderBottom), 0, `${width}x${height} quick-access title divider must be removed`);
    assert.ok(parseFloat(overview.firstEntryBorderBottom) > 0, `${width}x${height} quick-access row dividers must remain`);
    assert.ok(overview.contentBottomGap >= -1 && overview.contentBottomGap <= 24, `${width}x${height} content viewport must end immediately above the floating dock`);
    assert.ok(overview.contentMarginBottom >= 96, `${width}x${height} content must reserve the floating dock outside its scroll viewport`);
    assert.ok(overview.contentPaddingBottom >= 18 && overview.contentPaddingBottom <= 60, `${width}x${height} content should keep a normal section inset after reserving the dock`);
    assert.equal(overview.dock.background, "rgba(0, 0, 0, 0)", `${width}x${height} dock container must be transparent`);
    assert.equal(overview.dock.backgroundImage, "none", `${width}x${height} dock container must not paint a full-width image`);
    assert.ok(overview.dock.borderWidths.every((value) => value === 0), `${width}x${height} dock container must be borderless`);
    assert.equal(overview.dock.shadow, "none", `${width}x${height} dock container must not cast a full-width shadow`);
    assert.equal(overview.dock.blur, "none", `${width}x${height} dock container must not blur the full-width background`);
    assert.ok(overview.dock.capsuleWidth < width - 20 && overview.dock.capsuleHeight <= 72, `${width}x${height} only the inner floating capsule may paint`);
    report.results.push({ viewport: `${width}x${height}`, ...overview });
    await page.screenshot({ path: `${output}/profile-overview-${width}x${height}.png`, fullPage: true });
    await page.locator(".app-content").evaluate((content) => content.scrollTo({ top: content.scrollHeight, behavior: "auto" }));
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
    await expect(skeletonPage.locator(".page-skeleton-profile-entry-row")).toHaveCount(8);
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
        overflowY: frame.querySelector(".app-content") ? getComputedStyle(frame.querySelector(".app-content")).overflowY : "",
      }));
      assert.ok(routeGeometry.horizontalOverflow <= 1, `${width}x${height} ${subpage} frame overflow`);
      assert.ok(routeGeometry.contentOverflow <= 1, `${width}x${height} ${subpage} content overflow`);
      assert.equal(routeGeometry.scrollbarWidth, "none", `${width}x${height} ${subpage} must hide scrollbar chrome`);
      if (["skin", "health", "watch", "privacy", "account"].includes(subpage) || (subpage === "personal" && height >= 844)) {
        assert.ok(routeGeometry.verticalOverflow <= 1, `${width}x${height} ${subpage} must fit one screen, overflow ${routeGeometry.verticalOverflow}`);
      }
      if (subpage === "wardrobe") assert.equal(routeGeometry.overflowY, "hidden", `${width}x${height} wardrobe must remain a one-screen composition`);
      if (subpage === "personal") {
        await expect(page.locator(".profile-bmi-summary")).toHaveCount(0);
        await expect(page.getByText("BMI 参考", { exact: true })).toHaveCount(0);
        await expect(page.locator(".profile-personal-field")).toHaveCount(9);
        await expect(page.locator(".profile-personal-card select")).toHaveCount(0);
        await expect(page.locator(".profile-choice-trigger")).toHaveCount(5);
        const choiceArrowInsets = await page.locator(".profile-choice-trigger").evaluateAll((triggers) => triggers.map((trigger) => {
          const triggerRect = trigger.getBoundingClientRect();
          const arrowRect = trigger.querySelector("svg").getBoundingClientRect();
          return triggerRect.right - arrowRect.right;
        }));
        assert.ok(choiceArrowInsets.every((inset) => inset >= 14 && inset <= 22), `${width}x${height} every choice arrow needs the same right breathing room: ${choiceArrowInsets.join(", ")}`);
        const fields = await page.locator(".profile-personal-field").evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          const control = node.querySelector("input, .profile-choice-trigger");
          const controlRect = control?.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, controlX: controlRect?.x ?? 0, controlWidth: controlRect?.width ?? 0, controlHeight: controlRect?.height ?? 0 };
        }));
        assert.ok(fields.every((field) => Math.abs(field.x - fields[0].x) <= 1 && Math.abs(field.width - fields[0].width) <= 1), `${width}x${height} personal fields must be one full-width row each`);
        assert.ok(fields.every((field, index) => index === 0 || field.y >= fields[index - 1].y + fields[index - 1].height), `${width}x${height} personal fields must stack vertically`);
        assert.ok(fields.every((field) => Math.abs(field.controlX - fields[0].controlX) <= 1 && Math.abs(field.controlWidth - fields[0].controlWidth) <= 1), `${width}x${height} personal controls must share one width`);
        assert.ok(fields.every((field) => Math.abs(field.controlHeight - fields[0].controlHeight) <= 2), `${width}x${height} personal inputs and custom choices must share one height: ${JSON.stringify(fields)}`);
        const mbtiField = page.locator(".profile-choice-field").filter({ hasText: "MBTI" });
        await mbtiField.locator(".profile-choice-trigger").click();
        await expect(mbtiField.locator(".profile-choice-menu")).toBeVisible();
        await expect(mbtiField.locator('.profile-choice-menu [role="option"]')).toHaveCount(17);
        const choiceGeometry = await mbtiField.evaluate((field) => {
          const trigger = field.querySelector(".profile-choice-trigger").getBoundingClientRect();
          const arrow = field.querySelector(".profile-choice-trigger > svg").getBoundingClientRect();
          const menu = field.querySelector(".profile-choice-menu").getBoundingClientRect();
          const style = getComputedStyle(field.querySelector(".profile-choice-menu"));
          return {
            widthDifference: Math.abs(trigger.width - menu.width),
            arrowRightInset: trigger.right - arrow.right,
            horizontalOverflow: Math.max(0, -menu.left) + Math.max(0, menu.right - window.innerWidth),
            painted: style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backgroundImage !== "none",
            radius: parseFloat(style.borderRadius),
          };
        });
        assert.ok(choiceGeometry.widthDifference <= 1, `${width}x${height} choice menu must match its field width`);
        assert.ok(choiceGeometry.arrowRightInset >= 14 && choiceGeometry.arrowRightInset <= 22, `${width}x${height} choice arrow needs right breathing room: ${choiceGeometry.arrowRightInset}`);
        assert.ok(choiceGeometry.horizontalOverflow <= 1 && choiceGeometry.painted && choiceGeometry.radius >= 14, `${width}x${height} choice menu must stay inside and match the glass-card style`);
        if (width === 390) await page.screenshot({ path: `${output}/profile-personal-mbti-menu-${width}x${height}.png`, fullPage: true });
        await mbtiField.getByRole("option", { name: /ENFP/ }).click();
        await expect(mbtiField.locator(".profile-choice-trigger")).toContainText("ENFP");
        const exerciseField = page.locator(".profile-choice-field").filter({ hasText: "每周运动" });
        await exerciseField.locator(".profile-choice-trigger").click();
        const upwardGeometry = await exerciseField.evaluate((field) => {
          const trigger = field.querySelector(".profile-choice-trigger").getBoundingClientRect();
          const menu = field.querySelector(".profile-choice-menu").getBoundingClientRect();
          return { menuBottom: menu.bottom, triggerTop: trigger.top };
        });
        assert.ok(upwardGeometry.menuBottom <= upwardGeometry.triggerTop - 5, `${width}x${height} lower choice menu must open upward inside the profile card`);
        await exerciseField.getByRole("option", { name: /2–4 小时/ }).click();
        const saveGeometry = await page.locator(".profile-personal-save").evaluate((button) => {
          const card = button.closest(".profile-personal-card");
          return { buttonWidth: button.getBoundingClientRect().width, cardInnerWidth: card ? card.clientWidth - parseFloat(getComputedStyle(card).paddingLeft) - parseFloat(getComputedStyle(card).paddingRight) : 0 };
        });
        assert.ok(Math.abs(saveGeometry.buttonWidth - saveGeometry.cardInnerWidth) <= 2, `${width}x${height} personal save must span the card`);
        await page.locator(".profile-personal-save").click();
        await expect(page.locator(".profile-personal-save")).toContainText("已保存");
        await page.evaluate(() => { location.hash = "tab=profile"; });
        await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible();
        await page.evaluate(() => { location.hash = "tab=profile&view=personal"; });
        await expect(page.locator('.profile-subpage[data-profile-view="personal"]')).toBeVisible();
        await expect(page.locator(".profile-choice-field").filter({ hasText: "MBTI" }).locator(".profile-choice-trigger")).toContainText("ENFP");
        await expect(page.locator(".profile-choice-field").filter({ hasText: "每周运动" }).locator(".profile-choice-trigger")).toContainText("2–4 小时");
        if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
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
      if (subpage === "wardrobe") {
        await expect(page.locator(".mascot-wardrobe-preview")).toBeVisible();
        await expect(page.locator(".mascot-wardrobe-tabs [role=tab]")).toHaveCount(3);
        await expect(page.locator(".mascot-wardrobe-item")).toHaveCount(17);
        await expect(page.locator(".mascot-wardrobe-pagination button")).toHaveCount(5);
        await expect(page.locator(".mascot-wardrobe-character")).toHaveAttribute("data-renderer", "ready", { timeout: 20000 });
        await expect(page.locator(".mascot-wardrobe-turntable")).toHaveCount(1);
        const wardrobeGeometry = await page.locator(".mascot-wardrobe").evaluate((wardrobe) => {
          const action = wardrobe.querySelector(".mascot-wardrobe-action").getBoundingClientRect();
          const actionStyle = getComputedStyle(wardrobe.querySelector(".mascot-wardrobe-action"));
          const actionButtonStyle = getComputedStyle(wardrobe.querySelector(".mascot-wardrobe-action button"));
          const content = wardrobe.closest(".app-content").getBoundingClientRect();
          const preview = wardrobe.querySelector(".mascot-wardrobe-preview").getBoundingClientRect();
          const character = wardrobe.querySelector(".mascot-wardrobe-turntable").getBoundingClientRect();
          const summary = wardrobe.querySelector(".mascot-wardrobe-look-summary").getBoundingClientRect();
          const pagination = wardrobe.querySelector(".mascot-wardrobe-pagination").getBoundingClientRect();
          const balanceStyle = getComputedStyle(wardrobe.querySelector(".mascot-wardrobe-status > strong"));
          const itemPaint = [...wardrobe.querySelectorAll(".mascot-wardrobe-item")].map((item) => {
            const style = getComputedStyle(item);
            const artStyle = getComputedStyle(item.querySelector(".mascot-wardrobe-item-art"));
            return {
              background: style.backgroundColor,
              backgroundImage: style.backgroundImage,
              shadow: style.boxShadow,
              artBackground: artStyle.backgroundColor,
              artBackgroundImage: artStyle.backgroundImage,
            };
          });
          return {
            overflow: wardrobe.scrollWidth - wardrobe.clientWidth,
            root: { top: wardrobe.getBoundingClientRect().top, bottom: wardrobe.getBoundingClientRect().bottom, height: wardrobe.getBoundingClientRect().height },
            content: { top: content.top, bottom: content.bottom, height: content.height },
            ancestors: (() => { const result = []; let node = wardrobe.parentElement; while (node && node !== wardrobe.closest(".app-content")) { const style = getComputedStyle(node); result.push({ className: node.className, display: style.display, flexDirection: style.flexDirection, flex: style.flex, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, height: node.getBoundingClientRect().height }); node = node.parentElement; } return result; })(),
            actionVisible: action.top < content.bottom && action.bottom > content.top,
            actionBottomGap: content.bottom - action.bottom,
            previewHeight: preview.height,
            paginationActionGap: action.top - pagination.bottom,
            actionPaint: {
              background: actionStyle.backgroundColor,
              backgroundImage: actionStyle.backgroundImage,
              shadow: actionStyle.boxShadow,
              borderWidths: [actionStyle.borderTopWidth, actionStyle.borderRightWidth, actionStyle.borderBottomWidth, actionStyle.borderLeftWidth],
              blur: actionStyle.backdropFilter || actionStyle.webkitBackdropFilter || "none",
              buttonShadow: actionButtonStyle.boxShadow,
            },
            balanceColor: balanceStyle.color,
            characterWidth: character.width,
            characterHeight: character.height,
            characterSummaryGap: summary.top - character.bottom,
            paginationVisible: pagination.width > 0 && pagination.height > 0,
            activePageCount: wardrobe.querySelectorAll('.mascot-wardrobe-pagination [aria-current="page"]').length,
            itemPaint,
            carouselScrollable: wardrobe.querySelector(".mascot-wardrobe-grid").scrollWidth >= wardrobe.querySelector(".mascot-wardrobe-grid").clientWidth,
          };
        });
        assert.ok(wardrobeGeometry.overflow <= 1, `${width}x${height} wardrobe overflow`);
        assert.equal(wardrobeGeometry.actionVisible, true, `${width}x${height} wardrobe action must remain reachable`);
        assert.ok(wardrobeGeometry.actionBottomGap >= 10 && wardrobeGeometry.actionBottomGap <= 38, `${width}x${height} wardrobe action must retain safe-area breathing room: ${JSON.stringify(wardrobeGeometry)}`);
        assert.ok(wardrobeGeometry.paginationActionGap >= 8 && wardrobeGeometry.paginationActionGap <= 18, `${width}x${height} wardrobe preview must absorb spare height instead of leaving a large blank above the action: ${JSON.stringify(wardrobeGeometry)}`);
        assert.equal(wardrobeGeometry.actionPaint.background, "rgba(0, 0, 0, 0)", `${width}x${height} wardrobe action wrapper must be transparent`);
        assert.equal(wardrobeGeometry.actionPaint.backgroundImage, "none", `${width}x${height} wardrobe action wrapper must not add an image layer`);
        assert.equal(wardrobeGeometry.actionPaint.shadow, "none", `${width}x${height} wardrobe action wrapper must not cast a shadow`);
        assert.ok(wardrobeGeometry.actionPaint.borderWidths.every((value) => parseFloat(value) === 0), `${width}x${height} wardrobe action wrapper must be borderless`);
        assert.equal(wardrobeGeometry.actionPaint.blur, "none", `${width}x${height} wardrobe action wrapper must not blur the page`);
        assert.equal(wardrobeGeometry.actionPaint.buttonShadow, "none", `${width}x${height} wardrobe action button must not cast a second shadow`);
        assert.equal(wardrobeGeometry.balanceColor, "rgb(255, 255, 255)", `${width}x${height} wardrobe balance must stay white`);
        assert.ok(wardrobeGeometry.characterWidth >= Math.min(190, width * .5), `${width}x${height} wardrobe cat must be visibly enlarged`);
        assert.ok(wardrobeGeometry.characterSummaryGap >= 0 && wardrobeGeometry.characterSummaryGap <= 20, `${width}x${height} wardrobe 3D canvas must remain above the look summary: ${JSON.stringify(wardrobeGeometry)}`);
        assert.ok(wardrobeGeometry.itemPaint.every((paint) => paint.background.startsWith("rgba(255, 255, 255,") && paint.backgroundImage === "none" && paint.shadow === "none" && paint.artBackground === "rgba(0, 0, 0, 0)" && paint.artBackgroundImage === "none"), `${width}x${height} wardrobe items must use one white layer while thumbnails stay transparent`);
        assert.equal(wardrobeGeometry.carouselScrollable, true, `${width}x${height} wardrobe catalog must use the horizontal carousel contract`);
        assert.equal(wardrobeGeometry.paginationVisible, true, `${width}x${height} wardrobe pagination must stay visible between the catalog and action`);
        assert.equal(wardrobeGeometry.activePageCount, 1, `${width}x${height} wardrobe pagination must expose one current page`);
        await page.locator(".mascot-wardrobe-pagination button").nth(1).click();
        await expect(page.locator(".mascot-wardrobe-pagination button").nth(1)).toHaveAttribute("aria-current", "page");
        await page.locator(".mascot-wardrobe-pagination button").first().click();
        await expect(page.locator(".mascot-wardrobe-pagination button").first()).toHaveAttribute("aria-current", "page");
        await page.getByRole("tab", { name: "背景" }).click();
        await expect(page.locator(".mascot-wardrobe-item")).toHaveCount(17);
        await expect(page.locator(".mascot-wardrobe-scene-swatch img")).toHaveCount(13);
        await expect(page.locator(".mascot-wardrobe-pagination button")).toHaveCount(5);
        await page.locator('.mascot-wardrobe-item').filter({ hasText: "海边午后" }).click();
        const backgroundImage = page.locator(".mascot-wardrobe-background");
        await expect(backgroundImage).toBeVisible();
        await backgroundImage.evaluate(async (image) => {
          if (!image.complete || image.naturalWidth === 0) await image.decode();
        });
        assert.ok(await backgroundImage.evaluate((image) => image.complete && image.naturalWidth > 0), `${width}x${height} generated wardrobe background must decode`);
        if (width === 390) await page.screenshot({ path: `${output}/profile-wardrobe-background-${width}x${height}.png`, fullPage: true });
        await page.locator('.mascot-wardrobe-item').filter({ hasText: "晨光房间" }).click();
        await page.getByRole("tab", { name: "皮肤" }).click();
        if (width === 390) await page.screenshot({ path: `${output}/profile-wardrobe-default-${width}x${height}.png`, fullPage: true });
        await page.locator('.mascot-wardrobe-item').filter({ hasText: "暖橘" }).click();
        await expect(page.locator(".mascot-wardrobe-action button")).toHaveText("兑换");
        await page.locator(".mascot-wardrobe-action button").click();
        await expect(page.locator(".mascot-wardrobe-sheet")).toContainText("确认兑换暖橘");
        await page.locator(".mascot-wardrobe-sheet-actions button").first().click();
        await page.locator('.mascot-wardrobe-item').filter({ hasText: "奶霜" }).click();
        await page.getByRole("tab", { name: "饰品" }).click();
        await expect(page.locator(".mascot-wardrobe-item")).toHaveCount(17);
        await expect(page.locator(".mascot-wardrobe-pagination button")).toHaveCount(5);
        await expect(page.getByText("不佩戴", { exact: true })).toHaveCount(0);
        await page.locator('.mascot-wardrobe-item').filter({ hasText: "星月发夹" }).click();
        await page.locator('.mascot-wardrobe-item').filter({ hasText: "珍珠领结" }).click();
        // The current full-cat wardrobe selects one accessory at a time.
        await expect(page.locator(".mascot-wardrobe-turntable")).toHaveAttribute("data-accessories", "accessory-pearl-bow");
        await expect(page.locator('.mascot-wardrobe-item[data-selected="true"]')).toHaveCount(1);
        await expect(page.locator(".mascot-wardrobe-action button")).toHaveText("穿戴");
        await page.locator(".mascot-wardrobe-action button").click();
        await expect(page.locator(".mascot-wardrobe-action button")).toHaveText("穿戴中");
        await page.screenshot({ path: `${output}/profile-wardrobe-${width}x${height}.png`, fullPage: true });
      }
      if (["health", "watch"].includes(subpage)) {
        await expect(page.locator(".profile-device-orb")).toHaveCount(1);
        await expect(page.locator(".profile-subpage-actions")).toHaveCount(0);
        await expect(page.locator(".profile-device-facts > div")).toHaveCount(3);
        const devicePaint = await page.evaluate(() => {
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const paint = (element, pseudo = null) => {
            const style = getComputedStyle(element, pseudo);
            return {
              transparent: transparent(style.backgroundColor) && style.backgroundImage === "none",
              borderless: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((value) => parseFloat(value) === 0),
              shadowless: style.boxShadow === "none",
              blurFree: (style.backdropFilter || style.webkitBackdropFilter || "none") === "none",
            };
          };
          const stage = document.querySelector(".profile-device-stage");
          const facts = document.querySelector(".profile-device-facts");
          const orb = document.querySelector(".profile-device-orb");
          const orbStyle = getComputedStyle(orb);
          return {
            stage: paint(stage),
            facts: paint(facts),
            factRows: [...facts.children].map((row) => paint(row)),
            orb: {
              width: orb.getBoundingClientRect().width,
              height: orb.getBoundingClientRect().height,
              radius: orbStyle.borderRadius,
              hasPaint: !transparent(orbStyle.backgroundColor) || orbStyle.backgroundImage !== "none",
              before: paint(orb, "::before"),
              after: paint(orb, "::after"),
            },
          };
        });
        assert.ok(Object.values(devicePaint.stage).every(Boolean), `${width}x${height} ${subpage} stage must not add a rectangular surface`);
        assert.ok(Object.values(devicePaint.facts).every(Boolean), `${width}x${height} ${subpage} facts container must be paintless`);
        assert.ok(devicePaint.factRows.every((row) => row.transparent && row.borderless && row.shadowless), `${width}x${height} ${subpage} fact rows must have no backgrounds or dividers`);
        assert.ok(Math.abs(devicePaint.orb.width - devicePaint.orb.height) <= 1 && devicePaint.orb.radius === "50%" && devicePaint.orb.hasPaint, `${width}x${height} ${subpage} must expose exactly one painted circular action`);
        assert.ok(devicePaint.orb.before.transparent && devicePaint.orb.after.transparent, `${width}x${height} ${subpage} orb pseudo-elements must not add a square backing`);
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
        await expect(page.locator(".profile-account-security-card > .section-heading")).toHaveCount(0);
        await expect(page.locator(".profile-security-note")).toHaveCount(0);
        const accountIdentity = await page.evaluate(() => {
          const row = document.querySelector(".profile-account-security-card > .profile-row");
          const avatar = row.querySelector(".avatar.large").getBoundingClientRect();
          const name = getComputedStyle(row.querySelector("strong"));
          return { avatarWidth: avatar.width, avatarHeight: avatar.height, nameSize: parseFloat(name.fontSize) };
        });
        assert.ok(accountIdentity.avatarWidth >= 58 && Math.abs(accountIdentity.avatarWidth - accountIdentity.avatarHeight) <= 1, `${width}x${height} account avatar must be enlarged and circular`);
        assert.ok(accountIdentity.nameSize >= 18, `${width}x${height} account name must be enlarged`);
        await expect(page.locator(".profile-security-entries > button")).toHaveCount(7);
        const accountPaint = await page.evaluate(() => {
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const paint = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              transparent: transparent(style.backgroundColor) && style.backgroundImage === "none",
              borderless: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((value) => parseFloat(value) === 0),
              shadowless: style.boxShadow === "none",
            };
          };
          return {
            container: paint(document.querySelector(".profile-security-entries")),
            rows: [...document.querySelectorAll(".profile-security-entries > button")].map(paint),
          };
        });
        const securityRows = accountPaint.rows;
        assert.ok(securityRows.every((row) => Math.abs(row.x - securityRows[0].x) <= 1 && Math.abs(row.width - securityRows[0].width) <= 1), `${width}x${height} account entries must be one full-width row each`);
        assert.ok(securityRows.every((row, index) => index === 0 || row.y >= securityRows[index - 1].y + securityRows[index - 1].height), `${width}x${height} account entries must stack vertically`);
        assert.ok(accountPaint.container.transparent && accountPaint.container.borderless && accountPaint.container.shadowless, `${width}x${height} account entry group must not add a nested card`);
        assert.ok(securityRows.every((row) => row.transparent && row.borderless && row.shadowless), `${width}x${height} account entries must have no row backgrounds or dividers`);
        await expect(page.locator(".profile-account-danger-actions .action-button")).toHaveCount(2);
        await expect(page.locator(".profile-account-danger-actions .action-button").last()).toHaveText("注销账号");
        await expect(page.locator(".profile-account-danger-actions .action-button").last().locator("svg")).toHaveCount(0);
        await expect(page.locator(".profile-account-actions-card")).toHaveCount(0);
        for (const index of [1, 4, 5, 6]) {
          const unavailable = page.locator(".profile-security-entries > button").nth(index);
          await expect(unavailable).toBeDisabled();
          await unavailable.evaluate((button) => button.click());
          await expect(page.locator(".profile-security-sheet")).toHaveCount(0);
        }
        await page.locator(".profile-security-entries > button").first().click();
        await expect(page.locator(".profile-security-sheet")).toBeVisible();
        await expect(page.locator(".profile-security-sheet-title svg")).toHaveCount(1);
        await expect(page.locator(".profile-security-sheet > p")).toHaveCount(0);
        await expect(page.locator(".profile-security-sheet")).not.toContainText("保存后会");
        const sheetGeometry = await page.evaluate(() => {
          const frame = document.querySelector(".phone-frame").getBoundingClientRect();
          const sheet = document.querySelector(".profile-security-sheet").getBoundingClientRect();
          const title = document.querySelector(".profile-security-sheet-title").getBoundingClientRect();
          const close = document.querySelector(".profile-security-sheet > header > button");
          const closeRect = close.getBoundingClientRect();
          const closeStyle = getComputedStyle(close);
          return {
            centerX: Math.abs((sheet.left + sheet.width / 2) - (frame.left + frame.width / 2)),
            centerY: Math.abs((sheet.top + sheet.height / 2) - (frame.top + frame.height / 2)),
            headerAlignment: Math.abs((title.top + title.height / 2) - (closeRect.top + closeRect.height / 2)),
            closeTransparent: ["transparent", "rgba(0, 0, 0, 0)"].includes(closeStyle.backgroundColor) && closeStyle.backgroundImage === "none",
            closeBorderless: [closeStyle.borderTopWidth, closeStyle.borderRightWidth, closeStyle.borderBottomWidth, closeStyle.borderLeftWidth].every((value) => parseFloat(value) === 0),
            closeSize: Math.min(closeRect.width, closeRect.height),
          };
        });
        assert.ok(sheetGeometry.centerX <= 1 && sheetGeometry.centerY <= 2, `${width}x${height} security sheet must be centered in the phone canvas`);
        assert.ok(sheetGeometry.headerAlignment <= 1, `${width}x${height} security sheet title and close action must share one horizontal centerline`);
        assert.ok(sheetGeometry.closeTransparent && sheetGeometry.closeBorderless && sheetGeometry.closeSize >= 38, `${width}x${height} security sheet close action must be a backgroundless touch target`);
        await expect(page.locator('.profile-security-sheet input[type="password"]')).toHaveCount(2);
        if (width === 390) await page.screenshot({ path: `${output}/profile-account-password-${width}x${height}.png`, fullPage: true });
        await page.locator('.profile-security-sheet input[type="password"]').nth(0).fill("123456");
        await page.locator('.profile-security-sheet input[type="password"]').nth(1).fill("654321");
        await page.locator(".profile-security-save").click();
        await expect(page.locator(".profile-security-sheet .error-text")).toContainText("不一致");
        await page.locator(".profile-security-sheet header button").click();
        await expect(page.locator(".profile-security-sheet")).toHaveCount(0);
        await page.locator(".profile-security-entries > button").nth(2).click();
        await expect(page.locator(".profile-security-sheet-title")).toContainText("备用邮箱");
        await expect(page.locator('.profile-security-sheet input[type="email"]')).toHaveCount(1);
        await expect(page.locator('.profile-security-sheet input[autocomplete="one-time-code"]')).toHaveCount(1);
        await expect(page.locator(".profile-security-save")).toBeDisabled();
        await page.locator('.profile-security-sheet input[type="email"]').fill("backup@example.com");
        await page.locator(".profile-security-code-field button").click();
        await expect(page.locator(".profile-security-code-field button")).toHaveText("重新发送");
        await page.locator('.profile-security-sheet input[autocomplete="one-time-code"]').pressSequentially("12345678");
        const emailOtpDebug = await page.locator(".profile-security-sheet").evaluate((sheet) => ({
          contact: sheet.querySelector('input[type="email"]')?.value,
          code: sheet.querySelector('input[autocomplete="one-time-code"]')?.value,
          ready: sheet.querySelector(".profile-security-save")?.dataset.codeReady,
        }));
        assert.equal(emailOtpDebug.ready, "true", `${width}x${height} email OTP state did not become ready: ${JSON.stringify(emailOtpDebug)}`);
        await expect(page.locator(".profile-security-save")).toBeEnabled();
        await page.locator(".profile-security-save").click();
        await expect(page.locator(".profile-security-sheet")).toHaveCount(0);
        await page.locator(".profile-security-entries > button").nth(3).click();
        await expect(page.locator(".profile-security-sheet-title")).toContainText("备用手机号");
        await expect(page.locator('.profile-security-sheet input[inputmode="tel"]')).toHaveCount(1);
        await expect(page.locator(".profile-security-save")).toBeDisabled();
        await page.locator('.profile-security-sheet input[inputmode="tel"]').fill("13800000000");
        await page.locator(".profile-security-code-field button").click();
        await expect(page.locator(".profile-security-code-field button")).toHaveText("重新发送");
        await page.locator('.profile-security-sheet input[autocomplete="one-time-code"]').pressSequentially("123456");
        const phoneOtpDebug = await page.locator(".profile-security-sheet").evaluate((sheet) => ({
          contact: sheet.querySelector('input[inputmode="tel"]')?.value,
          code: sheet.querySelector('input[autocomplete="one-time-code"]')?.value,
          ready: sheet.querySelector(".profile-security-save")?.dataset.codeReady,
        }));
        assert.equal(phoneOtpDebug.ready, "true", `${width}x${height} phone OTP state did not become ready: ${JSON.stringify(phoneOtpDebug)}`);
        await expect(page.locator(".profile-security-save")).toBeEnabled();
        await expect(page.locator(".profile-security-sheet > p")).toHaveCount(0);
        if (width === 390) await page.screenshot({ path: `${output}/profile-account-phone-${width}x${height}.png`, fullPage: true });
        await page.locator(".profile-security-save").click();
        await expect(page.locator(".profile-security-sheet")).toHaveCount(0);
        await expect(page.locator(".profile-security-note")).toHaveCount(0);
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
