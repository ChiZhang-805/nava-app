import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const output = "Q:/NAVA-Workspace/Build/TestRuns/wellbeing-tools";
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: "127.0.0.1", port: 5220 }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
const base = server.resolvedUrls.local[0];
const results = [];
async function go(page, query) {
  await page.goto(`${base}?demo=1#${query}`, { waitUntil: "domcontentloaded", timeout: 30000 });
}
async function login(page) {
  await go(page, "");
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor();
  if (await page.locator(".onboarding-screen").isVisible()) {
    if (await page.locator(".onboarding-welcome").isVisible()) await page.locator(".onboarding-welcome").waitFor({ state: "hidden" });
    for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
      await expect(page.locator(".onboarding-screen")).toHaveAttribute("data-onboarding-step", step);
      await page.locator(".onboarding-option-grid button").first().click();
      if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
    }
    await page.locator(".onboarding-consent-row input").first().check({ force: true });
    await page.locator(".onboarding-next").click();
  }
  await page.locator(".bottom-nav").waitFor();
}
try {
  for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
    if (process.env.NAVA_WELLBEING_WIDTH && width !== Number(process.env.NAVA_WELLBEING_WIDTH)) continue;
    if (process.argv.includes("--focus-only") && width !== 390 && !process.argv.includes("--focus-all")) continue;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page);
    if (!process.argv.includes("--focus-only")) {
    await go(page, "tab=record&module=mood");
    const breath = page.locator("[data-breathing]");
    await breath.getByRole("button", { name: "和 NAVA 缓一缓" }).click();
    await page.clock.install();
    await breath.getByRole("button", { name: "开始一分钟" }).click();
    await page.clock.fastForward(5200);
    await expect(breath.getByRole("status")).toHaveText("慢慢呼气");
    await breath.getByRole("button", { name: "暂停", exact: true }).click();
    const paused = await breath.locator(".breathing-orbit > span").textContent();
    await page.clock.fastForward(12000);
    await expect(breath.locator(".breathing-orbit > span")).toHaveText(paused);
    await breath.getByRole("button", { name: "继续", exact: true }).click();
    await page.clock.fastForward(56000);
    await expect(breath.getByRole("status")).toHaveText("这一分钟，留给自己");
    await expect(breath.locator(".breathing-orbit > span")).toHaveText("60 / 60 秒");
    await breath.screenshot({ path: `${output}/${width}-breathing.png` });
    await breath.getByRole("button", { name: "再来一分钟" }).click();
    await page.locator(".mood-diary-trigger").click();
    await page.clock.fastForward(1000);
    const journalPaused = await breath.locator(".breathing-orbit > span").textContent();
    await page.clock.fastForward(10000);
    await expect(breath.locator(".breathing-orbit > span")).toHaveText(journalPaused);
    await page.locator(".module-modal-card").getByRole("button", { name: "取消", exact: true }).click();
    await breath.getByRole("button", { name: "和 NAVA 缓一缓" }).click();
    for (const module of ["mood", "sleep"]) {
      if (module === "sleep") await go(page, "tab=record&module=sleep");
      const monthly = page.locator(`[data-monthly-wellbeing="${module}"]`);
      await monthly.getByRole("button", { name: "月度回顾" }).click();
      await expect(monthly.locator(".wellbeing-summary")).toBeVisible();
      await monthly.locator('input[type="month"]').fill("2024-02");
      await expect(monthly.locator(".trend-point")).toHaveCount(29);
      await expect(monthly.locator(".trend-value")).toHaveCount(0);
      if (await monthly.locator(".trend-date").count() > 8) throw new Error("Monthly dates too dense");
      const selector = monthly.locator("select");
      if (await selector.count()) {
        const first = await selector.locator("option").first().getAttribute("value");
        await selector.selectOption(first);
        await expect(monthly.locator(".wellbeing-entry strong")).not.toHaveText("");
        await selector.scrollIntoViewIfNeeded();
        await selector.click();
        await page.keyboard.press("Escape");
        const accessible = await selector.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
          return !nav || box.bottom <= nav.top + 1;
        });
        if (!accessible) throw new Error(`Monthly record selector hidden by navigation ${width} ${module}`);
      }
      await monthly.screenshot({ path: `${output}/${width}-${module}-month.png` });
      const bounds = await monthly.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [...node.querySelectorAll("input, select, button, meter")].every((item) => {
          const r = item.getBoundingClientRect();
          return r.left >= box.left - 1 && r.right <= box.right + 1 && (!item.matches("input, select, button") || r.height >= 43);
        });
      });
      if (!bounds) throw new Error(`Layout overflow ${width} ${module}`);
    }
    await go(page, "tab=record&module=exercise&view=sports");
    await page.getByRole("button", { name: "25 min", exact: true }).click();
    await page.getByRole("button", { name: "开始此计划", exact: true }).click();
    await expect(page.locator("[data-exercise-stage]")).toHaveText("动态热身 5 分钟");
    // Advance persisted active-session time only in this explicit local demo account.
    await page.evaluate(async () => {
      const key = Object.keys(localStorage).find((key) => key.startsWith("nava.exercise-session.v1:"));
      if (!key) throw new Error("No exercise draft");
      const userId = key.slice("nava.exercise-session.v1:".length);
      const session = JSON.parse(localStorage.getItem(key));
      session.elapsedSeconds = 301;
      session.runningSince = null;
      if (userId !== "00000000-0000-4000-8000-000000000001") throw new Error("Not an isolated demo account");
      localStorage.setItem(key, JSON.stringify(session));
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("[data-exercise-stage]")).toHaveText("轻快步行 15 分钟");
    await page.locator(".exercise-live-session").screenshot({ path: `${output}/${width}-exercise-stage.png` });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "放弃本次计时" }).click();
    } else { await page.clock.install(); }
    if (width === 390 || process.argv.includes("--focus-all")) {
      await go(page, "tab=record&module=focus&view=immersive");
      const focus = page.locator(".focus-immersive");
      await focus.getByRole("textbox", { name: "专注事项", exact: true }).fill("本地保存边界测试");
      await focus.getByRole("textbox", { name: "分钟", exact: true }).fill("0");
      await focus.getByRole("textbox", { name: "秒钟", exact: true }).fill("1");
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        window.__saveFailures = 0;
        window.__restoreStorage = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function (key, value) {
          if (key === "nava.review.demo.records.v1") { window.__saveFailures++; throw new DOMException("Test storage write rejected", "QuotaExceededError"); }
          return original.call(this, key, value);
        };
      });
      await focus.getByRole("button", { name: "开始", exact: true }).click();
      await page.clock.fastForward(1500);
      await expect(page.locator("[data-focus-save-error]")).toBeVisible();
      const sessionKey = "nava-focus-timer:00000000-0000-4000-8000-000000000001";
      const failedId = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)).sessionId, sessionKey);
      await page.clock.fastForward(10000);
      if (await page.evaluate(() => window.__saveFailures) !== 1) throw new Error("Failed focus save auto-retried");
      await page.evaluate(() => window.__restoreStorage());
      await focus.screenshot({ path: `${output}/${width}-focus-save-failed.png` });
      const failureLayout = await focus.locator("[data-focus-save-error]").evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= window.innerWidth + 1 && box.top >= 0 && box.bottom <= window.innerHeight;
      });
      if (!failureLayout) throw new Error(`Focus save error clipped at ${width}`);
      await focus.getByRole("button", { name: "结束", exact: true }).click();
      await expect(focus).toHaveCount(0, { timeout: 20000 });
      const reward = page.locator(".reward-celebration-layer");
      if (await reward.isVisible()) await reward.getByRole("button", { name: "继续", exact: true }).click();
      await page.locator(".focus-summary-start").click();
      await focus.getByRole("button", { name: "开始", exact: true }).click();
      const nextId = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)).sessionId, sessionKey);
      if (nextId === failedId) throw new Error("New focus session reused old id");
      await focus.getByRole("button", { name: "重置", exact: true }).click();
      await focus.getByRole("button", { name: "退出并暂停沉浸专注" }).click();
      console.log("PASS focus write failure: preserved, no auto-retry, retry succeeds, new session id");
    }
    if (errors.length) throw new Error(`Page runtime errors: ${errors.join("; ")}`);
    results.push({ width, height, breathing: !process.argv.includes("--focus-only"), month: !process.argv.includes("--focus-only"), exerciseStage: !process.argv.includes("--focus-only"), focusSave: width === 390 || process.argv.includes("--focus-all"), mode: "local-demo-only" });
    console.log(`PASS ${width}x${height}: ${process.argv.includes("--focus-only") ? "focus save boundary" : "breathing, month, stage timing"}`);
    await context.close();
  }
  await writeFile(`${output}/${process.argv.includes("--focus-only") ? "focus-ui-results" : "ui-results"}.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await server.close();
}
