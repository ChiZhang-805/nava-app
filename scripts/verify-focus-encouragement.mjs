import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { validateFocusOutput } from "../supabase/functions/_shared/focus-contract.ts";
import { selectFocusHealthEvidence } from "../src/services/focusEncouragement.ts";
import { applyProjectPublicEnv } from "./project-env.mjs";

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Run through the secure NAVA account launcher.");
applyProjectPublicEnv(process.cwd());
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || new URL(url).hostname.split(".")[0] !== "wxteapvwagvhhtrjrbim") {
  throw new Error("The configured public Supabase project is not canonical.");
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const temporaryTaskIds = [];
try {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.user) throw new Error("NAVA account login failed.");
  const deviceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const startDay = new Date(`${deviceDate}T00:00:00Z`);
  startDay.setUTCDate(startDay.getUTCDate() - 6);
  const startDate = startDay.toISOString().slice(0, 10);
  const userId = login.data.user.id;
  const [profileResult, sleepResult, moodResult, exerciseResult] = await Promise.all([
    client.from("profiles").select("ai_personalization_consent,onboarding_answers").eq("id", userId).single(),
    client.from("sleep_records").select("record_date,sleep_duration_minutes").eq("user_id", userId).gte("record_date", startDate).lte("record_date", deviceDate).order("record_date", { ascending: false }).limit(7),
    client.from("mood_records").select("record_date,mood_score").eq("user_id", userId).gte("record_date", startDate).lte("record_date", deviceDate).order("record_date", { ascending: false }).limit(7),
    client.from("exercise_records").select("record_date,exercise_minutes,steps").eq("user_id", userId).gte("record_date", startDate).lte("record_date", deviceDate).order("record_date", { ascending: false }).limit(7),
  ]);
  for (const result of [profileResult, sleepResult, moodResult, exerciseResult]) if (result.error) throw new Error(`Owned focus evidence read failed: ${result.error.message}`);
  const evidence = selectFocusHealthEvidence({ sleeps: sleepResult.data, moods: moodResult.data, exercises: exerciseResult.data }, profileResult.data, deviceDate);
  if (!process.env.NAVA_FOCUS_UI_URL) {
    const focusRequest = { kind: "encouragement", title: "整理研究笔记", elapsedMinutes: 12 };
    const response = await client.functions.invoke("ai-chat-reply", {
      body: {
        focusRequest,
        focusContractVersion: 2,
        lang: "zh", responseMode: "text", deviceDate, stream: false,
      },
    });
    if (response.error) {
      const detail = await response.error.context?.json().catch(() => null);
      throw new Error(`Authenticated in-session cue failed: ${response.error.context?.status ?? "unknown"}; ${detail?.error ?? detail?.message ?? response.error.message}`);
    }
    const reply = typeof response.data?.reply === "string" ? response.data.reply.trim() : "";
    validateFocusOutput(JSON.stringify(response.data?.output), focusRequest, "zh", evidence);
    if (reply.length < 6 || Array.from(reply).length > 80 || /AI\s*暂不可用|请先登录/.test(reply)) {
      throw new Error("Authenticated in-session cue did not pass the safe reply check.");
    }
    const citedDomains = evidence.filter((item) => reply.includes(String(item.value)));
    if (evidence.length >= 2 && citedDomains.length < 2) throw new Error("The model did not cite two actual saved domain values for the requested cross-domain observation.");
    console.log(`Authenticated real-model in-session focus cue received (${reply.length} characters; content omitted); ${evidence.length} consented domains, ${citedDomains.length} observed values cited; no focus or health record saved.`);
    const legacy = await client.functions.invoke("ai-chat-reply", { body: { focusRequest, lang: "zh", deviceDate } });
    assert.equal(legacy.error, null, "Already-open legacy clients must retain an accepted response");
    assert.equal(legacy.data.output.reply, legacy.data.reply);
    assert.ok(Array.from(legacy.data.reply).length <= 80);
    for (const domain of legacy.data.output.citedDomains) {
      const item = evidence.find((entry) => entry.domain === domain);
      assert.ok(legacy.data.reply.includes(item.date) && legacy.data.reply.includes(String(item.value)));
    }
    console.log("Legacy response compatibility preserved with original dated facts; content omitted.");

  }
  if (process.env.NAVA_FOCUS_UI_URL) {
    const tasks = Array.from({ length: 2 }, (_, index) => ({ id: crypto.randomUUID(), user_id: userId,
      title: `专注契约验收${index + 1}：${"整理研究笔记，核验引用并列出待确认问题。".repeat(7)}`,
      scheduled_date: deviceDate, category: "todo", source: "manual", completed: false, estimated_minutes: 25, focus_sessions: 1 }));
    const inserted = await client.from("tasks").insert(tasks).select("id");
    if (inserted.error || inserted.data?.length !== 2) throw new Error("Could not create isolated, temporary focus acceptance tasks.");
    temporaryTaskIds.push(...inserted.data.map((row) => row.id));
    const previous = await client.from("active_user_sessions").select("payload").eq("user_id", userId).eq("session_type", "focus").maybeSingle();
    if (previous.error) throw new Error(`Could not inspect the existing focus session: ${previous.error.message}`);
    const browser = await chromium.launch({ headless: true });
    let context;
    try {
      context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const realUiCall = async (kind, click) => {
        const pending = page.waitForResponse((res) => res.url().includes("/functions/v1/ai-chat-reply") && res.request().postDataJSON()?.focusRequest?.kind === kind, { timeout: 75_000 });
        await click();
        const res = await pending;
        assert.equal(new URL(res.url()).origin, new URL(url).origin, "APP must use the canonical Supabase project");
        assert.equal(res.status(), 200, `Actual APP ${kind} HTTP status`);
        const data = await res.json();
        assert.match(data.modelVersion, /focus-v2$/);
        const request = res.request().postDataJSON().focusRequest;
        validateFocusOutput(JSON.stringify(data.output), request, "zh", kind === "encouragement" ? evidence : []);
        console.log(`Actual logged-in APP: ${kind} returned a validated real-model response.`);
        return data;
      };
      let sandboxedSessionCalls = 0;
      await page.route("**/rest/v1/active_user_sessions*", async (route) => {
        sandboxedSessionCalls += 1;
        const read = route.request().method() === "GET";
        await route.fulfill({ status: read ? 200 : 204, contentType: "application/json", body: read ? "[]" : "" });
      });
      await page.goto(process.env.NAVA_FOCUS_UI_URL, { waitUntil: "domcontentloaded" });
      if (process.env.NAVA_EXPECTED_MAIN_SHA) {
        const assetUrl = await page.locator('script[type="module"][src]').first().getAttribute("src");
        const asset = await page.request.get(new URL(assetUrl, process.env.NAVA_FOCUS_UI_URL).href);
        assert.equal(asset.status(), 200);
        assert.equal(createHash("sha256").update(await asset.body()).digest("hex"), process.env.NAVA_EXPECTED_MAIN_SHA.toLowerCase());
        console.log("Public main bundle matches the verified source artifact by SHA-256.");
      }
      const launch = page.locator(".launch-sequence");
      if (await launch.isVisible().catch(() => false)) await launch.click();
      const form = page.locator(".auth-form--signIn");
      await expect(form).toBeVisible({ timeout: 20_000 });
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password);
      await form.locator('button[type="submit"]').click();
      await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
      await page.goto(`${process.env.NAVA_FOCUS_UI_URL}#tab=record&module=focus`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".focus-todo-list")).toContainText(tasks[0].title, { timeout: 20_000 });
      const priority = await realUiCall("priority", () => page.locator(".focus-ai-priority-button").click());
      await expect(page.locator(".focus-ai-priority-result")).toContainText(priority.advice.basis);
      await page.locator(".focus-task-field input").fill(tasks[0].title);
      const difficulty = await realUiCall("difficulty", () => page.getByRole("button", { name: "询问 AI 难度", exact: true }).click());
      await expect(page.locator(".focus-ai-assessment p")).toHaveText(difficulty.reply);
      await page.locator(".focus-summary-start").click();
      await expect(page.locator('[data-module-view="focus-immersive"]')).toBeVisible();
      const cue = await realUiCall("starting_cue", () => page.getByRole("button", { name: "AI 进入状态", exact: true }).click());
      await expect(page.locator(".focus-guide-ai-cue")).toHaveText(cue.reply);
      await page.locator(".focus-guide-close").click();
      await page.getByRole("button", { name: "开始", exact: true }).click();
      const live = await realUiCall("encouragement", () => page.getByRole("button", { name: "获取计时中的 AI 鼓励" }).click());
      await expect(page.locator(".focus-encouragement-panel")).toContainText(live.reply);
      const evidenceDir = process.env.NAVA_FOCUS_EVIDENCE_DIR;
      if (evidenceDir) {
        await mkdir(evidenceDir, { recursive: true });
        await page.screenshot({ path: `${evidenceDir}/focus-real-model-390.png` });
      }
      await page.getByRole("button", { name: "重置" }).click();
      await page.clock.install({ time: new Date() });
      let modelUiCalls = 0;
      const uiPrompts = [];
      await page.route("**/functions/v1/ai-chat-reply", async (route) => {
        modelUiCalls += 1;
        uiPrompts.push(route.request().postDataJSON()?.focusRequest);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(live) });
      });
      await page.getByRole("button", { name: "开始" }).click();
      await expect(page.locator('[data-focus-state="running"]')).toBeVisible();
      await page.getByRole("button", { name: "获取计时中的 AI 鼓励" }).click();
      const panel = page.getByRole("region", { name: "计时中的 AI 鼓励" });
      await expect(panel).toBeVisible();
      await expect(panel.getByText(live.reply, { exact: true })).toBeVisible();
      await expect(panel.locator(".focus-encouragement-sources span")).toHaveCount(evidence.length);
      await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
      for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
        await page.setViewportSize(viewport);
        const bounds = await panel.boundingBox();
        if (!bounds || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > viewport.width + 1 || bounds.y + bounds.height > viewport.height + 1) {
          throw new Error(`AI cue panel exceeded the ${viewport.width}x${viewport.height} viewport.`);
        }
      }
      const auto = panel.getByRole("switch");
      await auto.click();
      await expect(auto).toHaveAttribute("aria-checked", "true");
      if (modelUiCalls !== 1) throw new Error("Automatic encouragement fired immediately instead of after the interval.");
      await page.clock.fastForward(15 * 60 * 1000 + 1_000);
      await expect.poll(() => modelUiCalls, { timeout: 10_000 }).toBe(2);
      if (uiPrompts[1]?.elapsedMinutes !== 15) throw new Error("Countdown focus time was not passed to the automatic AI cue.");
      await page.getByRole("button", { name: "暂停", exact: true }).click();
      await page.clock.fastForward(15 * 60 * 1000 + 1_000);
      if (modelUiCalls !== 2) throw new Error("A paused timer requested an automatic AI cue.");
      await page.getByRole("button", { name: "重置" }).click();
      await expect(page.locator('[data-focus-state="ready"]')).toBeVisible();
      await page.getByRole("button", { name: "正计时" }).click();
      await page.getByRole("button", { name: "开始", exact: true }).click();
      await page.getByRole("button", { name: "获取计时中的 AI 鼓励" }).click();
      await expect.poll(() => modelUiCalls, { timeout: 10_000 }).toBe(3);
      const secondAuto = page.getByRole("region", { name: "计时中的 AI 鼓励" }).getByRole("switch");
      await expect(secondAuto).toHaveAttribute("aria-checked", "false");
      await secondAuto.click();
      for (let index = 0; index < 4; index += 1) {
        await page.clock.fastForward(15 * 60 * 1000 + 1_000);
        await expect.poll(() => modelUiCalls, { timeout: 10_000 }).toBe(4 + index);
      }
      await expect(secondAuto).toHaveAttribute("aria-checked", "false");
      await page.clock.fastForward(15 * 60 * 1000 + 1_000);
      if (modelUiCalls !== 7) throw new Error("The four-cue per-session cap did not stop later automatic requests.");
      await page.getByRole("button", { name: "重置" }).click();
      await expect(page.locator('[data-focus-state="ready"]')).toBeVisible();
      if (sandboxedSessionCalls < 1) throw new Error("Focus session REST sandbox was not exercised.");
      console.log(`Authenticated browser UI: manual cue, consented evidence labels, opt-in 15-minute cue, pause/reset boundaries, four-cue cap, and four mobile viewports passed; ${sandboxedSessionCalls} cloud-session calls sandboxed, pre-existing focus session preserved; no focus record saved.`);
    } finally {
      await context?.close();
      await browser.close();
    }
    const after = await client.from("active_user_sessions").select("payload").eq("user_id", userId).eq("session_type", "focus").maybeSingle();
    if (after.error) throw new Error("Could not verify preservation of the pre-existing focus session.");
    assert.deepEqual(after.data, previous.data);
  }
} finally {
  try {
    if (temporaryTaskIds.length) {
      const cleanup = await client.from("tasks").delete().in("id", temporaryTaskIds).select("id");
      if (cleanup.error || cleanup.data?.length !== temporaryTaskIds.length) throw new Error("Exact temporary focus test tasks require cleanup.");
      console.log(`Removed ${temporaryTaskIds.length} exact temporary acceptance tasks; existing tasks and focus records untouched.`);
    }
  } finally { await client.auth.signOut({ scope: "local" }); }
}
