// Run only after the independent-reminder migration has been authorized/applied.
// Uses the actual APP form and Supabase RLS; restores only the four tested rows.
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import assert from "node:assert/strict";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure account launcher.");
const url = process.env.VITE_SUPABASE_URL;
assert.equal(new URL(url).hostname.split(".")[0], "wxteapvwagvhhtrjrbim");
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.auth.signInWithPassword({ email, password });
if (login.error || login.data.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Target account authentication failed.");
const userId = login.data.user.id;
const types = ["mood", "nutrition_breakfast", "nutrition_lunch", "nutrition_dinner"];
const read = async () => {
  const result = await client.from("notification_preferences").select("*").eq("user_id", userId).in("notification_type", types).order("notification_type");
  if (result.error) throw new Error("Owned reminder preferences read failed.");
  return result.data;
};
const original = await read();
const originalTypes = new Set(original.map((row) => row.notification_type));
let server;
let browser;
let changed = false;
try {
  let base = process.env.NAVA_REMINDER_UI_URL;
  if (!base) {
    server = await createServer({ server: { host: "127.0.0.1", port: 5218 }, logLevel: "silent" });
    await server.listen(); base = server.resolvedUrls.local[0];
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  const form = page.locator(".auth-form");
  await expect(form).toBeVisible();
  await form.locator('input[autocomplete="username"]').fill(email);
  await form.locator('input[autocomplete="current-password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30000 });
  console.log("Approved target account logged in through the actual APP form; identity matched (credentials omitted).");
  await page.goto(`${base}#tab=today&view=notifications`, { waitUntil: "domcontentloaded" });
  const settings = page.locator('[data-reminder-settings="all"]');
  await settings.locator(".reminder-settings-heading").click();
  await expect(settings.locator(".reminder-setting-row")).toHaveCount(4);
  for (const [index, kind] of ["mood", "breakfast", "lunch", "dinner"].entries()) {
    const row = settings.locator(`[data-reminder-kind="${kind}"]`);
    // Far outside the current one-hour catch-up window, including around midnight.
    const hour = (new Date().getHours() + 3 + index) % 24;
    const time = `${String(hour).padStart(2, "0")}:47`;
    changed = true;
    await row.locator("input").fill(time);
    await expect(settings.getByRole("status")).toHaveText("已保存到账号");
    if (await row.getByRole("switch").getAttribute("aria-checked") !== "true") await row.getByRole("switch").click();
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    const saved = (await read()).find((value) => value.notification_type === types[index]);
    assert.equal(saved?.local_time.slice(0, 5), time);
    assert.equal(saved?.enabled, true);
    console.log(`Actual APP + Supabase: ${kind} enabled/time confirmed.`);
  }
  const beforeOff = await read();
  await settings.locator('[data-reminder-kind="lunch"] [role="switch"]').click();
  await expect(settings.locator('[data-reminder-kind="lunch"] [role="switch"]')).toHaveAttribute("aria-checked", "false");
  const afterOff = await read();
  for (const row of afterOff) {
    if (row.notification_type === "nutrition_lunch") assert.equal(row.enabled, false);
    else assert.equal(JSON.stringify(row), JSON.stringify(beforeOff.find((previous) => previous.notification_type === row.notification_type)), "Another reminder changed unexpectedly.");
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await settings.locator(".reminder-settings-heading").click();
  await expect(settings.locator('[data-reminder-kind="lunch"] [role="switch"]')).toHaveAttribute("aria-checked", "false");
  await expect(settings.locator('[data-reminder-kind="breakfast"] [role="switch"]')).toHaveAttribute("aria-checked", "true");
  console.log("APP reload and cloud read agree; changing lunch left the other three rows unchanged.");
} catch {
  throw new Error("Authenticated APP reminder acceptance failed; account and credential details omitted.");
} finally {
  await browser?.close().catch(() => undefined);
  try {
  // No global sign-out: other existing user sessions must remain valid.
  if (changed) {
    const createdTypes = types.filter((type) => !originalTypes.has(type));
    if (createdTypes.length) {
      const removed = await client.from("notification_preferences").delete().eq("user_id", userId).in("notification_type", createdTypes);
      if (removed.error) throw new Error("Temporary reminder-row cleanup failed; inspect target account before retry.");
    }
    if (original.length) {
      const restored = await client.from("notification_preferences").upsert(original, { onConflict: "user_id,notification_type" });
      if (restored.error) throw new Error("Original reminder preferences restoration failed.");
    }
    const restored = await read();
    const stable = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updated_at")));
    assert.ok(JSON.stringify(stable(restored)) === JSON.stringify(stable(original)), "Original reminder restoration mismatch; account details omitted.");
    console.log("Original four reminder settings restored; test-created rows removed. No health records changed.");
  }
  } finally { if (server) {
    const timer = setTimeout(() => process.exit(process.exitCode ?? 0), 8000);
    await server.close(); clearTimeout(timer);
  } }
}
