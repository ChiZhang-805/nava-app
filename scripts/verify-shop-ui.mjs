import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:/NAVA-Workspace/Build/TestRuns/shop-navigation-products/app";
const port = 5213;
const demoUserId = "00000000-0000-4000-8000-000000000001";
const report = [];
const deviceMatrixDir = path.join(outputDir, "device-matrix");

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
await mkdir(deviceMatrixDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });

async function prepare(context, hash) {
  await context.addInitScript(({ userId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
  }, { userId: demoUserId });
  const page = await context.newPage();
  await page.addLocatorHandler(page.locator('.completion-celebration-layer'), async () => {
    await page.frameLocator('.completion-celebration-layer iframe').getByRole('button', { name: /Continue|继续/ }).click();
  });
  await page.goto(`${baseUrl}?demo=1${hash}`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator(".phone-frame")).toBeVisible();
  return page;
}

try {
  const desktopContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const desktop = await prepare(desktopContext, "#tab=today");
  const selector = desktop.locator(".nava-device-selector");
  const frontHeight = (await selector.boundingBox())?.height ?? 0;
  await desktop.getByTitle("查看规格参数").click();
  await expect(desktop.locator(".nava-device-selector-turn")).toHaveClass(/is-flipped/);
  await desktop.waitForTimeout(450);
  await expect(desktop.getByText("规格参数", { exact: true })).toBeVisible();
  const backHeight = (await selector.boundingBox())?.height ?? 0;
  const specificationGeometry = await desktop.evaluate(() => {
    const selector = document.querySelector(".nava-device-selector")?.getBoundingClientRect();
    const face = document.querySelector(".nava-device-selector-back")?.getBoundingClientRect();
    const lastRow = document.querySelector(".nava-device-selector-back dl > div:last-child")?.getBoundingClientRect();
    return selector && face && lastRow ? {
      selectorHeight: selector.height,
      faceHeight: face.height,
      bottomInset: face.bottom - lastRow.bottom,
    } : null;
  });
  if (frontHeight < 110 || backHeight <= frontHeight || !specificationGeometry || specificationGeometry.bottomInset < 12 || specificationGeometry.bottomInset > 18 || Math.abs(specificationGeometry.selectorHeight - specificationGeometry.faceHeight) > 2.5) throw new Error(`Device specification card did not fit its content ${JSON.stringify({ frontHeight, backHeight, specificationGeometry })}`);
  await desktop.screenshot({ path: path.join(outputDir, "desktop-device-specifications.png"), fullPage: true });
  await desktop.getByTitle("返回机型选择").click();
  await desktop.locator(".option-two-menu-toggle").click();
  await desktop.getByTitle("功能导航").click();
  await expect(desktop.locator(".utility-drawer")).toBeVisible();
  await desktop.waitForTimeout(420);
  const drawerSafe = await desktop.evaluate(() => {
    const title = document.querySelector(".utility-drawer h2")?.getBoundingClientRect();
    const cutout = document.querySelector(".nava-device-cutout")?.getBoundingClientRect();
    const drawer = document.querySelector(".utility-drawer")?.getBoundingClientRect();
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    return title && cutout && drawer && frame ? { titleTop: title.top, cutoutBottom: cutout.bottom, gap: title.top - cutout.bottom, drawerRight: drawer.right, frameRight: frame.right } : null;
  });
  if (!drawerSafe || drawerSafe.gap < 14 || Math.abs(drawerSafe.drawerRight - drawerSafe.frameRight) > 1) throw new Error(`Utility drawer overlaps the simulated sensor housing ${JSON.stringify(drawerSafe)}`);
  await desktop.screenshot({ path: path.join(outputDir, "desktop-drawer-and-selector.png"), fullPage: true });
  report.push({ mode: "desktop-controls", frontHeight, backHeight, drawerSafe });
  await desktopContext.close();

  for (const viewport of [
    { width: 360, height: 740 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await prepare(context, "#tab=today&view=points-shop");
    await expect(page.locator(".points-shop-screen")).toBeVisible();
    await expect(page.locator(".points-shop-product-row")).toHaveCount(4);
    const geometry = await page.evaluate(() => {
      const screen = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const header = document.querySelector(".points-shop-header")?.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".points-shop-product-row")].map((element) => element.getBoundingClientRect().toJSON());
      return {
        screen: screen?.toJSON() ?? null,
        header: header?.toJSON() ?? null,
        cards,
        horizontalOverflow: document.querySelector(".points-shop-screen")?.scrollWidth - document.querySelector(".points-shop-screen")?.clientWidth,
        selectorDisplay: getComputedStyle(document.querySelector(".nava-device-selector")).display,
      };
    });
    if (!geometry.screen || !geometry.header || geometry.horizontalOverflow > 1 || geometry.selectorDisplay !== "none"
      || geometry.cards.some((card) => card.left < geometry.screen.left - 1 || card.right > geometry.screen.right + 1)
      || geometry.cards.some((card, index) => index % 2 === 1 && Math.abs(card.top - geometry.cards[index - 1].top) > 1)
      || geometry.cards.some((card, index) => index > 1 && card.top <= geometry.cards[index - 2].bottom)) {
      throw new Error(`${viewport.width}x${viewport.height}: points shop layout failed ${JSON.stringify(geometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `shop-catalog-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.locator(".points-shop-product-open").first().click();
    await expect(page.locator(".points-shop-detail")).toBeVisible();
    await expect(page.getByText("商品图片待上架", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "返回首页", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, `shop-detail-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "返回首页", exact: true }).click();
    await expect(page.locator(".points-shop-screen")).toHaveCount(0);
    await expect(page.locator(".option-two-home")).toBeVisible();
    report.push({ mode: "shop-mobile", viewport, geometry });
    await context.close();
  }

  const directRedeemContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const directRedeem = await prepare(directRedeemContext, "&qa=shop-checkout#tab=today&view=points-shop-product-qa-nava-journal");
  await directRedeem.getByRole("button", { name: "立即兑换", exact: true }).click();
  await expect(directRedeem.locator(".points-shop-screen")).toHaveAttribute("data-shop-route", "cart");
  await expect(directRedeem.locator(".points-shop-cart-list article")).toHaveCount(1);
  report.push({ mode: "direct-redeem-to-cart", viewport: { width: 390, height: 844 } });
  await directRedeemContext.close();

  for (const viewport of [
    { width: 360, height: 740 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await prepare(context, "&qa=shop-checkout#tab=today&view=points-shop-cart");
    await expect(page.locator(".points-shop-cart-list article")).toHaveCount(1);
    await page.getByRole("button", { name: "确认兑换", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "checking");
    await page.screenshot({ path: path.join(outputDir, `checkout-checking-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "card", { timeout: 2500 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outputDir, `checkout-card-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt", { timeout: 5000 });
    await expect(page.getByText("NAVA 测试手账（仅本地）", { exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    const receiptGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
      const receipt = document.querySelector(".shop-receipt")?.getBoundingClientRect();
      const cat = document.querySelector(".shop-checkout-cat");
      const button = document.querySelector(".shop-checkout-primary")?.getBoundingClientRect();
      return frame && flow && receipt && button && cat instanceof HTMLImageElement ? {
        frame: frame.toJSON(), flow: flow.toJSON(), receipt: receipt.toJSON(), button: button.toJSON(),
        catLoaded: cat.complete && cat.naturalWidth > 0,
        catSrc: cat.currentSrc,
        overflow: flow.scrollWidth - flow.clientWidth,
      } : null;
    });
    if (!receiptGeometry || !receiptGeometry.catLoaded || receiptGeometry.overflow > 1
      || receiptGeometry.receipt.left < receiptGeometry.frame.left - 1 || receiptGeometry.receipt.right > receiptGeometry.frame.right + 1
      || receiptGeometry.receipt.bottom > receiptGeometry.frame.bottom + 1
      || receiptGeometry.button.left < receiptGeometry.frame.left - 1 || receiptGeometry.button.right > receiptGeometry.frame.right + 1
      || receiptGeometry.button.bottom > receiptGeometry.frame.bottom + 1) {
      throw new Error(`${viewport.width}x${viewport.height}: checkout receipt escaped the phone ${JSON.stringify(receiptGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-receipt-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "complete");
    await expect(page.getByRole("button", { name: "完成", exact: true })).toBeVisible();
    await page.waitForTimeout(850);
    const completionGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const cat = document.querySelector(".shop-checkout-cat");
      const gift = document.querySelector(".shop-checkout-gift")?.getBoundingClientRect();
      const actions = document.querySelector(".shop-checkout-actions")?.getBoundingClientRect();
      return frame && gift && actions && cat instanceof HTMLImageElement ? {
        frame: frame.toJSON(), gift: gift.toJSON(), actions: actions.toJSON(), catSrc: cat.currentSrc,
        cat: cat.getBoundingClientRect().toJSON(), catLoaded: cat.complete && cat.naturalWidth > 0,
      } : null;
    });
    if (!completionGeometry || !completionGeometry.catLoaded || completionGeometry.catSrc !== receiptGeometry.catSrc
      || completionGeometry.cat.left < completionGeometry.frame.left - 1 || completionGeometry.cat.right > completionGeometry.frame.right + 1
      || completionGeometry.actions.left < completionGeometry.frame.left - 1 || completionGeometry.actions.right > completionGeometry.frame.right + 1
      || completionGeometry.actions.bottom > completionGeometry.frame.bottom + 1) {
      throw new Error(`${viewport.width}x${viewport.height}: completion scene escaped or reloaded its cat ${JSON.stringify(completionGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-complete-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "查看兑换凭证", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt");
    report.push({ mode: "checkout-animation", viewport, receiptGeometry, completionGeometry });
    await context.close();
  }

  const reducedContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const reduced = await prepare(reducedContext, "&qa=shop-checkout#tab=today&view=points-shop-cart");
  await reduced.getByRole("button", { name: "确认兑换", exact: true }).click();
  await expect(reduced.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt", { timeout: 2500 });
  await expect(reduced.locator(".shop-checkout-experience")).toHaveAttribute("data-reduced-motion", "true");
  await reduced.screenshot({ path: path.join(outputDir, "checkout-reduced-motion-390x844.png"), fullPage: true });
  report.push({ mode: "checkout-reduced-motion", viewport: { width: 390, height: 844 } });
  await reducedContext.close();

  // Every supported portrait iPhone is exercised by model, even when multiple
  // models share the same logical canvas. Reduced motion keeps this full matrix
  // inexpensive while the four representative canvases above verify the real
  // card, printer, receipt, mascot, and completion timing.
  for (const device of IPHONE_PREVIEW_DEVICES) {
    const viewport = { width: device.logicalWidth, height: device.logicalHeight };
    const context = await browser.newContext({
      locale: "zh-CN",
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      isMobile: true,
      hasTouch: true,
    });
    const page = await prepare(context, "&qa=shop-checkout#tab=today&view=points-shop-cart");
    await page.getByRole("button", { name: "确认兑换", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt", { timeout: 2500 });
    await page.waitForTimeout(80);
    const receipt = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
      const paper = document.querySelector(".shop-receipt")?.getBoundingClientRect();
      const actions = document.querySelector(".shop-checkout-primary")?.getBoundingClientRect();
      return frame && flow && paper && actions ? {
        frame: frame.toJSON(),
        flow: flow.toJSON(),
        paper: paper.toJSON(),
        actions: actions.toJSON(),
        horizontalOverflow: flow.scrollWidth - flow.clientWidth,
      } : null;
    });
    if (!receipt || receipt.horizontalOverflow > 1
      || receipt.paper.left < receipt.frame.left - 1 || receipt.paper.right > receipt.frame.right + 1
      || receipt.paper.bottom > receipt.frame.bottom + 1
      || receipt.actions.left < receipt.frame.left - 1 || receipt.actions.right > receipt.frame.right + 1
      || receipt.actions.bottom > receipt.frame.bottom + 1) {
      throw new Error(`${device.label}: receipt layout failed ${JSON.stringify(receipt)}`);
    }
    await page.screenshot({ path: path.join(deviceMatrixDir, `${device.id}-receipt.png`), fullPage: true });
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "complete");
    const completion = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
      const cat = document.querySelector(".shop-checkout-cat")?.getBoundingClientRect();
      const gift = document.querySelector(".shop-checkout-gift")?.getBoundingClientRect();
      const actions = document.querySelector(".shop-checkout-actions")?.getBoundingClientRect();
      return frame && flow && cat && gift && actions ? {
        frame: frame.toJSON(), cat: cat.toJSON(), gift: gift.toJSON(), actions: actions.toJSON(),
        horizontalOverflow: flow.scrollWidth - flow.clientWidth,
        giftOpacity: Number.parseFloat(getComputedStyle(document.querySelector(".shop-checkout-gift")).opacity),
        actionsOpacity: Number.parseFloat(getComputedStyle(document.querySelector(".shop-checkout-actions")).opacity),
      } : null;
    });
    if (!completion || completion.horizontalOverflow > 1 || completion.giftOpacity < .99 || completion.actionsOpacity < .99
      || completion.cat.left < completion.frame.left - 1 || completion.cat.right > completion.frame.right + 1
      || completion.actions.left < completion.frame.left - 1 || completion.actions.right > completion.frame.right + 1
      || completion.actions.bottom > completion.frame.bottom + 1) {
      throw new Error(`${device.label}: completion layout failed ${JSON.stringify(completion)}`);
    }
    await page.screenshot({ path: path.join(deviceMatrixDir, `${device.id}-complete.png`), fullPage: true });
    report.push({ mode: "checkout-device-matrix", device: device.label, deviceId: device.id, viewport, receipt, completion });
    await context.close();
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Points shop and preview controls passed. Evidence: ${outputDir}`);
} finally {
  await browser.close();
  await server.close();
}
