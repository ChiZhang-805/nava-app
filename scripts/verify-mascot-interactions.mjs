// UI event wiring test. Only encoded frame durations are accelerated; no health/backend writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/App-Checks/mascot-interactions";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 5241, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {}, completedAt: new Date().toISOString() }));
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:5241/?demo=1#tab=today", { waitUntil: "networkidle" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  await page.evaluate(async () => {
    const { HomeMascotPlayer } = await import("/src/services/homeMascotPlayer.ts");
    const original = HomeMascotPlayer.prototype.load;
    HomeMascotPlayer.prototype.load = async function (src) {
      const clip = await original.call(this, src);
      return { ...clip, frames: clip.frames.map((frame) => ({ ...frame, duration: 1 })) };
    };
  });
  const cat = page.locator(".option-two-life-stage .nava-mascot");
  for (let n = 0; n < 10 && await cat.getAttribute("data-next-motion") !== "fluff"; n++) {
    await cat.click(); await expect(cat).toHaveAttribute("data-player-phase", "idle", { timeout: 30000 });
  }
  await expect(cat).toHaveAttribute("data-next-motion", "fluff");
  await cat.click(); await expect(cat).toHaveAttribute("data-player-phase", "waiting", { timeout: 15000 });
  await page.screenshot({ path: `${output}/groom-waiting.png` });
  const positions = [];
  for (let n = 0; n < 3; n++) {
    const box = await cat.boundingBox(); assert.ok(box);
    const x = box.x + box.width * .45, y = box.y + box.height * .5;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 42, y + 6, { steps: 5 }); await page.mouse.up();
    if (n < 2) await expect(cat).toHaveAttribute("data-player-phase", "waiting", { timeout: 15000 });
    else await expect(cat).toHaveAttribute("data-player-phase", "idle", { timeout: 15000 });
    positions.push(await cat.locator("canvas").getAttribute("data-clip"));
  }
  await expect(cat).toHaveAttribute("data-next-motion", "fish");
  await cat.click();
  await expect(cat.locator("canvas")).toHaveAttribute("data-clip", /home-fish-2/, { timeout: 15000 });
  await page.waitForTimeout(3000);
  await expect(cat.locator("canvas")).toHaveAttribute("data-clip", /home-fish-2/);
  await page.screenshot({ path: `${output}/fish-loop.png` });
  await cat.click(); await expect(cat).toHaveAttribute("data-player-phase", "idle", { timeout: 15000 });
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, realPointerStrokes: 3, fishLoopUntilTap: true, timingAccelerated: true, positions }, null, 2));
  console.log("PASS three pointer strokes and fish loop/tap through real React handlers");
} finally { await browser.close(); await server.close(); }
