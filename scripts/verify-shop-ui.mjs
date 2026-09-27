import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:/NAVA-Workspace/Build/TestRuns/shop-redesign/app";
const port = 5213;
const demoUserId = "00000000-0000-4000-8000-000000000001";
const report = [];

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
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
  if (frontHeight < 120 || backHeight <= frontHeight || !specificationGeometry || specificationGeometry.bottomInset < 12 || specificationGeometry.bottomInset > 18 || Math.abs(specificationGeometry.selectorHeight - specificationGeometry.faceHeight) > 2.5) throw new Error(`Device specification card did not fit its content ${JSON.stringify({ frontHeight, backHeight, specificationGeometry })}`);
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
    await page.locator(".points-shop-product-open").first().click();
    await expect(page.locator(".points-shop-detail")).toBeVisible();
    await expect(page.getByText("商品图片待上架", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, `shop-detail-${viewport.width}x${viewport.height}.png`), fullPage: true });
    report.push({ mode: "shop-mobile", viewport, geometry });
    await context.close();
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Points shop and preview controls passed. Evidence: ${outputDir}`);
} finally {
  await browser.close();
  await server.close();
}
