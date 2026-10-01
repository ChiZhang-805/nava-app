import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:/NAVA-Workspace/Build/TestRuns/points-shop-checkout-v3/app";
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

async function swipeCheckoutCards(page, forward = true) {
  const target = page.locator('.shop-checkout-experience[data-card-swipe-zone="active"]');
  const rect = await target.boundingBox();
  if (!rect) throw new Error("Checkout card swipe zone is missing");
  const session = await page.context().newCDPSession(page);
  const startX = rect.x + rect.width * (forward ? .82 : .18);
  const endX = rect.x + rect.width * (forward ? .18 : .82);
  const y = rect.y + rect.height * .48;
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
    for (let step = 1; step <= 12; step += 1) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + (endX - startX) * step / 12, y }] });
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
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
  // The compact developer selector deliberately became shorter when its rows were tightened.
  // Keep guarding content fit without restoring the obsolete 110px minimum.
  if (frontHeight < 88 || backHeight <= frontHeight || !specificationGeometry || specificationGeometry.bottomInset < 10 || specificationGeometry.bottomInset > 18 || Math.abs(specificationGeometry.selectorHeight - specificationGeometry.faceHeight) > 2.5) throw new Error(`Device specification card did not fit its content ${JSON.stringify({ frontHeight, backHeight, specificationGeometry })}`);
  await desktop.screenshot({ path: path.join(outputDir, "desktop-device-specifications.png"), fullPage: true });
  await desktop.getByTitle("返回机型选择").click();
  await desktop.locator(".option-two-menu-toggle").click();
  await desktop.getByTitle("今日待办").click();
  await expect(desktop.locator("[data-today-todo-page]")).toBeVisible();
  await desktop.screenshot({ path: path.join(outputDir, "desktop-today-todo-shortcut.png"), fullPage: true });
  report.push({ mode: "desktop-controls", frontHeight, backHeight, todoShortcut: true });
  await desktopContext.close();

  const desktopCheckoutContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const desktopCheckout = await prepare(desktopCheckoutContext, "&qa=shop-checkout&qaCheckoutTiming=fast#tab=today&view=points-shop-cart");
  await desktopCheckout.getByRole("button", { name: "确认兑换", exact: true }).click();
  await expect(desktopCheckout.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "select");
  const desktopCheckoutGeometry = await desktopCheckout.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    const screen = document.querySelector(".points-shop-screen--checkout")?.getBoundingClientRect();
    const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
    const cutout = document.querySelector(".nava-device-cutout")?.getBoundingClientRect();
    const title = document.querySelector(".shop-checkout-copy")?.getBoundingClientRect();
    return frame && screen && flow && cutout && title ? {
      frame: frame.toJSON(), screen: screen.toJSON(), flow: flow.toJSON(), cutout: cutout.toJSON(), title: title.toJSON(),
      screenPaddingTop: Number.parseFloat(getComputedStyle(document.querySelector(".points-shop-screen--checkout")).paddingTop),
    } : null;
  });
  if (!desktopCheckoutGeometry
    || Math.abs(desktopCheckoutGeometry.screen.top - desktopCheckoutGeometry.frame.top) > 1
    || Math.abs(desktopCheckoutGeometry.flow.top - desktopCheckoutGeometry.frame.top) > 1
    || Math.abs(desktopCheckoutGeometry.flow.height - desktopCheckoutGeometry.frame.height) > 1
    || desktopCheckoutGeometry.screenPaddingTop !== 0
    || desktopCheckoutGeometry.title.top < desktopCheckoutGeometry.cutout.bottom + 16) {
    throw new Error(`Desktop checkout status lane is not covered by one continuous background ${JSON.stringify(desktopCheckoutGeometry)}`);
  }
  await desktopCheckout.screenshot({ path: path.join(outputDir, "checkout-select-desktop-seam.png"), fullPage: true });
  report.push({ mode: "checkout-desktop-status-background", desktopCheckoutGeometry });
  await desktopCheckout.goto(`${baseUrl}?demo=1&qa=shop-checkout#tab=today&view=points-shop-add-card`, { waitUntil: "networkidle" });
  await expect(desktopCheckout.locator(".points-card-gallery")).toBeVisible();
  const desktopGallery = await desktopCheckout.evaluate(() => {
    const frame = document.querySelector(".phone-frame").getBoundingClientRect();
    const cutout = document.querySelector(".nava-device-cutout").getBoundingClientRect();
    const title = document.querySelector(".points-shop-header h1").getBoundingClientRect();
    const price = document.querySelector(".points-card-gallery-price").getBoundingClientRect();
    const button = document.querySelector(".points-card-gallery-footer button").getBoundingClientRect();
    return { titleClear: title.top >= cutout.bottom, priceButtonGap: button.top - price.bottom,
      bottomGap: frame.bottom - button.bottom, navHidden: getComputedStyle(document.querySelector(".bottom-nav")).visibility === "hidden" };
  });
  if (!desktopGallery.titleClear || !desktopGallery.navHidden || desktopGallery.bottomGap < 8 || Math.abs(desktopGallery.priceButtonGap) > 1) throw new Error("Desktop gallery safe areas: " + JSON.stringify(desktopGallery));
  await desktopCheckout.screenshot({ path: path.join(outputDir, "card-gallery-desktop-safe-area.png"), fullPage: true });
  report.push({mode:"card-gallery-desktop", desktopGallery});
  await desktopCheckoutContext.close();

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
      const home = document.querySelector(".points-shop-header > .home-experience-back");
      const actions = [...document.querySelectorAll(".points-shop-header-actions > button")];
      const cards = [...document.querySelectorAll(".points-shop-product-row")].map((element) => element.getBoundingClientRect().toJSON());
      return {
        screen: screen?.toJSON() ?? null,
        header: header?.toJSON() ?? null,
        homeRect: home?.getBoundingClientRect().toJSON() ?? null,
        actionRects: actions.map((element) => element.getBoundingClientRect().toJSON()),
        actionBackgrounds: actions.map((element) => getComputedStyle(element).backgroundColor),
        homeBackground: home ? getComputedStyle(home).backgroundColor : null,
        cards,
        horizontalOverflow: document.querySelector(".points-shop-screen")?.scrollWidth - document.querySelector(".points-shop-screen")?.clientWidth,
        selectorDisplay: getComputedStyle(document.querySelector(".nava-device-selector")).display,
      };
    });
    if (!geometry.screen || !geometry.header || !geometry.homeRect || geometry.horizontalOverflow > 1 || geometry.selectorDisplay !== "none"
      || Math.abs(geometry.homeRect.left - geometry.header.left) > 1 || geometry.homeRect.width > 43
      || geometry.actionRects.length !== 2 || Math.abs(geometry.actionRects[0].top - geometry.actionRects[1].top) > 1
      || geometry.actionBackgrounds.some((value) => value !== "rgba(0, 0, 0, 0)") || geometry.homeBackground !== "rgba(0, 0, 0, 0)"
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

  for (const viewport of [
    { width: 360, height: 740 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await prepare(context, "&qa=shop-checkout#tab=today&view=points-shop-cards");
    await expect(page.locator(".points-card-manager")).toBeVisible();
    await expect(page.locator(".points-card-wallet-list [role=radio]")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "更多", exact: true })).toBeVisible();
    await expect(page.locator(".points-shop-header-actions > button")).toHaveCount(1);
    await expect(page.getByText("所有卡片共用这一份积分。换卡不会改变额度。", { exact: true })).toHaveCount(1);
    const initialManagerGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const screen = document.querySelector(".points-shop-screen")?.getBoundingClientRect();
      const header = document.querySelector(".points-shop-header")?.getBoundingClientRect();
      const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
      const home = document.querySelector(".points-shop-header > .home-experience-back");
      const more = document.querySelector(".points-shop-more-shortcut");
      const cards = [...document.querySelectorAll(".points-card-wallet-list > button")].map((node) => node.getBoundingClientRect().toJSON());
      return frame && screen && header && nav && home && more ? {
        frame: frame.toJSON(), screen: screen.toJSON(), header: header.toJSON(), nav: nav.toJSON(), cards,
        homeRect: home.getBoundingClientRect().toJSON(),
        homeBackground: getComputedStyle(home).backgroundColor,
        moreBackground: getComputedStyle(more).backgroundColor,
        moreRect: more.getBoundingClientRect().toJSON(),
        horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      } : null;
    });
    if (!initialManagerGeometry || initialManagerGeometry.cards.length !== 3 || initialManagerGeometry.horizontalOverflow > 1
      || Math.abs(initialManagerGeometry.homeRect.left - initialManagerGeometry.header.left) > 1 || initialManagerGeometry.homeRect.width > 43
      || initialManagerGeometry.homeBackground !== "rgba(0, 0, 0, 0)" || initialManagerGeometry.moreBackground !== "rgba(0, 0, 0, 0)"
      || initialManagerGeometry.cards.some((card) => card.left < initialManagerGeometry.frame.left - 1 || card.right > initialManagerGeometry.frame.right + 1)
      || initialManagerGeometry.cards.at(-1).bottom > initialManagerGeometry.nav.top - 8) {
      throw new Error(`${viewport.width}x${viewport.height}: initial points-card composition failed ${JSON.stringify(initialManagerGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `points-card-manager-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "添加卡片", exact: true }).click();
    await expect(page.locator(".points-shop-screen")).toHaveAttribute("data-shop-route", "add-card");
    await expect(page.locator(".points-card-gallery-details h2")).toHaveText("薰衣草阅读卡");
    const managerGeometry = await page.evaluate(() => {
      const screen = document.querySelector(".points-shop-screen");
      const track = document.querySelector(".points-card-gallery-track");
      const action = document.querySelector(".points-card-gallery-footer button").getBoundingClientRect();
      return { overflow: screen.scrollWidth - screen.clientWidth, trackWidth: track.clientWidth, actionBottom: action.bottom,
        navHidden: getComputedStyle(document.querySelector(".bottom-nav")).visibility === "hidden" };
    });
    if (managerGeometry.overflow > 1 || !managerGeometry.navHidden || managerGeometry.actionBottom > viewport.height) {
      throw new Error("Card gallery composition failed " + JSON.stringify(managerGeometry));
    }
    await page.screenshot({ path: path.join(outputDir, `points-card-gallery-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "添加卡片", exact: true }).click();
    await expect(page.locator(".points-card-wallet-list [role=radio]")).toHaveCount(4);
    await expect(page.locator(".points-card-manager-summary strong")).toContainText("450");
    await expect(page.getByRole("radio", { name: /薰衣草阅读卡/ })).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: path.join(outputDir, `points-card-manager-added-${viewport.width}x${viewport.height}.png`), fullPage: true });
    report.push({ mode: "points-card-manager", viewport, initialManagerGeometry, managerGeometry });
    await context.close();
  }

  const directRedeemContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const directRedeem = await prepare(directRedeemContext, "&qa=shop-checkout&qaCheckoutTiming=fast#tab=today&view=points-shop-product-qa-nava-journal");
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
    const page = await prepare(context, "&qa=shop-checkout&qaCheckoutTiming=fast#tab=today&view=points-shop-cart");
    await expect(page.locator(".points-shop-cart-list article")).toHaveCount(1);
    await expect(page.locator(".bottom-nav")).toBeVisible();
    await expect(page.locator(".bottom-nav .nav-button")).toHaveCount(5);
    const cartShellGeometry = await page.evaluate(() => {
      const checkout = document.querySelector(".points-shop-checkout")?.getBoundingClientRect();
      const navigation = document.querySelector(".bottom-nav")?.getBoundingClientRect();
      return checkout && navigation ? {
        checkout: checkout.toJSON(),
        navigation: navigation.toJSON(),
        gap: navigation.top - checkout.bottom,
      } : null;
    });
    if (!cartShellGeometry || cartShellGeometry.gap < 0 || cartShellGeometry.gap > 28) throw new Error(`Cart checkout is not anchored immediately above the five-item navigation ${JSON.stringify(cartShellGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, `shop-cart-${viewport.width}x${viewport.height}.png`), fullPage: true });
    report.push({ mode: "cart-with-bottom-navigation", viewport, cartShellGeometry });
    await page.getByRole("button", { name: "确认兑换", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "select");
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-card-swipe-zone", "active");
    await expect(page.getByRole("radio")).toHaveCount(3);
    await expect(page.getByRole("radio", { name: /薄荷成长卡/ })).toHaveAttribute("aria-checked", "true");
    await swipeCheckoutCards(page, true);
    await expect(page.getByRole("radio", { name: /暖光陪伴卡/ })).toHaveAttribute("aria-checked", "true");
    await swipeCheckoutCards(page, false);
    await expect(page.getByRole("radio", { name: /薄荷成长卡/ })).toHaveAttribute("aria-checked", "true");
    await swipeCheckoutCards(page, true);
    await expect(page.getByRole("radio", { name: /暖光陪伴卡/ })).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(450);
    const pickerGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
      const track = document.querySelector(".shop-card-picker-list");
      const trackRect = track?.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".shop-card-picker-list button")].map((node) => ({
        ...node.getBoundingClientRect().toJSON(),
        selected: node.getAttribute("aria-checked") === "true",
      }));
      const actions = document.querySelector(".shop-card-picker-actions")?.getBoundingClientRect();
      const actionCount = document.querySelectorAll(".shop-card-picker-actions button").length;
      const pagerCount = document.querySelectorAll(".shop-card-picker-pages button").length;
      const activePagerCount = document.querySelectorAll('.shop-card-picker-pages button[aria-current="true"]').length;
      const removedCopyVisible = [...document.querySelectorAll(".shop-checkout-experience *")]
        .some((node) => ["可用总积分", "挑一张今天想带上的卡面"].includes(node.textContent?.trim() ?? ""));
      const imagesLoaded = [...document.querySelectorAll(".shop-card-picker-list img")].every((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0);
      const trackStyle = track ? getComputedStyle(track) : null;
      return frame && flow && trackRect && trackStyle && actions ? {
        frame: frame.toJSON(), flow: flow.toJSON(), track: trackRect.toJSON(), cards, actions: actions.toJSON(), imagesLoaded,
        flowHorizontalOverflow: flow.scrollWidth - flow.clientWidth,
        trackHorizontalOverflow: track.scrollWidth - track.clientWidth,
        overflowX: trackStyle.overflowX,
        scrollSnapType: trackStyle.scrollSnapType,
        actionCount,
        pagerCount,
        activePagerCount,
        removedCopyVisible,
      } : null;
    });
    const selectedCard = pickerGeometry?.cards.find((card) => card.selected);
    const hasPeekingCard = pickerGeometry?.cards.some((card) => !card.selected
      && card.right > pickerGeometry.track.left && card.left < pickerGeometry.track.right
      && (card.left < pickerGeometry.track.left || card.right > pickerGeometry.track.right));
    if (!pickerGeometry || !pickerGeometry.imagesLoaded || pickerGeometry.cards.length !== 3 || pickerGeometry.flowHorizontalOverflow > 1
      || pickerGeometry.trackHorizontalOverflow < 100 || pickerGeometry.overflowX !== "auto" || !pickerGeometry.scrollSnapType.includes("x")
      || !selectedCard || Math.abs((selectedCard.left + selectedCard.right) / 2 - (pickerGeometry.track.left + pickerGeometry.track.right) / 2) > 5
      || selectedCard.width / selectedCard.height < .56 || selectedCard.width / selectedCard.height > .64
      || !hasPeekingCard
      || pickerGeometry.actionCount !== 1 || pickerGeometry.pagerCount !== 3 || pickerGeometry.activePagerCount !== 1 || pickerGeometry.removedCopyVisible
      || pickerGeometry.actions.bottom > pickerGeometry.frame.bottom + 1) {
      throw new Error(`${viewport.width}x${viewport.height}: points-card picker failed ${JSON.stringify(pickerGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-select-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "使用这张卡片", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "confirm");
    await expect(page.getByRole("heading", { name: "确认订单", exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    const confirmGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const panel = document.querySelector(".shop-order-confirmation")?.getBoundingClientRect();
      const card = document.querySelector(".shop-order-card")?.getBoundingClientRect();
      const details = document.querySelector(".shop-order-details")?.getBoundingClientRect();
      const action = document.querySelector(".shop-checkout-primary")?.getBoundingClientRect();
      const cardImage = document.querySelector(".shop-order-card img");
      const copy = document.querySelector(".shop-order-details")?.textContent ?? "";
      return frame && panel && card && details && action && cardImage instanceof HTMLImageElement ? {
        frame: frame.toJSON(), panel: panel.toJSON(), card: card.toJSON(), details: details.toJSON(), action: action.toJSON(),
        ratio: card.width / card.height,
        cardTransform: getComputedStyle(document.querySelector(".shop-order-card")).transform,
        fontSize: parseFloat(getComputedStyle(document.querySelector(".shop-order-details div")).fontSize),
        timestamp: document.querySelector(".shop-order-details time")?.getAttribute("datetime"),
        copyCount: document.querySelectorAll(".shop-checkout-copy p").length,
        cardLoaded: cardImage.complete && cardImage.naturalWidth > 0,
        hasProduct: copy.includes("小猫陪伴手账本"),
        hasPoints: copy.includes("120 XP"),
        hasCard: copy.includes("暖光陪伴卡"),
      } : null;
    });
    if (!confirmGeometry || !confirmGeometry.cardLoaded || !confirmGeometry.hasProduct || !confirmGeometry.hasPoints || !confirmGeometry.hasCard
      || Math.abs(confirmGeometry.card.width - confirmGeometry.details.width) > 1 || confirmGeometry.cardTransform !== "none"
      || confirmGeometry.fontSize < 16 || !confirmGeometry.timestamp || confirmGeometry.copyCount !== 0
      || confirmGeometry.details.bottom > confirmGeometry.action.top - 10
      || confirmGeometry.ratio < 1.55 || confirmGeometry.ratio > 1.7
      || confirmGeometry.panel.left < confirmGeometry.frame.left - 1 || confirmGeometry.panel.right > confirmGeometry.frame.right + 1
      || confirmGeometry.action.bottom > confirmGeometry.frame.bottom + 1) {
      throw new Error(`${viewport.width}x${viewport.height}: confirm-order scene failed ${JSON.stringify(confirmGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-confirm-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "checking");
    await page.screenshot({ path: path.join(outputDir, `checkout-checking-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "card", { timeout: 2500 });
    await page.waitForTimeout(120);
    const cardGeometry = await page.evaluate(() => {
      const screen = document.querySelector(".points-shop-screen--checkout")?.getBoundingClientRect();
      const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
      const card = document.querySelector(".shop-points-card")?.getBoundingClientRect();
      const cardImage = document.querySelector(".shop-points-card image");
      const title = document.querySelector(".shop-checkout-copy h1");
      const copy = document.querySelector(".shop-checkout-copy p");
      if (!screen || !flow || !card || !(cardImage instanceof SVGImageElement) || !title) return null;
      return {
        screen: screen.toJSON(), flow: flow.toJSON(), card: card.toJSON(),
        cardLoaded: Boolean(cardImage.href.baseVal),
        titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
        copyCount: copy ? 1 : 0,
      };
    });
    if (!cardGeometry || Math.abs(cardGeometry.screen.width - cardGeometry.flow.width) > 1 || Math.abs(cardGeometry.screen.height - cardGeometry.flow.height) > 1
      || !cardGeometry.cardLoaded || cardGeometry.titleFont < 27 || cardGeometry.copyCount !== 0) {
      throw new Error(`${viewport.width}x${viewport.height}: checkout card is not full-screen or legible ${JSON.stringify(cardGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-card-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "placed", { timeout: 3000 });
    await expect(page.getByRole("heading", { name: "订单已完成", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "继续", exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    const placedGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const terminal = document.querySelector(".shop-payment-terminal")?.getBoundingClientRect();
      const summary = document.querySelector(".shop-terminal-summary")?.getBoundingClientRect();
      const action = document.querySelector(".shop-checkout-primary")?.getBoundingClientRect();
      const copy = document.querySelector(".shop-terminal-summary")?.textContent ?? "";
      const rows = [...document.querySelectorAll(".shop-terminal-summary-row")];
      const columns = rows[0] ? getComputedStyle(rows[0]).gridTemplateColumns.split(" ").length : 0;
      return frame && terminal && summary && action ? {
        frame: frame.toJSON(), terminal: terminal.toJSON(), summary: summary.toJSON(), action: action.toJSON(),
        hasProduct: copy.includes("小猫陪伴手账本"),
        hasPoints: copy.includes("XP"),
        hasUsedLabel: copy.includes("已使用"),
        rowCount: rows.length,
        columns,
      } : null;
    });
    if (!placedGeometry || !placedGeometry.hasProduct || !placedGeometry.hasPoints || !placedGeometry.hasUsedLabel
      || placedGeometry.rowCount !== 1 || placedGeometry.columns !== 4
      || placedGeometry.terminal.left < placedGeometry.frame.left - 1 || placedGeometry.terminal.right > placedGeometry.frame.right + 1
      || placedGeometry.summary.left < placedGeometry.frame.left - 1 || placedGeometry.summary.right > placedGeometry.frame.right + 1
      || placedGeometry.action.bottom > placedGeometry.frame.bottom + 1) {
      throw new Error(`${viewport.width}x${viewport.height}: order-placed scene failed ${JSON.stringify(placedGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-placed-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "printing");
    await page.waitForTimeout(400);
    const pressAnimation = await page.evaluate(() => {
      const cat = document.querySelector(".shop-checkout-cat");
      const actor = document.querySelector(".shop-checkout-cat > span");
      const button = document.querySelector(".shop-printer-button");
      if (!cat || !actor || !button) return null;
      return {
        catAnimation: getComputedStyle(cat).animationName,
        actorAnimation: getComputedStyle(actor).animationName,
        buttonAnimation: getComputedStyle(button).animationName,
        catLoaded: getComputedStyle(actor).backgroundImage !== "none",
      };
    });
    if (!pressAnimation?.catLoaded || pressAnimation.catAnimation !== "none" || pressAnimation.actorAnimation !== "shop-cat-paw-press" || pressAnimation.buttonAnimation !== "shop-machine-button") {
      throw new Error(`${viewport.width}x${viewport.height}: printer cat/button animation is not active ${JSON.stringify(pressAnimation)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-printing-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt", { timeout: 5000 });
    await expect(page.locator(".shop-receipt").getByText("小猫陪伴手账本", { exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    const receiptGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const flow = document.querySelector(".shop-checkout-experience")?.getBoundingClientRect();
      const receipt = document.querySelector(".shop-receipt")?.getBoundingClientRect();
      const cat = document.querySelector(".shop-checkout-cat");
      const printer = document.querySelector(".shop-receipt-printer")?.getBoundingClientRect();
      const button = document.querySelector(".shop-printer-button")?.getBoundingClientRect();
      const title = document.querySelector(".shop-checkout-copy h1");
      const copy = document.querySelector(".shop-checkout-copy p");
      const receiptRow = document.querySelector(".shop-receipt dl div");
      const actor = document.querySelector(".shop-checkout-cat > span");
      if (!frame || !flow || !receipt || !printer || !button || !cat || !actor || !title || !receiptRow) return null;
      const catRect = cat.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(catRect.right, printer.right) - Math.max(catRect.left, printer.left));
      const overlapHeight = Math.max(0, Math.min(catRect.bottom, printer.bottom) - Math.max(catRect.top, printer.top));
      const buttonOverlapWidth = Math.max(0, Math.min(catRect.right, button.right) - Math.max(catRect.left, button.left));
      const buttonOverlapHeight = Math.max(0, Math.min(catRect.bottom, button.bottom) - Math.max(catRect.top, button.top));
      return {
        frame: frame.toJSON(), flow: flow.toJSON(), receipt: receipt.toJSON(), printer: printer.toJSON(), button: button.toJSON(),
        cat: catRect.toJSON(), catPrinterOverlap: overlapWidth * overlapHeight, catButtonOverlap: buttonOverlapWidth * buttonOverlapHeight,
        catPrinterSeam: Math.abs(catRect.top + catRect.height * .83 - printer.top),
        catPrinterWidthRatio: catRect.width / printer.width,
        titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
        copyCount: copy ? 1 : 0,
        receiptFont: Number.parseFloat(getComputedStyle(receiptRow).fontSize),
        catLoaded: getComputedStyle(actor).backgroundImage !== "none",
        receiptMinHeight: getComputedStyle(document.querySelector(".shop-receipt")).minHeight,
        hasUnitPrice: [...document.querySelectorAll(".shop-receipt dt")].some(node => node.textContent === "单价"),
        hasTotal: [...document.querySelectorAll(".shop-receipt dt")].some(node => node.textContent === "总计"),
        hasRedeemed: [...document.querySelectorAll(".shop-receipt dt")].some(node => node.textContent === "已使用"),
        overflow: flow.scrollWidth - flow.clientWidth,
        transform: getComputedStyle(document.querySelector(".shop-receipt")).transform,
        paperCenterOffset: Math.abs((receipt.left + receipt.right) / 2 - (printer.left + printer.right) / 2),
      };
    });
    if (!receiptGeometry || !receiptGeometry.catLoaded || receiptGeometry.overflow > 1
      || receiptGeometry.transform !== "none" || receiptGeometry.paperCenterOffset > 1
      || receiptGeometry.receiptMinHeight !== "0px" || !receiptGeometry.hasUnitPrice || !receiptGeometry.hasTotal || receiptGeometry.hasRedeemed
      || receiptGeometry.catPrinterSeam > 1.5 || receiptGeometry.catPrinterWidthRatio < .5 || receiptGeometry.catPrinterWidthRatio > .67
      || receiptGeometry.catButtonOverlap < 1 || receiptGeometry.titleFont < 21 || receiptGeometry.copyCount !== 0 || receiptGeometry.receiptFont < 16
      || receiptGeometry.receipt.left < receiptGeometry.frame.left - 1 || receiptGeometry.receipt.right > receiptGeometry.frame.right + 1
      || receiptGeometry.receipt.bottom > receiptGeometry.frame.bottom + 1
      || receiptGeometry.cat.left < receiptGeometry.frame.left - 1 || receiptGeometry.cat.right > receiptGeometry.frame.right + 1) {
      throw new Error(`${viewport.width}x${viewport.height}: checkout receipt escaped the phone ${JSON.stringify(receiptGeometry)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `checkout-receipt-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await expect(page.getByRole("button", { name: "完成", exact: true })).toBeVisible();
    report.push({ mode: "checkout-animation", viewport, pickerGeometry, confirmGeometry, cardGeometry, placedGeometry, pressAnimation, receiptGeometry });
    await context.close();
  }

  const reducedContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const reduced = await prepare(reducedContext, "&qa=shop-checkout&qaCheckoutTiming=fast#tab=today&view=points-shop-cart");
  await reduced.getByRole("button", { name: "确认兑换", exact: true }).click();
  await reduced.getByRole("button", { name: "使用这张卡片", exact: true }).click();
  await expect(reduced.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "confirm");
  await reduced.getByRole("button", { name: "继续", exact: true }).click();
  await expect(reduced.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "placed", { timeout: 2500 });
  await expect(reduced.locator(".shop-checkout-experience")).toHaveAttribute("data-reduced-motion", "true");
  await reduced.screenshot({ path: path.join(outputDir, "checkout-reduced-motion-390x844.png"), fullPage: true });
  report.push({ mode: "checkout-reduced-motion", viewport: { width: 390, height: 844 } });
  await reducedContext.close();

  const timingContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const timingPage = await prepare(timingContext, "&qa=shop-checkout#tab=today&view=points-shop-cart");
  await timingPage.getByRole("button", { name: "确认兑换", exact: true }).click();
  await timingPage.getByRole("button", { name: "使用这张卡片", exact: true }).click();
  await expect(timingPage.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "confirm");
  const startedAt = Date.now();
  await timingPage.getByRole("button", { name: "继续", exact: true }).click();
  await expect(timingPage.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-timeline", "production");
  await expect(timingPage.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "placed", { timeout: 6000 });
  await timingPage.getByRole("button", { name: "继续", exact: true }).click();
  await expect(timingPage.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt", { timeout: 6500 });
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < 7800 || elapsedMs > 10500) throw new Error(`Production checkout animations did not preserve the reference pace: ${elapsedMs}ms`);
  await timingPage.screenshot({ path: path.join(outputDir, "checkout-production-timing-390x844.png"), fullPage: true });
  report.push({ mode: "checkout-production-timing", viewport: { width: 390, height: 844 }, elapsedMs });
  await timingContext.close();

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
    const page = await prepare(context, "&qa=shop-checkout&qaCheckoutTiming=fast#tab=today&view=points-shop-cards");
    await expect(page.locator(".points-card-wallet-list [role=radio]")).toHaveCount(3);
    const cardManager = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const screen = document.querySelector(".points-shop-screen")?.getBoundingClientRect();
      const header = document.querySelector(".points-shop-header")?.getBoundingClientRect();
      const card = document.querySelector(".points-card-wallet-list > button")?.getBoundingClientRect();
      return frame && screen && header && card ? {
        frame: frame.toJSON(), screen: screen.toJSON(), header: header.toJSON(), card: card.toJSON(),
        horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      } : null;
    });
    if (!cardManager || cardManager.horizontalOverflow > 1
      || cardManager.header.left < cardManager.frame.left - 1 || cardManager.header.right > cardManager.frame.right + 1
      || cardManager.card.left < cardManager.frame.left - 1 || cardManager.card.right > cardManager.frame.right + 1) {
      throw new Error(`${device.label}: points-card manager layout failed ${JSON.stringify(cardManager)}`);
    }
    await page.screenshot({ path: path.join(deviceMatrixDir, `${device.id}-cards.png`), fullPage: true });
    await page.goto(`${baseUrl}?demo=1&qa=shop-checkout&qaCheckoutTiming=fast#tab=today&view=points-shop-cart`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "确认兑换", exact: true }).click();
    await page.getByRole("button", { name: "使用这张卡片", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "confirm");
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "placed", { timeout: 2500 });
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.locator(".shop-checkout-experience")).toHaveAttribute("data-checkout-phase", "receipt");
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
    report.push({ mode: "checkout-device-matrix", device: device.label, deviceId: device.id, viewport, cardManager, receipt });
    await context.close();
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Points shop and preview controls passed. Evidence: ${outputDir}`);
} finally {
  await browser.close();
  await server.close();
}
