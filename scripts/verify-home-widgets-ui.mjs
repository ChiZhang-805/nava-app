import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-home-widgets-v102-20260905";
const port = 5204;
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

const demoUserId = "00000000-0000-4000-8000-000000000001";

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const report = [];

async function openRoute(page, hash) {
  await page.goto(`${baseUrl}?demo=1#${hash}`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator(".phone-frame")).toBeVisible();
  const reward = page.locator(".reward-celebration-layer");
  if (await reward.isVisible().catch(() => false)) await reward.locator("button").first().click();
}

function assertNoHorizontalOverflow(geometry, label) {
  if (geometry.documentOverflow > 1 || geometry.frameOverflow > 1) {
    throw new Error(`${label}: horizontal overflow ${JSON.stringify(geometry)}`);
  }
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      timezoneId: "Asia/Shanghai",
    });
    await context.addInitScript(({ userId }) => {
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem(`nava.onboarding.v2.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true });
    }, { userId: demoUserId });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto(`${baseUrl}?demo=1&qa=home-widgets-loading#tab=today`, { waitUntil: "networkidle" });
    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();
    const loadingReward = page.locator(".reward-celebration-layer");
    if (await loadingReward.isVisible().catch(() => false)) await loadingReward.locator("button").first().click();
    await expect(page.locator(".home-widget-skeleton")).toHaveCount(5);
    const skeletonGeometry = await page.locator(".home-widget-skeleton").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { width: box.width, height: box.height, borderRadius: getComputedStyle(item).borderRadius };
    }));
    if (skeletonGeometry.some((card) => card.height !== 106 || parseFloat(card.borderRadius) > 20)) throw new Error(`${viewport.name}: home loading cards do not match final card shape ${JSON.stringify(skeletonGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-loading.png`) });

    await openRoute(page, "tab=today");
    const homeGrid = page.locator(".home-widget-grid");
    await expect(homeGrid).toBeVisible();
    const defaultWidgets = page.locator(".home-health-widget");
    await expect(defaultWidgets).toHaveCount(5);
    const defaultWidgetOrder = await defaultWidgets.evaluateAll((items) => items.map((item) => item.getAttribute("data-home-widget")));
    if (defaultWidgetOrder.join(",") !== "sleep,focus,exercise,mood,diet") throw new Error(`${viewport.name}: unexpected default widget order ${defaultWidgetOrder.join(",")}`);
    const initialGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame");
      const grid = document.querySelector(".home-widget-grid");
      const cards = [...document.querySelectorAll(".home-health-widget")].map((item) => {
        const box = item.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, scrollWidth: item.scrollWidth, clientWidth: item.clientWidth };
      });
      const style = grid ? getComputedStyle(grid) : null;
      const sideButtons = [...document.querySelectorAll(".option-two-side-actions > button")].map((item) => {
        const box = item.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height };
      });
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
        columns: style?.gridTemplateColumns.split(" ").filter(Boolean).length ?? 0,
        cards,
        sideButtons,
      };
    });
    assertNoHorizontalOverflow(initialGeometry, `${viewport.name} default home`);
    if (initialGeometry.columns !== 3) throw new Error(`${viewport.name}: home widget grid must have three columns`);
    if (initialGeometry.cards.some((card) => card.scrollWidth > card.clientWidth + 1 || card.left < -1 || card.right > viewport.width + 1)) throw new Error(`${viewport.name}: a home widget clips or escapes ${JSON.stringify(initialGeometry)}`);
    if (initialGeometry.cards.some((card, index) => Math.abs(card.width - skeletonGeometry[index].width) > 1 || Math.abs(card.height - skeletonGeometry[index].height) > 1)) throw new Error(`${viewport.name}: loading and final home widget shapes differ ${JSON.stringify({ skeletonGeometry, cards: initialGeometry.cards })}`);
    const [firstRow, , , secondRow] = initialGeometry.cards;
    const [, notificationButton, calendarButton, profileButton, utilityButton] = initialGeometry.sideButtons;
    const aligned = firstRow && secondRow && notificationButton && calendarButton && profileButton && utilityButton
      && Math.abs(firstRow.top - notificationButton.top) <= 2
      && Math.abs(firstRow.bottom - calendarButton.bottom) <= 2
      && Math.abs(secondRow.top - profileButton.top) <= 2
      && Math.abs(secondRow.bottom - utilityButton.bottom) <= 2;
    if (!aligned) throw new Error(`${viewport.name}: home rows do not align to side-action bands ${JSON.stringify(initialGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-default.png`) });

    const menuToggle = page.locator(".option-two-menu-toggle");
    if ((await menuToggle.getAttribute("aria-expanded")) !== "true") await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    const sideButtons = page.locator(".option-two-side-actions > button");
    await expect(sideButtons).toHaveCount(5);
    await expect(sideButtons.nth(0)).toHaveClass(/option-two-menu-toggle/);
    await expect(sideButtons.nth(1)).toHaveClass(/option-two-notification-button/);
    const sideTops = await sideButtons.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    if (sideTops.some((top, index) => index > 0 && top <= sideTops[index - 1])) throw new Error(`${viewport.name}: side actions are not visually ordered ${JSON.stringify(sideTops)}`);
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".option-two-notification-button")).toBeHidden();
    await menuToggle.click();
    await expect(page.locator(".option-two-notification-button")).toBeVisible();
    await page.locator(".option-two-side-actions > button").last().click();
    await expect(page.locator(".utility-drawer")).toBeVisible();
    await page.locator(".drawer-home-edit").click();
    await expect(page.locator(".home-widget-editor")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);
    await expect(page.locator(".home-widget-picker > button")).toHaveCount(6);

    const unselected = page.locator(".home-widget-picker > button:not(.is-selected)");
    while (await unselected.count()) await unselected.first().click();
    await page.locator(".home-widget-editor > footer button").last().click();
    await expect(page.locator(".home-widget-sort > article")).toHaveCount(6);
    const sortGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame");
      const grid = document.querySelector(".home-widget-sort");
      const style = grid ? getComputedStyle(grid) : null;
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
        columns: style?.gridTemplateColumns.split(" ").filter(Boolean).length ?? 0,
        scrollHeight: grid?.scrollHeight ?? 0,
        clientHeight: grid?.clientHeight ?? 0,
      };
    });
    assertNoHorizontalOverflow(sortGeometry, `${viewport.name} editor`);
    if (sortGeometry.columns !== 3) throw new Error(`${viewport.name}: editor sort grid must have three columns`);
    const firstSortId = await page.locator(".home-widget-sort > article").first().getAttribute("data-sort-widget");
    const firstSortBox = await page.locator(".home-widget-sort > article").first().boundingBox();
    const lastSortBox = await page.locator(".home-widget-sort > article").last().boundingBox();
    if (!firstSortBox || !lastSortBox) throw new Error(`${viewport.name}: sort cards have no drag geometry`);
    await page.mouse.move(firstSortBox.x + firstSortBox.width / 2, firstSortBox.y + firstSortBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(lastSortBox.x + lastSortBox.width / 2, lastSortBox.y + lastSortBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".home-widget-sort > article").first()).not.toHaveAttribute("data-sort-widget", firstSortId ?? "");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-editor-six.png`) });
    await page.locator(".home-widget-editor > footer button").last().click();
    await expect(page.locator(".home-health-widget")).toHaveCount(6);
    await expect(page.locator(".option-two-guidance")).toHaveCount(0);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-six.png`) });

    await openRoute(page, "tab=today&view=home-widgets");
    const selectedWidgets = page.locator(".home-widget-picker > button.is-selected");
    while (await selectedWidgets.count()) await selectedWidgets.first().click();
    await page.locator(".home-widget-editor > footer button").last().click();
    await page.locator(".home-widget-editor > footer button").last().click();
    await expect(page.locator(".home-widget-empty")).toBeVisible();
    await expect(page.locator(".home-health-widget")).toHaveCount(0);
    await expect(page.locator(".option-two-guidance")).toHaveCount(0);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-empty.png`) });

    await page.locator('.nav-button[data-tab="ai"]').click();
    await expect.poll(() => new URL(page.url()).hash).toContain("tab=ai");
    await expect(page.getByRole("textbox", { name: /告诉 NAVA|Tell NAVA/i })).toBeVisible();

    await openRoute(page, "tab=record&module=sleep&view=editor");
    const sleepMaintenance = page.locator(".sleep-maintenance");
    await expect(sleepMaintenance).toBeVisible();
    if (!(await sleepMaintenance.getAttribute("class")).includes("is-active")) await sleepMaintenance.locator(":scope > button").click();
    await expect(sleepMaintenance).toHaveClass(/is-active/);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".sleep-maintenance")).toHaveClass(/is-active/);
    await page.locator(".sleep-maintenance > div:last-child button").first().click();
    await expect(page.locator(".sleep-maintenance")).not.toHaveClass(/is-active/);
    const duration = Number(await page.locator('form:not([hidden]) input[type="number"]').first().inputValue());
    if (!Number.isFinite(duration) || duration !== 1) throw new Error(`${viewport.name}: sleep tracking did not preserve the one-minute minimum; got ${duration}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-sleep-maintenance.png`) });

    await openRoute(page, "tab=record&module=face&view=editor");
    const readinessButtons = page.locator(".face-capture-readiness > div button");
    await expect(readinessButtons).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      if ((await readinessButtons.nth(index).getAttribute("aria-pressed")) !== "true") await readinessButtons.nth(index).click();
    }
    await expect(page.locator(".face-capture-readiness")).toHaveClass(/is-ready/);
    await expect(page.locator(".face-photo-actions button").first()).toBeEnabled();
    const faceGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame");
      const editor = document.querySelector(".record-editor-stack > div:not([hidden])");
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
        editorScrollHeight: editor?.scrollHeight ?? 0,
        editorClientHeight: editor?.clientHeight ?? 0,
      };
    });
    assertNoHorizontalOverflow(faceGeometry, `${viewport.name} face readiness`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-face-readiness.png`) });

    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    report.push({ viewport, skeletonGeometry, initialGeometry, sortGeometry, faceGeometry });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Home widgets, AI routing, sleep maintenance, and face readiness passed at ${viewports.map((item) => item.name).join(", ")}.`);
console.log(`Evidence: ${outputDir}`);
