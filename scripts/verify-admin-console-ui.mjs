import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:/NAVA-Workspace/Build/TestRuns/admin-console-navigation";
const port = 5227;
const demoUserId = "00000000-0000-4000-8000-000000000001";
const report = [];

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });

async function prepare(context) {
  await context.addInitScript(({ userId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
  }, { userId: demoUserId });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?demo=1&qa=admin-console#tab=today&view=admin-console`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  const completion = page.locator(".completion-celebration-layer");
  if (await completion.isVisible().catch(() => false)) {
    await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
    await expect(completion).toBeHidden();
  }
  await expect(page.locator(".admin-console-screen")).toBeVisible();
  await expect(page.getByText("选择管理功能", { exact: true })).toBeVisible();
  return page;
}

async function inspect(page, label) {
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    const screen = document.querySelector(".admin-console-screen");
    const screenRect = screen?.getBoundingClientRect();
    const header = document.querySelector(".admin-console-header")?.getBoundingClientRect();
    const main = document.querySelector(".admin-console-overview,.admin-console-content")?.getBoundingClientRect();
    return frame && screen && screenRect && header && main ? {
      frame: frame.toJSON(), screen: screenRect.toJSON(), header: header.toJSON(), main: main.toJSON(),
      page: screen.getAttribute("data-admin-page"),
      horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      navVisible: document.querySelector(".bottom-nav") ? getComputedStyle(document.querySelector(".bottom-nav")).display !== "none" : false,
    } : null;
  });
  if (!geometry || geometry.horizontalOverflow > 1 || geometry.navVisible
    || geometry.header.left < geometry.frame.left - 1 || geometry.header.right > geometry.frame.right + 1
    || geometry.main.left < geometry.frame.left - 1 || geometry.main.right > geometry.frame.right + 1
    || geometry.header.top < geometry.screen.top + 7) {
    throw new Error(`${label}: admin layout escaped the phone or safe header lane ${JSON.stringify(geometry)}`);
  }
  return geometry;
}

async function openFromOverview(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".admin-console-screen")).toHaveAttribute("data-admin-page", name === "商品管理" ? "products" : name === "发布通知" ? "notifications" : "roles");
}

async function backToOverview(page) {
  await page.getByRole("button", { name: "返回管理员首页", exact: true }).click();
  await expect(page.locator(".admin-console-screen")).toHaveAttribute("data-admin-page", "overview");
}

try {
  for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await prepare(context);
    const overview = await inspect(page, `${viewport.width}x${viewport.height}:overview`);
    await page.screenshot({ path: path.join(outputDir, `admin-overview-${viewport.width}x${viewport.height}.png`), fullPage: true });

    await openFromOverview(page, "商品管理");
    const products = await inspect(page, `${viewport.width}x${viewport.height}:products`);
    await page.getByRole("button", { name: "发布商品", exact: true }).click();
    await expect(page.locator(".admin-product-editor")).toBeVisible();
    const editor = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const sheet = document.querySelector(".admin-product-editor")?.getBoundingClientRect();
      return frame && sheet ? { frame: frame.toJSON(), sheet: sheet.toJSON() } : null;
    });
    if (!editor || editor.sheet.left < editor.frame.left - 1 || editor.sheet.right > editor.frame.right + 1 || editor.sheet.bottom > editor.frame.bottom + 1) throw new Error(`${viewport.width}x${viewport.height}: editor escaped ${JSON.stringify(editor)}`);
    await page.locator(".admin-product-editor header button").click();
    await backToOverview(page);

    await openFromOverview(page, "发布通知");
    await expect(page.getByText("APP 内通知", { exact: true })).toHaveCount(0);
    await expect(page.getByText("同时系统推送", { exact: true })).toHaveCount(0);
    await expect(page.getByText("通知内容会显示在这里。", { exact: true })).toHaveCount(0);
    await page.getByLabel("标题").fill("今晚的温柔提醒");
    await page.getByLabel("内容").fill("今晚记得给自己留一点休息时间。");
    const notifications = await inspect(page, `${viewport.width}x${viewport.height}:notifications`);
    await page.screenshot({ path: path.join(outputDir, `admin-notification-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "发送通知", exact: true }).click();
    await page.getByRole("button", { name: "更多管理员操作" }).click();
    await page.getByRole("menuitem", { name: "最近发布" }).click();
    await expect(page.getByText("今晚的温柔提醒", { exact: true })).toBeVisible();
    const recent = await inspect(page, `${viewport.width}x${viewport.height}:recent`);
    await backToOverview(page);

    await openFromOverview(page, "管理员权限");
    const roles = await inspect(page, `${viewport.width}x${viewport.height}:roles`);
    await page.getByRole("button", { name: "升级", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.getByText("已升级为管理员", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, `admin-roles-${viewport.width}x${viewport.height}.png`), fullPage: true });
    report.push({ viewport, overview, products, editor, notifications, recent, roles });
    await context.close();
  }

  for (const device of IPHONE_PREVIEW_DEVICES) {
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width: device.logicalWidth, height: device.logicalHeight }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await prepare(context);
    const states = { overview: await inspect(page, `${device.label}:overview`) };
    for (const [name, key] of [["商品管理", "products"], ["发布通知", "notifications"], ["管理员权限", "roles"]]) {
      await openFromOverview(page, name);
      states[key] = await inspect(page, `${device.label}:${key}`);
      await backToOverview(page);
    }
    await page.getByRole("button", { name: "更多管理员操作" }).click();
    await page.getByRole("menuitem", { name: "最近发布" }).click();
    states.recent = await inspect(page, `${device.label}:recent`);
    report.push({ device: device.label, deviceId: device.id, viewport: { width: device.logicalWidth, height: device.logicalHeight }, states });
    await context.close();
  }

  const desktop = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const desktopPage = await prepare(desktop);
  const desktopGeometry = await inspect(desktopPage, "desktop-preview-safe-header");
  await desktopPage.screenshot({ path: path.join(outputDir, "admin-desktop-preview.png"), fullPage: true });
  report.push({ desktopPreview: desktopGeometry });
  await desktop.close();

  await writeFile(path.join(outputDir, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(`Admin console UI verified in ${report.length} device groups.`);
} finally {
  await browser.close();
  await server.close();
}
