import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const { NAVA_ACCOUNT_EMAIL: email, NAVA_ACCOUNT_PASSWORD: password, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
assert.ok(email && password && key);
assert.equal(new URL(apiUrl).hostname, "wxteapvwagvhhtrjrbim.supabase.co");
const client = createClient(apiUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.auth.signInWithPassword({ email, password });
assert.equal(Boolean(login.error), false, "Account login must succeed");
const userId = login.data.user.id;
const snapshot = async () => {
  const result = await client.from("active_user_sessions").select("session_type,payload,updated_at").eq("user_id", userId).order("session_type");
  assert.equal(Boolean(result.error), false, "Session audit must succeed");
  return result.data;
};
const before = await snapshot();
const browser = await chromium.launch({ headless: true });
try {
  for (const site of ["https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/"]) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
    try {
      const page = await context.newPage();
      const shadow = new Map();
      const rawWrites = [];
      await page.route("**/rest/v1/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        assert.equal(url.origin, new URL(apiUrl).origin);
        const table = url.pathname.split("/").pop();
        if (table === "active_user_sessions") {
          if (request.method() === "GET") {
            const kind = url.searchParams.get("session_type")?.replace(/^eq\./, "");
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shadow.has(kind) ? { payload: shadow.get(kind) } : null) });
          }
          const row = request.postDataJSON();
          shadow.set(row.session_type, row.payload);
          return route.fulfill({ status: 204, body: "" });
        }
        if (request.method() !== "GET" && /^(exercise_records|sleep_records|mood_records|nutrition_records|focus_records|face_records)$/.test(table)) {
          rawWrites.push(table);
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(site, { waitUntil: "domcontentloaded" });
      const assetSrc = await page.locator('script[type="module"][src]').first().getAttribute("src");
      const asset = await page.request.get(new URL(assetSrc, site).href);
      assert.equal(asset.status(), 200);
      assert.equal(createHash("sha256").update(await asset.body()).digest("hex"), process.env.NAVA_EXPECTED_MAIN_SHA);
      const launch = page.locator(".launch-sequence");
      if (await launch.isVisible().catch(() => false)) await launch.click();
      const form = page.locator(".auth-form--signIn");
      await expect(form).toBeVisible({ timeout: 20000 });
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password);
      await form.locator('button[type="submit"]').click();
      // The page-transition snapshot temporarily clones the outgoing login
      // form. Verify the authenticated destination, not a unique old form.
      await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30000 });
      await page.evaluate(() => { location.hash = "tab=record&module=exercise&view=sports"; });
      await page.getByRole("button", { name: "开始此计划", exact: true }).click();
      const panel = page.locator('[data-preview-only="focus-event-simulator"]');
      await expect(panel).toHaveAttribute("data-preview-module", "exercise");
      await panel.locator('[data-preview-event="call"]').click();
      await expect(page.locator("[data-exercise-session]")).toHaveAttribute("data-running", "false");
      const frozen = await page.locator(".exercise-live-progress strong").textContent();
      await page.waitForTimeout(1200);
      assert.equal(await page.locator(".exercise-live-progress strong").textContent(), frozen);
      await page.locator(".exercise-live-actions").getByRole("button", { name: "继续", exact: true }).click();
      await expect(page.locator("[data-exercise-session]")).toHaveAttribute("data-running", "true");
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator(".exercise-live-discard").click();
      await page.evaluate(() => { location.hash = "tab=record&module=sleep&view=editor"; });
      await page.locator(".sleep-maintenance").getByRole("button", { name: "开始记录", exact: true }).click();
      const started = await page.evaluate((id) => localStorage.getItem(`nava.sleep-maintenance.v1:${id}`), userId);
      await panel.locator('[data-preview-event="message"]').click();
      await expect(page.locator(".preview-interruption-notice")).toHaveCount(0);
      await expect(panel.locator('[data-preview-event-result]')).toContainText("睡眠计时继续");
      assert.equal(await page.evaluate((id) => localStorage.getItem(`nava.sleep-maintenance.v1:${id}`), userId), started);
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator(".sleep-maintenance").getByRole("button", { name: "放弃", exact: true }).click();
      assert.deepEqual(rawWrites, []);
      console.log(`${new URL(site).hostname}: source hash, real form login, exercise pause/resume, sleep preservation passed; active drafts isolated; no raw-health writes.`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  assert.equal(JSON.stringify(await snapshot()) === JSON.stringify(before), true, "Original account active sessions must remain unchanged even after test failures");
  console.log("Original cloud sessions unchanged.");
}
