import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { applyProjectPublicEnv } from "./project-env.mjs";

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Run through the secure NAVA account launcher.");
applyProjectPublicEnv(process.cwd());
const apiUrl = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!apiUrl || !key || new URL(apiUrl).hostname.split(".")[0] !== "wxteapvwagvhhtrjrbim") {
  throw new Error("The configured public Supabase project is not canonical.");
}

const client = createClient(apiUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true });
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const marker = crypto.randomUUID().slice(0, 8);
const titles = [`四象限线上验收甲 ${marker}`, `四象限线上验收乙 ${marker}`];
let insertedIds = [];
let primaryError;
try {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.user) throw new Error("NAVA account login failed.");
  const userId = login.data.user.id;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (let index = 0; index < 2; index++) {
    const created = await client.from("tasks").insert({ id: ids[index], user_id: userId, title: titles[index], scheduled_date: date, category: "todo", source: "manual", completed: false, estimated_minutes: 25, focus_sessions: 1 }).select("id").single();
    if (created.error || !created.data) throw new Error(`Temporary public UI test task insert failed: ${created.error?.message ?? "no row"}`);
    insertedIds.push(ids[index]);
  }

  const targets = [
    ["sites", "https://nava-app-preview-cz.chizhang1031.chatgpt.site/"],
    ["pages", "https://chizhang-805.github.io/nava-app-preview/"],
  ];
  for (const [label, url] of targets) {
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const launch = page.locator(".launch-sequence");
      if (await launch.isVisible().catch(() => false)) await launch.click();
      const form = page.locator(".auth-form--signIn");
      await expect(form).toBeVisible({ timeout: 20_000 });
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password);
      await form.locator('button[type="submit"]').click();
      await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
      await page.goto(`${url}#tab=record&module=focus`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".focus-todo-list")).toContainText(titles[0], { timeout: 30_000 });
      await expect(page.locator(".focus-todo-list")).toContainText(titles[1]);
      await page.locator(".focus-quadrant-toggle").click();
      const first = page.getByRole("combobox", { name: `${titles[0]}的四象限` });
      const second = page.getByRole("combobox", { name: `${titles[1]}的四象限` });
      if (label === "sites") {
        await first.selectOption("do");
        await second.selectOption("plan");
        await expect(page.locator(".focus-quadrant-cell.is-do")).toContainText(titles[0]);
        await expect(page.locator(".focus-quadrant-cell.is-plan")).toContainText(titles[1]);
        await expect.poll(async () => {
          const result = await client.from("tasks").select("id,important,urgent").in("id", ids);
          if (result.error) throw result.error;
          const byId = new Map(result.data.map((row) => [row.id, row]));
          return JSON.stringify([[byId.get(ids[0])?.important, byId.get(ids[0])?.urgent], [byId.get(ids[1])?.important, byId.get(ids[1])?.urgent]]);
        }, { timeout: 20_000 }).toBe(JSON.stringify([[true, true], [true, false]]));
      }
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible({ timeout: 20_000 });
      if (await page.locator(".focus-quadrant-toggle").getAttribute("aria-expanded") !== "true") await page.locator(".focus-quadrant-toggle").click();
      await expect(page.getByRole("combobox", { name: `${titles[0]}的四象限` })).toHaveValue("do", { timeout: 30_000 });
      await expect(page.getByRole("combobox", { name: `${titles[1]}的四象限` })).toHaveValue("plan");
      console.log(`${label}: authenticated quadrant UI loaded and persisted after reload; private task contents omitted`);
    } finally {
      await context.close();
    }
  }
  const persisted = await client.from("tasks").select("id,important,urgent").in("id", ids);
  if (persisted.error) throw persisted.error;
  assert.equal(persisted.data.length, 2);
} catch (error) {
  primaryError = error;
} finally {
  if (insertedIds.length) {
    const cleanup = await client.from("tasks").delete().in("id", insertedIds).select("id");
    if (cleanup.error || cleanup.data?.length !== insertedIds.length) primaryError ??= new Error("Temporary public UI tasks were not fully removed.");
    else console.log(`Removed ${insertedIds.length} exact temporary public UI test tasks.`);
  }
  await browser.close();
  await client.auth.signOut();
}
if (primaryError) throw primaryError;
