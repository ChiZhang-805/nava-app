import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/independent-reminders";
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
console.log("Public environment loaded; starting isolated Vite server");
const server = await createServer({ server: { host: "127.0.0.1", port: 5217 }, logLevel: "silent" });
await server.listen();
console.log("Local server ready; starting one external test browser");
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
console.log("External test browser ready");
const results = [];
async function login(page) {
  await page.goto(`${base}?demo=1`, { waitUntil: "networkidle" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor();
  if (await page.locator(".onboarding-screen").isVisible()) {
    if (await page.locator(".onboarding-welcome").isVisible()) await page.locator(".onboarding-welcome").waitFor({ state: "hidden", timeout: 10000 });
    for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
      await expect(page.locator(".onboarding-screen")).toHaveAttribute("data-onboarding-step", step);
      await page.locator(".onboarding-option-grid button").first().click();
      if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
    }
    await page.locator(".onboarding-consent-row input").first().check({ force: true });
    await page.locator(".onboarding-next").click();
  }
  await expect(page.locator(".phone-frame")).toBeVisible();
}
const go = async (page, hash) => { await page.goto(`${base}?demo=1#${hash}`, { waitUntil: "networkidle" }); };
try {
  for (const [width, height] of (process.env.NAVA_REMINDER_DESKTOP_ONLY ? [[1440, 1080]] : [[360, 740], [375, 812], [390, 844], [430, 932], [1440, 1080]])) {
    const desktop = width > 700;
    const context = await browser.newContext({ locale: "zh-CN", permissions: ["notifications"], viewport: { width, height }, isMobile: !desktop, hasTouch: !desktop, reducedMotion: "reduce" });
    // Mobile Chromium permission emulation may still report denied. This suite tests
    // scheduling/settings, not OS delivery; authorization branches have their own suite.
    await context.addInitScript(() => Object.defineProperty(Notification, "permission", { configurable: true, value: "granted" }));
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page);
    console.log(`${width}: local demo login complete`);
    await go(page, "tab=today&view=notifications");
    await expect(page.locator('[data-reminder-settings]')).toHaveCount(0);
    await page.getByRole('button', { name: '通知操作' }).click();
    await page.getByRole('menuitem', { name: '提醒设置' }).click();
    await expect(page).toHaveURL(/view=reminder-settings/);
    const settings = page.locator('[data-reminder-settings="all"]');
    await expect(settings.locator(".reminder-setting-row")).toHaveCount(8);
    await expect(settings).not.toContainText(/每天独立|网页关闭后|设备所在地|锁屏提醒/);
    await page.screenshot({ path: `${output}/${width}-all-off.png` });
    const breakfast = settings.locator('[data-reminder-kind="breakfast"]');
    const lunch = settings.locator('[data-reminder-kind="lunch"]');
    await lunch.getByRole('switch').click();
    try { await expect(lunch.getByRole('switch')).toHaveAttribute('aria-checked', 'true'); }
    catch (error) {
      console.error('Reminder authorization diagnostic:', await page.evaluate(() => ({ permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission, secure: isSecureContext, status: document.querySelector('.reminder-feedback')?.textContent })));
      throw error;
    }
    const originalLunch = await lunch.locator('input[type="time"]').inputValue();
    await breakfast.getByRole("switch").click();
    await expect(breakfast.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await breakfast.locator('input[type="time"]').fill("09:17");
    await expect(settings.getByRole("status")).toHaveText("已保存");
    await breakfast.getByRole('button', { name: '智能', exact: true }).click();
    await expect(breakfast.locator('input')).toHaveCount(0);
    await expect(breakfast.locator('time')).toHaveText('08:30');
    await breakfast.getByRole('button', { name: '固定时间', exact: true }).click();
    await expect(breakfast.locator('input')).toHaveValue('09:17');
    for (const kind of ['mood','dinner','sleep','exercise','focus','face']) {
      const row = settings.locator(`[data-reminder-kind="${kind}"]`);
      await row.getByRole('switch').click();
      await row.getByRole('button', { name: '智能', exact: true }).click();
      await expect(row.getByRole('button', { name: '智能', exact: true })).toHaveAttribute('aria-pressed','true');
    }
    await expect(lunch.locator('input[type="time"]')).toHaveValue(originalLunch);
    const geometry = await settings.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll('input, .reminder-switch')].map((item) => {
        const r = item.getBoundingClientRect();
        return { width: r.width, height: r.height, fits: r.left >= box.left && r.right <= box.right + 1 };
      });
    });
    if (geometry.some((item) => !item.fits || item.height < 43)) throw new Error(`Control geometry failed: ${width}`);
    if (!desktop && await page.locator("[data-reminder-preview]").isVisible()) throw new Error("Desktop simulator leaked onto mobile");
    await page.locator('[data-reminder-page]').evaluate((node) => { node.scrollTop = 0; });
    await page.screenshot({ path: `${output}/${width}-settings-top.png` });
    await page.locator('[data-reminder-page]').evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(page.locator('.reminder-system-permission')).toHaveCount(0);
    await expect(page.locator('[data-reminder-kind="face"]')).toBeInViewport();
    const bottomFit = await page.locator('[data-reminder-kind="face"]').evaluate((node) => ({ bottom: node.getBoundingClientRect().bottom, navTop: document.querySelector('.bottom-nav').getBoundingClientRect().top }));
    expect(bottomFit.bottom).toBeLessThanOrEqual(bottomFit.navTop + 1);
    await page.screenshot({ path: `${output}/${width}-settings-bottom.png` });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('[data-reminder-kind="breakfast"] input')).toHaveValue("09:17");
    await expect(page.locator('[data-reminder-kind="breakfast"] [role="switch"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-reminder-kind="sleep"] .reminder-mode button').first()).toHaveAttribute('aria-pressed','true');
    await settings.locator('[data-reminder-kind="dinner"] [role="switch"]').click();
    await expect(settings.locator('[data-reminder-kind="dinner"] .reminder-item-controls')).toHaveCount(0);
    await page.getByRole('button', { name: '返回通知中心' }).click();
    await expect(page.locator('[data-notification-center]')).toBeVisible();
    for (const module of ["mood", "diet"]) {
      await go(page, `tab=record&module=${module}`);
      const entry = page.locator(`[data-reminder-settings="${module}"]`);
      await expect(entry).toBeVisible();
      if (await entry.locator("button").first().getAttribute("aria-expanded") !== "true") await entry.locator("button").first().click();
      await expect(entry.locator(".reminder-setting-row")).toHaveCount(module === "mood" ? 1 : 3);
      await entry.screenshot({ path: `${output}/${width}-${module}.png` });
    }
    for (const meal of ["breakfast", "lunch", "dinner"]) {
      await go(page, `tab=record&module=diet&view=editor-${meal}`);
      await expect(page.locator('.record-editor-stack select').filter({ has: page.locator('option[value="pantry"]') })).toHaveValue(meal);
    }
    if (!desktop) {
      await page.evaluate(async () => {
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        localStorage.setItem("nava.review.demo.empty-snapshot-date.v1", date);
        await new Promise((resolve) => window.dispatchEvent(new CustomEvent("nava:preview-reminder", { detail: { kind: "breakfast", resolve } })));
      });
      await expect(page.locator(".nava-notification-banner")).toContainText("早餐记录提醒");
      await expect(page.locator(".nava-notification-banner")).not.toContainText(/模拟|Preview/);
      await page.locator(".nava-notification-banner-main").tap();
      await expect(page.locator('.record-editor-stack select').filter({ has: page.locator('option[value="pantry"]') })).toHaveValue("breakfast");
    }
    if (desktop) {
      const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("nava-notification-"))));
      await page.getByRole("button", { name: "模拟晚餐到点提醒" }).click();
      await expect(page.locator("[data-reminder-preview]")).toContainText("该提醒已关闭");
      const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("nava-notification-"))));
      expect(after).toEqual(before);
      await page.evaluate(() => {
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        localStorage.setItem("nava.review.demo.empty-snapshot-date.v1", date);
      });
      // Authentication temporarily overlaps two chrome instances. Outgoing
      // cleanup must not remove the newly authenticated shell's marker.
      await expect(page.locator("html")).toHaveAttribute("data-phone-preview", "app");
      await page.getByRole("button", { name: "模拟早餐到点提醒" }).click();
      await expect(page.locator(".ios-notice-banner")).toContainText("早餐记录提醒");
      await expect(page.locator(".nava-notification-banner")).toHaveCount(0);
      await expect(page.locator(".ios-notice-banner")).not.toContainText(/模拟|Preview/);
      expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("nava-notification-"))))).toEqual(before);
      await page.locator(".ios-notice-banner .ios-notice").click();
      await expect(page.locator('.record-editor-stack select').filter({ has: page.locator('option[value="pantry"]') })).toHaveValue("breakfast");
      await expect.poll(() => page.locator(".nava-focus-event-simulator").evaluate((node) => {
        const panel = node.getBoundingClientRect();
        const last = node.querySelector("[data-reminder-preview] p:last-child").getBoundingClientRect();
        return panel.bottom - last.bottom;
      })).toBeGreaterThanOrEqual(10);
      // The target editor reloads its date/meal data after navigation. Waiting
      // for its screenshot avoids capturing a transient loading transition.
      await page.locator(".record-editor-stack").screenshot({ path: `${output}/breakfast-target.png` });
      await page.screenshot({ path: `${output}/desktop.png` });
      // Preview-only failure must not broadcast a product-settings error.
      const preferenceKey = 'nava-demo-reminders:00000000-0000-4000-8000-000000000001';
      const preferences = await page.evaluate((key) => {
        window.__previewSettingsErrors = [];
        window.addEventListener('nava:reminder-status', (event) => window.__previewSettingsErrors.push(event.detail.message));
        const previous = localStorage.getItem(key); localStorage.setItem(key, '{'); return previous;
      }, preferenceKey);
      try {
        await page.getByRole('button', { name: '模拟早餐到点提醒' }).click();
        await expect(page.locator('[data-reminder-preview] [role="status"]')).not.toContainText('模拟提醒已显示');
        await expect(page.getByRole('button', { name: '模拟早餐到点提醒' })).toBeEnabled();
        expect(await page.evaluate(() => window.__previewSettingsErrors)).toEqual([]);
        await expect(page.locator('.reminder-error')).toHaveCount(0);
      } finally {
        await page.evaluate(({key,value}) => { if(value===null) localStorage.removeItem(key); else localStorage.setItem(key,value); }, {key:preferenceKey,value:preferences});
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    results.push({ width, height, settings: "pass", independentPersistence: "demo-only pass", exactMealLinks: "pass", simulatedBannerTap: "pass", geometry: "pass" });
    await context.close();
    console.log(`${width}x${height}: passed`);
  }
  await writeFile(`${output}/${process.env.NAVA_REMINDER_DESKTOP_ONLY ? "ui-desktop-results" : "ui-results"}.json`, JSON.stringify({ mode: "local demo, NOT production persistence or native delivery evidence", results }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  const closing = server.close();
  const timeout = setTimeout(() => process.exit(process.exitCode ?? 0), 8000);
  await closing;
  clearTimeout(timeout);
}
