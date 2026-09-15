import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-pdf-requirements-review-20260914";
const demoUserId = "00000000-0000-4000-8000-000000000001";

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5218 }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "http://127.0.0.1:5218";
const browser = await chromium.launch({ headless: true });

async function openFocus(viewport, extraInitScript) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (extraInitScript) await context.addInitScript(extraInitScript);
  await context.addInitScript(({ userId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v2.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
  }, { userId: demoUserId });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?demo=1#tab=record&module=focus`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible();
  return { context, page };
}

try {
  const { context, page } = await openFocus({ width: 1365, height: 1000 }, () => {
    const Original = window.AudioContext;
    window.__focusAudioContexts = [];
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.__focusAudioContexts.push(this); }
    };
    window.__previewWake = { requests: 0, releases: 0 };
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => {
      window.__previewWake.requests++;
      const sentinel = new EventTarget();
      sentinel.released = false;
      sentinel.release = async () => { sentinel.released = true; window.__previewWake.releases++; sentinel.dispatchEvent(new Event("release")); };
      return sentinel;
    } } });
  });
  await expect(page.locator('[data-preview-only="focus-event-simulator"]')).toBeVisible();
  await expect(page.locator('[data-preview-event]:enabled')).toHaveCount(0);
  await page.locator('.focus-summary-start[aria-label="开始专注"]').click();
  await expect(page.locator('[data-module-view="focus-immersive"]')).toBeVisible();
  const mascotInteraction = await page.locator(".focus-immersive-mascot").evaluate((mascot) => ({
    pointerEvents: getComputedStyle(mascot).pointerEvents,
    interactiveAncestor: Boolean(mascot.closest('button,a,[role="button"]')),
    ariaHidden: mascot.getAttribute("aria-hidden"),
    clickHandler: typeof mascot.onclick === "function",
  }));
  assert.deepEqual(mascotInteraction, { pointerEvents: "none", interactiveAncestor: false, ariaHidden: "true", clickHandler: false }, "immersive mascot must remain decorative and non-clickable");
  await page.getByRole("button", { name: "进入状态" }).click();
  await expect(page.getByRole("dialog", { name: "进入专注状态" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 给一句开始提示" })).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "进入专注状态" })).toContainText("演示模式不调用真实 AI");
  await page.getByRole("dialog", { name: "进入专注状态" }).getByRole("button", { name: "关闭" }).click();
  const simulator = page.locator('[data-preview-only="focus-event-simulator"]');
  await expect(simulator).toBeVisible();
  await expect(simulator.locator("[data-preview-event]:enabled")).toHaveCount(0);
  await page.screenshot({ path: path.join(outputDir, "focus-preview-ready.png") });
  await page.locator('[data-module-view="focus-immersive"] [aria-label="开始"]').click();
  await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "running");
  await expect(page.getByRole("button", { name: "获取计时中的 AI 鼓励" })).toBeDisabled();

  for (const reason of ["call", "message", "distraction", "other"]) {
    if (reason === "call") {
      await page.getByRole("button", { name: "背景音", exact: true }).click();
      await page.getByRole("button", { name: "白噪音", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__focusAudioContexts.length)).toBe(1);
      await expect.poll(() => page.evaluate(() => window.__focusAudioContexts[0].state)).toBe("running");
    }
    await expect(simulator.locator(`[data-preview-event="${reason}"]`)).toBeEnabled();
    await simulator.locator(`[data-preview-event="${reason}"]`).click();
    const interruption = page.locator('.focus-interruption[data-preview-interruption="true"]');
    await expect(interruption).toBeVisible();
    await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "paused");
    await expect(interruption.locator("p")).toContainText("不会真实拨号");
    const draft = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((entry) => entry.startsWith("nava-focus-timer:"));
      return key ? JSON.parse(sessionStorage.getItem(key) ?? "null") : null;
    });
    assert.equal(draft?.interruptions, 0, `${reason}: simulated event must not count as a real interruption`);
    assert.deepEqual(draft?.interruptionReasons, { message: 0, call: 0, distraction: 0, other: 0 });
    if (reason === "call") {
      await expect.poll(() => page.evaluate(() => window.__focusAudioContexts[0].state)).toBe("closed");
      await expect.poll(() => page.evaluate(() => window.__previewWake.releases)).toBe(1);
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(outputDir, "focus-preview-call.png") });
    }
    await interruption.getByRole("button", { name: "继续专注" }).click();
    await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "running");
    await expect.poll(() => page.evaluate(() => window.__previewWake.requests)).toBe(["call", "message", "distraction", "other"].indexOf(reason) + 2);
    await page.waitForTimeout(1_550);
  }
  await context.close();

  const { context: aiContext, page: aiPage } = await openFocus({ width: 390, height: 844 });
  const difficultyButton = aiPage.getByRole("button", { name: "询问 AI 难度" });
  await expect(difficultyButton).toBeDisabled();
  await aiPage.locator(".focus-task-field input").fill("交论文");
  await expect(difficultyButton).toBeDisabled();
  await expect(aiPage.locator(".focus-ai-assessment-note")).toContainText("演示模式不调用真实 AI");
  await expect(aiPage.locator(".focus-ai-assessment")).toHaveCount(0);
  await aiContext.close();

  const { context: delayedContext, page: delayedPage } = await openFocus({ width: 390, height: 844 }, () => {
    const state = { requests: 0, releases: 0, grant: null };
    window.__wakeMock = state;
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: {
      request: () => new Promise((resolve) => {
        state.requests += 1;
        state.grant = () => {
          const sentinel = new EventTarget();
          sentinel.released = false;
          sentinel.release = async () => { sentinel.released = true; state.releases += 1; sentinel.dispatchEvent(new Event("release")); };
          resolve(sentinel);
        };
      }),
    } });
  });
  await delayedPage.locator('.focus-summary-start[aria-label="开始专注"]').click();
  await expect(delayedPage.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-wake-lock", "requesting");
  assert.equal(await delayedPage.evaluate(() => window.__wakeMock.requests), 1, "one pending wake request is enough");
  await delayedPage.locator(".focus-immersive-exit").click();
  await delayedPage.evaluate(() => window.__wakeMock.grant());
  await expect.poll(() => delayedPage.evaluate(() => window.__wakeMock.releases)).toBe(1);
  await delayedPage.locator(".focus-summary-start").click();
  await expect(delayedPage.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-wake-lock", "requesting");
  assert.equal(await delayedPage.evaluate(() => window.__wakeMock.requests), 2);
  await delayedPage.evaluate(() => window.__wakeMock.grant());
  await expect(delayedPage.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-wake-lock", "active");
  await delayedPage.getByRole("button", { name: "切换屏幕常亮" }).click();
  await expect(delayedPage.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-wake-lock", "off");
  await expect.poll(() => delayedPage.evaluate(() => window.__wakeMock.releases)).toBe(2);
  await delayedContext.close();

  const { context: deniedContext, page: deniedPage } = await openFocus({ width: 390, height: 844 }, () => {
    const state = { allow: false, requests: 0, releases: 0 };
    window.__wakeMock = state;
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: {
      request: async () => {
        state.requests += 1;
        if (!state.allow) throw new Error("mock permission denied");
        const sentinel = new EventTarget();
        sentinel.released = false;
        sentinel.release = async () => { sentinel.released = true; state.releases += 1; sentinel.dispatchEvent(new Event("release")); };
        return sentinel;
      },
    } });
  });
  await deniedPage.locator('.focus-summary-start[aria-label="开始专注"]').click();
  await expect(deniedPage.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-wake-lock", "failed");
  await expect(deniedPage.locator(".focus-capability-message")).toContainText("屏幕常亮申请失败");
  await deniedPage.evaluate(() => { window.__wakeMock.allow = true; });
  await deniedPage.getByRole("button", { name: "重试屏幕常亮" }).click();
  await expect(deniedPage.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-wake-lock", "active");
  await deniedPage.locator(".focus-immersive-exit").click();
  await expect.poll(() => deniedPage.evaluate(() => window.__wakeMock.releases)).toBe(1);
  await deniedContext.close();

  for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const { context: mobileContext, page: mobilePage } = await openFocus(viewport);
    const actionMetrics = await mobilePage.locator(".focus-ai-actions").evaluate((row) => {
      const bounds = row.getBoundingClientRect();
      return [...row.querySelectorAll("button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height, rowLeft: bounds.left, rowRight: bounds.right };
      });
    });
    assert.equal(actionMetrics.length, 2);
    assert.ok(actionMetrics.every((item) => item.left >= item.rowLeft - 1 && item.right <= item.rowRight + 1 && item.height >= 43.5), `${viewport.width}x${viewport.height}: AI actions overflow or have short targets ${JSON.stringify(actionMetrics)}`);
    const overviewOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overviewOverflow <= 1, `${viewport.width}x${viewport.height}: focus overview horizontal overflow ${overviewOverflow}px`);
    await mobilePage.locator('.focus-summary-start[aria-label="开始专注"]').click();
    const toolFit = await mobilePage.locator(".focus-immersive-tools").evaluate((tools) => ({
      right: tools.getBoundingClientRect().right,
      left: tools.getBoundingClientRect().left,
      buttons: [...tools.querySelectorAll("button")].map((button) => button.getBoundingClientRect().width),
    }));
    assert.ok(toolFit.left >= 0 && toolFit.right <= viewport.width + 1 && toolFit.buttons.length === 5 && toolFit.buttons.every((width) => width >= 37.5), `${viewport.width}x${viewport.height}: immersive tools clip or shrink ${JSON.stringify(toolFit)}`);
    await mobilePage.getByRole("button", { name: "进入状态" }).click();
    const guide = mobilePage.getByRole("dialog", { name: "进入专注状态" });
    await expect(guide).toBeVisible();
    const guideButton = guide.getByRole("button", { name: "AI 给一句开始提示" });
    await expect(guideButton).toBeDisabled();
    const guideBounds = await guideButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, width: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(guideBounds.left >= 0 && guideBounds.right <= guideBounds.width && guideBounds.top >= 0 && guideBounds.bottom <= guideBounds.viewportHeight && guideBounds.height >= 43.5, `${viewport.width}x${viewport.height}: focus guide AI action is clipped ${JSON.stringify(guideBounds)}`);
    await guide.getByRole("button", { name: "关闭" }).click();
    await expect(mobilePage.locator('[data-preview-only="focus-event-simulator"]')).toBeHidden();
    const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${viewport.width}x${viewport.height}: horizontal overflow ${overflow}px`);
    await mobileContext.close();
  }
  console.log("focus preview events: 4 desktop simulations, wake-lock delayed/denied/retry/release boundaries, and 4 mobile viewport boundaries passed");
} finally {
  await browser.close();
  await server.close();
}
