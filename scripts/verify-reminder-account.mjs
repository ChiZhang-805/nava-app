// Run only after the independent-reminder migration has been authorized/applied.
// Uses the actual APP form and Supabase RLS; precisely restores the eight tested types.
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure account launcher.");
const url = process.env.VITE_SUPABASE_URL;
assert.equal(new URL(url).hostname.split(".")[0], "wxteapvwagvhhtrjrbim");
const receipt = { startedAt: new Date().toISOString(), target: process.env.NAVA_REMINDER_UI_URL ? new URL(process.env.NAVA_REMINDER_UI_URL).hostname : "local-source", passed: false, settingsRestored: false, activeSessionsPreserved: false, healthWrites: 0 };
const output = "Q:/NAVA-Workspace/Build/TestRuns/independent-reminders";
await mkdir(output, { recursive: true });
await writeFile(`${output}/account-${receipt.target}.json`, JSON.stringify(receipt, null, 2));
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.auth.signInWithPassword({ email, password });
if (login.error || login.data.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Target account authentication failed.");
const userId = login.data.user.id;
const types = ["mood", "nutrition_breakfast", "nutrition_lunch", "nutrition_dinner", "sleep", "exercise", "focus", "face"];
const read = async () => {
  const result = await client.from("notification_preferences").select("*").eq("user_id", userId).in("notification_type", types).order("notification_type");
  if (result.error) throw new Error("Owned reminder preferences read failed.");
  return result.data;
};
const original = await read();
const originalTypes = new Set(original.map((row) => row.notification_type));
const stableRow = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updated_at"));
const activeBefore = await client.from("active_user_sessions").select("*").eq("user_id", userId).order("session_type");
if (activeBefore.error) throw new Error("Existing activity could not be checked safely.");
const confirmedWrites = new Map();
const exactRow = (row) => JSON.stringify(Object.keys(row).sort().map((key) => [key, row[key]]));
let healthWrites = 0;
let stage = "app-login";
let passed = false;
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
  const context = await browser.newContext({ locale: "zh-CN", permissions: ["notifications"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // Explicit permission fixture: verifies persisted settings, not native permission or delivery.
  await context.addInitScript(() => Object.defineProperty(Notification, "permission", { configurable: true, value: "granted" }));
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  const loadedAssets = new Set();
  const projects = new Set();
  page.on('request', (request) => {
    const target = new URL(request.url());
    if (target.hostname.endsWith('.supabase.co')) projects.add(target.hostname);
    // Cloudflare injects its own challenge scripts under /cdn-cgi/; those are
    // hosting infrastructure, not assets produced by this source revision.
    if (process.env.NAVA_REMINDER_UI_URL && target.origin === new URL(base).origin && !target.pathname.startsWith('/cdn-cgi/') && /\/[^/]+\.(js|css)$/.test(target.pathname)) loadedAssets.add(target.href);
  });
  await page.route("**/rest/v1/*", async (route) => {
    const request = route.request();
    const table = new URL(request.url()).pathname.split("/").pop();
    if (table === "notification_preferences" && request.method() === "POST") {
      // Keep the APP write unchanged; capture its full returned row for exact restoration.
      const responseUrl = new URL(request.url());
      responseUrl.searchParams.set("select", "*");
      const response = await route.fetch({ url: responseUrl.href });
      if (response.ok()) {
        const data = await response.json();
        for (const row of Array.isArray(data) ? data : [data]) {
          if (row.user_id === userId && types.includes(row.notification_type)) confirmedWrites.set(row.notification_type, row);
        }
      }
      return route.fulfill({ response });
    }
    if (table === "active_user_sessions") return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
    if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      healthWrites++;
      return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only health acceptance"}' });
    }
    return route.continue();
  });
  await page.goto(process.env.NAVA_REMINDER_UI_URL ? `${base}?demo=1` : base, { waitUntil: "domcontentloaded" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  const form = page.locator(".auth-form--signIn");
  await expect(form).toBeVisible();
  await form.locator('input[autocomplete="username"]').fill(email);
  await form.locator('input[autocomplete="current-password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30000 });
  console.log("Approved target account logged in through the actual APP form; identity matched (credentials omitted).");
  await page.goto(`${base}#tab=today&view=notifications`, { waitUntil: "domcontentloaded" });
  await page.getByRole('button', { name: '通知操作' }).click();
  await page.getByRole('menuitem', { name: '提醒设置' }).click();
  const settings = page.locator('[data-reminder-settings="all"]');
  await expect(settings.locator(".reminder-setting-row")).toHaveCount(8);
  for (const [index, kind] of ["mood", "breakfast", "lunch", "dinner", "sleep", "exercise", "focus", "face"].entries()) {
    stage = `save-${kind}`;
    const row = settings.locator(`[data-reminder-kind="${kind}"]`);
    changed = true;
    if (await row.getByRole("switch").getAttribute("aria-checked") !== "true") await row.getByRole('switch').click();
    await row.getByRole('button', { name: '固定时间', exact: true }).click();
    // Far outside the current one-hour catch-up window, including around midnight.
    const hour = (new Date().getHours() + 3 + index) % 24;
    let time = `${String(hour).padStart(2, "0")}:47`;
    if (await row.locator("input").inputValue() === time) time = `${String(hour).padStart(2, "0")}:49`;
    changed = true;
    await row.locator("input").fill(time);
    await expect(settings.getByRole("status")).toHaveText("已保存");
    if (await row.getByRole("switch").getAttribute("aria-checked") !== "true") {
      await row.getByRole("switch").click();
    }
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    const saved = (await read()).find((value) => value.notification_type === types[index]);
    assert.equal(saved?.local_time.slice(0, 5), time);
    assert.equal(saved?.enabled, true);
    assert.equal(saved?.timing_mode, 'fixed');
    await row.getByRole('button', { name: '智能', exact: true }).click();
    await expect(row.getByRole('button', { name: '智能', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const smart = (await read()).find((value) => value.notification_type === types[index]);
    assert.equal(smart?.timing_mode, 'smart');
    assert.equal(smart?.local_time.slice(0,5), time);
    await row.getByRole('button', { name: '固定时间', exact: true }).click();
    await expect(row.getByRole('button', { name: '固定时间', exact: true })).toHaveAttribute('aria-pressed', 'true');
    console.log(`Actual APP + Supabase: ${kind} enabled/time confirmed.`);
  }
  const beforeOff = await read();
  stage = "independent-off-and-reload";
  await settings.locator('[data-reminder-kind="lunch"] [role="switch"]').click();
  await expect(settings.locator('[data-reminder-kind="lunch"] [role="switch"]')).toHaveAttribute("aria-checked", "false");
  const afterOff = await read();
  stage = 'off-isolation-cloud';
  for (const row of afterOff) {
    if (row.notification_type === "nutrition_lunch") assert.equal(row.enabled, false);
    else assert.equal(JSON.stringify(row), JSON.stringify(beforeOff.find((previous) => previous.notification_type === row.notification_type)), "Another reminder changed unexpectedly.");
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  stage = 'off-reload-ui';
  await expect(settings.locator('[data-reminder-kind="lunch"] [role="switch"]')).toHaveAttribute("aria-checked", "false");
  await expect(settings.locator('[data-reminder-kind="breakfast"] [role="switch"]')).toHaveAttribute("aria-checked", "true");
  console.log("APP reload and cloud read agree; changing lunch left the other seven rows unchanged.");
  assert.deepEqual([...projects], ['wxteapvwagvhhtrjrbim.supabase.co']);
  receipt.canonicalProjectVerified = true;
  receipt.realLoginVerified = true;
  if (process.env.NAVA_REMINDER_UI_URL) {
    stage = 'public-asset-parity';
    assert.ok(loadedAssets.size >= 2);
    for (const asset of loadedAssets) {
      const response = await fetch(asset);
      assert.ok(response.ok);
      const local = await readFile(path.join(process.cwd(), 'dist/assets', path.basename(new URL(asset).pathname)));
      const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(local), 'Published asset differs from verified build');
    }
    receipt.assetsMatched = loadedAssets.size;
  }
  passed = true;
} catch {
  throw new Error(`Authenticated APP reminder acceptance failed at ${stage}; account and credential details omitted.`);
} finally {
  await browser?.close().catch(() => undefined);
  try {
  // No global sign-out: other existing user sessions must remain valid.
  if (changed) {
    const conflicts = [];
    for (const row of await read()) {
      const previous = original.find((item) => item.notification_type === row.notification_type);
      if (previous && JSON.stringify(stableRow(row)) === JSON.stringify(stableRow(previous))) continue;
      const confirmed = confirmedWrites.get(row.notification_type);
      if (!confirmed || exactRow(row) !== exactRow(confirmed)) { conflicts.push(row.notification_type); continue; }
      const query = !originalTypes.has(row.notification_type)
        ? client.from("notification_preferences").delete()
        : client.from("notification_preferences").update(original.find((item) => item.notification_type === row.notification_type));
      const restored = await query.eq("user_id", userId).eq("notification_type", row.notification_type).eq("updated_at", row.updated_at).select("notification_type");
      if (restored.error || restored.data?.length !== 1) conflicts.push(row.notification_type);
    }
    if (conflicts.length) throw new Error("Reminder restoration conflicted or failed; safe rows restored, inspect remaining target settings before retrying.");
    const restored = await read();
    const stable = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updated_at")));
    assert.ok(JSON.stringify(stable(restored)) === JSON.stringify(stable(original)), "Original reminder restoration mismatch; account details omitted.");
    console.log("Original eight reminder settings restored; test-created rows removed.");
  }
  receipt.settingsRestored = true;
  const activeAfter = await client.from("active_user_sessions").select("*").eq("user_id", userId).order("session_type");
  if (activeAfter.error || JSON.stringify(activeBefore.data) !== JSON.stringify(activeAfter.data) || healthWrites) throw new Error("Read-only health/activity boundary failed.");
  receipt.activeSessionsPreserved = true;
  receipt.healthWrites = healthWrites;
  receipt.passed = passed;
  console.log("Health writes: 0; existing activity preserved.");
  await writeFile(`${output}/account-${receipt.target}.json`, JSON.stringify({ ...receipt, stage }, null, 2));
  } finally { if (server) {
    const timer = setTimeout(() => { console.error("Test server shutdown timed out."); process.exit(1); }, 8000);
    await server.close(); clearTimeout(timer);
  } }
}
