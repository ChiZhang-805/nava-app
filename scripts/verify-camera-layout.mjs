// Synthetic camera frames test layout and local capture, not face AI or physical hardware.
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
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 2, answers: {}, completedAt: new Date().toISOString() }));
        window.FaceDetector = undefined;
        window.__frameSize = [1280, 960]; window.__cameraMode = "live"; window.__testTracks = [];
        navigator.mediaDevices.getUserMedia = async () => {
          if (window.__cameraMode === "denied") throw new DOMException("test permission denial", "NotAllowedError");
          if (window.__cameraMode === "pending") await new Promise((resolve) => { window.__resolvePermission = resolve; });
          const canvas = document.createElement("canvas");
          [canvas.width, canvas.height] = window.__frameSize;
          const draw = canvas.getContext("2d");
          const gradient = draw.createLinearGradient(0, 0, canvas.width, canvas.height);
          gradient.addColorStop(0, "#bcecf4"); gradient.addColorStop(1, "#5a9fba");
          draw.fillStyle = gradient; draw.fillRect(0, 0, canvas.width, canvas.height);
          // Four differently colored corners reveal unintended capture cropping.
          for (const [x, y, color] of [[0, 0, "#e53333"], [canvas.width - 80, 0, "#33b533"], [0, canvas.height - 80, "#3333d5"], [canvas.width - 80, canvas.height - 80, "#e5c533"]]) {
            draw.fillStyle = color; draw.fillRect(x, y, 80, 80);
          }
          const stream = canvas.captureStream(1);
          window.__testTracks.push(...stream.getTracks()); return stream;
        };
      });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:5227/?demo=1#tab=record&module=face", { waitUntil: "networkidle" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      const open = () => page.getByRole("button", { name: /^(使用前置摄像头拍照|前置拍摄|重新拍摄)$/ }).click();
      const modal = page.locator(".camera-capture-overlay");
      const measure = async (state) => {
        const metrics = await modal.evaluate((node) => {
          const rect = (selector) => node.querySelector(selector).getBoundingClientRect();
          const sheet = rect(".camera-capture-sheet"), body = rect(".camera-capture-body"), footer = rect("footer");
          const close = rect(".camera-close"), icon = rect(".camera-close svg");
          const outer = node.getBoundingClientRect(), style = getComputedStyle(node);
          const media = node.querySelector("img") ?? node.querySelector("video");
          const box = media.getBoundingClientRect(), finder = rect(".camera-viewfinder");
          const intrinsic = media instanceof HTMLImageElement ? [media.naturalWidth, media.naturalHeight] : [media.videoWidth, media.videoHeight];
          return { sheetHeight: sheet.height, footerGap: footer.top - body.bottom, photoGap: footer.top + parseFloat(getComputedStyle(node.querySelector("footer")).paddingTop) - box.bottom,
            safe: sheet.top >= outer.top + parseFloat(style.paddingTop) - 1 && sheet.bottom <= outer.bottom - parseFloat(style.paddingBottom) + 1,
            targets: [...node.querySelectorAll("button")].every((button) => { const b = button.getBoundingClientRect(); return b.width >= 43 && b.height >= 43 && b.left >= sheet.left && b.right <= sheet.right && b.bottom <= sheet.bottom; }),
            close: [close.width, close.height], icon: icon.width, title: parseFloat(getComputedStyle(node.querySelector("h2")).fontSize), closeBackground: getComputedStyle(node.querySelector(".camera-close")).backgroundColor,
            overflow: body.width < node.querySelector(".camera-capture-body").scrollWidth - 1,
            verticalOverflow: node.querySelector(".camera-capture-body").scrollHeight > node.querySelector(".camera-capture-body").clientHeight + 1,
            statusesVisible: [...node.querySelectorAll('[role="status"]')].every((p) => p.getBoundingClientRect().bottom <= body.bottom + 1),
            media: [box.width, box.height], finder: [finder.width, finder.height], intrinsic };
        });
        assert.ok(metrics.safe && metrics.targets && !metrics.overflow && !metrics.verticalOverflow && metrics.statusesVisible, JSON.stringify({ state, metrics }));
        assert.ok(Math.abs(metrics.footerGap) < 1, `extra footer blank: ${state}`);
        assert.ok(Math.abs(metrics.icon - metrics.title) < 1);
        assert.equal(metrics.closeBackground, "rgba(0, 0, 0, 0)");
        if (state.includes("review") || state.includes("live")) {
          const [w, h] = metrics.media, [iw, ih] = metrics.intrinsic;
          assert.ok(Math.abs(w / h - iw / ih) < .005, JSON.stringify(metrics));
          assert.ok(Math.abs(w - metrics.finder[0]) < 1 && Math.abs(h - metrics.finder[1]) < 1, "letterbox around photo");
          if (state.includes("review")) assert.ok(metrics.photoGap >= 14 && metrics.photoGap <= 18, JSON.stringify(metrics));
        } else assert.ok(metrics.sheetHeight < 300, `empty camera state stretched: ${state}`);
        await expect(modal).not.toContainText("取景画面只在本机处理");
        receipt.results.push({ viewport, state, ...metrics });
      };
      await open(); await expect(modal).toHaveAttribute("data-camera-phase", "live");
      for (const [shape, size] of [["landscape", [1280, 960]], ["portrait", [720, 1280]]]) {
        if (shape === "portrait") { await page.evaluate((size) => { window.__frameSize = size; }, size); await modal.getByRole("button", { name: "重拍", exact: true }).click(); }
        await expect(modal).toHaveAttribute("data-camera-phase", "live"); await expect(modal).toContainText("手动对齐");
        await measure(`${shape}-live`);
        await modal.getByRole("button", { name: "拍摄", exact: true }).click(); await expect(modal).toHaveAttribute("data-camera-phase", "review");
        await expect.poll(() => modal.locator("img").evaluate((img) => img.naturalWidth)).toBe(size[0]);
        await measure(`${shape}-review`);
        const pixels = await modal.locator("img").evaluate((img) => {
          const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
          return [[20, 20], [canvas.width - 20, 20], [20, canvas.height - 20], [canvas.width - 20, canvas.height - 20]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
        });
        assert.ok(pixels[0][0] > 200 && pixels[1][1] > 150 && pixels[2][2] > 180 && pixels[3][0] > 200, "capture lost image corners");
        const photo = await modal.locator("img").getAttribute("src");
        await page.evaluate(async () => (await import("/src/services/previewEnvironment.ts")).simulatePreviewInterruption("call"));
        await expect(modal).toHaveAttribute("data-camera-phase", "review"); await expect(modal.locator("img")).toHaveAttribute("src", photo);
        await expect(modal.locator("p")).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.__testTracks.every((track) => track.readyState === "ended")), true);
        await page.screenshot({ path: `${output}/${viewport.width}-${shape}.png` });
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await measure("portrait-review-enlarged-text");
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      await modal.getByRole("button", { name: "关闭相机" }).click();
      await page.evaluate(() => { window.__cameraMode = "denied"; }); await open(); await expect(modal).toHaveAttribute("data-camera-phase", "error");
      await measure("permission-error"); await expect(modal.locator(".camera-viewfinder")).toBeHidden();
      await page.screenshot({ path: `${output}/${viewport.width}-permission.png` });
      await modal.getByRole("button", { name: "关闭相机" }).click();
      await page.evaluate(() => { window.__cameraMode = "pending"; }); await open(); await expect(modal).toHaveAttribute("data-camera-phase", "starting");
      await measure("permission-pending"); await modal.getByRole("button", { name: "关闭相机" }).click();
      await page.evaluate(() => window.__resolvePermission());
      await expect.poll(() => page.evaluate(() => window.__testTracks.every((track) => track.readyState === "ended"))).toBe(true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally {
  await browser.close(); await server.close();
  await writeFile(`${output}/result.json`, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
}
console.log(JSON.stringify({ passed: receipt.passed, states: receipt.results.length, output }));
