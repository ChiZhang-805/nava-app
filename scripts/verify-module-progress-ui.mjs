import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-module-progress-20260903";
const port = 5198;
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    });
    await context.addInitScript(() => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
      localStorage.setItem("nava.review.demo.records.v1", JSON.stringify({
        sleeps: {},
        exercises: {},
        nutritions: {
          [date]: {
            id: `partial-diet-${date}`,
            record_date: date,
            total_calories: 360,
            breakfast_items: [{ name: "燕麦", calories: 360, amount: "1 碗" }],
            lunch_items: [],
            dinner_items: [],
            pantry_items: [],
            protein_grams: 16,
            carbohydrate_grams: 52,
            fat_grams: 9,
            hydration_ml: 300,
            health_rating: 4,
            ai_feedback: null,
          },
        },
        focus: {},
        faces: {},
      }));
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true });
    });

    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${baseUrl}?demo=1#tab=today`, { waitUntil: "networkidle" });
    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();
    await expect(page.locator(".option-two-home")).toBeVisible();
    const reward = page.locator(".reward-celebration-layer");
    if (await reward.isVisible().catch(() => false)) await reward.locator("button").click();

    const home = page.locator(".option-two-home");
    const homeBox = await home.boundingBox();
    if (!homeBox) throw new Error(`${viewport.name}: Today screen has no swipe bounds.`);
    const x = homeBox.x + homeBox.width * .5;
    const startY = homeBox.y + homeBox.height * .78;
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x + 4, startY - Math.max(150, homeBox.height / 5), { steps: 8 });
    await page.mouse.up();
    await expect(home).toHaveAttribute("data-health-menu-open", "true");
    await page.waitForTimeout(820);

    const diet = page.locator(".option-two-health-entry--diet");
    await expect(diet).toHaveAttribute("data-module-progress", "0.25");
    await expect(diet).toHaveAttribute("data-module-state", "partial");
    const homeGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const entries = [...document.querySelectorAll(".option-two-health-entry")].map((entry) => {
        const button = entry.getBoundingClientRect();
        const ring = entry.querySelector(".module-progress-ring")?.getBoundingClientRect();
        return {
          state: entry.getAttribute("data-module-state"),
          progress: entry.getAttribute("data-module-progress"),
          button: { left: button.left, right: button.right, top: button.top, bottom: button.bottom, width: button.width, height: button.height },
          ring: ring ? { left: ring.left, right: ring.right, top: ring.top, bottom: ring.bottom, width: ring.width, height: ring.height } : null,
        };
      });
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        frame: frame ? { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom } : null,
        entries,
      };
    });
    if (homeGeometry.overflow > 1 || !homeGeometry.frame || homeGeometry.entries.length !== 6) {
      throw new Error(`${viewport.name}: invalid Today progress layout ${JSON.stringify(homeGeometry)}`);
    }
    for (const entry of homeGeometry.entries) {
      if (!entry.ring
        || Math.abs((entry.ring.left + entry.ring.right - entry.button.left - entry.button.right) / 2) > 1
        || Math.abs((entry.ring.top + entry.ring.bottom - entry.button.top - entry.button.bottom) / 2) > 1
        || entry.ring.left < homeGeometry.frame.left - 1
        || entry.ring.right > homeGeometry.frame.right + 1
        || entry.ring.top < homeGeometry.frame.top - 1
        || entry.ring.bottom > homeGeometry.frame.bottom + 1) {
        throw new Error(`${viewport.name}: a Today progress ring is misaligned or clipped ${JSON.stringify(entry)}`);
      }
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-today-progress.png`) });

    await page.locator('[data-tab="record"]').click();
    const hubDiet = page.locator('[data-record-module="diet"]');
    await expect(hubDiet).toHaveAttribute("data-record-state", "partial");
    await expect(hubDiet).toHaveAttribute("data-module-progress", "0.25");
    await expect(page.locator(".record-module-entry .module-progress-ring")).toHaveCount(6);
    await page.waitForTimeout(620);
    const hubOverflow = await page.locator(".phone-frame").evaluate((frame) => frame.scrollWidth - frame.clientWidth);
    if (hubOverflow > 1) throw new Error(`${viewport.name}: record hub has ${hubOverflow}px horizontal overflow.`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-record-progress.png`) });

    await hubDiet.click();
    await expect(page.locator('[data-record-detail="diet"] .record-editor-stack > form:not([hidden])')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toContain("view=editor");
    await page.waitForTimeout(620);
    const detailOverflow = await page.locator(".phone-frame").evaluate((frame) => frame.scrollWidth - frame.clientWidth);
    if (detailOverflow > 1) throw new Error(`${viewport.name}: partial diet editor has ${detailOverflow}px horizontal overflow.`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-partial-diet-editor.png`) });

    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    report.push({ viewport, homeGeometry, hubOverflow, detailOverflow });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Module progress visual verification passed at ${viewports.length} portrait viewports.`);
