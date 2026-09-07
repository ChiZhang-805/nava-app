import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-iphone-preview-v119-20260908";
const port = 5206;
const demoUserId = "00000000-0000-4000-8000-000000000001";

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const report = [];

async function prepare(context, search = "", hash = "#tab=today") {
  await context.addInitScript(({ userId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v2.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
  }, { userId: demoUserId });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?demo=1${search}${hash}`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator(".phone-frame")).toBeVisible();
  const reward = page.locator(".reward-celebration-layer");
  if (await reward.isVisible().catch(() => false)) await reward.locator("button").first().click();
  return page;
}

function assertVerticallyCentered(label, geometry, viewportHeight, tolerance = 1.25) {
  if (!geometry) throw new Error(`${label}: missing geometry`);
  const topGap = geometry.top;
  const bottomGap = viewportHeight - geometry.top - geometry.height;
  if (Math.abs(topGap - bottomGap) > tolerance) {
    throw new Error(`${label}: phone is not vertically centered ${JSON.stringify({ geometry, topGap, bottomGap, viewportHeight })}`);
  }
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
      cutout: geometry(".nava-device-cutout"),
      island: geometry(".nava-device-dynamic-island"),
      notch: geometry(".nava-device-notch"),
      clock: geometry(".nava-device-status-bar time"),
      statusIcons: geometry(".nava-device-status-icons"),
      selector: geometry(".nava-device-selector"),
      homeIndicator: geometry(".nava-device-home-indicator"),
      scores: geometry(".option-two-scores"),
      deviceId: document.querySelector(".nava-app-stage")?.getAttribute("data-nava-preview-device"),
      cutoutType: document.querySelector(".nava-app-stage")?.getAttribute("data-nava-preview-cutout"),
    };
  });
}

try {
  const signedOutDesktopContext = await browser.newContext({ viewport: { width: 1365, height: 1000 }, deviceScaleFactor: 1 });
  const signedOutDesktop = await signedOutDesktopContext.newPage();
  await signedOutDesktop.goto(baseUrl, { waitUntil: "networkidle" });
  const signedOutLaunch = signedOutDesktop.locator(".launch-sequence");
  if (await signedOutLaunch.isVisible().catch(() => false)) await signedOutLaunch.click();
  await expect(signedOutDesktop.locator(".auth-screen")).toBeVisible();
  const signedOutDesktopGeometry = await signedOutDesktop.evaluate(() => {
    const auth = document.querySelector(".auth-screen")?.getBoundingClientRect();
    const chromeElement = document.querySelector(".nava-device-preview");
    const chrome = chromeElement?.getBoundingClientRect();
    const locale = document.querySelector(".auth-locale")?.getBoundingClientRect();
    return {
      auth: auth ? { left: auth.left, top: auth.top, width: auth.width, height: auth.height } : null,
      chrome: chrome ? { left: chrome.left, top: chrome.top, width: chrome.width, height: chrome.height } : null,
      locale: locale ? { left: locale.left, top: locale.top, width: locale.width, height: locale.height } : null,
      chromeDisplay: chromeElement ? getComputedStyle(chromeElement).display : null,
    };
  });
  if (!signedOutDesktopGeometry.auth || !signedOutDesktopGeometry.chrome || !signedOutDesktopGeometry.locale || signedOutDesktopGeometry.chromeDisplay === "none"
    || Math.abs(signedOutDesktopGeometry.auth.left - signedOutDesktopGeometry.chrome.left) > 1
    || Math.abs(signedOutDesktopGeometry.auth.top - signedOutDesktopGeometry.chrome.top) > 1
    || signedOutDesktopGeometry.locale.top - signedOutDesktopGeometry.auth.top < 64) {
    throw new Error(`Signed-out desktop entry is not inside the simulated device ${JSON.stringify(signedOutDesktopGeometry)}`);
  }
  await signedOutDesktop.screenshot({ path: path.join(outputDir, "desktop-auth-1365x1000.png"), fullPage: true });
  report.push({ mode: "desktop-auth-preview", geometry: signedOutDesktopGeometry });
  await signedOutDesktopContext.close();

  const desktopContext = await browser.newContext({ viewport: { width: 1365, height: 1000 }, deviceScaleFactor: 1 });
  const desktop = await prepare(desktopContext);
  const desktopGeometry = await readDesktopGeometry(desktop);
  if (!desktopGeometry.frame || !desktopGeometry.chrome || !desktopGeometry.selector || desktopGeometry.chrome.display === "none" || desktopGeometry.selector.display === "none") throw new Error(`Desktop device shell or selector is missing ${JSON.stringify(desktopGeometry)}`);
  assertVerticallyCentered("Desktop frame", desktopGeometry.frame, 1000);
  assertVerticallyCentered("Desktop chrome", desktopGeometry.chrome, 1000);
  if (Math.abs(desktopGeometry.frame.width - 430) > 1 || Math.abs(desktopGeometry.frame.height - 932) > 1) throw new Error(`Desktop content no longer uses the 430x932 reference canvas ${JSON.stringify(desktopGeometry.frame)}`);
  if (Math.abs(desktopGeometry.frame.left - desktopGeometry.chrome.left) > 1 || Math.abs(desktopGeometry.frame.top - desktopGeometry.chrome.top) > 1 || Math.abs(desktopGeometry.frame.width - desktopGeometry.chrome.width) > 1 || Math.abs(desktopGeometry.frame.height - desktopGeometry.chrome.height) > 1) throw new Error(`Desktop chrome and content are not aligned ${JSON.stringify(desktopGeometry)}`);
  if (desktopGeometry.frame.borderRadius !== "51px") throw new Error(`Desktop shell is missing the selected-device corner radius ${JSON.stringify(desktopGeometry.frame)}`);
  if (!desktopGeometry.island || Math.abs(desktopGeometry.island.width - 126) > 1 || Math.abs((desktopGeometry.island.left + desktopGeometry.island.width / 2) - (desktopGeometry.frame.left + desktopGeometry.frame.width / 2)) > 1) throw new Error(`Dynamic Island is not centered ${JSON.stringify(desktopGeometry)}`);
  if (!desktopGeometry.homeIndicator || Math.abs((desktopGeometry.homeIndicator.left + desktopGeometry.homeIndicator.width / 2) - (desktopGeometry.frame.left + desktopGeometry.frame.width / 2)) > 1) throw new Error(`Home indicator is not centered ${JSON.stringify(desktopGeometry)}`);
  if (desktopGeometry.deviceId !== "iphone-15-pro-max" || desktopGeometry.cutoutType !== "dynamic-island") throw new Error(`Default device selection changed ${JSON.stringify(desktopGeometry)}`);
  if (!desktopGeometry.scores || Math.abs((desktopGeometry.scores.top - desktopGeometry.frame.top) - 77) > 2) throw new Error(`Preview chrome changed homepage content coordinates ${JSON.stringify(desktopGeometry)}`);
  await desktop.screenshot({ path: path.join(outputDir, "desktop-1365x1000.png"), fullPage: true });
  report.push({ mode: "desktop-preview", geometry: desktopGeometry });
  await desktopContext.close();

  const catalogContext = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const catalogPage = await prepare(catalogContext);
  const deviceSelector = catalogPage.getByTestId("nava-preview-device-select");
  await expect(deviceSelector).toBeVisible();
  await expect(deviceSelector.locator("option")).toHaveCount(IPHONE_PREVIEW_DEVICES.length);
  for (const device of IPHONE_PREVIEW_DEVICES) {
    await deviceSelector.selectOption(device.id);
    await expect(catalogPage.locator(".nava-app-stage")).toHaveAttribute("data-nava-preview-device", device.id);
    await expect(catalogPage.locator(".nava-app-stage")).toHaveAttribute("data-nava-preview-cutout", device.cutout);
    await catalogPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await readDesktopGeometry(catalogPage);
    const cameraControlCount = await catalogPage.locator(".nava-device-side-button--camera-control").count();
    const frameOverflow = await catalogPage.locator(".phone-frame").evaluate((node) => {
      const frame = node.getBoundingClientRect();
      return {
        x: node.scrollWidth - node.clientWidth,
        y: node.scrollHeight - node.clientHeight,
        elements: [...node.querySelectorAll("*")].flatMap((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.right <= frame.right + 1 && rect.left >= frame.left - 1) return [];
          return [{
            className: element.className?.toString().slice(0, 120) ?? element.tagName,
            left: rect.left,
            right: rect.right,
            width: rect.width,
          }];
        }).slice(0, 12),
      };
    });
    if (!geometry.frame || !geometry.chrome || !geometry.cutout || !geometry.selector || !geometry.clock || !geometry.statusIcons || !geometry.homeIndicator || !geometry.scores) {
      throw new Error(`${device.label}: desktop preview is incomplete ${JSON.stringify(geometry)}`);
    }
    assertVerticallyCentered(`${device.label} frame`, geometry.frame, 1080);
    assertVerticallyCentered(`${device.label} chrome`, geometry.chrome, 1080);
    const frameCenter = geometry.frame.left + geometry.frame.width / 2;
    const viewportCenter = 1440 / 2;
    const cutoutCenter = geometry.cutout.left + geometry.cutout.width / 2;
    const expandedSafeArea = ["iphone-17", "iphone-air", "iphone-17-pro", "iphone-17-pro-max", "iphone-16-pro", "iphone-16-pro-max"].includes(device.id);
    const statusCenter = geometry.frame.top + (device.cutout === "notch" ? 26 : expandedSafeArea ? 31 : 30);
    if (Math.abs(geometry.scale - 1) > 0.001
      || Math.abs(geometry.frame.width - device.logicalWidth) > 1
      || Math.abs(geometry.frame.height - device.logicalHeight) > 1
      || Math.abs(geometry.chrome.left - geometry.frame.left) > 1
      || Math.abs(geometry.chrome.top - geometry.frame.top) > 1
      || Math.abs(frameCenter - viewportCenter) > 1
      || Math.abs(cutoutCenter - frameCenter) > 1
      || Math.abs((geometry.clock.top + geometry.clock.height / 2) - statusCenter) > 1
      || Math.abs((geometry.statusIcons.top + geometry.statusIcons.height / 2) - statusCenter) > 1
      || geometry.scores.top < geometry.frame.top + (device.cutout === "notch" ? 55 : 67)
      || geometry.selector.left <= geometry.frame.left + geometry.frame.width
      || cameraControlCount !== Number(device.cameraControl)) {
      throw new Error(`${device.label}: per-model geometry failed ${JSON.stringify({ geometry, frameOverflow, cameraControlCount, device })}`);
    }
    if (device.cutout === "notch" && (!geometry.notch || geometry.island)) throw new Error(`${device.label}: notch variant rendered the wrong sensor housing ${JSON.stringify(geometry)}`);
    if (device.cutout === "dynamic-island" && (!geometry.island || geometry.notch)) throw new Error(`${device.label}: Dynamic Island variant rendered the wrong sensor housing ${JSON.stringify(geometry)}`);
    await catalogPage.screenshot({ path: path.join(outputDir, `${device.id}-1440x1080.png`), fullPage: true });
    report.push({ mode: "device-catalog", device: device.id, geometry, frameOverflow });
  }

  await catalogPage.goto(`${baseUrl}?demo=1#tab=today&view=profile-details`, { waitUntil: "networkidle" });
  await expect(catalogPage.locator('[data-home-view="profile-details"]')).toBeVisible();
  for (const device of IPHONE_PREVIEW_DEVICES) {
    await deviceSelector.selectOption(device.id);
    await expect(catalogPage.locator(".nava-app-stage")).toHaveAttribute("data-nava-preview-device", device.id);
    await catalogPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const safeHeader = await catalogPage.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const cutout = document.querySelector(".nava-device-cutout")?.getBoundingClientRect();
      const header = document.querySelector(".home-experience-header")?.getBoundingClientRect();
      const title = document.querySelector(".home-experience-header h1")?.getBoundingClientRect();
      const back = document.querySelector(".home-experience-back")?.getBoundingClientRect();
      const action = document.querySelector(".advanced-profile-header-icon")?.getBoundingClientRect();
      if (!frame || !cutout || !header || !title || !back || !action) return null;
      return {
        frameTop: frame.top,
        cutoutBottom: cutout.bottom,
        headerTop: header.top,
        titleTop: title.top,
        titleCenter: title.top + title.height / 2,
        backCenter: back.top + back.height / 2,
        actionCenter: action.top + action.height / 2,
        breathingGap: title.top - cutout.bottom,
      };
    });
    if (!safeHeader
      || safeHeader.breathingGap < 18
      || safeHeader.breathingGap > 27
      || Math.abs(safeHeader.titleCenter - safeHeader.backCenter) > 1
      || Math.abs(safeHeader.titleCenter - safeHeader.actionCenter) > 1) {
      throw new Error(`${device.label}: subpage header breathing space is inconsistent ${JSON.stringify(safeHeader)}`);
    }
    report.push({ mode: "device-safe-header", device: device.id, geometry: safeHeader });
  }
  await catalogContext.close();

  const notificationContext = await browser.newContext({ viewport: { width: 1365, height: 1000 }, deviceScaleFactor: 1 });
  const notificationDesktop = await prepare(notificationContext, "&qa=notifications");
  const banner = notificationDesktop.locator(".nava-notification-banner-layer");
  await expect(banner).toBeVisible();
  await notificationDesktop.waitForTimeout(500);
  const notificationGeometry = await notificationDesktop.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    const layer = document.querySelector(".nava-notification-banner-layer")?.getBoundingClientRect();
    const stage = document.querySelector(".nava-app-stage");
    const safeTop = stage ? Number.parseFloat(getComputedStyle(stage).getPropertyValue("--nava-system-safe-top")) : 0;
    return frame && layer ? {
      frame: { left: frame.left, top: frame.top, right: frame.right },
      layer: { left: layer.left, top: layer.top, right: layer.right, width: layer.width },
      safeTop,
    } : null;
  });
  if (!notificationGeometry
    || Math.abs(notificationGeometry.layer.top - notificationGeometry.frame.top - notificationGeometry.safeTop - 2) > 2
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
  if (!compactGeometry.frame || !compactGeometry.chrome || !compactGeometry.island || !compactGeometry.selector || !compactGeometry.scores) throw new Error(`Compact desktop shell is incomplete ${JSON.stringify(compactGeometry)}`);
  assertVerticallyCentered("Compact desktop frame", compactGeometry.frame, 768);
  assertVerticallyCentered("Compact desktop chrome", compactGeometry.chrome, 768);
  if (Math.abs(compactGeometry.scale - expectedScale) > 0.001
    || Math.abs(compactGeometry.frame.width - 430 * expectedScale) > 1
    || Math.abs(compactGeometry.frame.height - 932 * expectedScale) > 1
    || Math.abs(compactGeometry.island.width - 126 * expectedScale) > 1
    || Math.abs((compactGeometry.scores.top - compactGeometry.frame.top) - 77 * expectedScale) > 2) {
    throw new Error(`Compact desktop preview was reflowed instead of uniformly scaled ${JSON.stringify(compactGeometry)}`);
  }
  if (Math.abs(compactGeometry.frame.left - compactGeometry.chrome.left) > 1 || Math.abs(compactGeometry.frame.top - compactGeometry.chrome.top) > 1) throw new Error(`Compact desktop chrome and content diverged ${JSON.stringify(compactGeometry)}`);
  await compactDesktop.screenshot({ path: path.join(outputDir, "desktop-1365x768.png"), fullPage: true });
  report.push({ mode: "compact-desktop-preview", geometry: compactGeometry });
  await compactDesktopContext.close();

  const subpageDesktopContext = await browser.newContext({ viewport: { width: 1365, height: 1000 }, deviceScaleFactor: 1 });
  const subpageDesktop = await prepare(subpageDesktopContext, "", "#tab=today&view=profile-details");
  await expect(subpageDesktop.locator('[data-home-view="profile-details"]')).toBeVisible();
  const subpageHeaderGeometry = await subpageDesktop.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    const island = document.querySelector(".nava-device-dynamic-island")?.getBoundingClientRect();
    const header = document.querySelector(".home-experience-header")?.getBoundingClientRect();
    const title = document.querySelector(".home-experience-header h1")?.getBoundingClientRect();
    const back = document.querySelector(".home-experience-back")?.getBoundingClientRect();
    const action = document.querySelector(".advanced-profile-header-icon")?.getBoundingClientRect();
    if (!frame || !island || !header || !title || !back || !action) return null;
    return {
      frame: { top: frame.top, bottom: frame.bottom },
      island: { top: island.top, bottom: island.bottom },
      header: { top: header.top, bottom: header.bottom },
      title: { top: title.top, bottom: title.bottom, center: title.top + title.height / 2 },
      backCenter: back.top + back.height / 2,
      actionCenter: action.top + action.height / 2,
    };
  });
  if (!subpageHeaderGeometry
    || subpageHeaderGeometry.title.top < subpageHeaderGeometry.island.bottom + 18
    || subpageHeaderGeometry.title.top > subpageHeaderGeometry.island.bottom + 27
    || Math.abs(subpageHeaderGeometry.title.center - subpageHeaderGeometry.backCenter) > 1
    || Math.abs(subpageHeaderGeometry.title.center - subpageHeaderGeometry.actionCenter) > 1) {
    throw new Error(`Desktop subpage header is not below the simulated status area and aligned ${JSON.stringify(subpageHeaderGeometry)}`);
  }
  await expect(subpageDesktop.locator(".advanced-profile-header-icon")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(subpageDesktop.locator(".advanced-profile-header-icon")).toHaveCSS("box-shadow", "none");
  await subpageDesktop.screenshot({ path: path.join(outputDir, "desktop-profile-safe-header-1365x1000.png"), fullPage: true });
  report.push({ mode: "desktop-profile-safe-header", geometry: subpageHeaderGeometry });
  await subpageDesktopContext.close();

  const headerRoutes = [
    { view: "calendar", selector: ".home-experience-header", title: "我的月历" },
    { view: `day-${new Date().toISOString().slice(0, 10)}`, selector: ".home-experience-header", title: "当日综合报告" },
    { view: "home-widgets", selector: ".home-widget-editor-header", title: "选择小组件" },
    { view: "profile-details", selector: ".home-experience-header", title: "详细资料设置" },
    { view: "notifications", selector: ".notification-center-header", title: "通知中心" },
  ];
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 402, height: 874 },
    { width: 420, height: 912 },
    { width: 428, height: 926 },
    { width: 430, height: 932 },
    { width: 440, height: 956 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    for (const route of headerRoutes) {
      const page = await prepare(context, "", `#tab=today&view=${route.view}`);
      const header = page.locator(route.selector);
      await expect(header).toBeVisible();
      await expect(header.locator("h1")).toHaveText(route.title);
      await expect(header.locator(":scope > div > small")).toHaveCount(0);
      const alignment = await header.evaluate((node) => {
        const title = node.querySelector("h1")?.getBoundingClientRect();
        const first = node.firstElementChild?.getBoundingClientRect();
        const last = node.lastElementChild?.getBoundingClientRect();
        return title && first && last ? {
          titleCenter: title.top + title.height / 2,
          firstCenter: first.top + first.height / 2,
          lastCenter: last.top + last.height / 2,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        } : null;
      });
      if (!alignment || Math.abs(alignment.titleCenter - alignment.firstCenter) > 1 || Math.abs(alignment.titleCenter - alignment.lastCenter) > 1 || alignment.overflow > 1) {
        throw new Error(`${viewport.width}x${viewport.height} ${route.view}: single-line title controls are misaligned ${JSON.stringify(alignment)}`);
      }
      await page.screenshot({ path: path.join(outputDir, `${route.view}-${viewport.width}x${viewport.height}.png`), fullPage: true });
      await page.close();
    }
    await context.close();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await prepare(mobileContext);
  const mobileGeometry = await mobile.evaluate(() => {
    const frameElement = document.querySelector(".phone-frame");
    const frame = frameElement?.getBoundingClientRect();
    const chrome = document.querySelector(".nava-device-preview");
    const selector = document.querySelector(".nava-device-selector");
    return {
      frame: frame ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height } : null,
      chromeDisplay: chrome ? getComputedStyle(chrome).display : null,
      selectorDisplay: selector ? getComputedStyle(selector).display : null,
      frameRadius: frameElement ? getComputedStyle(frameElement).borderRadius : null,
    };
  });
  if (!mobileGeometry.frame || Math.abs(mobileGeometry.frame.width - 430) > 1 || Math.abs(mobileGeometry.frame.height - 932) > 1) throw new Error(`Mobile product canvas changed ${JSON.stringify(mobileGeometry)}`);
  if (mobileGeometry.chromeDisplay !== "none") throw new Error(`Preview-only device chrome leaked into mobile/PWA mode ${JSON.stringify(mobileGeometry)}`);
  if (mobileGeometry.selectorDisplay !== "none") throw new Error(`Preview-only selector leaked into mobile/PWA mode ${JSON.stringify(mobileGeometry)}`);
  if (mobileGeometry.frameRadius !== "0px") throw new Error(`Preview-only shell radius leaked into mobile/PWA mode ${JSON.stringify(mobileGeometry)}`);
  await mobile.screenshot({ path: path.join(outputDir, "mobile-430x932.png"), fullPage: true });
  report.push({ mode: "mobile-product", geometry: mobileGeometry });
  await mobileContext.close();

  const signedOutMobileContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const signedOutMobile = await signedOutMobileContext.newPage();
  await signedOutMobile.goto(baseUrl, { waitUntil: "networkidle" });
  const signedOutMobileLaunch = signedOutMobile.locator(".launch-sequence");
  if (await signedOutMobileLaunch.isVisible().catch(() => false)) await signedOutMobileLaunch.click();
  await expect(signedOutMobile.locator(".auth-screen")).toBeVisible();
  const signedOutMobileBoundary = await signedOutMobile.evaluate(() => {
    const chrome = document.querySelector(".nava-device-preview");
    const selector = document.querySelector(".nava-device-selector");
    return {
      chromeDisplay: chrome ? getComputedStyle(chrome).display : null,
      selectorDisplay: selector ? getComputedStyle(selector).display : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (signedOutMobileBoundary.chromeDisplay !== "none" || signedOutMobileBoundary.selectorDisplay !== "none" || signedOutMobileBoundary.overflow > 1) {
    throw new Error(`Preview-only chrome leaked into the signed-out mobile entry ${JSON.stringify(signedOutMobileBoundary)}`);
  }
  await signedOutMobile.screenshot({ path: path.join(outputDir, "mobile-auth-430x932.png"), fullPage: true });
  report.push({ mode: "mobile-auth-product", boundary: signedOutMobileBoundary });
  await signedOutMobileContext.close();
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Desktop iPhone preview and mobile product isolation passed. Evidence: ${outputDir}`);
