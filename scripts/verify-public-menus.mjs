// Real sign-in, real reads, no health/preference changes or AI generation.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure launcher.");
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/menus-locale/public";
await mkdir(output, { recursive: true });
const receipt = { passed: false, nativePermissionTested: false, aiTested: false, results: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const base of ["https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/"]) {
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      const assets = new Set(), errors = []; let healthWrites = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin === new URL(base).origin && !url.pathname.startsWith("/cdn-cgi/") && /\.(js|css)$/.test(url.pathname)) assets.add(url.href);
      });
      await page.route("**/rest/v1/**", (route) => {
        const request = route.request(), table = new URL(request.url()).pathname.split("/").pop();
        if (["active_user_sessions", "record_drafts"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
        if (["ai_conversations", "ai_conversation_archives"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table)) healthWrites++;
          return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only visual acceptance"}' });
        }
        return route.continue();
      });
      await page.route("**/functions/v1/**", (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "wxteapvwagvhhtrjrbim.supabase.co" && url.pathname === "/functions/v1/auth-account-status") return route.continue();
        return route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"AI outside visual acceptance"}' });
      });
      await page.goto(`${base}?demo=1`, { waitUntil: "domcontentloaded" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      const form = page.locator(".auth-form--signIn"); await expect(form).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      const responsePromise = page.waitForResponse((r) => new URL(r.url()).pathname === "/auth/v1/token" && r.status() === 200);
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password);
      await form.locator('button[type="submit"]').click();
      const response = await responsePromise, authenticated = await response.json();
      assert.equal(new URL(response.url()).hostname, "wxteapvwagvhhtrjrbim.supabase.co");
      assert.equal(authenticated.user?.email?.toLowerCase(), email.toLowerCase());
      await expect(page.locator(".bottom-nav")).toBeVisible();
      const host = new URL(base).hostname;
      for (const [width, height] of [[360,740], [375,812], [390,844], [430,932]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => { location.hash = "tab=today&view=calendar"; });
        await expect(page.locator('.home-calendar-grid')).toBeVisible();
        await expect(page.locator('[data-page-skeleton="calendar"]')).toHaveCount(0);
        const trigger = page.locator(".nava-more-trigger"); await trigger.click();
        await expect(page.locator(".more-menu-language")).toBeVisible();
        assert.equal(Math.round((await page.locator(".app-utility-popover").boundingBox()).width), 228);
        await page.screenshot({ path: `${output}/${host}-${width}-menu.png` });
        await page.locator(".more-menu-language").click();
        await page.getByRole("menuitemradio", { name: "简体中文" }).click();
        await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
        await trigger.click(); await page.locator(".more-menu-language").click();
        await page.getByRole("menuitemradio").first().click();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await page.evaluate(() => { location.hash = "tab=today&view=profile-details"; });
        await page.locator("[data-profile-details-avatar]").click();
        const picker = page.locator(".avatar-picker"); await expect(picker).toBeVisible();
        assert.equal(await picker.evaluate((s) => s.parentElement.parentElement.classList.contains("phone-frame")), true);
        const rect = await picker.boundingBox(); assert.ok(rect.x >= 12 && rect.x + rect.width <= width - 12 && rect.y + rect.height <= height - 24);
        await page.screenshot({ path: `${output}/${host}-${width}-avatar.png` });
        await page.keyboard.press("Escape");
      }
      await page.evaluate(() => { location.hash = "tab=today&view=reminder-settings"; });
      await expect(page.locator('[data-reminder-settings="all"] [role="switch"]')).toHaveCount(8);
      await expect(page.locator(".reminder-system-permission")).toHaveCount(0);
      await page.screenshot({ path: `${output}/${host}-reminders.png` });
      for (const url of assets) {
        const response = await page.request.get(url); assert.ok(response.ok());
        const expected = await readFile(path.join("dist/assets", decodeURIComponent(new URL(url).pathname.split("/").pop())));
        const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
        assert.equal(hash(await response.body()), hash(expected), `Stale asset: ${url}`);
      }
      assert.equal(healthWrites, 0);
      assert.deepEqual(errors, []);
      receipt.results.push({ base, realLogin: true, canonicalProject: true, publicDemoRejected: true, systemLocale: true, menusAvatarsFourSizes: true, systemCardRemoved: true, matchingAssets: assets.size, healthWrites });
      console.log(`PASS public menus/language/avatar/reminder: ${host}`);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally { await browser.close(); await writeFile(`${output}/receipt.json`, JSON.stringify(receipt, null, 2)); }
