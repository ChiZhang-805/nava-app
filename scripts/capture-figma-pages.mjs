import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.SCREENSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUTPUT_DIR)
  : path.resolve(root, "..", "Build", "TestRuns", "nava-figma-pages");
const port = Number(process.env.PORT || 5194);
const demoAccount = "13800138000";
const demoPassword = "12345678";

const viewports = [
  { name: "phone-360x740", width: 360, height: 740 },
  { name: "phone-375x812", width: 375, height: 812 },
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "phone-430x932", width: 430, height: 932 },
];

async function dismissLaunch(page) {
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) {
    await launch.click();
    await expect(launch).toBeHidden();
  }
}

async function captureOnboarding(page, viewport, name, report) {
  const target = page.locator(".onboarding-screen");
  await expect(target).toBeVisible();
  const layout = await target.evaluate((node) => ({
    frameWidth: node.clientWidth,
    frameScrollWidth: node.scrollWidth,
    contentHeight: node.clientHeight,
    contentScrollHeight: node.scrollHeight,
  }));
  if (layout.frameScrollWidth > layout.frameWidth + 1) {
    throw new Error(`${viewport.name}/${name} has horizontal overflow: ${JSON.stringify(layout)}`);
  }
  report.push({ viewport: viewport.name, screen: name, ...layout });
  await page.screenshot({ path: path.join(outputDir, viewport.name, `${name}.png`) });
}

async function completeOnboarding(page, viewport, report) {
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;

  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) {
    await captureOnboarding(page, viewport, "00-onboarding-welcome", report);
    await welcome.waitFor({ state: "hidden", timeout: 6_000 });
  }

  const steps = [
    { key: "gender", multi: false },
    { key: "occupation", multi: false },
    { key: "ageGroup", multi: false },
    { key: "hobbies", multi: true },
    { key: "sleepDuration", multi: false },
    { key: "exerciseDuration", multi: false },
    { key: "dietPreferences", multi: true },
  ];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    await expect(onboarding).toHaveAttribute("data-onboarding-step", step.key);
    await captureOnboarding(page, viewport, `00-onboarding-${index + 1}-${step.key}`, report);
    await page.locator(".onboarding-option-grid button").first().click();
    if (step.multi) await page.locator(".onboarding-next").click();
  }

  await expect(onboarding).toHaveAttribute("data-onboarding-step", "privacy");
  await captureOnboarding(page, viewport, "00-onboarding-privacy", report);
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function login(page, baseUrl, viewport, report) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.locator(".auth-submit").click();
  await completeOnboarding(page, viewport, report);
  await expect(page.locator(".phone-frame")).toBeVisible();
  await page.waitForTimeout(350);
  const reward = page.locator(".reward-celebration-card > button");
  if (await reward.isVisible().catch(() => false)) await reward.click();
}

async function capture(page, viewport, name, selector, report) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  await page.waitForTimeout(650);
  const layout = await page.locator(".phone-frame").evaluate((node) => {
    const content = node.querySelector(".app-content");
    return {
      frameWidth: node.clientWidth,
      frameScrollWidth: node.scrollWidth,
      contentHeight: content?.clientHeight ?? 0,
      contentScrollHeight: content?.scrollHeight ?? 0,
    };
  });
  if (layout.frameScrollWidth > layout.frameWidth + 1) {
    throw new Error(`${viewport.name}/${name} has horizontal overflow: ${JSON.stringify(layout)}`);
  }
  if (name === "07-focus") {
    const formGeometry = await page.locator(".focus-todo-plan-form").evaluate((form) => {
      const title = form.querySelector(".focus-todo-title-input")?.getBoundingClientRect();
      const controls = [...form.querySelectorAll("label")].map((node) => node.getBoundingClientRect());
      return {
        titleBottom: title?.bottom ?? 0,
        controlsTop: controls.length > 0 ? Math.min(...controls.map((rect) => rect.top)) : Number.POSITIVE_INFINITY,
      };
    });
    if (formGeometry.titleBottom > formGeometry.controlsTop + 1) {
      throw new Error(`${viewport.name}/${name} task planner rows overlap: ${JSON.stringify(formGeometry)}`);
    }
  }
  if (name === "06-exercise-device") {
    const cardGeometry = await page.locator(".device-subview-card").evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const lastChild = card.lastElementChild?.getBoundingClientRect();
      return { cardBottom: cardRect.bottom, contentBottom: lastChild?.bottom ?? cardRect.bottom };
    });
    if (cardGeometry.cardBottom - cardGeometry.contentBottom > 32) {
      throw new Error(`${viewport.name}/${name} leaves excessive empty space inside its card: ${JSON.stringify(cardGeometry)}`);
    }
  }
  if (name === "00g-home-widgets-sort") {
    const positions = await page.locator(".home-widget-sort > article").evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { index: Number(item.getAttribute("data-sort-index")), top: rect.top, left: rect.left };
    }));
    const byIndex = new Map(positions.map((position) => [position.index, position]));
    const first = byIndex.get(1);
    const second = byIndex.get(2);
    const third = byIndex.get(3);
    const fourth = byIndex.get(4);
    if (!first || !second || !third || !fourth
      || first.top >= second.top
      || Math.abs(second.top - third.top) > 1
      || Math.abs(second.top - fourth.top) > 1
      || !(second.left < third.left && third.left < fourth.left)) {
      throw new Error(`${viewport.name}/${name} does not mirror the home 1+3 slots: ${JSON.stringify(positions)}`);
    }
  }
  if (name === "00h-profile-details") {
    const profilePresentation = await page.locator(".advanced-profile-section").nth(1).evaluate((section) => ({
      selectedOptions: [...section.querySelectorAll("select")].map((select) => select.selectedOptions[0]?.textContent?.trim() ?? ""),
      selectedDiet: [...section.querySelectorAll(".advanced-profile-diet-chips .is-selected")].map((button) => button.textContent?.trim() ?? ""),
    }));
    const rawCodes = new Set(["under_5h", "5_6h", "6_7h", "7_8h", "8_9h", "over_9h", "almost_none", "under_1h", "1_2h", "2_4h", "4_7h", "over_7h", "none"]);
    if (profilePresentation.selectedOptions.some((value) => rawCodes.has(value))
      || profilePresentation.selectedDiet.some((value) => rawCodes.has(value))) {
      throw new Error(`${viewport.name}/${name} exposes stored profile codes instead of localized labels: ${JSON.stringify(profilePresentation)}`);
    }
  }
  report.push({ viewport: viewport.name, screen: name, ...layout });
  await page.screenshot({ path: path.join(outputDir, viewport.name, `${name}.png`) });
}

async function navigateRoute(page, hash, selector) {
  await page.evaluate((nextHash) => { window.location.hash = nextHash; }, hash);
  await expect(page.locator(selector).first()).toBeVisible();
}

async function returnToHub(page) {
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator("[data-record-module]")).toHaveCount(6);
}

async function captureViewport(browser, baseUrl, viewport, report, errors) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${viewport.name}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${viewport.name}: ${error.message}`));

  await mkdir(path.join(outputDir, viewport.name), { recursive: true });
  await login(page, baseUrl, viewport, report);

  await capture(page, viewport, "00-home", ".option-two-home", report);
  await page.locator(".option-two-menu-toggle").click();
  await capture(page, viewport, "00b-home-shortcuts", '.option-two-home[data-health-menu-open="false"]', report);

  await navigateRoute(page, "#tab=today&view=calendar", '[data-home-view="calendar"]');
  await capture(page, viewport, "00c-home-calendar", '[data-home-view="calendar"]', report);
  await page.locator(".home-calendar-day.is-today").click();
  await capture(page, viewport, "00d-home-daily-report", '[data-home-view="daily"]', report);

  await navigateRoute(page, "#tab=today&view=notifications", "[data-notification-center]");
  await capture(page, viewport, "00e-notifications", "[data-notification-center]", report);

  await navigateRoute(page, "#tab=today&view=home-widgets", '[data-widget-editor-step="select"]');
  await capture(page, viewport, "00f-home-widgets-select", '[data-widget-editor-step="select"]', report);
  await page.locator(".home-widget-editor footer button").last().click();
  await capture(page, viewport, "00g-home-widgets-sort", '[data-widget-editor-step="sort"]', report);

  await navigateRoute(page, "#tab=today&view=profile-details", '[data-home-view="profile-details"]');
  await capture(page, viewport, "00h-profile-details", '[data-home-view="profile-details"]', report);

  await navigateRoute(page, "#tab=ai", ".chat-layout");
  await capture(page, viewport, "00i-ai", ".chat-layout", report);

  await navigateRoute(page, "#tab=record", "[data-record-module]");
  await page.locator('[data-tab="record"]').click();
  await capture(page, viewport, "01-record-hub", ".record-module-grid", report);

  await page.locator('[data-record-module="mood"]').click();
  await capture(page, viewport, "02-mood", '[data-module-view="mood-overview"]', report);
  await page.locator('[aria-label="填写情绪日记"], [aria-label="Write mood journal"]').click();
  await capture(page, viewport, "03-mood-journal", '[role="dialog"]', report);
  await page.locator('[role="dialog"] button[type="button"]').last().click();
  await returnToHub(page);

  await page.locator('[data-record-module="sleep"]').click();
  await capture(page, viewport, "04-sleep", '[data-module-view="sleep-overview"]', report);
  await returnToHub(page);

  await page.locator('[data-record-module="exercise"]').click();
  await capture(page, viewport, "05-exercise", '[data-module-view="exercise-overview"]', report);
  await page.locator('[aria-label="查看运动设备"], [aria-label="View devices"]').click();
  await capture(page, viewport, "06-exercise-device", '[data-module-view="module-subview"]', report);
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator('[data-module-view="exercise-overview"]')).toBeVisible();
  await returnToHub(page);

  await page.locator('[data-record-module="focus"]').click();
  await capture(page, viewport, "07-focus", '[data-module-view="focus-overview"]', report);
  await page.locator('[aria-label="开始专注"], [aria-label="Start focus"]').click();
  await capture(page, viewport, "08-focus-immersive", '[data-module-view="focus-immersive"]', report);
  await page.locator('[data-module-view="focus-immersive"] .focus-immersive-exit').click();
  await returnToHub(page);

  await page.locator('[data-record-module="diet"]').click();
  await capture(page, viewport, "09-diet", '[data-module-view="diet-overview"]', report);
  await page.locator('.diet-meals-card .module-card-icon-action').click();
  await capture(page, viewport, "09b-diet-editor", '[data-record-detail="diet"] .record-editor-stack', report);
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator('[data-module-view="diet-overview"]')).toBeVisible();
  await returnToHub(page);

  await page.locator('[data-record-module="face"]').click();
  await capture(page, viewport, "10-face", '[data-module-view="face-overview"]', report);
  await page.locator('[aria-label="使用前置摄像头拍照"], [aria-label="Take a front-camera photo"]').click();
  await capture(page, viewport, "10b-face-editor", '[data-record-detail="face"] .record-editor-stack', report);
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator('[data-module-view="face-overview"]')).toBeVisible();
  await returnToHub(page);

  await page.locator('.health-report-tabs [role="tab"]').last().click();
  await capture(page, viewport, "11-weekly-dnb", "[data-weekly-health-report]", report);

  await page.locator('[data-tab="trends"]').click();
  await capture(page, viewport, "12-growth-tasks", "[data-growth-screen]", report);

  await page.locator('[data-tab="profile"]').click();
  await expect(page.locator(".profile-stack")).toBeVisible();
  await capture(page, viewport, "13-profile", ".profile-stack", report);
  await page.locator(".profile-next-section-button").click();
  await expect(page.locator(".profile-device-card").first()).toBeInViewport();
  await capture(page, viewport, "13-profile-devices", ".profile-device-stack", report);
  await context.close();
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const report = [];
  const errors = [];
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) await captureViewport(browser, baseUrl, viewport, report, errors);
    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ screens: report, errors }, null, 2)}\n`, "utf8");
    console.log(`Captured ${report.length} Figma-aligned states across ${viewports.length} iPhone viewports.`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
