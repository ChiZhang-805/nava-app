import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const output = "Q:/NAVA-Workspace/Build/TestRuns/external-events-current";
const userId = "00000000-0000-4000-8000-000000000001";
const viewports = [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
applyProjectPublicEnv(root);
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5219, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of [{ width: 1365, height: 1000 }, ...viewports]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport, deviceScaleFactor: 1 });
    try {
      await context.addInitScript(({ userId }) => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
        const journalSettings = JSON.parse(localStorage.getItem("nava.review.demo.journal-settings.v1") ?? "{}");
        localStorage.setItem("nava.review.demo.journal-settings.v1", JSON.stringify({ ...journalSettings,
          "fluffy-first-guide-sleep": true, "fluffy-first-guide-sport": true, "fluffy-first-guide-mood": true,
          "fluffy-first-guide-focus": true, "fluffy-first-guide-food": true, "fluffy-first-guide-face": true,
        }));
        const date = new Date().toLocaleDateString("en-CA");
        localStorage.setItem(`nava-growth-activities:${userId}:${date}:v1`, JSON.stringify(["checkin"]));
        localStorage.setItem("nava-demo-growth-reward-ledger:v1", JSON.stringify([
          "profile:profile-foundation", "profile:profile-goal", `${date}:checkin`, `${date}:share`, `${date}:ai`,
          `${date}:sleep`, `${date}:exercise`, `${date}:mood`, `${date}:nutrition`, `${date}:focus`, `${date}:face`,
        ]));
      }, { userId });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const open = async module => {
        await page.goto(`http://127.0.0.1:5219/?demo=1#tab=record&module=${module}`, { waitUntil: "domcontentloaded" });
        const launch = page.locator(".launch-sequence");
        if (await launch.isVisible().catch(() => false)) await launch.click();
        await expect(page.locator(".journal-experience iframe")).toBeVisible();
        await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 20_000 });
        await expect(page.locator(".journal-loading.is-error")).toHaveCount(0);
        return page.frameLocator(".journal-experience iframe");
      };
      const desktop = viewport.width > 700;
      const trigger = async reason => {
        if (desktop) {
          await expect(page.locator(`[data-preview-event="${reason}"]`)).toBeEnabled();
        } else {
          await expect(page.locator('[data-preview-only="focus-event-simulator"]')).toBeHidden();
        }
        const accepted = await page.evaluate(async value => (await import("/src/services/previewEnvironment.ts")).simulatePreviewInterruption(value), reason);
        assert.equal(accepted, true, `${reason}: visible journal activity must accept the external interruption`);
        await page.waitForTimeout(100);
      };

      const focus = await open("focus");
      await expect(focus.locator("#screen")).toHaveAttribute("data-scene", "entry");
      await focus.locator("#field-task").fill("整理上线检查清单");
      await focus.locator("#field-durationMinutes").fill("25");
      await focus.locator("#confirm-entry").click();
      await expect(focus.locator("#focus-page")).toBeVisible();
      await expect(focus.locator("#timer-pause")).toHaveAttribute("aria-label", "暂停");
      const journalBefore = await page.evaluate(() => localStorage.getItem("nava.review.demo.journal.v1"));
      for (const reason of ["call", "message", "other"]) {
        await page.waitForTimeout(1_050);
        await trigger(reason);
        await expect(focus.locator("#timer-pause")).toHaveAttribute("aria-label", "继续");
        const paused = await focus.locator("#timer-time").textContent();
        await page.waitForTimeout(1_150);
        assert.equal(await focus.locator("#timer-time").textContent(), paused, `${reason}: interruption must freeze the active focus timer`);
        assert.equal(await page.evaluate(() => localStorage.getItem("nava.review.demo.journal.v1")), journalBefore, `${reason}: interruption must not save a record`);
        await focus.locator("#timer-pause").click();
        await expect(focus.locator("#timer-pause")).toHaveAttribute("aria-label", "暂停");
      }
      if (desktop) await page.screenshot({ path: path.join(output, `focus-${viewport.width}.png`) });
      await expect.poll(() => page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem("nava.review.demo.journal-settings.v1") ?? "{}");
        return settings["fluffy-active-focus-v1"]?.timer?.state ?? null;
      })).toBe("running");
      await page.goto("http://127.0.0.1:5219/?demo=1#tab=today", { waitUntil: "domcontentloaded" });
      await open("focus");
      const restored = page.frameLocator(".journal-experience iframe");
      await expect(restored.locator("#focus-page")).toBeVisible();
      await expect(restored.locator("#timer-pause")).toHaveAttribute("aria-label", "继续");

      await page.evaluate(() => {
        const key = "nava.review.demo.journal-settings.v1";
        const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
        delete settings["fluffy-active-focus-v1"];
        localStorage.setItem(key, JSON.stringify(settings));
      });
      const sleep = await open("sleep");
      await expect(sleep.locator("#screen")).toHaveAttribute("data-scene", "entry");
      await expect(sleep.locator("#entry-form")).toHaveAttribute("data-category", "sleep");
      await trigger("call");
      await expect(page.locator(".journal-loading.is-error")).toHaveCount(0);
      assert.equal(await page.evaluate(() => localStorage.getItem("nava.review.demo.journal.v1")), journalBefore, "sleep interruption must not save a record");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      results.push({ viewport, focus: "pause/resume/reload", sleep: "loads and interrupts without save", noJournalWrites: true });
      console.log(`External events ${viewport.width}x${viewport.height}: passed`);
    } finally {
      await context.close();
    }
  }
  await writeFile(path.join(output, "acceptance.json"), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await server.close();
}
