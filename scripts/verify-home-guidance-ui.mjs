import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-home-guidance-figma-parity-v111-20260906";
const port = 5202;
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

async function login(page) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;
  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) await welcome.waitFor({ state: "hidden", timeout: 6_000 });
  for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
    await expect(onboarding).toHaveAttribute("data-onboarding-step", step);
    await page.locator(".onboarding-option-grid button").first().click();
    if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
  }
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function dismissRewardIfPresent(page) {
  const reward = page.locator(".reward-celebration-layer");
  await reward.waitFor({ state: "visible", timeout: 1_500 }).catch(() => null);
  if (await reward.isVisible().catch(() => false)) await reward.locator(".reward-celebration-card > button").click();
  await reward.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => null);
}

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const results = [];

function assertNear(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${label}: expected ${expected}±${tolerance}, got ${actual}`);
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await login(page);
    await dismissRewardIfPresent(page);

    const home = page.locator(".option-two-home");
    const guidance = page.locator(".option-two-guidance");
    const mascot = page.locator(".nava-mascot");
    await expect(home).toHaveAttribute("data-home-phase", /^(dawn|day|evening|night)$/);
    await expect(home).not.toHaveAttribute("data-home-guidance", "loading");
    await expect(guidance).toBeVisible();
    await expect(guidance.locator("p")).toHaveCount(1);
    await expect(mascot).toHaveAttribute("data-context-motion", /^(wave|tail|read|sleep|lift)$/);

    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const frame = document.querySelector(".phone-frame");
      const navButtons = [...document.querySelectorAll(".bottom-nav .nav-button")].map((element) => element.getBoundingClientRect());
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
        guidance: rect(".option-two-guidance"),
        scores: rect(".option-two-scores"),
        navTop: navButtons.length ? Math.min(...navButtons.map((box) => box.top)) : null,
      };
    });
    if ((geometry.documentOverflow ?? 0) > 1 || (geometry.frameOverflow ?? 0) > 1) throw new Error(`${viewport.name}: home guidance overflows horizontally ${JSON.stringify(geometry)}`);
    if (!geometry.guidance || geometry.guidance.left < 0 || geometry.guidance.right > viewport.width + 1) throw new Error(`${viewport.name}: guidance is clipped ${JSON.stringify(geometry)}`);
    if (geometry.scores && geometry.guidance.top < geometry.scores.bottom + 8) throw new Error(`${viewport.name}: guidance overlaps the score row ${JSON.stringify(geometry)}`);
    if (geometry.navTop != null && geometry.guidance.bottom > geometry.navTop - 8) throw new Error(`${viewport.name}: guidance collides with navigation ${JSON.stringify(geometry)}`);
    if (viewport.name === "430x932") {
      assertNear(geometry.guidance.left, 18, 2, "430x932 guidance left");
      assertNear(geometry.guidance.top, 516, 3, "430x932 guidance top");
      assertNear(geometry.guidance.width, 180, 2, "430x932 guidance width");
      assertNear(geometry.guidance.height, 90, 2, "430x932 guidance height");
      assertNear(geometry.scores.left, 18, 2, "430x932 score row left");
      assertNear(geometry.scores.top, 77, 2, "430x932 score row top");
      assertNear(geometry.scores.height, 34, 2, "430x932 score row height");
      assertNear(geometry.navTop, 830, 3, "430x932 center navigation top");
    }

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-guidance.png`) });

    const homeBox = await home.boundingBox();
    if (!homeBox) throw new Error(`${viewport.name}: home has no swipe geometry`);
    const swipeX = homeBox.x + homeBox.width * .5;
    const swipeStartY = homeBox.y + homeBox.height * .78;
    await page.mouse.move(swipeX, swipeStartY);
    await page.mouse.down();
    await page.mouse.move(swipeX + 3, swipeStartY - Math.max(150, homeBox.height * .2), { steps: 8 });
    await page.mouse.up();
    await expect(home).toHaveAttribute("data-health-menu-open", "true");
    const healthEntries = page.locator(".option-two-health-entry");
    await expect(healthEntries).toHaveCount(6);
    await healthEntries.last().waitFor({ state: "visible" });
    await page.waitForTimeout(620);
    const expandedGeometry = await page.evaluate(() => {
      const disc = document.querySelector(".option-two-health-disc")?.getBoundingClientRect();
      const mascotStage = document.querySelector(".option-two-life-stage");
      const mascot = document.querySelector(".nava-mascot");
      const mascotImage = document.querySelector(".nava-mascot > img");
      const geometryFor = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height, transform: style.transform, animation: style.animationName };
      };
      const entries = [...document.querySelectorAll(".option-two-health-entry")].map((entry) => {
        const box = entry.getBoundingClientRect();
        return { centerX: box.left + box.width / 2, centerY: box.top + box.height / 2, width: box.width, height: box.height };
      });
      return { discTop: disc?.top ?? null, entries, mascotStage: geometryFor(mascotStage), mascot: geometryFor(mascot), mascotImage: geometryFor(mascotImage) };
    });
    if (expandedGeometry.discTop == null || expandedGeometry.discTop < viewport.height * .68 || expandedGeometry.discTop > viewport.height * .76) throw new Error(`${viewport.name}: expanded glass dome misses the Figma anchor ${JSON.stringify(expandedGeometry)}`);
    if (expandedGeometry.entries.some((entry) => Math.abs(entry.width - entry.height) > 1)) throw new Error(`${viewport.name}: expanded module entries are not circular ${JSON.stringify(expandedGeometry)}`);
    if (expandedGeometry.entries.some((entry, index, entries) => index > 0 && entry.centerX <= entries[index - 1].centerX)) throw new Error(`${viewport.name}: expanded module entries are not ordered along the arc ${JSON.stringify(expandedGeometry)}`);
    if (viewport.name === "430x932") {
      assertNear(expandedGeometry.discTop, 668, 3, "430x932 expanded dome top");
      const referenceCenters = [[72, 806], [117, 748], [181, 721], [246, 721], [311, 748], [354, 806]];
      expandedGeometry.entries.forEach((entry, index) => {
        assertNear(entry.centerX, referenceCenters[index][0], 3, `430x932 expanded entry ${index + 1} x`);
        assertNear(entry.centerY, referenceCenters[index][1], 4, `430x932 expanded entry ${index + 1} y`);
        assertNear(entry.width, 52, 2, `430x932 expanded entry ${index + 1} size`);
      });
      assertNear(expandedGeometry.mascotImage.left, expandedGeometry.mascotStage.left, 1, "430x932 expanded mascot x alignment");
      assertNear(expandedGeometry.mascotImage.top, expandedGeometry.mascotStage.top, 1, "430x932 expanded mascot y alignment");
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-expanded.png`) });
    await page.waitForTimeout(500);
    await page.locator(".option-two-scores").click();
    await expect(home).toHaveAttribute("data-health-menu-open", "false");

    const preferredMotion = await mascot.getAttribute("data-context-motion");
    const mascotBox = await mascot.boundingBox();
    if (!mascotBox) throw new Error(`${viewport.name}: mascot has no interaction geometry`);
    await mascot.click({ position: { x: mascotBox.width * .5, y: mascotBox.height * .65 } });
    await expect(mascot).toHaveAttribute("data-mascot-motion", preferredMotion);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-context-motion.png`) });

    if (viewport.name === "360x740") {
      await page.waitForTimeout(10_100);
      await expect(guidance).toBeHidden();
    } else if (viewport.name === "375x812") {
      await guidance.click();
      await expect.poll(() => new URL(page.url()).hash).not.toBe("#tab=today");
    } else if (viewport.name === "390x844") {
      await page.locator('.nav-button[data-tab="record"]').click();
      await expect.poll(() => new URL(page.url()).hash).toContain("tab=record");
      await page.locator('.nav-button[data-tab="today"]').click();
      await expect.poll(() => new URL(page.url()).hash).toContain("tab=today");
      await expect(guidance).toHaveCount(0);
    } else {
      await guidance.click();
      await expect.poll(() => new URL(page.url()).hash).toContain("tab=record");
    }
    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    results.push({ viewport, preferredMotion, geometry, expandedGeometry });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`Home guidance and expanded-module visual verification passed at ${viewports.map((item) => item.name).join(", ")}.`);
console.log(`Evidence: ${outputDir}`);
