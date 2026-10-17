import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = process.env.NAVA_WARDROBE_EVIDENCE_DIR
  ? `${process.env.NAVA_WARDROBE_EVIDENCE_DIR}/fast-switch`
  : "Q:/NAVA-Workspace/Build/TestRuns/wardrobe-fast-switch";
await mkdir(output, { recursive: true });

const server = await createServer({ server: { host: "127.0.0.1", port: 5281, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
await context.addInitScript(() => {
  sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
  localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
});

let releaseWorn;
const wornGate = new Promise((resolve) => { releaseWorn = resolve; });
await context.route("**/*.glb", async (route) => {
  if (route.request().url().includes("nava-wardrobe-cat")) return route.continue();
  await wornGate;
  return route.continue().catch(() => {});
});

const page = await context.newPage();
const report = { passed: false, baseBounds: null, wornBounds: null, retainedWhileLoading: false, warmedSwitchMilliseconds: null, errors: [] };

async function alphaBounds() {
  const image = await page.locator(".mascot-wardrobe-turntable").screenshot({ omitBackground: true });
  return page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const probe = document.createElement("canvas");
    probe.width = bitmap.width; probe.height = bitmap.height;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < probe.height; y += 1) for (let x = 0; x < probe.width; x += 1) {
      const offset = (y * probe.width + x) * 4;
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      // Sample the pale cyan/white body within the character stage. The status
      // pills and summary card sit outside this vertical band, while the purple
      // preview background has a much larger blue/red separation.
      const catFur = red > 135 && green > 150 && blue > 155 && Math.abs(red - green) < 70 && blue - red < 95;
      if (y < 35 || y > probe.height - 62 || pixels[offset + 3] < 8 || !catFur) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1;
    }
    if (count === 0) throw new Error("The rendered cat produced no visible pixels");
    return { width: maxX - minX + 1, height: maxY - minY + 1, count, canvasWidth: probe.width, canvasHeight: probe.height };
  }, `data:image/png;base64,${image.toString("base64")}`);
}

try {
  await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=profile&view=wardrobe`, { waitUntil: "domcontentloaded" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  const character = page.locator(".mascot-wardrobe-character");
  const canvas = page.locator(".mascot-wardrobe-turntable");
  await expect(character).toHaveAttribute("data-renderer", "ready", { timeout: 30000 });
  report.baseBounds = await alphaBounds();
  const baseFrame = await canvas.screenshot();

  await page.getByRole("tab", { name: "饰品" }).click();
  await page.locator(".mascot-wardrobe-item").filter({ hasText: "星月发夹" }).click();
  await expect(canvas).toHaveAttribute("data-worn-model", /loading:accessory-star-moon-clip/);
  await expect(character).toHaveAttribute("data-renderer", "ready");
  await expect(page.locator(".mascot-wardrobe-model-loading")).toHaveCount(0);
  assert.deepEqual(await canvas.screenshot(), baseFrame, "the visible cat must stay unchanged while its replacement loads");
  report.retainedWhileLoading = true;

  releaseWorn();
  await expect(canvas).toHaveAttribute("data-worn-model", "accessory-star-moon-clip", { timeout: 30000 });
  report.wornBounds = await alphaBounds();
  const ratio = report.baseBounds.height / report.wornBounds.height;
  assert.ok(ratio >= 0.92 && ratio <= 1.08, `base/worn visible height ratio ${ratio.toFixed(3)} is not visually matched`);
  await page.screenshot({ path: `${output}/worn-star-moon-clip.png` });

  await page.locator(".mascot-wardrobe-item").filter({ hasText: "星月发夹" }).click();
  await expect(canvas).toHaveAttribute("data-worn-model", "none");
  await page.screenshot({ path: `${output}/base-cat.png` });

  await page.waitForTimeout(700);
  const switchStarted = Date.now();
  await page.locator(".mascot-wardrobe-item").filter({ hasText: "雾紫贝雷帽" }).click();
  await expect(canvas).toHaveAttribute("data-worn-model", "accessory-mist-beret", { timeout: 30000 });
  report.warmedSwitchMilliseconds = Date.now() - switchStarted;
  await page.screenshot({ path: `${output}/mist-beret-fixed.png` });
  report.passed = true;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  releaseWorn();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
  await server.close();
}

if (!report.passed) throw new Error(report.errors.join("\n"));
console.log(`Wardrobe fast switch passed; base ${report.baseBounds.width}x${report.baseBounds.height}, worn ${report.wornBounds.width}x${report.wornBounds.height}, warmed switch ${report.warmedSwitchMilliseconds}ms.`);
