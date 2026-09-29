// Synthetic camera frames verify the current first-record camera sheet, not physical hardware.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/camera-layout";
await mkdir(output, { recursive: true });
const receipt = { startedAt: new Date().toISOString(), passed: false, syntheticCamera: true, results: [] };
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
        window.__frameSize = [1280, 960];
        window.__cameraMode = "live";
        window.__testTracks = [];
        navigator.mediaDevices.getUserMedia = async () => {
          if (window.__cameraMode === "denied") throw new DOMException("fixture denial", "NotAllowedError");
          if (window.__cameraMode === "pending") await new Promise(resolve => { window.__resolvePermission = resolve; });
          const canvas = document.createElement("canvas");
          [canvas.width, canvas.height] = window.__frameSize;
          const draw = canvas.getContext("2d");
          const gradient = draw.createLinearGradient(0, 0, canvas.width, canvas.height);
          gradient.addColorStop(0, "#bcecf4"); gradient.addColorStop(1, "#5a9fba");
          draw.fillStyle = gradient; draw.fillRect(0, 0, canvas.width, canvas.height);
          for (const [x, y, color] of [[0, 0, "#e53333"], [canvas.width - 80, 0, "#33b533"], [0, canvas.height - 80, "#3333d5"], [canvas.width - 80, canvas.height - 80, "#e5c533"]]) {
            draw.fillStyle = color; draw.fillRect(x, y, 80, 80);
          }
          const stream = canvas.captureStream(1);
          window.__testTracks.push(...stream.getTracks());
          return stream;
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*.supabase.co/rest/v1/journal_entries**", route => route.fulfill({ json: [] }));
      await page.route("**/*.supabase.co/rest/v1/journal_preferences**", route => route.fulfill({ json: { settings: { "fluffy-first-guide-face": true } } }));
      await page.goto("http://127.0.0.1:5227/?demo=1#tab=record&module=face", { waitUntil: "networkidle" });
      if (await page.locator(".launch-sequence").isVisible().catch(() => false)) await page.locator(".launch-sequence").click();
      await page.waitForTimeout(500);
      if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) {
        await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
        await expect(page.locator(".completion-celebration-layer")).toHaveCount(0);
      }
      const frame = page.frameLocator(".journal-experience iframe");
      await expect(frame.locator("#cold-guide")).toBeHidden({ timeout: 30000 });
      const preview = frame.locator("#photo-preview");
      const sheet = frame.locator("#sheet-layer");

      for (const [shape, size] of [["landscape", [1280, 960]], ["portrait", [720, 1280]]]) {
        await frame.locator("body").evaluate((_, next) => { window.__frameSize = next; window.__cameraMode = "live"; }, size);
        await preview.click();
        await expect(sheet).toBeVisible();
        await expect(frame.getByRole("button", { name: "拍下这一张", exact: true })).toBeVisible();
        await expect(frame.getByRole("button", { name: "选择照片", exact: true })).toBeVisible();
        const geometry = await frame.locator("#sheet").evaluate(node => {
          const box = node.getBoundingClientRect();
          const screen = document.getElementById("screen").getBoundingClientRect();
          const buttons = [...node.querySelectorAll("button")].filter(button => getComputedStyle(button).display !== "none").map(button => button.getBoundingClientRect());
          return { contained: box.left >= screen.left - 1 && box.right <= screen.right + 1 && box.top >= screen.top - 1 && box.bottom <= screen.bottom + 1,
            noOverflow: node.scrollWidth <= node.clientWidth + 1,
            targets: buttons.every(button => button.width >= 43 && button.height >= 43), buttonSizes: buttons.map(button => [button.width, button.height]), box: [box.left, box.top, box.right, box.bottom], screen: [screen.left, screen.top, screen.right, screen.bottom] };
        });
        assert.ok(geometry.contained && geometry.noOverflow && geometry.targets, JSON.stringify({ viewport, shape, geometry }));
        await page.screenshot({ path: `${output}/${viewport.width}-${shape}-camera.png` });
        await frame.getByRole("button", { name: "拍下这一张", exact: true }).click();
        await expect(sheet).toBeHidden();
        const image = preview.locator("img");
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(size[0]);
        const intrinsic = await image.evaluate(node => [node.naturalWidth, node.naturalHeight]);
        assert.deepEqual(intrinsic, size);
        assert.equal(await frame.locator("body").evaluate(() => window.__testTracks.every(track => track.readyState === "ended")), true);
        await page.screenshot({ path: `${output}/${viewport.width}-${shape}-captured.png` });
        receipt.results.push({ viewport, shape, intrinsic, geometry });
      }

      await frame.locator("body").evaluate(() => { window.__cameraMode = "pending"; });
      await preview.click();
      await expect(sheet).toBeVisible();
      await frame.locator("#sheet-close").click();
      await frame.locator("body").evaluate(() => window.__resolvePermission());
      await expect.poll(() => frame.locator("body").evaluate(() => window.__testTracks.every(track => track.readyState === "ended"))).toBe(true);
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
