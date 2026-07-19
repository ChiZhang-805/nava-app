import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "ui-review-2026-07-19-launch-experience");
const baseUrl = "http://127.0.0.1:5173";

async function makeContext(browser, viewport) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
}

async function advance(page) {
  await page.locator(".launch-sequence").tap({ position: { x: 24, y: 420 } });
  await page.waitForTimeout(1320);
}

async function reachReady(page) {
  for (let index = 0; index < 3; index += 1) await advance(page);
  await page.locator(".launch-sequence.ready .launch-start").waitFor();
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".living-background__canvas");
    const wordmark = document.querySelector(".launch-wordmark .nava-wordmark__vector")?.getBoundingClientRect();
    const start = document.querySelector(".launch-start")?.getBoundingClientRect();
    return {
      canvas: canvas
        ? {
          launchField: Number(canvas.dataset.launchField ?? 0),
          launchImpulse: Number(canvas.dataset.launchImpulse ?? 0),
          ready: canvas.dataset.ready === "true",
          renderCount: Number(canvas.dataset.renderCount ?? 0),
          }
        : null,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      start: start && { height: Math.round(start.height), width: Math.round(start.width), x: Math.round(start.x), y: Math.round(start.y) },
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
      viewport: { height: window.innerHeight, width: window.innerWidth },
      wordmark: wordmark && {
        height: Math.round(wordmark.height),
        width: Math.round(wordmark.width),
        x: Math.round(wordmark.x),
        y: Math.round(wordmark.y),
      },
    };
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  const metrics = {};
  const errors = [];

  try {
    const context = await makeContext(browser, { width: 430, height: 932 });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(outputDir, "01-line-fade-in.png") });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, "02-line-visible.png") });
    metrics.lineAnimations = await page.locator(".launch-line").evaluate((element) =>
      element.getAnimations().map((animation) => ({
        duration: Number(animation.effect?.getTiming().duration ?? 0),
        name: animation instanceof CSSAnimation ? animation.animationName : "transition",
      })),
    );
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(outputDir, "03-line-hold.png") });
    await page.locator(".launch-sequence").tap({ position: { x: 24, y: 420 } });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outputDir, "04-line-fade-out.png") });
    await page.waitForTimeout(820);
    await page.screenshot({ path: path.join(outputDir, "05-next-line-fade-in.png") });

    await advance(page);
    await advance(page);
    await page.locator(".launch-sequence.ready .launch-start").waitFor();
    await page.waitForTimeout(1500);
    metrics.ready = await readMetrics(page);
    await page.screenshot({ path: path.join(outputDir, "06-ready-field.png") });
    const renderRateStartedAt = Date.now();
    await page.waitForTimeout(3000);
    const readyLater = await readMetrics(page);
    metrics.readyRenderRate = Number(
      ((readyLater.canvas.renderCount - metrics.ready.canvas.renderCount) / ((Date.now() - renderRateStartedAt) / 1000)).toFixed(1),
    );
    await page.screenshot({ path: path.join(outputDir, "07-ready-field-later.png") });
    await page.touchscreen.tap(215, 515);
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(outputDir, "08-ready-field-touch.png") });
    await page.waitForTimeout(420);
    metrics.touched = await readMetrics(page);
    await page.waitForTimeout(430);
    await page.screenshot({ path: path.join(outputDir, "09-ready-field-settle.png") });
    await context.close();

    const compactContext = await makeContext(browser, { width: 375, height: 667 });
    const compactPage = await compactContext.newPage();
    compactPage.on("pageerror", (error) => errors.push(error.message));
    await compactPage.goto(baseUrl, { waitUntil: "networkidle" });
    await reachReady(compactPage);
    await compactPage.waitForTimeout(1500);
    metrics.compact = await readMetrics(compactPage);
    await compactPage.screenshot({ path: path.join(outputDir, "10-ready-field-compact.png") });
    await compactContext.close();

    metrics.errors = errors;
    if (errors.length > 0) throw new Error(`Launch experience emitted errors: ${JSON.stringify(errors)}`);
    if (!metrics.ready.canvas?.ready || metrics.ready.canvas.launchField < 0.8) {
      throw new Error(`Launch field did not become ready: ${JSON.stringify(metrics.ready)}`);
    }
    if (metrics.readyRenderRate < 20) {
      throw new Error(`Launch field rendered too slowly: ${metrics.readyRenderRate} fps`);
    }
    if (metrics.touched.canvas.launchImpulse <= metrics.ready.canvas.launchImpulse) {
      throw new Error(`Touch did not energize the launch field: ${JSON.stringify(metrics.touched)}`);
    }
    if (metrics.ready.horizontalOverflow || metrics.ready.verticalOverflow || metrics.compact.horizontalOverflow || metrics.compact.verticalOverflow) {
      throw new Error(`Launch experience overflowed a portrait viewport: ${JSON.stringify(metrics)}`);
    }
    await writeFile(path.join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
  }

  console.log(`Launch experience review saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
