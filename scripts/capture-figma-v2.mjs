import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "figma-v2-review");
const baseUrl = "http://127.0.0.1:5173/?demo=1";
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function context(browser, viewport = { width: 430, height: 932 }) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
}

async function layout(page, selector) {
  return page.evaluate((target) => {
    const element = document.querySelector(target)?.getBoundingClientRect();
    return {
      selector: target,
      target: element && { x: Math.round(element.x), y: Math.round(element.y), width: Math.round(element.width), height: Math.round(element.height) },
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, selector);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const metrics = {};
  const errors = [];

  try {
    const launchContext = await context(browser);
    const launchPage = await launchContext.newPage();
    launchPage.on("pageerror", (error) => errors.push(error.message));
    await launchPage.goto(baseUrl, { waitUntil: "networkidle" });
    await launchPage.waitForTimeout(1300);
    await launchPage.screenshot({ path: path.join(outputDir, "01-launch-line.png") });
    metrics.launchLine = await layout(launchPage, ".launch-sequence");
    for (let index = 0; index < 3; index += 1) {
      await launchPage.locator(".launch-sequence").click({ position: { x: 18, y: 410 } });
      await launchPage.waitForTimeout(1320);
    }
    await launchPage.locator('.launch-bubble__canvas[data-ready="true"]').waitFor({ timeout: 15000 });
    await launchPage.waitForTimeout(800);
    await launchPage.screenshot({ path: path.join(outputDir, "02-launch-bubble.png") });
    metrics.launchBubble = await layout(launchPage, ".launch-bubble");
    await launchContext.close();

    const authContext = await context(browser);
    await authContext.addInitScript(() => sessionStorage.setItem("nava.launch.sequence.v2", "seen"));
    const authPage = await authContext.newPage();
    authPage.on("pageerror", (error) => errors.push(error.message));
    await authPage.goto(baseUrl, { waitUntil: "networkidle" });
    await authPage.waitForTimeout(600);
    await authPage.screenshot({ path: path.join(outputDir, "03-login.png") });
    metrics.login = await layout(authPage, ".auth-form");
    await authPage.locator(".auth-mode-icon").click();
    await authPage.waitForTimeout(450);
    await authPage.screenshot({ path: path.join(outputDir, "04-signup.png") });
    metrics.signup = await layout(authPage, ".auth-form");
    await authContext.close();

    const homeContext = await context(browser);
    await homeContext.addInitScript(() => {
      sessionStorage.setItem("nava.launch.sequence.v2", "seen");
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    });
    const homePage = await homeContext.newPage();
    homePage.on("pageerror", (error) => errors.push(error.message));
    await homePage.goto(baseUrl, { waitUntil: "networkidle" });
    await homePage.waitForTimeout(850);
    await homePage.screenshot({ path: path.join(outputDir, "05-home-collapsed.png") });
    metrics.homeCollapsed = await layout(homePage, ".option-two-home");
    await homePage.locator(".option-two-side-actions button").first().click();
    await homePage.waitForTimeout(700);
    await homePage.screenshot({ path: path.join(outputDir, "06-home-expanded.png") });
    metrics.homeExpanded = await layout(homePage, ".option-two-health-menu");
    metrics.healthEntries = await homePage.locator(".option-two-health-entry").count();

    const appTabs = [
      ["record", "07-record.png"],
      ["ai", "08-ai.png"],
      ["trends", "09-trends.png"],
      ["profile", "10-profile.png"],
    ];
    for (const [tab, filename] of appTabs) {
      await homePage.locator(`[data-tab="${tab}"]`).click();
      await homePage.waitForTimeout(650);
      await homePage.screenshot({ path: path.join(outputDir, filename) });
      metrics[tab] = await layout(homePage, ".screen-panel");
      if (tab === "record") {
        for (const module of ["mood", "sleep", "exercise", "diet", "focus", "face"]) {
          await homePage.locator(`[data-record-module="${module}"]`).click();
          await homePage.waitForTimeout(900);
          await homePage.screenshot({ path: path.join(outputDir, `07-record-${module}.png`) });
          metrics[`record-${module}`] = await layout(homePage, `[data-record-detail="${module}"]`);
          await homePage.locator('[aria-label="返回记录入口"], [aria-label="Back to records"]').click();
          await homePage.waitForTimeout(560);
        }
      }
    }
    await homeContext.close();

    metrics.errors = errors;
    for (const value of Object.values(metrics)) {
      if (value && typeof value === "object" && "horizontalOverflow" in value && value.horizontalOverflow) {
        throw new Error(`Horizontal overflow: ${JSON.stringify(value)}`);
      }
    }
    if (metrics.healthEntries !== 6) throw new Error(`Expected six health entries, found ${metrics.healthEntries}`);
    if (errors.length) throw new Error(`Page errors: ${JSON.stringify(errors)}`);
    await writeFile(path.join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
  }

  console.log(`Figma v2 screenshots saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
