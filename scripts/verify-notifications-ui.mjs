import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-notifications-v126-20260908";
const port = 5201;
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

async function login(page) {
  await page.goto(`${baseUrl}?demo=1&qa=notifications`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;
  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) await welcome.waitFor({ state: "hidden", timeout: 6_000 });
  for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
    await expect(onboarding).toHaveAttribute("data-onboarding-step", step);
    await page.locator(".onboarding-option-grid button").first().click();
    if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
  }
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function swipe(page, locator, direction) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Swipe target has no bounding box.");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + (direction === "right" ? 82 : direction === "left" ? -82 : 0);
  const endY = startY + (direction === "up" ? -62 : 0);
  await locator.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: startX, clientY: startY, button: 0 });
  await locator.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: endX, clientY: endY, button: 0 });
  await locator.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: endX, clientY: endY, button: 0 });
}

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await login(page);
    console.log(`${viewport.name}: notification QA logged in`);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("nava-notification-inbox:")) localStorage.removeItem(key);
    });
    await page.reload({ waitUntil: "networkidle" });

    const banner = page.locator(".nava-notification-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("NAVA 今日提醒");
    const bannerBox = await banner.boundingBox();
    if (!bannerBox || bannerBox.x < 0 || bannerBox.x + bannerBox.width > viewport.width + 1) throw new Error(`${viewport.name}: banner is clipped ${JSON.stringify(bannerBox)}`);
    const bannerGeometry = await banner.evaluate((node) => {
      const main = node.querySelector(".nava-notification-banner-main")?.getBoundingClientRect();
      const icon = node.querySelector(".nava-notification-banner-icon")?.getBoundingClientRect();
      const copy = node.querySelector(".nava-notification-banner-copy")?.getBoundingClientRect();
      const title = node.querySelector(".nava-notification-banner-copy > b");
      const body = node.querySelector(".nava-notification-banner-copy > span:last-child");
      const meta = node.querySelector(".nava-notification-banner-meta");
      return main && icon && copy && title && body && meta ? {
        main: { top: main.top, bottom: main.bottom, height: main.height },
        icon: { top: icon.top, bottom: icon.bottom, width: icon.width, height: icon.height },
        copy: { top: copy.top, bottom: copy.bottom, height: copy.height },
        centerDelta: Math.abs((main.top + main.bottom) / 2 - (copy.top + copy.bottom) / 2),
        iconCenterDelta: Math.abs((main.top + main.bottom) / 2 - (icon.top + icon.bottom) / 2),
        topInset: Math.min(icon.top, copy.top) - main.top,
        bottomInset: main.bottom - Math.max(icon.bottom, copy.bottom),
        titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
        bodyFont: Number.parseFloat(getComputedStyle(body).fontSize),
        metaFont: Number.parseFloat(getComputedStyle(meta).fontSize),
      } : null;
    });
    if (!bannerGeometry
      || bannerGeometry.main.height < 88
      || bannerGeometry.main.height > 96
      // Transformed DOMRects can report 41.999996 for an exact 42px icon.
      || bannerGeometry.icon.width + 0.001 < 42
      || bannerGeometry.icon.height + 0.001 < 42
      || bannerGeometry.centerDelta > 1
      || bannerGeometry.iconCenterDelta > 1
      || Math.abs(bannerGeometry.topInset - bannerGeometry.bottomInset) > 1.5
      || bannerGeometry.titleFont < 14
      || bannerGeometry.bodyFont < 12
      || bannerGeometry.metaFont < 10.5) {
      throw new Error(`${viewport.name}: banner hierarchy is cramped or not vertically centered ${JSON.stringify(bannerGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-banner.png`) });
    await swipe(page, banner, "up");
    await expect(banner).toBeHidden();
    console.log(`${viewport.name}: banner geometry and swipe passed`);

    const menuToggle = page.locator(".option-two-menu-toggle");
    await expect(menuToggle).toBeVisible();
    await expect(page.locator(".option-two-menu-unread")).toHaveCount(1);
    await expect(page.locator(".option-two-menu-unread")).toBeHidden();
    const sideButtons = page.locator(".option-two-side-actions > button");
    await expect(sideButtons).toHaveCount(6);
    await expect(sideButtons.nth(0)).toHaveClass(/option-two-menu-toggle/);
    await expect(sideButtons.nth(1)).toHaveClass(/option-two-side-shortcut/);
    await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sideButtons.nth(1)).toBeVisible();
    await page.waitForTimeout(350);
    const notificationShortcut = sideButtons.nth(5);
    await expect(notificationShortcut).toHaveAttribute("aria-label", "消息通知");
    await expect(notificationShortcut.locator("svg")).toHaveClass(/lucide-bell/);
    await expect(notificationShortcut.locator(".option-two-menu-unread")).toBeVisible();
    const bellBox = await notificationShortcut.boundingBox();
    if (!bellBox || bellBox.width < 40 || bellBox.height < 40 || bellBox.x + bellBox.width > viewport.width + 1) throw new Error(`${viewport.name}: bell touch target is invalid ${JSON.stringify(bellBox)}`);
    await notificationShortcut.click();
    await expect(page.locator("[data-notification-center]")).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toContain("view=notifications");
    await expect(page.locator(".notification-row-shell")).toHaveCount(5);
    await expect(page.locator(".notification-center-title")).toHaveText("通知中心");
    await expect(page.locator(".notification-center-title small")).toHaveCount(0);
    await expect(page.locator(".notification-swipe-hint")).toHaveCount(0);
    const categoryIcons = await page.locator(".notification-row-icon").evaluateAll((icons) => icons.map((icon) => ({ category: icon.getAttribute("data-category"), svg: icon.innerHTML })));
    if (new Set(categoryIcons.map((item) => item.svg)).size !== categoryIcons.length) throw new Error(`${viewport.name}: category icons are not distinct ${JSON.stringify(categoryIcons)}`);
    const initialRowHeights = await page.locator(".notification-row-shell").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    if (Math.max(...initialRowHeights) - Math.min(...initialRowHeights) < 5) throw new Error(`${viewport.name}: notification rows are not adapting to their content ${JSON.stringify(initialRowHeights)}`);
    const notificationGeometry = await page.locator(".notification-row-shell").evaluateAll((rows) => rows.map((row) => {
      const icon = row.querySelector(".notification-row-icon")?.getBoundingClientRect();
      const side = row.querySelector(".notification-row-side")?.getBoundingClientRect();
      const time = row.querySelector(".notification-row-side time")?.getBoundingClientRect();
      const dot = row.querySelector(".notification-unread-dot")?.getBoundingClientRect();
      return {
        icon: icon ? { top: icon.top, bottom: icon.bottom, width: icon.width, height: icon.height } : null,
        side: side ? { top: side.top, bottom: side.bottom } : null,
        time: time ? { top: time.top, bottom: time.bottom } : null,
        dot: dot ? { top: dot.top, bottom: dot.bottom } : null,
      };
    }));
    if (notificationGeometry.some(({ icon }) => !icon || icon.width < 48 || icon.height < 48)) throw new Error(`${viewport.name}: category icons are not enlarged and centered ${JSON.stringify(notificationGeometry)}`);
    if (notificationGeometry.some(({ side, time, dot }) => dot && (!side || !time || dot.top < time.bottom || Math.abs((dot.top + dot.bottom) / 2 - (time.bottom + side.bottom) / 2) > 4))) throw new Error(`${viewport.name}: unread dot is not centered below the time ${JSON.stringify(notificationGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-center-populated.png`) });

    const nutritionRow = page.locator('.notification-row-shell:has(.notification-row-icon[data-category="nutrition"])');
    await expect(nutritionRow).toHaveAttribute("data-read", "false");
    const unreadBeforeDetail = await page.locator('.notification-filter-tabs [role="tab"]').nth(1).locator("span").textContent();
    if (unreadBeforeDetail !== "4") throw new Error(`${viewport.name}: entering notification center unexpectedly changed unread state (${unreadBeforeDetail})`);
    const firstBody = await nutritionRow.locator(".notification-row-body").textContent();
    await nutritionRow.locator(".notification-row-main").click();
    const detail = page.locator(".notification-detail-dialog");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(firstBody ?? "");
    await expect(detail.locator(".notification-detail-heading strong")).toHaveText("饮食");
    await expect(nutritionRow).toHaveAttribute("data-read", "true");
    const detailGeometry = await detail.evaluate((dialog) => {
      const icon = dialog.querySelector(".notification-detail-heading .notification-row-icon")?.getBoundingClientRect();
      const category = dialog.querySelector(".notification-detail-heading strong")?.getBoundingClientRect();
      const time = dialog.querySelector(".notification-detail-heading time")?.getBoundingClientRect();
      return { icon: icon ? { left: icon.left, right: icon.right } : null, category: category ? { left: category.left, fontSize: getComputedStyle(dialog.querySelector(".notification-detail-heading strong")).fontSize } : null, time: time ? { left: time.left, fontSize: getComputedStyle(dialog.querySelector(".notification-detail-heading time")).fontSize } : null };
    });
    if (!detailGeometry.icon || !detailGeometry.category || !detailGeometry.time || detailGeometry.icon.right >= detailGeometry.category.left || parseFloat(detailGeometry.category.fontSize) <= parseFloat(detailGeometry.time.fontSize)) throw new Error(`${viewport.name}: detail hierarchy is invalid ${JSON.stringify(detailGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-detail.png`) });
    await detail.locator(".notification-detail-close").click();
    await expect(detail).toBeHidden();

    const permissionCard = page.locator(".notification-permission-card");
    await expect(permissionCard).toHaveCount(0);
    await page.getByRole('button', { name: '通知操作' }).click();
    await page.getByRole('menuitem', { name: '提醒设置' }).click();
    await page.evaluate(() => Object.defineProperty(Notification, "permission", { configurable: true, value: "granted" }));
    const grantedState = await page.evaluate(() => Notification.permission);
    if (grantedState !== "granted") throw new Error(`${viewport.name}: browser notification permission fixture is ${grantedState}`);
    await expect(page.locator('.reminder-system-permission')).toHaveCount(0);
    await expect(page.locator('[data-reminder-settings="all"] [role="switch"]')).toHaveCount(8);
    await page.getByRole('button', { name: '返回通知中心' }).click();
    await expect(page.locator(".notification-row-shell")).toHaveCount(5);

    let row = page.locator(".notification-row-shell").first();
    await swipe(page, row.locator(".notification-row-card"), "right");
    await expect(row).toHaveAttribute("data-swipe", "delete");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-swipe-delete.png`) });
    await row.locator(".notification-swipe-delete").click();
    await expect(page.locator(".notification-undo")).toBeVisible();
    await expect(page.locator(".notification-row-shell")).toHaveCount(4);
    await page.locator(".notification-undo button").click();
    await expect(page.locator(".notification-row-shell")).toHaveCount(5);

    row = page.locator(".notification-row-shell").first();
    const readBeforeSwipe = await row.getAttribute("data-read");
    await swipe(page, row.locator(".notification-row-card"), "left");
    await expect(row).toHaveAttribute("data-swipe", "read");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-swipe-read.png`) });
    await row.locator(".notification-swipe-read").click();
    await expect(row).toHaveAttribute("data-read", readBeforeSwipe === "true" ? "false" : "true");

    const menuButton = page.locator(".notification-center .nava-more-trigger");
    await expect(menuButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(menuButton).toHaveCSS("box-shadow", "none");
    await menuButton.click();
    await expect(page.getByRole("menuitem", { name: "全部已读" }).locator("svg")).toHaveClass(/lucide-mail-open/);
    await expect(page.getByRole("menuitem", { name: "多选" }).locator("svg")).toHaveClass(/lucide-list-plus/);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-menu.png`) });
    await page.getByRole("menuitem", { name: "多选" }).click();
    await expect(page.locator(".notification-center-header")).toHaveClass(/is-selecting/);
    await expect(page.locator(".notification-selection-actions > button")).toHaveCount(2);
    await page.locator(".notification-selection-bar button").click();
    await expect(page.locator(".notification-row-shell.is-selected")).toHaveCount(5);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-multi-select.png`) });
    await page.locator(".notification-selection-actions > button").nth(1).click();
    await expect(page.locator(".notification-center-header")).not.toHaveClass(/is-selecting/);
    await page.locator('.notification-filter-tabs [role="tab"]').nth(1).click();
    await expect(page.locator(".notification-empty-state")).toBeVisible();
    await page.locator('.notification-filter-tabs [role="tab"]').first().click();

    row = page.locator(".notification-row-shell").first();
    const longPressBox = await row.locator(".notification-row-card").boundingBox();
    if (!longPressBox) throw new Error(`${viewport.name}: long-press target has no box`);
    const pressX = longPressBox.x + longPressBox.width / 2;
    const pressY = longPressBox.y + longPressBox.height / 2;
    await row.locator(".notification-row-card").dispatchEvent("pointerdown", { pointerId: 11, pointerType: "touch", isPrimary: true, clientX: pressX, clientY: pressY, button: 0 });
    await page.waitForTimeout(560);
    await row.locator(".notification-row-card").dispatchEvent("pointerup", { pointerId: 11, pointerType: "touch", isPrimary: true, clientX: pressX, clientY: pressY, button: 0 });
    await expect(page.locator(".notification-center-header")).toHaveClass(/is-selecting/);
    await expect(page.locator(".notification-row-shell.is-selected")).toHaveCount(1);
    await page.locator(".notification-center-header > button").click();

    page.once("dialog", (dialog) => dialog.accept());
    await menuButton.click();
    await page.getByRole("menuitem", { name: "全部删除" }).click();
    await expect(page.locator(".notification-empty-state")).toBeVisible();
    await expect(page.locator(".notification-undo")).toBeVisible();
    await page.locator(".notification-undo button").click();
    await expect(page.locator(".notification-row-shell")).toHaveCount(5);

    const geometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame");
      const center = document.querySelector(".notification-center");
      const nav = document.querySelector(".bottom-nav");
      const rect = (element) => element ? { top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom } : null;
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
        centerOverflow: center ? center.scrollWidth - center.clientWidth : null,
        center: rect(center),
        nav: rect(nav),
      };
    });
    if ((geometry.documentOverflow ?? 0) > 1 || (geometry.frameOverflow ?? 0) > 1 || (geometry.centerOverflow ?? 0) > 1) throw new Error(`${viewport.name}: notification UI overflows horizontally ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-center.png`) });
    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    results.push({ viewport, bannerBox, bannerGeometry, bellBox, categoryIcons: categoryIcons.map((item) => item.category), initialRowHeights, notificationGeometry, detailGeometry, geometry });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`Notification visual verification passed at ${viewports.map((item) => item.name).join(", ")}.`);
console.log(`Evidence: ${outputDir}`);
