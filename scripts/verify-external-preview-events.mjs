import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const output = "Q:/NAVA-Workspace/Build/TestRuns/external-events-v150";
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
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    try {
      await context.addInitScript(({ userId }) => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem(`nava.onboarding.v2.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
      }, { userId });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const open = async (hash) => {
        await page.goto(`http://127.0.0.1:5219/?demo=1#${hash}`, { waitUntil: "networkidle" });
        const launch = page.locator(".launch-sequence");
        if (await launch.isVisible().catch(() => false)) await launch.click();
      };
      const desktop = viewport.width > 700;
      const trigger = async (reason) => {
        if (desktop) await page.locator(`[data-preview-event="${reason}"]`).click();
        else {
          // Test the same consumer at phone sizes without exposing desktop controls.
          await expect(page.locator('[data-preview-only="focus-event-simulator"]')).toBeHidden();
          await page.evaluate(async (reason) => (await import("/src/services/previewEnvironment.ts")).simulatePreviewInterruption(reason), reason);
        }
      };
      await open("tab=record&module=exercise&view=sports");
      if (!desktop) await expect(page.locator(".nava-device-preview")).toBeHidden();
      await expect(page.locator(".sports-plan-actions")).toBeVisible();
      const panel = page.locator('[data-preview-only="focus-event-simulator"]');
      if (desktop) { await expect(panel).toHaveAttribute("data-preview-module", "exercise"); await expect(panel.locator("[data-preview-event]:enabled")).toHaveCount(0); }
      await page.getByRole("button", { name: "开始此计划", exact: true }).click();
      await expect(page.locator("[data-exercise-session]")).toHaveAttribute("data-running", "true");
      const savedHealthBefore = await page.evaluate(() => localStorage.getItem("nava.review.demo.records.v1"));
      for (const reason of ["call", "message", "other"]) {
        await page.waitForTimeout(1100);
        await trigger(reason);
        await expect(page.locator("[data-exercise-session]")).toHaveAttribute("data-running", "false");
        await expect(page.locator(`[data-preview-interruption="${reason}"]`)).toBeVisible();
        await expect(page.locator(".preview-interruption-notice")).toHaveCSS("opacity", "1");
        const paused = await page.locator(".exercise-live-progress strong").textContent();
        await page.waitForTimeout(1250);
        assert.equal(await page.locator(".exercise-live-progress strong").textContent(), paused);
        const duplicate = await page.evaluate(async () => (await import("/src/services/previewEnvironment.ts")).simulatePreviewInterruption("call"));
        assert.equal(duplicate, false);
        if (reason === "call") {
          await page.locator(".preview-interruption-notice").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `exercise-${viewport.width}.png`) });
        }
        await page.locator(".exercise-live-actions").getByRole("button", { name: "继续", exact: true }).click();
        await expect(page.locator("[data-exercise-session]")).toHaveAttribute("data-running", "true");
        await expect(page.locator(".preview-interruption-notice")).toHaveCount(0);
      }
      await trigger("call");
      await open("tab=record&module=exercise&view=sports");
      await expect(page.locator("[data-exercise-session]")).toHaveAttribute("data-running", "false");
      assert.equal(await page.evaluate(() => localStorage.getItem("nava.review.demo.records.v1")), savedHealthBefore, "interruptions never save a health record");
      await page.getByRole("button", { name: "结束并填写感受", exact: true }).click();
      await expect(page.locator('[data-record-detail="exercise"] form:not([hidden])')).toBeVisible();
      await expect(panel).toHaveAttribute("data-preview-module", "idle");
      await expect(panel.locator("[data-preview-event]:enabled")).toHaveCount(0);

      await open("tab=record&module=sleep&view=editor");
      await page.locator(".sleep-maintenance").getByRole("button", { name: "开始记录", exact: true }).click();
      const sleepKey = `nava.sleep-maintenance.v1:${userId}`;
      const sleepStart = await page.evaluate((key) => localStorage.getItem(key), sleepKey);
      assert.ok(sleepStart);
      for (const reason of ["call", "message", "other"]) {
        await trigger(reason);
        await expect(page.locator(`[data-preview-interruption="${reason}"]`)).toBeVisible();
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), sleepKey), sleepStart);
        await expect(page.locator(".preview-interruption-notice")).toContainText("不会生成夜醒次数");
        await expect(page.locator(".preview-interruption-notice")).toHaveCSS("opacity", "1");
        await page.getByRole("button", { name: "返回睡眠记录", exact: true }).scrollIntoViewIfNeeded();
        if (reason === "call") await page.screenshot({ path: path.join(output, `sleep-${viewport.width}.png`) });
        await page.getByRole("button", { name: "返回睡眠记录", exact: true }).click();
      }
      await open("tab=today");
      await expect(panel).toHaveAttribute("data-preview-module", "idle");
      await expect(panel.locator("[data-preview-event]:enabled")).toHaveCount(0);
      await open("tab=record&module=sleep&view=editor");
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), sleepKey), sleepStart);
      await expect(page.locator(".sleep-maintenance.is-active")).toBeVisible();
      await trigger("call");
      await page.getByRole("button", { name: "结束并填入", exact: true }).click();
      await expect(page.locator(".preview-interruption-notice")).toHaveCount(0);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), sleepKey), null);
      assert.equal(await page.evaluate(() => localStorage.getItem("nava.review.demo.records.v1")), savedHealthBefore);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      if (desktop) {
        for (const width of [700, 900, 901, 1091, 1365]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.waitForTimeout(200);
          const boxes = await page.evaluate(() => {
            const phone = document.querySelector(".phone-frame").getBoundingClientRect();
            const panel = document.querySelector('[data-preview-only="focus-event-simulator"]').getBoundingClientRect();
            return { phoneRight: phone.right, panelLeft: panel.left, right: panel.right, width: innerWidth };
          });
          assert.ok(boxes.panelLeft > boxes.phoneRight && boxes.right <= boxes.width, JSON.stringify(boxes));
        }
      }
      results.push({ viewport, exercise: "pause/resume/reload/review only", sleep: "preserve/return/reload/review only", noHealthWrites: true });
      console.log(`External events ${viewport.width}x${viewport.height}: passed`);
    } finally { await context.close(); }
  }
  await writeFile(path.join(output, "acceptance.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); await server.close(); }
