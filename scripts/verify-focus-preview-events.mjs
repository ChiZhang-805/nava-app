import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-pdf-requirements-review-20260914";
const demoUserId = "00000000-0000-4000-8000-000000000001";

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5218 }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "http://127.0.0.1:5218";
const browser = await chromium.launch({ headless: true });

async function openFocus(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(({ userId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v2.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
  }, { userId: demoUserId });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?demo=1#tab=record&module=focus`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible();
  return { context, page };
}

try {
  const { context, page } = await openFocus({ width: 1365, height: 1000 });
  await expect(page.locator('[data-preview-only="focus-event-simulator"]')).toHaveCount(0);
  await page.locator('.focus-summary-start[aria-label="开始专注"]').click();
  await expect(page.locator('[data-module-view="focus-immersive"]')).toBeVisible();
  const simulator = page.locator('[data-preview-only="focus-event-simulator"]');
  await expect(simulator).toBeVisible();
  await expect(simulator.locator("button:enabled")).toHaveCount(0);
  await page.screenshot({ path: path.join(outputDir, "focus-preview-ready.png") });
  await page.locator('[data-module-view="focus-immersive"] [aria-label="开始"]').click();
  await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "running");

  for (const reason of ["call", "message", "distraction", "other"]) {
    await expect(simulator.locator(`[data-preview-event="${reason}"]`)).toBeEnabled();
    await simulator.locator(`[data-preview-event="${reason}"]`).click();
    const interruption = page.locator('.focus-interruption[data-preview-interruption="true"]');
    await expect(interruption).toBeVisible();
    await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "paused");
    await expect(interruption.locator("p")).toContainText("不会真实拨号");
    const draft = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((entry) => entry.startsWith("nava-focus-timer:"));
      return key ? JSON.parse(sessionStorage.getItem(key) ?? "null") : null;
    });
    assert.equal(draft?.interruptions, 0, `${reason}: simulated event must not count as a real interruption`);
    assert.deepEqual(draft?.interruptionReasons, { message: 0, call: 0, distraction: 0, other: 0 });
    if (reason === "call") {
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(outputDir, "focus-preview-call.png") });
    }
    await interruption.getByRole("button", { name: "继续专注" }).click();
    await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "running");
    await page.waitForTimeout(1_550);
  }
  await context.close();

  for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const { context: mobileContext, page: mobilePage } = await openFocus(viewport);
    await mobilePage.locator('.focus-summary-start[aria-label="开始专注"]').click();
    await expect(mobilePage.locator('[data-preview-only="focus-event-simulator"]')).toBeHidden();
    const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${viewport.width}x${viewport.height}: horizontal overflow ${overflow}px`);
    await mobileContext.close();
  }
  console.log("focus preview events: 4 desktop simulations and 4 mobile viewport boundaries passed");
} finally {
  await browser.close();
  await server.close();
}
