import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:/NAVA-Workspace/Build/TestRuns/admin-console";
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
  await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
    await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
  });
  await page.goto(`${baseUrl}?demo=1&qa=admin-console#tab=today&view=admin-console`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator(".admin-console-screen")).toBeVisible();
  return page;
}

async function inspect(page, label) {
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    const screen = document.querySelector(".admin-console-screen");
    const header = document.querySelector(".admin-console-header")?.getBoundingClientRect();
    const tabs = document.querySelector(".admin-console-tabs")?.getBoundingClientRect();
    return frame && screen && header && tabs ? {
      frame: frame.toJSON(), header: header.toJSON(), tabs: tabs.toJSON(),
      horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      navVisible: document.querySelector(".bottom-nav") ? getComputedStyle(document.querySelector(".bottom-nav")).display !== "none" : false,
    } : null;
  });
  if (!geometry || geometry.horizontalOverflow > 1 || geometry.navVisible
    || geometry.header.left < geometry.frame.left - 1 || geometry.header.right > geometry.frame.right + 1
    || geometry.tabs.left < geometry.frame.left - 1 || geometry.tabs.right > geometry.frame.right + 1) {
    throw new Error(`${label}: admin layout escaped the phone ${JSON.stringify(geometry)}`);
  }
  return geometry;
}

try {
  for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await prepare(context);
    const products = await inspect(page, `${viewport.width}x${viewport.height}:products`);
    await page.getByRole("button", { name: "发布商品", exact: true }).click();
    await expect(page.locator(".admin-product-editor")).toBeVisible();
    const editor = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const sheet = document.querySelector(".admin-product-editor")?.getBoundingClientRect();
      return frame && sheet ? { frame: frame.toJSON(), sheet: sheet.toJSON(), scrollable: document.querySelector(".admin-product-editor").scrollHeight >= document.querySelector(".admin-product-editor").clientHeight } : null;
    });
    if (!editor || editor.sheet.left < editor.frame.left - 1 || editor.sheet.right > editor.frame.right + 1 || editor.sheet.bottom > editor.frame.bottom + 1) throw new Error(`${viewport.width}x${viewport.height}: editor escaped ${JSON.stringify(editor)}`);
    await page.locator(".admin-product-editor header button").click();
    await page.getByRole("tab", { name: "通知", exact: true }).click();
    await expect(page.getByRole("button", { name: /同时系统推送/ })).toBeDisabled();
    await page.getByLabel("内容").fill("今晚记得给自己留一点休息时间。");
    await page.getByRole("button", { name: "发送通知", exact: true }).click();
    await expect(page.getByText("来自 NAVA 的新消息", { exact: true }).last()).toBeVisible();
    const notifications = await inspect(page, `${viewport.width}x${viewport.height}:notifications`);
    await page.screenshot({ path: path.join(outputDir, `admin-${viewport.width}x${viewport.height}.png`), fullPage: true });
    report.push({ viewport, products, editor, notifications });
    await context.close();
  }

  for (const device of IPHONE_PREVIEW_DEVICES) {
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width: device.logicalWidth, height: device.logicalHeight }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await prepare(context);
    const geometry = await inspect(page, device.label);
    report.push({ device: device.label, deviceId: device.id, viewport: { width: device.logicalWidth, height: device.logicalHeight }, geometry });
    await context.close();
  }

  await writeFile(path.join(outputDir, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(`Admin console UI verified in ${report.length} viewport states.`);
} finally {
  await browser.close();
  await server.close();
}
