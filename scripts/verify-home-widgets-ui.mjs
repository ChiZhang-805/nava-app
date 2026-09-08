import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-home-widgets-v128-20260908";
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

function assertNear(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}±${tolerance}, got ${actual}`);
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
    await expect(page.locator(".home-widget-skeleton")).toHaveCount(4);
    const skeletonGeometry = await page.locator(".home-widget-skeleton").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { width: box.width, height: box.height, borderRadius: getComputedStyle(item).borderRadius };
    }));
    if (skeletonGeometry.some((card) => card.height < 103 || card.height > 143 || parseFloat(card.borderRadius) > 18)) throw new Error(`${viewport.name}: home loading cards do not match the reference card shape ${JSON.stringify(skeletonGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-loading.png`) });

    await openRoute(page, "tab=today");
    const homeGrid = page.locator(".home-widget-grid");
    await expect(homeGrid).toBeVisible();
    const sceneBackground = page.locator(".option-two-scene-background");
    await expect(sceneBackground).toBeVisible();
    const backgroundGeometry = await sceneBackground.evaluate((image) => {
      const box = image.getBoundingClientRect();
      return {
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
    });
    if (!backgroundGeometry.complete || backgroundGeometry.naturalWidth < 800 || backgroundGeometry.naturalHeight < 1800) throw new Error(`${viewport.name}: generated home scene did not load at production resolution ${JSON.stringify(backgroundGeometry)}`);
    if (Math.abs(backgroundGeometry.left) > 1 || Math.abs(backgroundGeometry.top) > 1 || Math.abs(backgroundGeometry.right - viewport.width) > 1 || Math.abs(backgroundGeometry.bottom - viewport.height) > 1) throw new Error(`${viewport.name}: generated home scene does not cover the viewport ${JSON.stringify(backgroundGeometry)}`);
    const defaultWidgets = page.locator(".home-health-widget");
    await expect(defaultWidgets).toHaveCount(4);
    const defaultWidgetOrder = await defaultWidgets.evaluateAll((items) => items.map((item) => item.getAttribute("data-home-widget")));
    if (defaultWidgetOrder.join(",") !== "heart,sleep,exercise,steps") throw new Error(`${viewport.name}: unexpected default widget order ${defaultWidgetOrder.join(",")}`);
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
    if (initialGeometry.cards.some((card) => card.left < -1 || card.right > viewport.width + 1)) throw new Error(`${viewport.name}: a home widget escapes the viewport ${JSON.stringify(initialGeometry)}`);
    if (initialGeometry.cards.some((card, index) => Math.abs(card.width - skeletonGeometry[index].width) > 1 || Math.abs(card.height - skeletonGeometry[index].height) > 1)) throw new Error(`${viewport.name}: loading and final home widget shapes differ ${JSON.stringify({ skeletonGeometry, cards: initialGeometry.cards })}`);
    const [heart, sleep, exercise, steps] = initialGeometry.cards;
    const referenceLayout = heart && sleep && exercise && steps
      && Math.abs(heart.left - sleep.left) <= 1
      && Math.abs(sleep.top - exercise.top) <= 1
      && Math.abs(exercise.top - steps.top) <= 1
      && Math.abs(heart.width - sleep.width) <= 1
      && heart.bottom < sleep.top;
    if (!referenceLayout) throw new Error(`${viewport.name}: home cards do not follow the reference 1+3 arrangement ${JSON.stringify(initialGeometry)}`);
    if (viewport.name === "430x932") {
      const referenceCards = [
        { left: 18, top: 153, width: 126, height: 141 },
        { left: 18, top: 309, width: 126, height: 141 },
        { left: 152, top: 309, width: 126, height: 141 },
        { left: 286, top: 309, width: 126, height: 141 },
      ];
      initialGeometry.cards.forEach((card, index) => {
        const expected = referenceCards[index];
        for (const key of ["left", "top", "width", "height"]) assertNear(card[key], expected[key], 3, `430x932 card ${index + 1} ${key}`);
      });
      assertNear(initialGeometry.sideButtons[0].top, 70, 2, "430x932 menu top");
      assertNear(initialGeometry.sideButtons[0].height, 48, 2, "430x932 menu size");
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-default.png`) });

    await page.locator('[data-home-widget="sleep"]').click();
    await expect.poll(() => new URL(page.url()).hash).toContain("tab=record");
    await expect.poll(() => new URL(page.url()).hash).toContain("module=sleep");
    await openRoute(page, "tab=today");

    const draggableHeart = page.locator('[data-home-widget="heart"]');
    const heartBox = await draggableHeart.boundingBox();
    if (!heartBox) throw new Error(`${viewport.name}: heart widget has no long-press geometry`);
    await page.mouse.move(heartBox.x + heartBox.width / 2, heartBox.y + heartBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await expect(page.locator(".home-widget-grid")).toHaveClass(/is-arranging/);
    await expect(page.locator(".home-widget-edit-done")).toHaveCount(0);
    await expect(page.locator(".home-widget-slot")).toHaveCount(6);
    await page.waitForTimeout(260);
    const slotGeometry = await page.locator(".home-widget-slot").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return { left: box.left, top: box.top, width: box.width, height: box.height, opacity: Number(style.opacity) };
    }));
    if (slotGeometry.some((slot) => slot.opacity < .99 || slot.width < 80 || slot.height < 100)) throw new Error(`${viewport.name}: six placement slots are not visible ${JSON.stringify(slotGeometry)}`);
    const targetSlot = page.locator('[data-home-widget-slot="4"]');
    const targetBox = await targetSlot.boundingBox();
    if (!targetBox) throw new Error(`${viewport.name}: empty placement slot has no geometry`);
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
    await expect(targetSlot).toHaveClass(/is-target/);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-dragging.png`) });
    await page.mouse.up();
    await expect(page.locator('[data-home-widget="heart"]')).toHaveAttribute("data-home-widget-position", "5");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-home-arranged.png`) });
    await page.locator('[data-home-widget="heart"]').dispatchEvent("click");
    await expect(page.locator(".home-widget-grid")).toHaveClass(/is-arranging/);
    await page.locator(".option-two-scene-background").dispatchEvent("click");
    await expect(page.locator(".home-widget-grid")).not.toHaveClass(/is-arranging/);
    await page.reload({ waitUntil: "networkidle" });
    const reloadLaunch = page.locator(".launch-sequence");
    if (await reloadLaunch.isVisible().catch(() => false)) await reloadLaunch.click();
    await expect(page.locator('[data-home-widget="heart"]')).toHaveAttribute("data-home-widget-position", "5");
    await page.locator('[data-home-widget="heart"]').focus();
    await page.keyboard.press("Shift+Enter");
    await expect(page.locator(".home-widget-grid")).toHaveClass(/is-arranging/);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-home-widget="heart"]')).toHaveAttribute("data-home-widget-position", "6");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-home-widget="heart"]')).toHaveAttribute("data-home-widget-position", "5");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-home-widget="heart"]')).toHaveAttribute("data-home-widget-position", "3");
    await expect(page.locator('[data-home-widget="exercise"]')).toHaveAttribute("data-home-widget-position", "5");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('[data-home-widget="heart"]')).toHaveAttribute("data-home-widget-position", "5");
    await expect(page.locator('[data-home-widget="exercise"]')).toHaveAttribute("data-home-widget-position", "3");
    await page.keyboard.press("Escape");
    await expect(page.locator(".home-widget-grid")).not.toHaveClass(/is-arranging/);

    const menuToggle = page.locator(".option-two-menu-toggle");
    if ((await menuToggle.getAttribute("aria-expanded")) !== "true") await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    const sideButtons = page.locator(".option-two-side-actions > button");
    await expect(sideButtons).toHaveCount(6);
    await expect(sideButtons.nth(0)).toHaveClass(/option-two-menu-toggle/);
    await sideButtons.nth(5).waitFor({ state: "visible" });
    await page.waitForTimeout(380);
    const sideTops = await sideButtons.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    if (sideTops.some((top, index) => index > 0 && top <= sideTops[index - 1])) throw new Error(`${viewport.name}: side actions are not visually ordered ${JSON.stringify(sideTops)}`);
    await sideButtons.nth(5).click();
    await expect(page.locator(".notification-center")).toBeVisible();
    await openRoute(page, "tab=today");
    await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sideButtons.nth(1)).toBeHidden();
    await menuToggle.click();
    await expect(sideButtons.nth(1)).toBeVisible();
    await sideButtons.nth(4).click();
    await expect(page.locator(".utility-drawer")).toBeVisible();
    await page.locator(".drawer-home-edit").first().click();
    await expect(page.locator(".home-widget-editor")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);
    await expect(page.locator(".home-widget-picker > button")).toHaveCount(8);

    const unselected = page.locator(".home-widget-picker > button:not(.is-selected):not(:disabled)");
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
    const widgetTextGeometry = await page.locator(".home-health-widget").evaluateAll((widgets) => widgets.map((widget) => {
      const card = widget.getBoundingClientRect();
      const value = widget.querySelector(".home-widget-value");
      const core = value?.querySelector("strong");
      const support = value?.querySelector("small");
      const supportStyle = support ? getComputedStyle(support) : null;
      const toRect = (element) => {
        const rect = element?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
      };
      return {
        id: widget.getAttribute("data-home-widget"),
        card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
        value: toRect(value),
        core: core ? { text: core.textContent?.trim(), rect: toRect(core), scrollWidth: core.scrollWidth, clientWidth: core.clientWidth } : null,
        support: support ? {
          text: support.textContent?.trim(),
          rect: toRect(support),
          scrollWidth: support.scrollWidth,
          clientWidth: support.clientWidth,
          scrollHeight: support.scrollHeight,
          clientHeight: support.clientHeight,
          textOverflow: supportStyle?.textOverflow,
        } : null,
      };
    }));
    for (const widget of widgetTextGeometry) {
      if (!widget.value || !widget.core?.rect || !widget.support?.rect
        || widget.core.scrollWidth > widget.core.clientWidth + 1
        || widget.support.scrollWidth > widget.support.clientWidth + 1
        || widget.support.scrollHeight > widget.support.clientHeight + 1
        || widget.value.left < widget.card.left - 1
        || widget.value.right > widget.card.right + 1
        || widget.value.bottom > widget.card.bottom + 1
        || widget.core.rect.left < widget.card.left - 1
        || widget.core.rect.right > widget.card.right + 1
        || widget.support.rect.left < widget.card.left - 1
        || widget.support.rect.right > widget.card.right + 1
        || widget.support.rect.bottom > widget.card.bottom + 1
        || widget.support.textOverflow === "ellipsis") {
        throw new Error(`${viewport.name}: a populated home widget truncates its value or support text ${JSON.stringify(widget)}`);
      }
    }
    const moodWidget = widgetTextGeometry.find(({ id }) => id === "mood");
    if (!moodWidget || moodWidget.core?.text !== "平稳" || !moodWidget.support?.text?.startsWith("较近7日")) {
      throw new Error(`${viewport.name}: populated mood widget did not expose its complete core and trend copy ${JSON.stringify(moodWidget)}`);
    }
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

    await openRoute(page, "tab=record&module=face&view=conditions");
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
    report.push({ viewport, backgroundGeometry, skeletonGeometry, initialGeometry, sortGeometry, widgetTextGeometry, faceGeometry });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Home widgets, AI routing, sleep maintenance, and face readiness passed at ${viewports.map((item) => item.name).join(", ")}.`);
console.log(`Evidence: ${outputDir}`);
