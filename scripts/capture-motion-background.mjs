import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputDir = path.resolve("artifacts", process.env.MOTION_REVIEW_DIR || "motion-background-review");
const baseUrl = process.env.BG_BASE_URL || "http://127.0.0.1:5173";

async function emitOrientation(page, beta, gamma, repetitions = 1) {
  await page.evaluate(async ({ beta, gamma, repetitions }) => {
    for (let index = 0; index < repetitions; index += 1) {
      const event = new Event("deviceorientation");
      Object.defineProperties(event, {
        absolute: { value: false },
        alpha: { value: 0 },
        beta: { value: beta },
        gamma: { value: gamma },
      });
      window.dispatchEvent(event);
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
  }, { beta, gamma, repetitions });
}

async function emitAcceleration(page, x, y, z, repetitions = 1) {
  await page.evaluate(async ({ x, y, z, repetitions }) => {
    for (let index = 0; index < repetitions; index += 1) {
      const event = new Event("devicemotion");
      Object.defineProperties(event, {
        acceleration: { value: { x, y, z } },
        accelerationIncludingGravity: { value: null },
        interval: { value: 40 },
        rotationRate: { value: null },
      });
      window.dispatchEvent(event);
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
  }, { repetitions, x, y, z });
}

async function readMotion(page) {
  return page.locator(".living-background__canvas").evaluate((canvas) => ({
    intensity: Number(canvas.dataset.motionIntensity || 0),
    ready: canvas.dataset.ready === "true",
    renderCount: Number(canvas.dataset.renderCount || 0),
    status: canvas.dataset.motionStatus || "unknown",
    startupStatus: canvas.dataset.motionStartupStatus || "unknown",
    x: Number(canvas.dataset.motionX || 0),
    y: Number(canvas.dataset.motionY || 0),
  }));
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ locale: "zh-CN",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("nava.launch.sequence.v1", "seen");
    Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, value: Event });
    Object.defineProperty(window, "DeviceMotionEvent", { configurable: true, value: Event });
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".living-background__canvas[data-ready='true']").waitFor();
  const environment = await page.evaluate(() => ({
    hidden: document.hidden,
    motionConstructor: typeof window.DeviceMotionEvent,
    motionPermission: typeof window.DeviceMotionEvent?.requestPermission,
    orientationConstructor: typeof window.DeviceOrientationEvent,
    orientationPermission: typeof window.DeviceOrientationEvent?.requestPermission,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  process.stdout.write(`${JSON.stringify(environment)}\n`);
  await page.screenshot({ path: path.join(outputDir, "01-baseline.png") });

  await emitOrientation(page, 58, 0);
  await emitOrientation(page, 58, 14, 14);
  await page.waitForTimeout(900);
  const tiltRight = await readMotion(page);
  await page.screenshot({ path: path.join(outputDir, "02-tilt-right.png") });

  await emitOrientation(page, 58, 0, 10);
  await emitAcceleration(page, -1.35, 0.18, 0.08, 12);
  await page.waitForTimeout(700);
  const impulseLeft = await readMotion(page);
  await page.screenshot({ path: path.join(outputDir, "03-impulse-left.png") });

  await page.waitForTimeout(2600);
  const settled = await readMotion(page);
  await page.screenshot({ path: path.join(outputDir, "04-settled.png") });

  assert.equal(tiltRight.ready, true);
  assert.ok(tiltRight.x > 0.65 && tiltRight.intensity > 0.4, `right tilt did not engage: ${JSON.stringify(tiltRight)}`);
  assert.ok(impulseLeft.x < -0.55 && impulseLeft.intensity > 0.35, `left impulse did not engage: ${JSON.stringify(impulseLeft)}`);
  assert.ok(settled.intensity < 0.25, `motion did not settle: ${JSON.stringify(settled)}`);

  const metrics = { impulseLeft, settled, tiltRight };
  await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  await context.close();
  process.stdout.write(`Motion background review saved to ${outputDir}\n`);
} finally {
  await browser.close();
}
