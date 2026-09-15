import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd(), output = "Q:/NAVA-Workspace/Build/TestRuns/mascot-continuity";
await mkdir(output, { recursive: true });
applyProjectPublicEnv(root);
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5232, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  // UI checks are serial; one Chromium, one context, no account writes or in-app browser.
  for (const [width, height] of [[360,740],[375,812],[390,844],[430,932]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 2, answers: {}, completedAt: new Date().toISOString() }));
      });
      const page = await context.newPage();
      await page.route("**/*.supabase.co/**", (route) => route.abort());
      await page.goto("http://127.0.0.1:5232/?demo=1#tab=today", { waitUntil: "networkidle" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      const cat = page.locator(".option-two-life-stage .nava-mascot"), canvas = cat.locator("canvas");
      await expect(canvas).toHaveAttribute("data-ready", "true");
      await canvas.evaluate((node) => { window.originalCanvas = node; });
      await page.route("**/home-stretch.webp", async (route) => { await new Promise((resolve) => setTimeout(resolve, 1100)); await route.continue(); });
      await cat.click();
      await page.waitForTimeout(400);
      await expect(cat).toHaveAttribute("data-player-phase", "loading");
      const continuity = await canvas.evaluate((node) => {
        const p = node.getContext("2d").getImageData(0, 0, node.width, node.height).data;
        return { sameCanvas: node === window.originalCanvas, alphaPixels: p.filter((v, i) => i % 4 === 3 && v > 64).length, fallbackHidden: getComputedStyle(node.nextElementSibling).visibility === "hidden" };
      });
      if (!continuity.sameCanvas || continuity.alphaPixels < 10000 || !continuity.fallbackHidden) throw new Error(`Blank/duplicate cat during loading: ${JSON.stringify(continuity)}`);
      await page.screenshot({ path: `${output}/loading-${width}.png` });
      await expect(canvas).toHaveAttribute("data-clip", /home-stretch/);
      await cat.click(); await cat.click();
      await expect(cat).toHaveAttribute("data-action-queued", "true");
      await expect(cat).toHaveAttribute("data-motion-run", "2");
      const layout = await cat.evaluate((node) => {
        const c = node.querySelector("canvas").getBoundingClientRect(), b = node.getBoundingClientRect();
        return { width: c.width, height: c.height, touchWidth: b.width, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      if (layout.overflow || layout.touchWidth < 44) throw new Error(`Mascot layout: ${JSON.stringify(layout)}`);
      await page.screenshot({ path: `${output}/action-${width}.png` });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(cat).toHaveAttribute("data-player-phase", "static");
      await expect(cat.locator("img")).toBeVisible();
      await expect(cat).toHaveAttribute("data-action-queued", "false");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(canvas).toHaveAttribute("data-ready", "true");
      results.push({ viewport: `${width}x${height}`, continuity, layout, reducedMotion: true });
    } finally { await context.close(); }
  }

  // Inspect every composited frame of the unchanged artwork. Drive the production renderer
  // without wall-clock waits here; the UI above checks real request/RAF integration.
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5232/", { waitUntil: "domcontentloaded" });
    const clips = await page.evaluate(async () => {
      const { HomeMascotPlayer } = await import("/src/services/homeMascotPlayer.ts");
      const { parseMascotWebp } = await import("/src/services/mascotWebp.ts");
      const { homeMascotActions } = await import("/src/services/homeMascotClips.ts");
      const idle = "/src/assets/mascot/animated/home-idle.webp";
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      canvas.style.cssText = "position:fixed;inset:0;z-index:99999;background:#caeff8"; document.body.append(canvas);
      const player = new HomeMascotPlayer(canvas, idle, () => {});
      player.observer.disconnect(); document.removeEventListener("visibilitychange", player.updatePause);
      player.schedule = () => {}; cancelAnimationFrame(player.raf);
      const out = [];
      for (const src of [idle, ...homeMascotActions.flatMap((action) => action.clips.map((clip) => clip.src))]) {
        const clip = parseMascotWebp(await (await fetch(src)).arrayBuffer());
        player.stage.width = clip.width; player.stage.height = clip.height;
        const track = { clip, src, index: 0, scale: 1, x: 0, y: 0, aligned: false };
        player.track = track; player.action = null; player.switchTo = null;
        let minAlpha = Infinity, blanks = 0;
        const probe = document.createElement("canvas"); probe.width = 80; probe.height = 60;
        const ctx = probe.getContext("2d", { willReadFrequently: true });
        for (let i = 0; i < clip.frames.length; i++) {
          await player.renderFrame(track);
          if (canvas.dataset.clip !== src || canvas.dataset.frame !== String(i)) throw new Error(`Frame did not decode: ${src} #${i}`);
          ctx.clearRect(0,0,80,60); ctx.drawImage(canvas,0,0,80,60);
          const p = ctx.getImageData(0,0,80,60).data;
          let alpha = 0; for (let n = 3; n < p.length; n += 4) if (p[n] > 64) alpha++;
          minAlpha = Math.min(minAlpha, alpha); if (alpha < 20) blanks++;
        }
        out.push({ src: src.split("/").pop(), frames: clip.frames.length, minAlpha, blanks });
      }
      // A late decode failure must not resurrect a disposed renderer or start a fetch.
      player.dispose(); canvas.remove();
      return out;
    });
    if (clips.some((clip) => clip.blanks || clip.minAlpha < 250)) throw new Error(`Transparent/near-vanished displayed frame: ${JSON.stringify(clips)}`);
    results.push({ allCompositedFrames: clips });
    const lifecycle = await page.evaluate(async () => {
      const { HomeMascotPlayer } = await import("/src/services/homeMascotPlayer.ts");
      const { parseMascotWebp } = await import("/src/services/mascotWebp.ts");
      const src = "/src/assets/mascot/animated/home-idle.webp";
      const clip = parseMascotWebp(await (await fetch(src)).arrayBuffer());
      const tiny = { ...clip, frames: clip.frames.slice(0, 3).map((f) => ({ ...f, duration: 40 })) };
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      canvas.style.cssText = "position:fixed;inset:0;z-index:99999"; document.body.append(canvas);
      const events = [], wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const player = new HomeMascotPlayer(canvas, src, (state) => events.push({ ...state }));
      await wait(150);
      player.load = async (path) => { if (path === "broken") throw new Error("test offline segment"); return tiny; };
      const first = player.play({ id: "first", clips: [{ src: "first" }] });
      const queued = player.play({ id: "second", clips: [{ src: "second" }] });
      const rejected = !player.play({ id: "third", clips: [{ src: "third" }] });
      await wait(800);
      if (!events.some((e) => e.action === "second" && e.phase === "playing") || player.action !== null) throw new Error("Queued action did not play and settle");
      player.play({ id: "split", clips: [{ src: "valid" }, { src: "broken" }] });
      await wait(700);
      if (player.track?.src !== src || player.phase !== "idle") throw new Error("Failed segment did not recover idle");
      player.visible = false; player.updatePause();
      const pausedFrame = canvas.dataset.frame;
      await wait(160);
      const offscreenPaused = canvas.dataset.frame === pausedFrame;
      player.visible = true; player.updatePause(); await wait(170);
      const resumed = canvas.dataset.paused === "false";
      let hidden = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
      const backgroundFrame = canvas.dataset.frame; await wait(160);
      const backgroundPaused = canvas.dataset.frame === backgroundFrame;
      hidden = false; document.dispatchEvent(new Event("visibilitychange"));
      delete document.hidden;
      player.observer.disconnect(); player.schedule = () => {}; cancelAnimationFrame(player.raf);
      await wait(100);
      const nativeBitmap = window.createImageBitmap, nativeDecode = HTMLImageElement.prototype.decode;
      // Explicitly exercise the WebKit-compatible static-image decoder.
      window.createImageBitmap = undefined;
      const fallbackIndex = player.track.index;
      await player.renderFrame(player.track);
      const imageFallback = canvas.dataset.ready === "true" && canvas.dataset.frame === String(fallbackIndex);
      let rejectOld;
      window.createImageBitmap = () => new Promise((_, reject) => { rejectOld = reject; });
      HTMLImageElement.prototype.decode = async () => { throw new Error("test late failure"); };
      let releaseAction;
      player.load = () => new Promise((resolve) => { releaseAction = () => resolve(tiny); });
      const oldTrack = player.track;
      player.play({ id: "delayed", clips: [{ src: "delayed" }] });
      const failingIdle = player.renderFrame(oldTrack);
      rejectOld(new Error("test idle failure during action load")); await failingIdle;
      const preservedAction = player.action?.id === "delayed" && player.track === null;
      releaseAction(); await wait(10);
      if (!preservedAction || player.switchTo?.src !== "delayed") throw new Error("Idle failure orphaned requested action");
      player.track = oldTrack;
      const pending = player.renderFrame(player.track);
      player.dispose(); const afterDispose = events.length;
      rejectOld(new Error("test old bitmap failure")); await pending;
      window.createImageBitmap = nativeBitmap; HTMLImageElement.prototype.decode = nativeDecode;
      const noResurrection = events.length === afterDispose && player.requests.size === 0;
      canvas.remove();
      if (!first || !queued || !rejected || !offscreenPaused || !backgroundPaused || !resumed || !imageFallback || !noResurrection) throw new Error("Mascot lifecycle regression");
      return { first, queued, rejected, offscreenPaused, backgroundPaused, resumed, imageFallback, preservedAction, noResurrection };
    });
    results.push({ lifecycle });
  } finally { await context.close(); }
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, results }, null, 2));
  console.log(JSON.stringify({ passed: true, viewports: 4, clips: results[4].allCompositedFrames.length }));
} finally { await browser.close(); await server.close(); }
