// Read-only health acceptance. Real APP login; no health records or preferences are changed.
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { applyProjectPublicEnv } from "./project-env.mjs";
import { monthlyWellbeing } from "../src/services/monthlyWellbeing.ts";
applyProjectPublicEnv(process.cwd());
const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const url = process.env.VITE_SUPABASE_URL;
if (!email || !password || new URL(url).hostname !== "wxteapvwagvhhtrjrbim.supabase.co") throw new Error("Use the secure launcher with the canonical project.");
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server;
let stage = "account-authentication";
const results = [];
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/wellbeing-tools";
const target = process.env.NAVA_WELLBEING_UI_URL ? new URL(process.env.NAVA_WELLBEING_UI_URL).hostname : "local-source";
const startedAt = new Date().toISOString();
await mkdir(output, { recursive: true });
await writeFile(`${output}/account-${target}.json`, JSON.stringify({ startedAt, passed: false, app: target }, null, 2));
try {
  const auth = await client.auth.signInWithPassword({ email, password });
  if (auth.error || auth.data.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Account identity mismatch");
  const userId = auth.data.user.id;
  stage = "existing-session-snapshot";
  console.log("Target account API identity verified; preparing APP form login.");
  const activeBefore = await client.from("active_user_sessions").select("*").eq("user_id", userId).order("session_type");
  if (activeBefore.error) throw activeBefore.error;
  stage = "local-server";
  let base = process.env.NAVA_WELLBEING_UI_URL;
  if (!base) {
    server = await createServer({ server: { host: "127.0.0.1", port: 5222 }, logLevel: "silent" });
    await server.listen();
    base = server.resolvedUrls.local[0];
  }
  browser = await chromium.launch({ headless: true });
  stage = "app-login-form";
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  let healthWrites = 0;
  await page.route("**/rest/v1/*", async (route) => {
    const request = route.request();
    const table = new URL(request.url()).pathname.split("/").pop();
    // Preserve the account's existing active focus session; only this QA page is isolated.
    if (table === "active_user_sessions") return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
    if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      healthWrites++;
      return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only acceptance"}' });
    }
    return route.continue();
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  const form = page.locator(".auth-form--signIn");
  await expect(form).toBeVisible();
  await form.locator('input[autocomplete="username"]').fill(email);
  await form.locator('input[autocomplete="current-password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  stage = "authenticated-navigation";
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30000 });
  console.log("Actual APP form login succeeded; target identity matched (credentials omitted).");
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  for (const module of ["mood", "sleep"]) {
    stage = `${module}-cloud-read`;
    const records = await client.from(`${module}_records`).select("*").eq("user_id", userId).gte("record_date", "2026-08-01").lte("record_date", "2026-09-30");
    if (records.error) throw records.error;
    await page.goto(`${base}#tab=record&module=${module}`, { waitUntil: "domcontentloaded" });
    if (module === "mood") {
      stage = "breathing-start-pause";
      const breath = page.locator("[data-breathing]");
      await breath.getByRole("button", { name: "和 NAVA 缓一缓" }).click();
      await breath.getByRole("button", { name: "开始一分钟" }).click();
      await expect(breath.locator(".breathing-orbit > span")).not.toHaveText("0 / 60 秒");
      await breath.getByRole("button", { name: "暂停", exact: true }).click();
      const paused = await breath.locator(".breathing-orbit > span").textContent();
      await page.waitForTimeout(1200);
      await expect(breath.locator(".breathing-orbit > span")).toHaveText(paused);
      await expect(breath.getByRole("button", { name: "继续", exact: true })).toBeVisible();
      await breath.getByRole("button", { name: "和 NAVA 缓一缓" }).click();
      results.push({ breathing: "actual-clock-start-and-pause" });
    }
    const card = page.locator(`[data-monthly-wellbeing="${module}"]`);
    await card.getByRole("button", { name: "月度回顾" }).click();
    for (const month of ["2026-08", "2026-09"]) {
      stage = `${module}-${month}-ui-comparison`;
      const expected = monthlyWellbeing(module, records.data, month, today);
      await card.locator('input[type="month"]').fill(month);
      await expect(card.locator(".wellbeing-summary strong").first()).toHaveText(`${expected.count} 天`);
      const average = expected.average === null ? "—" : module === "mood" ? `${Math.round(expected.average)} 分` : `${(expected.average / 60).toFixed(1)} 小时`;
      await expect(card.locator(".wellbeing-summary strong").nth(1)).toHaveText(average);
      if (module === "mood") await expect(card.locator(".wellbeing-factor")).toHaveCount(expected.factors.length);
      if (expected.records.length) {
        const row = expected.records[expected.records.length - 1];
        await card.locator("select").selectOption(row.record_date);
        const note = module === "mood" ? row.diary_content : row.self_note;
        if (note) await expect(card.locator(".wellbeing-entry p").last()).toHaveText(note);
      }
      results.push({ module, month, cloudMatchesUi: true });
      console.log(`PASS actual account ${module} ${month}: cloud records, average and day detail agree.`);
    }
  }
  const activeAfter = await client.from("active_user_sessions").select("*").eq("user_id", userId).order("session_type");
  if (activeAfter.error || JSON.stringify(activeBefore.data) !== JSON.stringify(activeAfter.data) || healthWrites) throw new Error("Read-only boundary failed");
  await writeFile(`${output}/account-${target}.json`, JSON.stringify({ startedAt, passed: true, results, healthWrites, existingActiveSessionsPreserved: true, app: target, deployed: Boolean(process.env.NAVA_WELLBEING_UI_URL) }, null, 2));
} catch (error) {
  await writeFile(`${output}/account-failure.json`, JSON.stringify({ stage, type: error?.constructor?.name, results, timestamp: new Date().toISOString() }, null, 2));
  const status = Number.isInteger(error?.status) ? ` HTTP ${error.status}` : "";
  throw new Error(`Authenticated wellbeing acceptance failed at ${stage}${status}; account details omitted.`);
} finally {
  await browser?.close();
  await server?.close();
  // No global signOut: do not invalidate the user's other devices.
}
