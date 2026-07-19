import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "ui-review-2026-07-19-launch-bubble");
const baseUrl = "http://127.0.0.1:5173";

async function makeContext(browser, viewport, mobile = true) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 1 : 1.25,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      : undefined,
  });
}

async function advance(page) {
  await page.locator(".launch-sequence").click({ position: { x: 24, y: 420 } });
  await page.waitForTimeout(1320);
}

async function reachReady(page) {
  for (let index = 0; index < 3; index += 1) await advance(page);
  await page.locator('.launch-bubble__canvas[data-ready="true"]').waitFor();
}

async function canvasPixels(page) {
  return page.locator(".launch-bubble__canvas").evaluate((canvas) => {
    const sample = document.createElement("canvas");
    sample.width = 96;
    sample.height = 96;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, sample.width, sample.height);
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let alphaPixels = 0;
    let checksum = 0;
    let colorSum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha > 8) alphaPixels += 1;
      colorSum += pixels[index] + pixels[index + 1] + pixels[index + 2];
      checksum = (checksum + (pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7 + alpha * 11) * (index + 17)) % 2147483647;
    }
    return {
      alphaPixels,
      checksum,
      meanColor: Number((colorSum / (sample.width * sample.height * 3)).toFixed(2)),
    };
  });
}

async function wordmarkPixels(page) {
  const png = await page.locator(".launch-wordmark .nava-wordmark__text").screenshot({ animations: "disabled" });
  return page.evaluate(async ({ base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let right = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        if (alpha > 160 && red < 45 && green < 65 && blue < 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }

    if (right < left) return null;
    const leftSafety = left;
    const rightSafety = canvas.width - 1 - right;
    return {
      centerDelta: Number((((left + right) / 2) - ((canvas.width - 1) / 2)).toFixed(2)),
      left,
      leftSafety,
      right,
      rightSafety,
      safetyDelta: leftSafety - rightSafety,
      width: canvas.width,
    };
  }, { base64: png.toString("base64") });
}

async function readMetrics(page, includeWordmark = false) {
  const layout = await page.evaluate(() => {
    const background = document.querySelector(".living-background__canvas");
    const bubble = document.querySelector(".launch-bubble")?.getBoundingClientRect();
    const canvas = document.querySelector(".launch-bubble__canvas");
    const wordmark = document.querySelector(".launch-wordmark .nava-wordmark__text")?.getBoundingClientRect();
    const start = document.querySelector(".launch-start")?.getBoundingClientRect();
    const overlaps = bubble && start
      ? !(bubble.right <= start.left || bubble.left >= start.right || bubble.bottom <= start.top || bubble.top >= start.bottom)
      : null;
    return {
      backgroundReady: background?.dataset.ready === "true",
      bubble: bubble && { height: Math.round(bubble.height), width: Math.round(bubble.width), x: Math.round(bubble.x), y: Math.round(bubble.y) },
      canvas: canvas
        ? {
            bufferHeight: Number(canvas.dataset.bufferHeight || 0),
            bufferWidth: Number(canvas.dataset.bufferWidth || 0),
            energy: Number(canvas.dataset.energy || 0),
            phase: canvas.dataset.phase,
            pitch: Number(canvas.dataset.pitch || 0),
            ready: canvas.dataset.ready === "true",
            renderCount: Number(canvas.dataset.renderCount || 0),
            split: Number(canvas.dataset.split || 0),
            touch: Number(canvas.dataset.touch || 0),
            yaw: Number(canvas.dataset.yaw || 0),
          }
        : null,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      overlapsStart: overlaps,
      start: start && { height: Math.round(start.height), width: Math.round(start.width), x: Math.round(start.x), y: Math.round(start.y) },
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
      viewport: { height: window.innerHeight, width: window.innerWidth },
      wordmark: wordmark && { height: Math.round(wordmark.height), width: Math.round(wordmark.width), x: Math.round(wordmark.x), y: Math.round(wordmark.y) },
    };
  });
  return {
    ...layout,
    pixels: await canvasPixels(page),
    wordmarkPixels: includeWordmark ? await wordmarkPixels(page) : undefined,
  };
}

async function swipe(page, client, from, to, steps = 9) {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ force: 1, id: 1, radiusX: 4, radiusY: 4, x: from.x, y: from.y }],
  });
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        force: 1,
        id: 1,
        radiusX: 4,
        radiusY: 4,
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      }],
    });
    await page.waitForTimeout(12);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
}

async function waitForPhase(page, expected, timeout = 5000) {
  await page.waitForFunction(
    (phase) => document.querySelector(".launch-bubble__canvas")?.dataset.phase === phase,
    expected,
    { timeout },
  );
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  const metrics = {};
  const errors = [];

  try {
    const context = await makeContext(browser, { width: 430, height: 932 });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
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
    await page.locator(".launch-sequence").click({ position: { x: 24, y: 420 } });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outputDir, "04-line-fade-out.png") });
    await page.waitForTimeout(820);
    await page.screenshot({ path: path.join(outputDir, "05-next-line-fade-in.png") });

    await advance(page);
    await advance(page);
    await page.locator('.launch-bubble__canvas[data-ready="true"]').waitFor();
    await page.waitForTimeout(900);
    metrics.idle = await readMetrics(page, true);
    await page.screenshot({ path: path.join(outputDir, "06-bubble-idle.png") });
    const rateStartedAt = Date.now();
    await page.waitForTimeout(1800);
    metrics.idleLater = await readMetrics(page);
    metrics.renderRate = Number(
      ((metrics.idleLater.canvas.renderCount - metrics.idle.canvas.renderCount) / ((Date.now() - rateStartedAt) / 1000)).toFixed(1),
    );
    await page.screenshot({ path: path.join(outputDir, "07-bubble-breathing.png") });

    const box = await page.locator(".launch-bubble__canvas").boundingBox();
    if (!box) throw new Error("Launch bubble has no layout box.");
    const centerY = box.y + box.height * 0.53;
    await swipe(page, client, { x: box.x + box.width * 0.25, y: centerY }, { x: box.x + box.width * 0.78, y: centerY - 36 });
    metrics.rotated = await readMetrics(page);
    await page.screenshot({ path: path.join(outputDir, "08-bubble-dragged.png") });
    await swipe(page, client, { x: box.x + box.width * 0.78, y: centerY + 34 }, { x: box.x + box.width * 0.22, y: centerY - 24 });
    await swipe(page, client, { x: box.x + box.width * 0.23, y: centerY - 42 }, { x: box.x + box.width * 0.8, y: centerY + 30 });
    await page.waitForFunction(() => document.querySelector(".launch-bubble__canvas")?.dataset.phase !== "idle", null, { timeout: 2500 });
    await page.waitForTimeout(220);
    metrics.splitting = await readMetrics(page);
    await page.screenshot({ path: path.join(outputDir, "09-bubble-splitting.png") });
    await waitForPhase(page, "separated");
    await page.waitForTimeout(300);
    metrics.separated = await readMetrics(page);
    await page.screenshot({ path: path.join(outputDir, "10-bubble-separated.png") });
    await waitForPhase(page, "merging");
    await page.waitForTimeout(700);
    metrics.merging = await readMetrics(page);
    await page.screenshot({ path: path.join(outputDir, "11-bubble-merging.png") });
    await waitForPhase(page, "idle", 6000);
    await page.waitForTimeout(500);
    metrics.settled = await readMetrics(page);
    await page.screenshot({ path: path.join(outputDir, "12-bubble-settled.png") });
    await context.close();

    const compactContext = await makeContext(browser, { width: 375, height: 667 });
    const compactPage = await compactContext.newPage();
    compactPage.on("pageerror", (error) => errors.push(error.message));
    await compactPage.goto(baseUrl, { waitUntil: "networkidle" });
    await reachReady(compactPage);
    await compactPage.waitForTimeout(900);
    metrics.compact = await readMetrics(compactPage, true);
    await compactPage.screenshot({ path: path.join(outputDir, "13-bubble-compact.png") });
    await compactContext.close();

    const desktopContext = await makeContext(browser, { width: 900, height: 1000 }, false);
    const desktopPage = await desktopContext.newPage();
    desktopPage.on("pageerror", (error) => errors.push(error.message));
    await desktopPage.goto(baseUrl, { waitUntil: "networkidle" });
    await reachReady(desktopPage);
    await desktopPage.waitForTimeout(900);
    metrics.desktop = await readMetrics(desktopPage, true);
    await desktopPage.screenshot({ path: path.join(outputDir, "14-bubble-desktop.png") });
    await desktopContext.close();

    metrics.errors = errors;
    if (errors.length > 0) throw new Error(`Launch experience emitted errors: ${JSON.stringify(errors)}`);
    if (!metrics.idle.backgroundReady || !metrics.idle.canvas?.ready || metrics.idle.pixels.alphaPixels < 180) {
      throw new Error(`Bubble canvas was blank or not ready: ${JSON.stringify(metrics.idle)}`);
    }
    if (metrics.idle.pixels.checksum === metrics.idleLater.pixels.checksum) {
      throw new Error("Bubble pixels did not change while idling.");
    }
    if (metrics.renderRate < 20) throw new Error(`Bubble rendered too slowly: ${metrics.renderRate} fps`);
    if (Math.abs(metrics.rotated.canvas.yaw - metrics.idleLater.canvas.yaw) < 0.2) {
      throw new Error(`Drag did not rotate the bubble: ${JSON.stringify(metrics.rotated)}`);
    }
    if (metrics.separated.canvas.split < 0.9 || metrics.merging.canvas.split >= 0.9 || metrics.settled.canvas.split > 0.02) {
      throw new Error(`Split/merge cycle was incomplete: ${JSON.stringify({ separated: metrics.separated, merging: metrics.merging, settled: metrics.settled })}`);
    }
    for (const state of [metrics.idle, metrics.compact, metrics.desktop]) {
      if (state.horizontalOverflow || state.verticalOverflow || state.overlapsStart) {
        throw new Error(`Launch layout overflow or overlap: ${JSON.stringify(state)}`);
      }
      if (state.pixels.alphaPixels < 120) throw new Error(`Bubble was blank at a tested viewport: ${JSON.stringify(state)}`);
      if (
        !state.wordmarkPixels ||
        Math.abs(state.wordmarkPixels.centerDelta) > 4 ||
        Math.min(state.wordmarkPixels.leftSafety, state.wordmarkPixels.rightSafety) < 4 ||
        Math.abs(state.wordmarkPixels.safetyDelta) > 8
      ) {
        throw new Error(`Launch NAVA glyph pixels are off-center or clipped: ${JSON.stringify(state.wordmarkPixels)}`);
      }
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
