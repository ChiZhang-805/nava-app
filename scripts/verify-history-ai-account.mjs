// Real authenticated UI + provider + persisted report acceptance. No raw health writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
applyProjectPublicEnv(process.cwd());
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD;
const url = process.env.VITE_SUPABASE_URL;
if (!email || !password || new URL(url).hostname !== "wxteapvwagvhhtrjrbim.supabase.co") throw new Error("Secure launcher and canonical project required.");
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/history-ai-acceptance";
const host = process.env.NAVA_HISTORY_AI_URL ? new URL(process.env.NAVA_HISTORY_AI_URL).hostname : "local-source";
const startedAt = new Date().toISOString();
const results = [], requests = [];
let browser, server, stage = "login", healthWrites = 0, activeBefore, rawBefore, userId, protectedBefore;
let consecutiveFailures = 0;
const scopes = ["mood", "sleep", "exercise", "diet", "focus", "face"];
const start = process.env.NAVA_HISTORY_AI_START ?? "2026-08-28", end = process.env.NAVA_HISTORY_AI_END ?? "2026-09-13";
if (!/^2026-\d{2}-\d{2}$/.test(start) || !/^2026-\d{2}-\d{2}$/.test(end) || start < "2026-08-28" || end > "2026-09-13" || start > end) throw new Error("Outside authorized history range.");
const dates = [];
for (let date = new Date(`${start}T12:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) dates.push(date.toISOString().slice(0, 10));
await mkdir(output, { recursive: true });
const receipt = async (extra = {}) => writeFile(`${output}/${host}.json`, JSON.stringify({ startedAt, passed: false, stage, start, end, results, requests, healthWrites, ...extra }, null, 2));
const bulletHash = (items) => createHash("sha256").update(JSON.stringify(items.map((item) => item.trim()))).digest("hex");
const query = async (table, select = "*") => { const response = await client.from(table).select(select).eq("user_id", userId).order(table === "active_user_sessions" ? "session_type" : "id"); if (response.error) throw new Error(`Read failed: ${table}`); return response.data; };
const rawDigest = async () => {
  const data = {};
  for (const scope of scopes) {
    const table = `${scope === "diet" ? "nutrition" : scope}_records`;
    const rows = await query(table); if (rows.length >= 1000) throw new Error("Snapshot requires explicit pagination before acceptance.");
    data[table] = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updated_at" && !(table === "nutrition_records" && key === "ai_feedback"))));
  }
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
};
const protectedDigest = async () => {
  const state = {};
  for (const table of ["record_drafts", "growth_reward_ledger", "user_notifications", "ai_conversations", "ai_conversation_archives"]) {
    const rows = await query(table);
    if (rows.length >= 1000) throw new Error("Protected state needs explicit pagination before acceptance.");
    state[table] = rows;
  }
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
};
const metadata = async (scope, date) => {
  if (scope === "diet") {
    const response = await client.from("nutrition_records").select("ai_feedback").eq("user_id", userId).eq("record_date", date).maybeSingle();
    if (response.error) throw new Error("Diet cache read failed");
    let value; try { value = JSON.parse(response.data?.ai_feedback ?? "null"); } catch { value = null; }
    return value ? { generatedAt: value.generatedAt, modelVersion: value.modelVersion, fingerprintPresent: Boolean(value.sourceFingerprint), bulletHash: Array.isArray(value.bullets) ? bulletHash(value.bullets) : null, firstBulletHash: Array.isArray(value.bullets) && value.bullets.length ? bulletHash([value.bullets[0]]) : null, compactValid: value.compactBullets?.length === 4 && value.compactBullets.every((item) => /^\p{Script=Han}{7}$/u.test(item)) } : null;
  }
  const response = await client.from("ai_health_reports").select("generated_at,model_version,provider,source_count,bullets").eq("user_id", userId).eq("scope", scope).eq("period_start", new Date(Date.parse(`${date}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)).eq("period_end", date).eq("language", "zh").maybeSingle();
  if (response.error) throw new Error("Report cache read failed");
  const value = response.data;
  return value ? { generatedAt: value.generated_at, modelVersion: value.model_version, provider: value.provider, sourceCount: value.source_count, fingerprintPresent: Boolean(value.bullets?.sourceFingerprint), bulletHash: Array.isArray(value.bullets?.sections) ? bulletHash(value.bullets.sections.map((section) => section.headline)) : null, firstBulletHash: value.bullets?.sections?.[0] ? bulletHash([value.bullets.sections[0].headline]) : null, compactValid: value.bullets?.compactBullets?.length === 4 && value.bullets.compactBullets.every((item) => /^\p{Script=Han}{7}$/u.test(item)), structured: value.bullets?.sections?.length === 4 } : null;
};
await receipt();
try {
  const auth = await client.auth.signInWithPassword({ email, password });
  if (auth.error || auth.data.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Identity mismatch");
  userId = auth.data.user.id;
  stage = "active-session-snapshot"; activeBefore = await query("active_user_sessions");
  stage = "raw-health-snapshot"; rawBefore = await rawDigest();
  protectedBefore = await protectedDigest();
  let base = process.env.NAVA_HISTORY_AI_URL;
  if (!base) { server = await createServer({ server: { host: "127.0.0.1", port: 5226, strictPort: true }, logLevel: "silent" }); await server.listen(); base = server.resolvedUrls.local[0]; }
  stage = "browser-launch"; browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, reducedMotion: "reduce", permissions: ["camera"] });
  await context.addInitScript(() => {
    // Explicit media fixtures: real account/AI, but no claim of physical microphone/camera testing.
    window.SpeechRecognition = class { start() { window.__qaRecognition = this; } stop() { this.onend?.(); } abort() { this.onend?.(); } };
    Object.defineProperty(navigator, "share", { value: async () => { throw new DOMException("QA cancellation", "AbortError"); } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request(), table = new URL(request.url()).pathname.split("/").pop();
    if (table === "active_user_sessions" || table === "record_drafts") return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
    if (table === "ai_conversations" && request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "00000000-0000-4000-8000-000000000099", user_id: userId, role: "assistant", content: "媒体中断验收（临时显示，不保存）", created_at: new Date().toISOString() }]) });
    if (table === "ai_conversation_archives" && request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) { healthWrites++; return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only health acceptance"}' }); }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"QA isolates non-report account side effects"}' });
    return route.continue();
  });
  await page.route("**/functions/v1/ai-chat-reply", (route) => route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"Chat provider is outside report/media acceptance"}' }));
  page.on("response", async (response) => {
    if (!/\/functions\/v1\/ai-(health|diet)-report$/.test(response.url())) return;
    let input; try { input = response.request().postDataJSON(); } catch { return; }
    const item = { scope: input?.scope ?? "diet", date: input?.endDate ?? input?.date, refresh: input?.refresh === true, status: response.status() };
    if (response.status() === 200) { const body = await response.json().catch(() => null); if (Array.isArray(body?.bullets) && body.bullets.every((value) => typeof value === "string")) Object.assign(item, { generatedAt: body.generatedAt, modelVersion: body.modelVersion, bulletHash: bulletHash(body.bullets) }); }
    requests.push(item);
  });
  stage = "app-login-form";
  const loginUrl = new URL(base);
  if (process.env.NAVA_HISTORY_AI_URL) loginUrl.searchParams.set("demo", "1");
  await page.goto(loginUrl.href, { waitUntil: "domcontentloaded" }); if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  const form = page.locator(".auth-form--signIn"); await expect(form).toBeVisible();
  const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/v1/token" && new URL(response.url()).searchParams.get("grant_type") === "password" && response.status() === 200, { timeout: 45000 });
  await form.locator('input[autocomplete="username"]').fill(email); await form.locator('input[autocomplete="current-password"]').fill(password); await form.locator('button[type="submit"]').click();
  const authenticated = await loginResponse;
  assert.equal(new URL(authenticated.url()).hostname, new URL(url).hostname);
  assert.equal((await authenticated.json()).user?.id, userId);
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 45000 });
  console.log("Actual target-account APP form login passed; inspecting persisted historical AI reports.");
  for (const scope of scopes) {
    await page.goto(`${base}#tab=record&module=${scope}&view=history`, { waitUntil: "domcontentloaded" });
    const input = page.getByLabel("报告日期", { exact: true }); await expect(input).toBeVisible();
    for (const date of dates) {
      stage = `${scope}:${date}`; const before = await metadata(scope, date);
      try {
        await input.fill(date);
        const report = page.locator(`.module-ai-report[data-report-date="${date}"]`);
        await expect(report).toBeVisible({ timeout: 45000 });
        await expect(report).toHaveAttribute("data-ai-state", /ready|error/, { timeout: 180000 });
        // Force one newly generated report per scope, without tampering with the cache.
        const refresh = date === end && process.env.NAVA_HISTORY_AI_FORCE !== "0";
        if (refresh || await report.getAttribute("data-ai-state") === "error") {
          const requestCount = requests.length;
          await report.getByRole("button", { name: "重新生成", exact: true }).click();
          await expect.poll(() => requests.slice(requestCount).some((item) => item.scope === scope && item.date === date && item.refresh), { timeout: 180000 }).toBe(true);
        }
        await expect(report).toHaveAttribute("data-ai-state", "ready", { timeout: 180000 });
        await expect(report.locator("li")).toHaveCount(4);
        const after = await metadata(scope, date);
        assert.ok(after?.generatedAt && after?.modelVersion && /^(deepseek|qwen|nava)/i.test(after.modelVersion) && after.compactValid && after.fingerprintPresent);
        assert.equal(bulletHash(await report.locator("li").allTextContents()), after.bulletHash);
        await expect.poll(() => requests.some((item) => item.scope === scope && item.date === date && item.bulletHash === after.bulletHash && Date.parse(item.generatedAt) === Date.parse(after.generatedAt)), { timeout: 10000 }).toBe(true);
        if (scope !== "diet") assert.ok(after.provider === "deepseek" && after.structured);
        if (refresh) assert.ok(Date.parse(after.generatedAt) >= Date.parse(startedAt) && after.generatedAt !== before?.generatedAt);
        results.push({ scope, date, passed: true, uiResponseDatabaseMatch: true, source: after.generatedAt === before?.generatedAt ? "persisted-provider-cache" : "new-provider-generation", ...after });
        consecutiveFailures = 0;
        console.log(`PASS ${scope} ${date}: ${results.at(-1).source}`);
      } catch (error) { consecutiveFailures++; results.push({ scope, date, passed: false, errorType: error?.constructor?.name }); console.log(`FAIL ${scope} ${date}: report acceptance (details withheld)`); }
      await receipt();
      if (consecutiveFailures >= 3) throw new Error("Three consecutive report failures; stop for diagnosis instead of flooding the provider.");
    }
  }
  // Exercise each module's separate overview entry through the APP's date picker.
  for (const scope of scopes) {
    stage = `overview:${scope}`;
    try {
      await page.goto(`${base}#tab=record`, { waitUntil: "domcontentloaded" });
      await page.locator('.record-hub-date input[type="date"]').fill(end);
      await expect(page.locator('.record-hub-date input[type="date"]')).toHaveValue(end);
      const entry = page.locator(`[data-record-module="${scope}"]`); await expect(entry).not.toHaveAttribute("data-record-state", "missing", { timeout: 30000 }); await entry.click();
      await expect(page.locator(".module-overview-ai")).toHaveAttribute("data-ai-state", "ready", { timeout: 180000 });
      assert.equal(bulletHash([await page.locator(".module-overview-ai p").first().innerText()]), (await metadata(scope, end))?.firstBulletHash);
      results.push({ entry: "overview", scope, date: end, passed: true, uiDatabaseMatch: true }); console.log(`PASS overview ${scope}`);
    } catch (error) { results.push({ entry: "overview", scope, date: end, passed: false, errorType: error?.constructor?.name }); }
    await receipt();
  }
  if (process.env.NAVA_HISTORY_AI_URL) {
    stage = "public-media-smoke";
    await page.setViewportSize({ width: 1365, height: 1000 });
    await page.goto(`${base}#tab=record&module=face`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^(使用前置摄像头拍照|前置拍摄|重新拍摄)$/ }).click();
    const camera = page.locator(".camera-capture-overlay");
    await expect(camera).toHaveAttribute("data-camera-phase", "live", { timeout: 30000 });
    await page.evaluate(() => { window.__qaTracks = [...document.querySelector(".camera-viewfinder video").srcObject.getTracks()]; });
    await page.locator('[data-preview-event="call"]').click();
    await expect(camera).toHaveAttribute("data-camera-phase", "paused");
    assert.equal(await page.evaluate(() => window.__qaTracks.every((track) => track.readyState === "ended")), true);
    await camera.getByRole("button", { name: "关闭相机" }).click();
    await page.goto(`${base}#tab=ai`, { waitUntil: "domcontentloaded" });
    const mic = page.locator(".chat-voice-button"); await mic.focus(); await page.keyboard.press("Enter");
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => window.__qaRecognition.onresult({ results: [{ 0: { transcript: "未发送的中断检查" }, isFinal: false }] }));
    await page.locator('[data-preview-event="call"]').click();
    await expect(mic).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".chat-input-shell input")).toHaveValue("未发送的中断检查");
    await page.locator(".chat-input-shell input").fill("");
    results.push({ entry: "public-media-smoke", passed: true, camera: "browser-fake-device", speech: "recognition-fixture", conversation: "explicit-in-memory-fixture", healthWrite: false });
    console.log("PASS deployed camera and recording interruption controls; explicit device fixtures.");
  }
  stage = "integrity";
  assert.equal(await rawDigest(), rawBefore); assert.deepEqual(await query("active_user_sessions"), activeBefore); assert.equal(healthWrites, 0);
  assert.equal(await protectedDigest(), protectedBefore);
  await receipt({ passed: results.every((item) => item.passed), rawHealthUnchanged: true, activeSessionsPreserved: true, protectedAccountStateUnchanged: true, completedAt: new Date().toISOString() });
  if (results.some((item) => !item.passed)) throw new Error("Some real report entries failed; consult metadata receipt.");
} catch (error) {
  const integrity = userId && rawBefore && protectedBefore ? await Promise.all([rawDigest().then((value) => value === rawBefore), protectedDigest().then((value) => value === protectedBefore)]).catch(() => null) : null;
  await receipt({ failedStage: stage, errorType: error?.constructor?.name, rawHealthUnchanged: integrity?.[0], protectedAccountStateUnchanged: integrity?.[1] });
  throw new Error(`Real account report acceptance stopped at ${stage}; private details omitted.`);
} finally { try { await browser?.close(); } finally { try { await server?.close(); } finally { client.auth.stopAutoRefresh(); } } }
