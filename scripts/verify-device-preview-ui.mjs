import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-desktop-device-preview-v111-20260907";
const port = 5206;
const demoUserId = "00000000-0000-4000-8000-000000000001";

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const report = [];

async function prepare(context, search = "") {
  await context.addInitScript(({ userId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v2.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
  }, { userId: demoUserId });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?demo=1${search}#tab=today`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator(".phone-frame")).toBeVisible();
  const reward = page.locator(".reward-celebration-layer");
  if (await reward.isVisible().catch(() => false)) await reward.locator("button").first().click();
  return page;
}

async function readDesktopGeometry(page) {
  return page.evaluate(() => {
    const geometry = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height, display: getComputedStyle(element).display, borderRadius: getComputedStyle(element).borderRadius };
    };
    return {
      scale: Number.parseFloat(getComputedStyle(document.querySelector(".nava-app-stage")).getPropertyValue("--nava-preview-scale")) || 1,
      frame: geometry(".phone-frame"),
      chrome: geometry(".nava-device-preview"),
      island: geometry(".nava-device-dynamic-island"),
      clock: geometry(".nava-device-status-bar time"),
      statusIcons: geometry(".nava-device-status-icons"),
      scores: geometry(".option-two-scores"),
    };
  });
}

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1365, height: 1000 }, deviceScaleFactor: 1 });
  const desktop = await prepare(desktopContext);
  const desktopGeometry = await readDesktopGeometry(desktop);
  if (!desktopGeometry.frame || !desktopGeometry.chrome || desktopGeometry.chrome.display === "none") throw new Error(`Desktop device shell is missing ${JSON.stringify(desktopGeometry)}`);
  if (Math.abs(desktopGeometry.frame.width - 430) > 1 || Math.abs(desktopGeometry.frame.height - 932) > 1) throw new Error(`Desktop content no longer uses the 430x932 reference canvas ${JSON.stringify(desktopGeometry.frame)}`);
  if (Math.abs(desktopGeometry.frame.left - desktopGeometry.chrome.left) > 1 || Math.abs(desktopGeometry.frame.top - desktopGeometry.chrome.top) > 1 || Math.abs(desktopGeometry.frame.width - desktopGeometry.chrome.width) > 1 || Math.abs(desktopGeometry.frame.height - desktopGeometry.chrome.height) > 1) throw new Error(`Desktop chrome and content are not aligned ${JSON.stringify(desktopGeometry)}`);
  if (desktopGeometry.frame.borderRadius !== "50px") throw new Error(`Desktop shell is missing the reference corner radius ${JSON.stringify(desktopGeometry.frame)}`);
  if (!desktopGeometry.island || Math.abs((desktopGeometry.island.left + desktopGeometry.island.width / 2) - (desktopGeometry.frame.left + desktopGeometry.frame.width / 2)) > 1) throw new Error(`Dynamic Island is not centered ${JSON.stringify(desktopGeometry)}`);
  if (!desktopGeometry.scores || Math.abs((desktopGeometry.scores.top - desktopGeometry.frame.top) - 77) > 2) throw new Error(`Preview chrome changed homepage content coordinates ${JSON.stringify(desktopGeometry)}`);
  await desktop.screenshot({ path: path.join(outputDir, "desktop-1365x1000.png"), fullPage: true });
  report.push({ mode: "desktop-preview", geometry: desktopGeometry });
  await desktopContext.close();

  const notificationContext = await browser.newContext({ viewport: { width: 1365, height: 1000 }, deviceScaleFactor: 1 });
  const notificationDesktop = await prepare(notificationContext, "&qa=notifications");
  const banner = notificationDesktop.locator(".nava-notification-banner-layer");
  await expect(banner).toBeVisible();
  await notificationDesktop.waitForTimeout(500);
  const notificationGeometry = await notificationDesktop.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    const layer = document.querySelector(".nava-notification-banner-layer")?.getBoundingClientRect();
    return frame && layer ? {
      frame: { left: frame.left, top: frame.top, right: frame.right },
      layer: { left: layer.left, top: layer.top, right: layer.right, width: layer.width },
    } : null;
  });
  if (!notificationGeometry
    || Math.abs(notificationGeometry.layer.top - notificationGeometry.frame.top - 61) > 2
    || notificationGeometry.layer.left < notificationGeometry.frame.left
    || notificationGeometry.layer.right > notificationGeometry.frame.right) {
    throw new Error(`Desktop notification did not enter through the simulated system area ${JSON.stringify(notificationGeometry)}`);
  }
  await notificationDesktop.screenshot({ path: path.join(outputDir, "desktop-notification-1365x1000.png"), fullPage: true });
  report.push({ mode: "desktop-notification", geometry: notificationGeometry });
  await notificationContext.close();

  const compactDesktopContext = await browser.newContext({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
  const compactDesktop = await prepare(compactDesktopContext);
  const compactGeometry = await readDesktopGeometry(compactDesktop);
  const expectedScale = (768 - 52) / 932;
  if (!compactGeometry.frame || !compactGeometry.chrome || !compactGeometry.island || !compactGeometry.scores) throw new Error(`Compact desktop shell is incomplete ${JSON.stringify(compactGeometry)}`);
  if (Math.abs(compactGeometry.scale - expectedScale) > 0.001
    || Math.abs(compactGeometry.frame.width - 430 * expectedScale) > 1
    || Math.abs(compactGeometry.frame.height - 932 * expectedScale) > 1
    || Math.abs(compactGeometry.island.width - 136 * expectedScale) > 1
    || Math.abs((compactGeometry.scores.top - compactGeometry.frame.top) - 77 * expectedScale) > 2) {
    throw new Error(`Compact desktop preview was reflowed instead of uniformly scaled ${JSON.stringify(compactGeometry)}`);
  }
  if (Math.abs(compactGeometry.frame.left - compactGeometry.chrome.left) > 1 || Math.abs(compactGeometry.frame.top - compactGeometry.chrome.top) > 1) throw new Error(`Compact desktop chrome and content diverged ${JSON.stringify(compactGeometry)}`);
  await compactDesktop.screenshot({ path: path.join(outputDir, "desktop-1365x768.png"), fullPage: true });
  report.push({ mode: "compact-desktop-preview", geometry: compactGeometry });
  await compactDesktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await prepare(mobileContext);
  const mobileGeometry = await mobile.evaluate(() => {
    const frameElement = document.querySelector(".phone-frame");
    const frame = frameElement?.getBoundingClientRect();
    const chrome = document.querySelector(".nava-device-preview");
    return {
      frame: frame ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height } : null,
      chromeDisplay: chrome ? getComputedStyle(chrome).display : null,
      frameRadius: frameElement ? getComputedStyle(frameElement).borderRadius : null,
    };
  });
  if (!mobileGeometry.frame || Math.abs(mobileGeometry.frame.width - 430) > 1 || Math.abs(mobileGeometry.frame.height - 932) > 1) throw new Error(`Mobile product canvas changed ${JSON.stringify(mobileGeometry)}`);
  if (mobileGeometry.chromeDisplay !== "none") throw new Error(`Preview-only device chrome leaked into mobile/PWA mode ${JSON.stringify(mobileGeometry)}`);
  if (mobileGeometry.frameRadius !== "0px") throw new Error(`Preview-only shell radius leaked into mobile/PWA mode ${JSON.stringify(mobileGeometry)}`);
  await mobile.screenshot({ path: path.join(outputDir, "mobile-430x932.png"), fullPage: true });
  report.push({ mode: "mobile-product", geometry: mobileGeometry });
  await mobileContext.close();
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Desktop iPhone preview and mobile product isolation passed. Evidence: ${outputDir}`);
