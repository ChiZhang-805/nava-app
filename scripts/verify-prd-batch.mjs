import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const root = process.cwd();
const baseUrl = (process.env.REVIEW_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const outputDir = path.resolve(root, "..", "Build", "TestRuns", "nava-prd-batch-20260902");
const viewports = [
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function login(page) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;
  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) await welcome.waitFor({ state: "hidden", timeout: 6_000 });
  for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
    await expect(onboarding).toHaveAttribute("data-onboarding-step", step);
    await page.locator(".onboarding-option-grid button").first().click();
    if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
  }
  await expect(onboarding).toHaveAttribute("data-onboarding-step", "privacy");
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function openRoute(page, hash, selector) {
  await page.goto(`${baseUrl}?demo=1#${hash}`, { waitUntil: "networkidle" });
  await expect(page.locator(selector)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(700);
}

async function assertPortraitFit(page, label) {
  const fit = await page.evaluate(() => {
    const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      bodyWidth: document.documentElement.scrollWidth,
      frameLeft: frame?.left ?? 0,
      frameRight: frame?.right ?? 0,
    };
  });
  if (fit.bodyWidth > fit.viewport + 1 || fit.frameLeft < -1 || fit.frameRight > fit.viewport + 1) {
    throw new Error(`${label} overflows horizontally: ${JSON.stringify(fit)}`);
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: viewports[3], isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  await login(page);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const suffix = `${viewport.width}x${viewport.height}`;

    await openRoute(page, "tab=record&module=focus", '[data-module-view="focus-overview"]');
    await expect(page.locator(".focus-todo-card")).toBeVisible();
    await page.locator(".focus-todo-title-input").fill(`回归待办 ${suffix}`);
    await page.locator('.focus-todo-plan-form input[type="time"]').fill("15:30");
    await page.locator('.focus-todo-plan-form input[aria-label="每次专注分钟数"]').fill("45");
    await page.locator('.focus-todo-plan-form input[aria-label="计划专注次数"]').fill("3");
    await page.locator(".focus-todo-add button").click();
    await expect(page.locator(".focus-todo-list")).toContainText(`回归待办 ${suffix}`);
    await page.locator(".focus-todo-tabs button").last().click();
    await expect(page.locator(".focus-todo-calendar button")).toHaveCount(7);
    await page.locator(".focus-chart-tabs button").nth(1).click();
    await expect(page.locator(".focus-distribution-bars, .module-empty-copy").first()).toBeVisible();
    await expect(page.locator(".module-cross-actions button")).toHaveCount(2);
    await assertPortraitFit(page, `focus-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `focus-${suffix}.png`), fullPage: true });

    await openRoute(page, "tab=record&module=sleep", '[data-module-view="sleep-overview"]');
    await expect(page.locator(".sleep-chart-actions button")).toHaveCount(3);
    await page.locator(".sleep-chart-actions > div button").last().click();
    await assertPortraitFit(page, `sleep-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `sleep-${suffix}.png`), fullPage: true });

    await openRoute(page, "tab=record&module=mood", '[data-module-view="mood-overview"]');
    await expect(page.locator(".mood-factor-chips button")).toHaveCount(9);
    const selectedBefore = await page.locator(".mood-factor-chips button.selected").count();
    await page.locator(".mood-factor-chips button:not(.selected)").first().click();
    await page.locator(".mood-factor-chips button:not(.selected)").first().click();
    await expect(page.locator(".mood-factor-chips button.selected")).toHaveCount(selectedBefore + 2);
    await assertPortraitFit(page, `mood-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `mood-${suffix}.png`), fullPage: true });

    await openRoute(page, "tab=record&module=diet", '[data-module-view="diet-overview"]');
    await expect(page.locator(".diet-energy-context")).toBeVisible();
    await expect(page.locator(".diet-macro-ring")).toBeVisible();
    await assertPortraitFit(page, `diet-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `diet-${suffix}.png`), fullPage: true });

    await openRoute(page, "tab=record&module=face", '[data-module-view="face-overview"]');
    await expect(page.locator(".face-daily-note")).toBeVisible();
    await assertPortraitFit(page, `face-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `face-${suffix}.png`), fullPage: true });

    await page.goto(`${baseUrl}?demo=1&qa=weekly-ai#tab=record`, { waitUntil: "networkidle" });
    await expect(page.locator(".record-hub")).toBeVisible();
    await page.locator('.health-report-tabs [role="tab"]').last().click();
    await expect(page.locator('[data-weekly-health-report]')).toBeVisible();
    const detailTrigger = page.locator(".weekly-ai-summary-list li button").first();
    await expect(detailTrigger).toBeVisible();
    await detailTrigger.click();
    await expect(page.locator(".weekly-detail-dialog")).toBeVisible();
    await expect(page.locator(".weekly-detail-dialog")).toContainText("详细解释");
    await page.waitForTimeout(320);
    await assertPortraitFit(page, `weekly-detail-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `weekly-detail-${suffix}.png`), fullPage: true });
    await page.locator('.weekly-detail-dialog header button').click();

    await openRoute(page, "tab=trends", "[data-growth-screen]");
    await expect(page.locator('.growth-task-group').first().locator('[data-growth-task][data-completed="true"]')).toHaveCount(0);
    await assertPortraitFit(page, `growth-${suffix}`);
    await page.screenshot({ path: path.join(outputDir, `growth-${suffix}.png`), fullPage: true });
  }

  await browser.close();
  if (runtimeErrors.length > 0) throw new Error(`Runtime errors:\n${runtimeErrors.join("\n")}`);
  console.log(`PRD batch visual verification passed at ${viewports.map((item) => `${item.width}x${item.height}`).join(", ")}.`);
  console.log(`Evidence: ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
