import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/menus-locale";
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), passed: false, results: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5236, strictPort: true }, logLevel: "silent" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const routes = [
  ["calendar", "tab=today&view=calendar"], ["details", "tab=today&view=profile-details"], ["notifications", "tab=today&view=notifications"],
  ["todos", "tab=today&view=today-todos"], ["getting-started", "tab=today&view=getting-started"], ["admin", "tab=today&view=admin-console"],
  ["report", "tab=record"], ["ai", "tab=ai"], ["growth", "tab=trends"], ["profile", "tab=profile"],
];
async function init(context) {
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
    window.__permission = "default"; window.__permissionRequests = 0; window.__permissionAnswer = "granted";
    class PermissionFixture {
      static get permission() { return window.__permission; }
      static async requestPermission() { window.__permissionRequests++; window.__permission = window.__permissionAnswer; return window.__permission; }
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: PermissionFixture });
  });
}
async function dismissCompletionWhenPresent(page) {
  await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
    await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
  });
}
async function route(page, hash) {
  await page.evaluate((value) => { location.hash = value; }, hash);
  await expect(page.locator(".nava-more-trigger").first()).toBeVisible();
  await expect(page.locator(".page-skeleton").first()).toBeHidden();
}
async function menuCheck(page, name) {
  const trigger = page.locator(".nava-more-trigger").first();
  await trigger.click();
  const menu = page.locator(".app-utility-popover");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".more-menu-language")).toBeVisible();
  await expect(menu.getByRole("button", { name: /功能导航|Utilities/ })).toHaveCount(0);
  const geometry = await menu.evaluate((element) => {
    const frame = document.querySelector(".phone-frame").getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const scale = frame.width / document.querySelector(".phone-frame").offsetWidth;
    const rows = [...element.querySelectorAll("button")].map((button) => {
      const r = button.getBoundingClientRect(); const s = getComputedStyle(button);
      const text = button.querySelector("span"); const textStyle = text ? getComputedStyle(text) : s;
      return { height: r.height / scale, font: s.fontSize, textFont: textStyle.fontSize, clipped: button.scrollWidth > button.clientWidth + 1, inside: r.left >= rect.left && r.right <= rect.right + 1 };
    });
    return { width: rect.width / scale, inside: rect.left >= frame.left && rect.right <= frame.right && rect.bottom <= frame.bottom, rows };
  });
  assert.ok(geometry.inside, `${name} menu outside phone`);
  assert.ok(geometry.width >= 200 && geometry.width <= 206, `${name} compact width ${geometry.width}`);
  assert.ok(geometry.rows.every((row) => row.height >= 43.9 && row.height <= 64 && row.font === "16px" && row.textFont === "16px" && !row.clipped && row.inside), `${name} rows ${JSON.stringify(geometry.rows)}`);
  await page.screenshot({ path: `${output}/${name}-menu.png` });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  report.results.push({ name, ...geometry });
}
async function avatarCheck(page, name, details = true) {
  const avatar = page.locator(details ? "[data-profile-details-avatar]" : ".avatar-button");
  await expect(avatar).toBeVisible(); await avatar.click();
  const picker = page.locator(".avatar-picker");
  await expect(picker).toBeVisible();
  const geometry = await picker.evaluate((sheet) => {
    const frame = document.querySelector(".phone-frame").getBoundingClientRect(); const r = sheet.getBoundingClientRect();
    const scale = frame.width / document.querySelector(".phone-frame").offsetWidth;
    const buttons = [...sheet.querySelectorAll("button")].map((b) => { const x = b.getBoundingClientRect(); return { width: x.width / scale, height: x.height / scale, inside: x.left >= r.left + 12 * scale && x.right <= r.right - 12 * scale && x.bottom <= r.bottom - 12 * scale }; });
    return { inside: r.left >= frame.left + 12 * scale && r.right <= frame.right - 12 * scale && r.bottom <= frame.bottom - 24 * scale, buttons, portal: sheet.parentElement.parentElement.classList.contains("phone-frame") };
  });
  assert.ok(geometry.inside && geometry.portal && geometry.buttons.every((b) => b.inside && b.width >= 43.9 && b.height >= 43.9), `${name} avatar geometry ${JSON.stringify(geometry)}`);
  await page.screenshot({ path: `${output}/${name}-avatar.png` });
  // Real browser chooser event, cancel without uploading or touching the account.
  const chooser = page.waitForEvent("filechooser");
  await picker.locator(".avatar-sheet-actions button").last().click();
  const fileChooser = await chooser; await fileChooser.setFiles([]);
  await expect(picker).toHaveCount(0);
  await avatar.click(); await page.keyboard.press("Escape");
  await expect(avatar).toBeFocused();
  report.results.push({ name: `${name}-avatar`, ...geometry });
}
try {
  for (const locale of ["zh-CN", "en-US"]) for (const [width, height] of [[360,740], [375,812], [390,844], [430,932]]) {
    const context = await browser.newContext({ locale, viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    try {
      await init(context); const page = await context.newPage(); page.setDefaultTimeout(20000);
      await dismissCompletionWhenPresent(page);
      page.on("pageerror", (e) => report.errors.push(e.message));
      await page.goto(`${base}?demo=1&qa=admin-console#tab=today&view=calendar`, { waitUntil: "networkidle" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh-CN" ? "zh-CN" : "en");
      assert.equal(await page.evaluate(() => localStorage.getItem("nava.locale")), null, "system default must not become an explicit override");
      for (const [name, hash] of routes) {
        await route(page, hash); await menuCheck(page, `${locale}-${width}-${name}`);
        if (name === "details") await avatarCheck(page, `${locale}-${width}-${name}`);
      }
      await route(page, "tab=today&view=calendar"); await page.locator(".nava-more-trigger").click();
      await page.locator(".more-menu-language").click();
      await expect(page.getByRole("menuitemradio")).toHaveCount(3);
      await page.screenshot({ path: `${output}/${locale}-${width}-language.png` });
      await page.getByRole("menuitemradio", { name: locale === "zh-CN" ? "English" : "简体中文" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh-CN" ? "en" : "zh-CN");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh-CN" ? "en" : "zh-CN");
      await page.locator(".nava-more-trigger").click(); await page.locator(".more-menu-language").click();
      await page.getByRole("menuitemradio").first().click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh-CN" ? "zh-CN" : "en");
      await page.evaluate(() => { location.hash = "tab=today&view=reminder-settings"; });
      const settings = page.locator('[data-reminder-settings="all"]'); await expect(settings).toBeVisible();
      await expect(settings.getByRole("switch")).toHaveCount(8);
      await expect(page.locator(".reminder-system-permission")).toHaveCount(0);
      assert.equal(await settings.locator('[role="switch"][aria-checked="true"]').count(), 0);
      const first = settings.getByRole("switch").first();
      await page.evaluate(() => { window.__permissionAnswer = "denied"; });
      await first.click(); await expect(first).toBeEnabled(); await expect(first).toHaveAttribute("aria-checked", "false");
      assert.equal(await page.evaluate(() => localStorage.getItem("nava-demo-reminders:00000000-0000-4000-8000-000000000001")), null, "denied cannot persist enabled");
      await first.click(); await expect(first).toBeEnabled();
      assert.equal(await page.evaluate(() => window.__permissionRequests), 1, "denied cannot re-prompt");
      await page.evaluate(() => { window.__permission = "granted"; });
      await first.click(); await expect(first).toHaveAttribute("aria-checked", "true");
      await expect(first.locator('span')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 20, 0)');
      assert.equal(await page.evaluate(() => window.__permissionRequests), 1, "already granted must not prompt");
      await page.screenshot({ path: `${output}/${locale}-${width}-reminders.png` });
      await first.click(); await expect(first).toHaveAttribute("aria-checked", "false");
      console.log(`${locale} ${width}: ${routes.length} current shell menu routes, profile-details avatar, language persistence and permission gating passed`);
    } finally { await context.close(); }
  }
  // Exercise settings-return handling with an explicit bridge fixture, not a fake claim of iOS delivery.
  const permissionContext = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  try {
    await init(permissionContext);
    await permissionContext.route(/\/src\/services\/reminderPermission\.ts/, (request) => request.fulfill({
      contentType: "application/javascript", body: 'export async function ensureReminderPermission(){return window.__nativeResult} export async function reminderPermissionGranted(){return window.__nativeGranted === true}',
    }));
    const page = await permissionContext.newPage();
    await dismissCompletionWhenPresent(page);
    await page.goto(`${base}?demo=1#tab=today&view=reminder-settings`, { waitUntil: "networkidle" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    const switches = page.locator('[data-reminder-settings="all"] [role="switch"]');
    await expect(switches).toHaveCount(8);
    await page.evaluate(() => { window.__nativeResult = "cancelled"; });
    await switches.first().click(); await expect(switches.first()).toBeEnabled();
    await expect(switches.first()).toHaveAttribute("aria-checked", "false");
    await page.evaluate(() => { window.__nativeResult = "settings"; window.__nativeGranted = false; });
    await switches.first().click(); await expect(switches.first()).toBeEnabled();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(switches.first()).toHaveAttribute("aria-checked", "false");
    await switches.nth(4).click(); await expect(switches.nth(4)).toBeEnabled();
    await page.evaluate(() => { window.__nativeGranted = true; document.dispatchEvent(new Event("visibilitychange")); });
    await expect(switches.nth(4)).toHaveAttribute("aria-checked", "true");
    assert.equal(await page.locator('[data-reminder-settings="all"] [aria-checked="true"]').count(), 1, "only the requested reminder may enable after Settings");
    await switches.nth(4).click(); await expect(switches.nth(4)).toHaveAttribute("aria-checked", "false");
    await switches.first().click(); await expect(switches.first()).toBeEnabled();
    await route(page, "tab=today&view=calendar");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.evaluate(() => { location.hash = "tab=today&view=reminder-settings"; });
    await expect(switches).toHaveCount(8);
    assert.equal(await page.locator('[data-reminder-settings="all"] [aria-checked="true"]').count(), 0, "leaving settings cancels pending opt-in");
    report.permissionReturnFixture = "cancelled, denied, granted, one item only, unmounted cancellation passed";
  } finally { await permissionContext.close(); }
  // Every desktop phone preset uses its real scaled canvas, not outer-window breakpoints.
  const desktop = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
  try {
    await init(desktop); const page = await desktop.newPage(); page.setDefaultTimeout(20000);
    await dismissCompletionWhenPresent(page);
    await page.goto(`${base}?demo=1#tab=today&view=calendar`, { waitUntil: "networkidle" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    const select = page.getByTestId("nava-preview-device-select");
    for (const id of await select.locator("option").evaluateAll((opts) => opts.map((o) => o.value))) {
      await select.selectOption(id); await route(page, "tab=today&view=calendar"); await menuCheck(page, `desktop-${id}`);
      await route(page, "tab=today&view=profile-details"); await avatarCheck(page, `desktop-${id}`);
    }
  } finally { await desktop.close(); }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.failure = String(error.stack ?? error); throw error; }
finally { await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); await server.close(); }
