import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "figma-pages");
const port = Number(process.env.PORT || 5194);
const demoAccount = "13800138000";
const demoPassword = "12345678";

const viewports = [
  { name: "iphone-14-pro-max", width: 430, height: 932 },
  { name: "iphone-standard", width: 390, height: 844 },
  { name: "iphone-compact", width: 375, height: 667 },
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
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;

  await captureOnboarding(page, viewport, "00-onboarding-privacy", report);
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();

  const steps = ["age", "occupation", "goal", "sleep", "activity", "diet"];
  for (let index = 0; index < steps.length; index += 1) {
    await captureOnboarding(page, viewport, `00-onboarding-${index + 1}-${steps[index]}`, report);
    await page.locator(".onboarding-option-grid button").first().click();
    await page.locator(".onboarding-next").click();
  }
}

async function login(page, baseUrl, viewport, report) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.locator(".auth-submit").click();
  await completeOnboarding(page, viewport, report);
  await expect(page.locator(".phone-frame")).toBeVisible();
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
  report.push({ viewport: viewport.name, screen: name, ...layout });
  await page.screenshot({ path: path.join(outputDir, viewport.name, `${name}.png`) });
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
  await page.locator('[aria-label="查看运动详情"], [aria-label="View activity details"]').click();
  await capture(page, viewport, "06-exercise-detail", '[data-module-view="exercise-detail"]', report);
  await page.locator('[data-module-view="exercise-detail"] .module-inline-back').click();
  await returnToHub(page);

  await page.locator('[data-record-module="focus"]').click();
  await capture(page, viewport, "07-focus", '[data-module-view="focus-overview"]', report);
  await page.locator('[aria-label="开始专注"], [aria-label="Start focus"]').click();
  await capture(page, viewport, "08-focus-immersive", '[data-module-view="focus-immersive"]', report);
  await page.locator('[data-module-view="focus-immersive"] .module-inline-back').click();
  await returnToHub(page);

  await page.locator('[data-record-module="diet"]').click();
  await capture(page, viewport, "09-diet", '[data-module-view="diet-overview"]', report);
  await page.locator('[aria-label="记录饮食"], [aria-label="Log a meal"]').click();
  await capture(page, viewport, "09b-diet-editor", '[data-record-detail="diet"] .record-editor-stack', report);
  await page.locator('[data-record-detail="diet"] .record-back-button').click();
  await returnToHub(page);

  await page.locator('[data-record-module="face"]').click();
  await capture(page, viewport, "10-face", '[data-module-view="face-overview"]', report);
  await page.locator('[aria-label="使用前置摄像头拍照"], [aria-label="Take a front-camera photo"]').click();
  await capture(page, viewport, "10b-face-editor", '[data-record-detail="face"] .record-editor-stack', report);
  await page.locator('[data-record-detail="face"] .record-back-button').click();
  await returnToHub(page);

  await page.locator('.health-report-tabs [role="tab"]').last().click();
  await capture(page, viewport, "11-weekly-dnb", "[data-weekly-health-report]", report);

  await page.locator('[data-tab="trends"]').click();
  await capture(page, viewport, "12-growth-tasks", "[data-growth-screen]", report);
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
