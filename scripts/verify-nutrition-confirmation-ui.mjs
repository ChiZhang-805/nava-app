import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/nutrition-confirmation";
const port = 5233;
const viewports = [
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const photo = {
  name: "meal.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
};

await mkdir(output, { recursive: true });
const receipt = { passed: false, startedAt: new Date().toISOString(), viewports: [] };
await writeFile(`${output}/ui.json`, JSON.stringify(receipt, null, 2));
const server = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
      await page.frameLocator('.completion-celebration-layer iframe[title="完成"]').getByRole("button", { name: /Continue|继续/ }).click();
    });
    await page.goto(`http://127.0.0.1:${port}/?demo=1#tab=ai`, { waitUntil: "networkidle" });
    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();
    await expect(page.locator(".chat-composer")).toBeVisible();
    await page.locator(".chat-camera-input").setInputFiles(photo);

    const card = page.locator('[data-structured-confirmation="nutrition"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.locator(".nutrition-meal-heading strong")).toHaveText(/早餐|午餐|晚餐|加餐/);
    await expect(card.locator(".nutrition-result-item")).toHaveCount(2);
    await expect(card.locator(".nutrition-result-item").nth(0)).toContainText("鸡胸肉沙拉");
    await expect(card.locator(".nutrition-result-item").nth(1)).toContainText("蓝莓酸奶");
    await expect(card.locator(".nutrition-result-item dl > div")).toHaveCount(6);
    await expect(card.locator(".nutrition-meal-total dl > div")).toHaveCount(3);
    await expect(card.locator(".nutrition-meal-total dl")).not.toContainText("0g");
    await expect(card.locator(".nutrition-meal-total dl dd")).toHaveText(["—", "—", "—"]);
    await card.getByRole("button", { name: "逐项编辑" }).click();
    await expect(card.locator(".nutrition-result-editor input")).toHaveCount(4);
    await card.getByRole("button", { name: "逐项编辑" }).click();
    await card.scrollIntoViewIfNeeded();

    const geometry = await card.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const frame = node.closest(".phone-frame")?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect();
      const items = [...node.querySelectorAll(".nutrition-result-item")].map((item) => {
        const itemRect = item.getBoundingClientRect();
        return { left: itemRect.left, right: itemRect.right, width: itemRect.width, overflow: item.scrollWidth - item.clientWidth };
      });
      return { left: rect.left, right: rect.right, frameLeft: frame.left, frameRight: frame.right, overflow: node.scrollWidth - node.clientWidth, items };
    });
    assert.ok(geometry.left >= geometry.frameLeft && geometry.right <= geometry.frameRight && geometry.overflow <= 1, JSON.stringify(geometry));
    assert.ok(geometry.items.every((item) => item.overflow <= 1 && item.left >= geometry.left && item.right <= geometry.right), JSON.stringify(geometry));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/nutrition-${viewport.width}x${viewport.height}.png` });
    await card.screenshot({ path: `${output}/nutrition-card-${viewport.width}x${viewport.height}.png` });
    receipt.viewports.push({ ...viewport, geometry });
    await context.close();
  }
  receipt.passed = true;
  receipt.completedAt = new Date().toISOString();
  await writeFile(`${output}/ui.json`, JSON.stringify(receipt, null, 2));
  console.log(`Nutrition confirmation verified at ${viewports.length} portrait sizes: ${output}`);
} finally {
  await browser.close();
  await server.close();
}
