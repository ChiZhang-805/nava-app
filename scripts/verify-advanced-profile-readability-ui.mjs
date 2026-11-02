import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/advanced-profile-readability";
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
await mkdir(output, { recursive: true });
const report = { passed: false, results: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5268, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: "zh-CN", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      sessionStorage.clear();
      localStorage.clear();
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
    });
    const page = await context.newPage();
    await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=today&view=profile-details`, { waitUntil: "networkidle" });
    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();
    if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) await page.keyboard.press("Escape");
    await expect(page.locator(".advanced-profile-section")).toHaveCount(4);

    const geometry = await page.locator(".advanced-profile-screen").evaluate((screen) => {
      const font = (node) => parseFloat(getComputedStyle(node).fontSize);
      const paint = (node) => ({ background: getComputedStyle(node).backgroundColor, image: getComputedStyle(node).backgroundImage, shadow: getComputedStyle(node).boxShadow });
      return {
        overflow: screen.scrollWidth - screen.clientWidth,
        headers: [...screen.querySelectorAll(".advanced-profile-section > header")].map((header) => ({
          title: font(header.querySelector("strong")),
          caption: font(header.querySelector("small")),
          glyph: header.querySelector(":scope > span > svg").getBoundingClientRect().width,
          iconPaint: paint(header.querySelector(":scope > span")),
        })),
        labels: [...screen.querySelectorAll(".advanced-profile-section label > span:first-child, .advanced-profile-diet-field legend")].map(font),
        values: [...screen.querySelectorAll('.advanced-profile-section input:not([type="checkbox"]), .advanced-profile-section textarea, .advanced-profile-wheel > button')].map(font),
        chips: [...screen.querySelectorAll(".advanced-profile-diet-chips button")].map(font),
      };
    });
    assert.ok(geometry.overflow <= 1, `${width}x${height}: horizontal overflow`);
    assert.ok(geometry.headers.every((item) => item.title >= 16 && item.caption >= 11 && item.glyph >= 22), `${width}x${height}: section typography or glyph is too small`);
    assert.ok(geometry.headers.every((item) => item.iconPaint.background === "rgba(0, 0, 0, 0)" && item.iconPaint.image === "none" && item.iconPaint.shadow === "none"), `${width}x${height}: a section icon still has a background layer`);
    assert.ok(geometry.labels.length > 0 && geometry.labels.every((size) => size >= 12), `${width}x${height}: field label is too small`);
    assert.ok(geometry.values.length > 0 && geometry.values.every((size) => size >= 14), `${width}x${height}: field value is too small`);
    assert.ok(geometry.chips.length > 0 && geometry.chips.every((size) => size >= 12), `${width}x${height}: preference chip is too small`);
    report.results.push({ viewport: `${width}x${height}`, ...geometry });
    await page.screenshot({ path: `${output}/${width}x${height}.png`, fullPage: true });
    await context.close();
  }
  report.passed = true;
  console.log("Advanced profile typography and bare section icons passed at four portrait sizes.");
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
