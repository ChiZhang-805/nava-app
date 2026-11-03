// Browser fixtures exercise actual UI handlers, not real camera/speech hardware or AI availability.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/App-Checks/media-feedback";
await mkdir(output, { recursive: true });
await writeFile(`${output}/ui.json`, JSON.stringify({ passed: false, startedAt: new Date().toISOString() }));
const server = await createServer({ server: { host: "127.0.0.1", port: 5225, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const results = [];
try {
  for (const viewport of [{ width: 1365, height: 1000 }, { width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, permissions: ["camera"], reducedMotion: "reduce" });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {}, completedAt: new Date().toISOString() }));
        window.FaceDetector = class { constructor() { throw new Error("unsupported device fixture"); } };
        window.SpeechRecognition = class { start() { window.__recognition = this; } stop() { this.onend?.(); } abort() { window.__voiceAborted = true; this.onend?.(); } };
        window.__speechQueue = []; window.__speechCalls = 0;
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [], speak: (utterance) => { window.__speechQueue.push(utterance); window.__speechCalls++; }, cancel: () => { window.__speechQueue = []; } } });
        localStorage.setItem("nava-ai-speech-enabled:00000000-0000-4000-8000-000000000001", "true");
        const userId = "00000000-0000-4000-8000-000000000001";
        const date = new Date().toLocaleDateString("en-CA");
        localStorage.setItem(`nava-growth-activities:${userId}:${date}:v1`, JSON.stringify(["checkin"]));
        localStorage.setItem("nava-demo-growth-reward-ledger:v1", JSON.stringify([
          "profile:profile-foundation", "profile:profile-goal", `${date}:checkin`, `${date}:share`, `${date}:ai`,
          `${date}:sleep`, `${date}:exercise`, `${date}:mood`, `${date}:nutrition`, `${date}:focus`, `${date}:face`,
        ]));
        window.__shares = []; window.__shareMode = "cancel";
        Object.defineProperty(navigator, "canShare", { value: () => true });
        Object.defineProperty(navigator, "share", { value: async (data) => {
          if (window.__shareMode === "cancel") throw new DOMException("fixture cancel", "AbortError");
          if (window.__shareMode === "error") throw new DOMException("fixture error", "NotAllowedError");
          window.__shares.push({ url: data.url, title: data.title, name: data.files?.[0]?.name, bytes: data.files ? Array.from(new Uint8Array(await data.files[0].arrayBuffer())) : null });
        } });
        window.__drawn = [];
        const draw = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { window.__drawn.push(text); return draw.call(this, text, ...args); };
      });
      const page = await context.newPage(); const errors = [];
      page.on("requestfailed", request => {
        if (request.url().startsWith('http://127.0.0.1:5225/')) console.error(`Local request failed: ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
      await page.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: { "fluffy-first-guide-face": true } } }));
      let navigation = 0;
      const open = async (route) => {
        await page.goto(`http://127.0.0.1:5225/?demo=1&qa-nav=${navigation++}#${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
        if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) {
          await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
          await expect(page.locator(".completion-celebration-layer")).toHaveCount(0);
        }
        if (route.includes("module=face")) {
          await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 60000 });
          await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 60000 });
          await expect(page.frameLocator(".journal-experience iframe").locator("#cold-guide")).toBeHidden({ timeout: 30000 });
        }
      };
      const interrupt = async () => {
        if (viewport.width > 700) await page.locator('[data-preview-event="call"]').click();
        else await page.evaluate(async () => (await import("/src/services/previewEnvironment.ts")).simulatePreviewInterruption("call"));
        await expect(page.locator('.phone-frame')).not.toContainText(/模拟中断|模拟来电|网页预览事件|Simulated interruption/);
        if (viewport.width > 700) await expect(page.locator('[data-preview-event-result]')).toBeVisible();
        // The phone harness now presents a real-layout call banner above the
        // camera. End that simulated call before operating the paused camera.
        if (viewport.width > 700) await page.locator('[data-phone-action="end-call"]').click();
      };
      await open("tab=record&module=face");
      const journal = page.frameLocator(".journal-experience iframe");
      const camera = journal.locator("#sheet-layer");
      await journal.locator("#photo-preview").focus(); await journal.locator("#photo-preview").press("Enter");
      await expect(camera).toBeVisible();
      await expect(camera).toContainText("选择照片");
      await journal.locator("body").evaluate(() => { window.__cameraTracks = [...document.querySelector(".camera-video").srcObject.getTracks()]; });
      await interrupt(); await expect(camera).toBeVisible();
      assert.equal(await journal.locator("body").evaluate(() => window.__cameraTracks.every(track => track.readyState === "ended")), true);
      await journal.locator("#sheet-close").focus(); await journal.locator("#sheet-close").press("Enter"); await expect(camera).toBeHidden();
      await journal.locator("#photo-preview").focus(); await journal.locator("#photo-preview").press("Enter"); await expect(camera).toBeVisible();
      await expect.poll(() => camera.locator(".camera-video").evaluate((video) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2);
      const capture = journal.getByRole("button", { name: "拍下这一张", exact: true }); await capture.focus(); await capture.press("Enter"); await expect(camera).toBeHidden();
      await expect(journal.locator("#photo-preview img")).toBeVisible();
      await page.screenshot({ path: `${output}/camera-${viewport.width}.png` });
      const geometry = await journal.locator("#photo-preview").evaluate((node) => { const box = node.getBoundingClientRect(), screen = document.getElementById("screen").getBoundingClientRect(); return box.left >= screen.left && box.right <= screen.right && box.bottom <= screen.bottom; });
      assert.equal(geometry, true);
      await open("tab=record&module=face");
      const pendingJournal = page.frameLocator(".journal-experience iframe");
      await pendingJournal.locator("body").evaluate(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await original(...args); window.__lateTracks = stream.getTracks(); await new Promise((resolve) => { window.__releaseCamera = resolve; }); return stream; };
      });
      await pendingJournal.locator("#photo-preview").focus(); await pendingJournal.locator("#photo-preview").press("Enter");
      await expect.poll(() => pendingJournal.locator("body").evaluate(() => Boolean(window.__releaseCamera))).toBe(true);
      await pendingJournal.locator("#sheet-close").focus(); await pendingJournal.locator("#sheet-close").press("Enter"); await pendingJournal.locator("body").evaluate(() => window.__releaseCamera());
      await expect.poll(() => pendingJournal.locator("body").evaluate(() => window.__lateTracks.every(track => track.readyState === "ended"))).toBe(true);
      await open("tab=ai");
      const mic = page.locator(".chat-voice-button"); await mic.focus(); await page.keyboard.press("Enter");
      await expect(mic).toHaveAttribute("aria-pressed", "true");
      await page.evaluate(() => window.__recognition.onresult({ results: [{ 0: { transcript: "保留这一句" }, isFinal: false }] }));
      await expect(page.locator(".chat-input-shell input")).toHaveValue("保留这一句");
      await interrupt(); await expect(mic).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(".chat-input-shell input")).toHaveValue("保留这一句");
      assert.equal(await page.evaluate(() => window.__voiceAborted), true);
      await expect(page.locator(".chat-media-notice")).toHaveCount(0);
      // Await the actual surface entrance, not merely a present input node.
      const composer = page.locator('.chat-composer');
      await expect(composer).toHaveCSS('opacity', '1');
      await expect(composer).toBeInViewport({ ratio: 1 });
      assert.equal(await composer.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true, 'composer must remain painted and hittable after interruption');
      await page.screenshot({ path: `${output}/chat-interrupted-${viewport.width}.png` });
      await page.locator('.nava-more-trigger').click();
      await page.locator('.app-utility-popover button').filter({ hasText: /^语音聊天$|^Voice chat$/ }).click();
      await expect(page.locator('.ai-voice-call')).toHaveAttribute('data-voice-call-phase', 'listening');
      const beforeCall = await page.locator('.chat-message-row').count();
      await page.evaluate(() => window.__recognition.onresult({ results: [{ 0: { transcript: '通话中保留的文字' }, isFinal: false }] }));
      await interrupt();
      await expect(page.locator('.ai-voice-call')).toHaveCount(0);
      await expect(page.locator('.chat-input-shell input')).toHaveValue(/通话中保留的文字/);
      await expect(page.locator('.chat-media-notice')).toHaveCount(0);
      await page.waitForTimeout(1800);
      assert.equal(await page.locator('.chat-message-row').count(), beforeCall, 'interrupted call must not submit a message');
      await page.locator(".chat-input-shell input").fill("今天状态不错，想聊聊休息。");
      await page.locator(".chat-input-shell input").press("Enter");
      await expect.poll(() => page.evaluate(() => window.__speechQueue.length), { timeout: 30000 }).toBeGreaterThan(0);
      if (viewport.width > 700) await expect(page.locator('[data-preview-module="playback"]')).toBeVisible();
      await interrupt();
      const spoken = await page.evaluate(() => window.__speechCalls);
      assert.equal(await page.evaluate(() => window.__speechQueue.length), 0);
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(() => window.__speechCalls), spoken);
      await expect(mic).toHaveAttribute("aria-pressed", "false");
      await open("tab=record"); await page.getByRole("tab", { name: "本周报告", exact: true }).click();
      await page.getByRole("button", { name: "保存海报", exact: true }).click();
      const weekly = page.getByRole("dialog", { name: "分享前确认" });
      await expect(weekly.locator("img")).toBeVisible();
      await expect(weekly.getByLabel("包含具体日期")).not.toBeChecked();
      await expect(weekly.getByLabel("包含洞察摘要")).not.toBeChecked();
      await expect.poll(() => page.evaluate(() => window.__drawn.includes("演示数据 / Demo"))).toBe(true);
      await weekly.getByLabel("包含洞察摘要").check(); await expect(weekly.getByLabel("包含具体日期")).toBeChecked();
      await weekly.getByLabel("包含具体日期").uncheck(); await expect(weekly.getByLabel("包含洞察摘要")).not.toBeChecked();
      const confirm = weekly.getByRole("button", { name: "确认并分享 / 保存" }); await expect(confirm).toBeEnabled({ timeout: 30000 });
      await page.screenshot({ path: `${output}/weekly-${viewport.width}.png` });
      const previewBytes = await weekly.locator("img").evaluate(async (img) => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
      await page.evaluate(() => { window.__shareMode = "error"; }); await confirm.click(); await expect(weekly.getByRole("alert")).toBeVisible();
      await page.evaluate(() => { window.__shareMode = "success"; }); await confirm.click(); await expect(weekly).toHaveCount(0);
      const shared = await page.evaluate(() => window.__shares.at(-1)); assert.equal(shared.name, "NAVA-weekly.png"); assert.deepEqual(shared.bytes, previewBytes);
      if (viewport.width === 390) {
        // Explicit delayed permission fixture: tests UI cancellation, not actual iPhone authorization.
        await page.route("**/src/services/voice.ts", (route) => route.fulfill({ contentType: "application/javascript", body: `export class VoiceInputError extends Error {} export async function startVoiceInput(options) { window.__voiceOptions=options; await new Promise(resolve=>{window.__releaseVoice=resolve}); if(options.signal.aborted) throw new Error('fixture aborted'); return {stop:async()=>options.onEnd(),cancel:async()=>options.onEnd()}; }` }));
        await open("tab=ai"); await page.reload({ waitUntil: "networkidle" });
        if (await page.getByRole("button", { name: "继续", exact: true }).isVisible()) await page.getByRole("button", { name: "继续", exact: true }).click();
        const pendingMic = page.locator(".chat-voice-button"); await pendingMic.focus(); await page.keyboard.press("Enter");
        await expect(pendingMic).toHaveAttribute("aria-pressed", "true"); await page.keyboard.press("Enter");
        assert.equal(await page.evaluate(() => window.__voiceOptions.signal.aborted), true);
        await page.evaluate(() => window.__releaseVoice()); await expect(pendingMic).toHaveAttribute("aria-pressed", "false");
        await open("tab=home"); const nav = page.locator(".ai-nav-button"); const box = await nav.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
        await expect.poll(() => page.evaluate(() => window.__voiceOptions.signal.aborted)).toBe(true);
        await page.evaluate(() => window.__releaseVoice()); await expect(page.locator(".chat-voice-button")).toHaveAttribute("aria-pressed", "false");
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
      results.push({ viewport, passed: true, camera: "browser-fake-device", speech: "recognition-fixture", realAi: false });
      console.log(`PASS media/feedback/date/privacy UI ${viewport.width}`);
    } finally { await context.close(); }
  }
  await writeFile(`${output}/ui.json`, JSON.stringify({ passed: true, results }, null, 2));
} finally { await browser.close(); await server.close(); }
