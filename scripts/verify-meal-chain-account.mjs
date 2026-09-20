// Authorized 9/13 test-breakfast round trip. Real APP/provider/write; precise CAS recovery.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, open, unlink, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
import { readProtectedTestState, writeProtectedTestState } from "./protected-test-state.mjs";
applyProjectPublicEnv(process.cwd());
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD, url = process.env.VITE_SUPABASE_URL;
if (!email || !password || new URL(url).hostname !== "wxteapvwagvhhtrjrbim.supabase.co") throw new Error("Canonical account secure launcher required.");
const output = "Q:/NAVA-Workspace/Build/TestRuns/meal-chain-acceptance";
await mkdir(output, { recursive: true });
const journalPath = `${output}/recovery.dpapi`;
const imagePath = "Q:/NAVA-Workspace/Build/TestRuns/nava-account-history-20260913/synthetic-images/2026-09-13-breakfast.png";
const date = "2026-09-13", meal = "breakfast";
const recoveryOnly = process.env.NAVA_MEAL_RECOVER_ONLY === "1";
const receiptPath = `${output}/${recoveryOnly ? "recovery-result" : "result"}.json`;
const receipt = { startedAt: new Date().toISOString(), passed: false, restored: false, isolation: ["active sessions", "drafts", "growth rewards", "notifications", "analytics"], source: "user-authorized synthetic breakfast photo" };
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
const auth = await client.auth.signInWithPassword({ email, password });
if (auth.error || auth.data.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Target identity mismatch.");
const userId = auth.data.user.id;
let journal, browser, server, page, stage = "snapshot", allowSave = false, saved = false, lock;
let persistence = Promise.resolve();
const persist = () => { const snapshot = structuredClone(journal); persistence = persistence.then(() => writeProtectedTestState(journalPath, snapshot)); return persistence; };
const readNutrition = async () => { const result = await client.from("nutrition_records").select("*").eq("user_id", userId).eq("record_date", date).single(); if (result.error) throw new Error("Target breakfast unavailable."); return result.data; };
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const stable = (value) => JSON.stringify(canonical(value));
const bulletHash = (items) => createHash("sha256").update(JSON.stringify(items.map((item) => item.trim()))).digest("hex");
const raw = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["updated_at", "ai_feedback"].includes(key)));
const protectedState = async () => {
  const state = {};
  for (const table of ["active_user_sessions", "record_drafts", "growth_reward_ledger", "user_notifications", "mood_records", "sleep_records", "exercise_records", "focus_records", "face_records"]) {
    const response = await client.from(table).select("*").eq("user_id", userId).limit(1000);
    if (response.error || response.data.length >= 1000) throw new Error("Protected account snapshot unavailable.");
    state[table] = response.data.map((row) => stable(raw(row))).sort();
  }
  return stable(state);
};
const restore = async (finalize = false) => {
  receipt.recoveryPhase = "identity-and-row";
  if (!journal || journal.userId !== userId || journal.date !== date || journal.original?.user_id !== userId || !journal.original?.id) throw new Error("Recovery identity guard failed.");
  const current = await readNutrition();
  const originalRaw = Object.fromEntries(Object.entries(journal.original).filter(([key]) => !["updated_at", "ai_feedback"].includes(key)));
  const currentRaw = Object.fromEntries(Object.entries(current).filter(([key]) => !["updated_at", "ai_feedback"].includes(key)));
  if (stable(currentRaw) !== stable(originalRaw)) {
    if (!journal.expectedPayload || stable(currentRaw) !== stable(raw({ ...journal.original, ...journal.expectedPayload })) || current.id !== journal.original.id) throw new Error("Concurrent change detected; recovery stopped without overwriting.");
    const payload = Object.fromEntries(Object.entries(journal.original).filter(([key]) => !["id", "user_id", "created_at", "updated_at", "ai_feedback"].includes(key)));
    const response = await client.from("nutrition_records").update(payload).eq("user_id", userId).eq("id", current.id).eq("updated_at", current.updated_at).select("id").maybeSingle();
    if (response.error || !response.data) throw new Error("Recovery CAS failed; encrypted recovery journal retained.");
  }
  const restoredRow = await readNutrition();
  receipt.recoveryPhase = "exact-photo-cleanup";
  for (const path of journal.uploads) {
    if (!path.startsWith(`${userId}/${date}/`) || path.includes("..") || Object.values(restoredRow).includes(path)) throw new Error("Unsafe upload cleanup target.");
    const response = await client.storage.from("diet-photos").remove([path]); if (response.error) throw new Error("Exact test-upload cleanup failed.");
  }
  if (!journal.expectedPayload) {
    journal.restored = true; journal.rawRestored = true; journal.aiPending = false; await persist(); receipt.restored = true; receipt.noHealthWriteRequiredNoRecompute = true; return;
  }
  const session = await client.auth.getSession();
  const headers = { Authorization: `Bearer ${session.data.session.access_token}` };
  const score = await client.functions.invoke("rhythm-score", { body: { date }, headers });
  receipt.recoveryPhase = "derived-recompute";
  const fdnb = await client.functions.invoke("dnb-weekly-report", { body: { startDate: "2026-09-07", endDate: date, analysisDays: 14 }, headers });
  receipt.derivedAnalysisDays = 14;
  if (score.error || fdnb.error) { receipt.derivedErrors = { score: score.error?.context?.status ?? score.error?.name, fdnb: fdnb.error?.context?.status ?? fdnb.error?.name }; throw new Error("Raw breakfast restored; derived-data recomputation still needs recovery."); }
  const after = await readNutrition();
  assert.equal(stable(Object.fromEntries(Object.entries(after).filter(([key]) => !["updated_at", "ai_feedback"].includes(key)))), stable(originalRaw));
  journal.rawRestored = true; journal.restored = finalize; journal.aiPending = !finalize; journal.restoredAt = new Date().toISOString(); await persist(); receipt.restored = true; receipt.derivedRecomputed = true;
};
const verifyRestoredAi = async () => {
  if (!page) {
    server = await createServer({ server: { host: "127.0.0.1", port: 5227, strictPort: true }, logLevel: "silent" }); await server.listen();
    browser = await chromium.launch({ headless: true }); page = await browser.newPage({ locale: "zh-CN", viewport: { width: 390, height: 844 } });
    await page.route("**/rest/v1/**", (route) => {
      const request = route.request(), table = new URL(request.url()).pathname.split("/").at(-1), method = request.method();
      if (table === "active_user_sessions" || table === "record_drafts") return route.fulfill({ status: 200, contentType: "application/json", body: method === "GET" ? "null" : "[]" });
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) return route.abort();
      return route.continue();
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    const form = page.locator(".auth-form--signIn"); await form.locator('input[autocomplete="username"]').fill(email); await form.locator('input[autocomplete="current-password"]').fill(password); await form.locator('button[type="submit"]').click(); await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 45000 });
  }
  const base = server.resolvedUrls.local[0];
  receipt.restoredAiRequests = [];
  page.on("response", async (response) => {
    if (!/\/functions\/v1\/ai-(health|diet)-report$/.test(response.url())) return;
    const input = response.request().postDataJSON();
    const body = await response.json().catch(() => null);
    receipt.restoredAiRequests.push({ scope: input?.scope ?? "diet", date: input?.endDate ?? input?.date, status: response.status(), modelVersion: body?.modelVersion, errorCode: body?.code, bulletHash: Array.isArray(body?.bullets) ? bulletHash(body.bullets) : null });
  });
  stage = "restored-app-ai"; await page.goto(`${base}#tab=record&module=diet&view=history`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("报告日期", { exact: true }).fill(date);
  await expect(page.getByLabel("报告日期", { exact: true })).toHaveValue(date);
  const dietReport = page.locator(`.module-ai-report[data-report-date="${date}"]`);
  await expect(dietReport).toHaveAttribute("data-ai-state", /ready|error/, { timeout: 180000 });
  if (await dietReport.getAttribute("data-ai-state") === "error") {
    receipt.restoredDietRetry = true;
    await dietReport.getByRole("button", { name: "重新生成", exact: true }).click();
  }
  await expect(dietReport).toHaveAttribute("data-ai-state", "ready", { timeout: 180000 });
  const restoredDiet = JSON.parse((await readNutrition()).ai_feedback);
  const uiHash = bulletHash(await dietReport.locator("li").allTextContents());
  assert.equal(uiHash, bulletHash(restoredDiet.bullets));
  assert.ok(restoredDiet.sourceFingerprint && !restoredDiet.modelVersion?.includes("demo"));
  await expect.poll(() => receipt.restoredAiRequests.some((item) => item.scope === "diet" && item.date === date && item.bulletHash === uiHash)).toBe(true);
  receipt.restoredDietUiResponseDatabaseMatch = true;
  stage = "restored-weekly-ai";
  await page.goto(`${base}#tab=record`, { waitUntil: "domcontentloaded" }); await page.reload({ waitUntil: "domcontentloaded" });
  const weeklyResponse = page.waitForResponse((response) => response.url().endsWith("/ai-health-report") && response.request().postDataJSON()?.scope === "weekly" && response.request().postDataJSON()?.endDate === date, { timeout: 180000 });
  await page.locator('.record-hub-date input').fill(date);
  const weekly = await weeklyResponse; assert.equal(weekly.status(), 200);
  const report = await weekly.json(); assert.ok(report.provider && report.provider !== "demo" && report.sections?.length === 4); assert.equal(report.periodStart, "2026-09-07"); assert.equal(report.periodEnd, date);
  await restore(true);
  const jobs = await client.from("fdnb_recompute_jobs").select("status").eq("user_id", userId).eq("requested_date", date).maybeSingle();
  assert.equal(jobs.error, null); assert.equal(jobs.data?.status, "completed"); receipt.restoredAiAndDerivedVerified = true;
};
try {
  lock = await open(`${output}/run.lock`, "wx"); await lock.writeFile(String(process.pid));
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  try { await access(journalPath); journal = await readProtectedTestState(journalPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (journal && !journal.restored) { if (!recoveryOnly) { journal = null; throw new Error("Unfinished run requires explicit recovery-only execution."); } const recoveryProtected = await protectedState(); await restore(); if (journal.expectedPayload) await verifyRestoredAi(); assert.equal(await protectedState(), recoveryProtected); receipt.protectedAccountStateUnchanged = true; receipt.recoveredOnly = true; receipt.passed = true; console.log("PASS original meal, APP-generated AI and derived-data recovery."); }
  if (!recoveryOnly) {
    const original = await readNutrition(); if (!original.breakfast_items?.length) throw new Error("Requires existing authorized test breakfast.");
    const beforeProtected = await protectedState();
    journal = { userId, date, original, uploads: [], expectedPayload: null, restored: false, startedAt: receipt.startedAt }; await persist();
    server = await createServer({ server: { host: "127.0.0.1", port: 5227, strictPort: true }, logLevel: "silent" }); await server.listen();
    const base = server.resolvedUrls.local[0]; browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }); page = await context.newPage(); page.setDefaultTimeout(30000);
    const inFlight = new Set(); const analysis = [];
    page.on("request", (request) => { if (request.url().includes("/functions/v1/")) inFlight.add(request); });
    page.on("requestfinished", (request) => inFlight.delete(request)); page.on("requestfailed", (request) => inFlight.delete(request));
    page.on("response", async (response) => { if (response.url().endsWith("/diet-extract") && response.status() === 200) { const data = await response.json().catch(() => null); if (data) analysis.push({ provider: data.provider, modelVersion: data.modelVersion ?? data.model_version, count: data.items?.length, available: data.analysisAvailable }); } });
    await page.route("**/storage/v1/object/diet-photos/**", async (route) => {
      if (["POST", "PUT"].includes(route.request().method())) {
        const path = decodeURIComponent(new URL(route.request().url()).pathname.split("/diet-photos/")[1]);
        if (!path.startsWith(`${userId}/${date}/breakfast-`) || path.includes("..")) return route.abort();
        const name = path.split("/").at(-1); const listing = await client.storage.from("diet-photos").list(`${userId}/${date}`, { search: name, limit: 100 });
        if (listing.error || listing.data.some((entry) => entry.name === name)) return route.abort();
        journal.uploads.push(path); await persist();
      }
      return route.continue();
    });
    await page.route("**/rest/v1/**", async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname, table = path.split("/").pop(), method = request.method();
      if (table === "active_user_sessions" || table === "record_drafts") return route.fulfill({ status: 200, contentType: "application/json", body: method === "GET" ? "null" : "[]" });
      if (/nava_(reconcile_growth_rewards|record_growth_activity|ack_growth_progress)/.test(path) || (/(notification|analytics)/.test(table) && !["GET", "HEAD", "OPTIONS"].includes(method))) return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"QA side effect isolated"}' });
      if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table) && !["GET", "HEAD", "OPTIONS"].includes(method)) {
        const payload = request.postDataJSON();
        if (!allowSave || table !== "nutrition_records" || method !== "PATCH" || payload.user_id !== userId || payload.record_date !== date || !journal.uploads.includes(payload.breakfast_photo_url)) { receipt.guardFailure = "save-scope"; return route.abort(); }
        const requestUrl = new URL(request.url());
        const current = await readNutrition();
        const version = requestUrl.searchParams.get("updated_at");
        if (requestUrl.searchParams.get("id") !== `eq.${original.id}` || !version?.startsWith("eq.") || !Number.isFinite(Date.parse(version.slice(3))) || Date.parse(version.slice(3)) > Date.parse(current.updated_at) || stable(raw(current)) !== stable(raw(original))) { receipt.guardFailure = "row-id-or-version"; return route.abort(); }
        for (const other of ["lunch", "dinner", "pantry"]) for (const [key, value] of Object.entries(payload)) if (key.startsWith(`${other}_`) && stable(value) !== stable(original[key])) { receipt.guardFailure = `unrelated-${key}`; return route.abort(); }
        if (journal.expectedPayload && stable(raw(journal.expectedPayload)) !== stable(raw(payload))) return route.abort();
        journal.expectedPayload ??= payload; await persist(); saved = true;
      }
      return route.continue();
    });
    stage = "app-login"; await page.goto(base, { waitUntil: "domcontentloaded" }); if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    const form = page.locator(".auth-form--signIn"); await form.locator('input[autocomplete="username"]').fill(email); await form.locator('input[autocomplete="current-password"]').fill(password); await form.locator('button[type="submit"]').click(); await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 45000 });
    await page.goto(`${base}#tab=record&module=diet&view=editor`, { waitUntil: "domcontentloaded" });
    const editor = page.locator('[data-record-detail="diet"] form:not([hidden])');
    await editor.locator('input[type="date"]').fill(date); await editor.locator("select").first().selectOption(meal);
    await expect(editor.locator('input[type="date"]')).toHaveValue(date); await page.waitForTimeout(800);
    stage = "real-photo-analysis"; await editor.getByLabel("从相册上传饮食照片").setInputFiles(imagePath);
    await expect.poll(() => analysis.length, { timeout: 180000 }).toBeGreaterThan(0);
    await expect(page.locator(".diet-photo-preview")).not.toHaveClass(/is-analyzing/, { timeout: 180000 });
    await expect(editor.locator(".diet-estimate-item").first()).toBeVisible({ timeout: 180000 });
    assert.ok(analysis.some((value) => value.modelVersion && value.modelVersion !== "demo" && value.count > 0));
    receipt.analysis = analysis;
    const beforeSave = await readNutrition(); assert.equal(stable(beforeSave), stable(original));
    const caloriesInput = editor.locator(".diet-estimate-item").first().locator('input[type="number"]').nth(1);
    const oldCalories = Number(await caloriesInput.inputValue()); const correctedCalories = Math.max(1, Math.round(oldCalories * .5));
    stage = "user-correction"; await caloriesInput.fill(String(correctedCalories)); await caloriesInput.blur();
    await expect(editor.locator(".diet-estimate-item").first()).toContainText("已修正");
    const displayedTotal = Number(await editor.locator('.two-col:has(select) input[type="number"]').inputValue());
    stage = "confirmed-app-save"; allowSave = true; await editor.locator('button[type="submit"]').click();
    assert.equal(await editor.evaluate((form) => form.checkValidity()), true, "Meal input validity must accept real decimal nutrition estimates");
    await expect.poll(async () => (await readNutrition()).breakfast_photo_url, { timeout: 45000 }).toBe(journal.uploads.at(-1));
    await expect(page.locator('[data-record-detail="diet"]')).not.toHaveAttribute("data-record-busy", /.+/, { timeout: 180000 });
    await expect.poll(() => inFlight.size, { timeout: 180000 }).toBe(0);
    const current = await readNutrition(); assert.equal(current.breakfast_items[0].calories, correctedCalories); assert.equal(current.breakfast_items[0].nutrition_source, "user_corrected");
    for (const other of ["lunch", "dinner", "pantry"]) for (const field of ["items", "time", "photo_url"]) assert.deepEqual(current[`${other}_${field}`], original[`${other}_${field}`]);
    const mealTotal = current.breakfast_items.reduce((sum, item) => sum + Number(item.calories ?? 0), 0); assert.equal(mealTotal, displayedTotal);
    const dailyTotal = ["breakfast", "lunch", "dinner", "pantry"].reduce((sum, key) => sum + current[`${key}_items`].reduce((subtotal, item) => subtotal + Number(item.calories ?? 0), 0), 0); assert.equal(Math.round(current.total_calories), Math.round(dailyTotal));
    receipt.analysis = analysis; receipt.confirmedWrite = true; receipt.otherMealsPreserved = true; receipt.mealAndDailyCaloriesMatch = true;
    stage = "restore"; await restore();
    // Restored records generate their AI through the real APP, never via hand-written cache data.
    await verifyRestoredAi();
    assert.equal(await protectedState(), beforeProtected); receipt.protectedAccountStateUnchanged = true;
    receipt.passed = true; console.log("PASS real meal photo, item correction, confirmed write, day aggregation and exact recovery.");
  }
} catch (error) {
  receipt.failedStage = stage; receipt.errorType = error?.constructor?.name;
  if (page && !page.isClosed()) {
    const report = page.locator(`.module-ai-report[data-report-date="${date}"]`);
    receipt.failureUi = { hash: new URL(page.url()).hash, reportCount: await report.count().catch(() => -1), reportState: await report.first().getAttribute("data-ai-state", { timeout: 1000 }).catch(() => null), selectedDate: await page.getByLabel("报告日期", { exact: true }).inputValue({ timeout: 1000 }).catch(() => null) };
  }
  if (journal && !journal.restored) {
    try { await page?.close(); page = null; await restore(); } catch (recoveryError) { receipt.recoveryRequired = true; receipt.recoveryErrorType = recoveryError?.constructor?.name; receipt.recoveryReason = recoveryError?.message?.startsWith("Concurrent") ? "concurrent-raw-change" : recoveryError?.message?.startsWith("Unsafe") ? "unsafe-cleanup" : "recovery-boundary-failure"; }
  }
  throw new Error(`Meal acceptance failed at ${stage}; ${receipt.restored ? "original meal restored" : "encrypted recovery journal retained"}. Private details omitted.`);
} finally { try { await browser?.close(); } finally { try { await server?.close(); } finally { client.auth.stopAutoRefresh(); receipt.saveAttempted = saved; if (lock) { await writeFile(receiptPath, JSON.stringify(receipt, null, 2)); await lock.close(); await unlink(`${output}/run.lock`); } } } }
