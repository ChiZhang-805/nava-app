// Synthetic files exercise direct browser capture and preview without camera hardware.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/camera-layout";
await mkdir(output, { recursive: true });
const receipt = { startedAt: new Date().toISOString(), passed: false, syntheticPhotos: true, results: [] };
await writeFile(`${output}/result.json`, JSON.stringify(receipt));
const server = await createServer({ server: { host: "127.0.0.1", port: 5227, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, reducedMotion: "reduce" });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {}, completedAt: new Date().toISOString(), source: "local" }));
      });
      const page = await context.newPage();
      await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))).catch(() => {});
      });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*.supabase.co/rest/v1/journal_entries**", route => route.fulfill({ json: [] }));
      await page.route("**/*.supabase.co/rest/v1/journal_preferences**", route => route.fulfill({ json: { settings: { "fluffy-first-guide-face": true } } }));
      await page.goto("http://127.0.0.1:5227/?demo=1#tab=record&module=face", { waitUntil: "networkidle" });
      if (await page.locator(".launch-sequence").isVisible().catch(() => false)) await page.locator(".launch-sequence").click();
      await page.waitForTimeout(500);
      if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) {
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
        await expect(page.locator(".completion-celebration-layer")).toHaveCount(0);
      }
      const frame = page.frameLocator(".journal-experience iframe");
      await expect(frame.locator("#cold-guide")).toBeHidden({ timeout: 30000 });
      const preview = frame.locator("#photo-preview");
      const sheet = frame.locator("#sheet-layer");

      for (const [shape, size] of [["landscape", [1280, 960]], ["portrait", [720, 1280]]]) {
        const file = await page.evaluate(([width, height]) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const draw = canvas.getContext("2d");
          draw.fillStyle = "#89c7df";
          draw.fillRect(0, 0, width, height);
          draw.fillStyle = "#30486b";
          draw.fillRect(0, 0, width / 2, height / 2);
          return canvas.toDataURL("image/jpeg").split(",")[1];
        }, size);
        const picker = page.waitForEvent("filechooser");
        await preview.click();
        const chooser = await picker;
        await expect(sheet).toBeHidden();
        await expect(frame.locator("#photo-library")).toHaveAttribute("capture", "user");
        await chooser.setFiles({ name: "capture.jpg", mimeType: "image/jpeg", buffer: Buffer.from(file, "base64") });
        const image = preview.locator("img");
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(size[0]);
        const intrinsic = await image.evaluate(node => [node.naturalWidth, node.naturalHeight]);
        assert.deepEqual(intrinsic, size);
        const geometry = await preview.evaluate(node => {
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
        assert.ok(Math.abs(geometry.width / geometry.height - size[0] / size[1]) < 0.03);
        await page.screenshot({ path: `${output}/${viewport.width}-${shape}-captured.png` });
        receipt.results.push({ viewport, shape, intrinsic, geometry });
      }

      const cancelPicker = page.waitForEvent("filechooser");
      await preview.click();
      await (await cancelPicker).setFiles([]);
      await expect(sheet).toBeHidden();
      await expect(preview.locator("img")).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally {
  await browser.close();
  await server.close();
  await writeFile(`${output}/result.json`, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
}
console.log(JSON.stringify({ passed: receipt.passed, states: receipt.results.length, output }));
