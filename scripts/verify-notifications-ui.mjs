import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-notifications-v100-20260905";
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
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await login(page);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("nava-notification-inbox:")) localStorage.removeItem(key);
    });
    await page.reload({ waitUntil: "networkidle" });

    const banner = page.locator(".nava-notification-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("NAVA 今日提醒");
    const bannerBox = await banner.boundingBox();
    if (!bannerBox || bannerBox.x < 0 || bannerBox.x + bannerBox.width > viewport.width + 1) throw new Error(`${viewport.name}: banner is clipped ${JSON.stringify(bannerBox)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-banner.png`) });
    await swipe(page, banner, "up");
    await expect(banner).toBeHidden();

    const bell = page.locator(".option-two-notification-button");
    await expect(bell).toBeVisible();
    await expect(page.locator(".option-two-notification-badge")).toBeVisible();
    const sideButtons = page.locator(".option-two-side-actions > button");
    await expect(sideButtons).toHaveCount(5);
    await expect(sideButtons.nth(0)).toHaveClass(/option-two-menu-toggle/);
    await expect(sideButtons.nth(1)).toHaveClass(/option-two-notification-button/);
    const menuToggle = page.locator(".option-two-menu-toggle");
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
    await expect(bell).toBeHidden();
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    await expect(bell).toBeVisible();
    await page.waitForTimeout(350);
    const bellBox = await bell.boundingBox();
    if (!bellBox || bellBox.width < 40 || bellBox.height < 40 || bellBox.x + bellBox.width > viewport.width + 1) throw new Error(`${viewport.name}: bell touch target is invalid ${JSON.stringify(bellBox)}`);
    await bell.click();
    await expect(page.locator("[data-notification-center]")).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toContain("view=notifications");
    await expect(page.locator(".notification-row-shell")).toHaveCount(4);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-center-populated.png`) });

    let row = page.locator(".notification-row-shell").first();
    await swipe(page, row.locator(".notification-row-card"), "right");
    await expect(row).toHaveAttribute("data-swipe", "delete");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-swipe-delete.png`) });
    await row.locator(".notification-swipe-delete").click();
    await expect(page.locator(".notification-undo")).toBeVisible();
    await expect(page.locator(".notification-row-shell")).toHaveCount(3);
    await page.locator(".notification-undo button").click();
    await expect(page.locator(".notification-row-shell")).toHaveCount(4);

    row = page.locator(".notification-row-shell").first();
    await swipe(page, row.locator(".notification-row-card"), "left");
    await expect(row).toHaveAttribute("data-swipe", "read");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-swipe-read.png`) });
    await row.locator(".notification-swipe-read").click();
    await expect(row).toHaveAttribute("data-read", "true");
    await page.locator(".notification-center-header > button").last().click();
    await page.locator('.notification-filter-tabs [role="tab"]').nth(1).click();
    await expect(page.locator(".notification-empty-state")).toBeVisible();

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
    results.push({ viewport, bannerBox, bellBox, geometry });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`Notification visual verification passed at ${viewports.map((item) => item.name).join(", ")}.`);
console.log(`Evidence: ${outputDir}`);
