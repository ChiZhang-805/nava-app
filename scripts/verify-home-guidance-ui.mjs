import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-home-guidance-v100-20260905";
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
    const actions = guidance.locator(".option-two-guidance-actions button");
    const closeGuidance = guidance.locator(".option-two-guidance-close");
    const mascot = page.locator(".nava-mascot");
    await expect(home).toHaveAttribute("data-home-phase", /^(dawn|day|evening|night)$/);
    await expect(home).not.toHaveAttribute("data-home-guidance", "loading");
    await expect(guidance).toBeVisible();
    await expect(actions).toHaveCount(2);
    await expect(closeGuidance).toBeVisible();
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

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-guidance.png`) });
    await closeGuidance.click();
    await expect(guidance).toBeHidden();
    await page.reload({ waitUntil: "networkidle" });
    await dismissRewardIfPresent(page);
    await expect(guidance).toBeVisible();
    if (viewport.name === "360x740") {
      await page.waitForTimeout(10_100);
      await expect(guidance).toBeHidden();
      await page.reload({ waitUntil: "networkidle" });
      await dismissRewardIfPresent(page);
      await expect(guidance).toBeVisible();
    }
    const preferredMotion = await mascot.getAttribute("data-context-motion");
    await mascot.click({ position: { x: 120, y: 120 } });
    await expect(mascot).toHaveAttribute("data-mascot-motion", preferredMotion);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-context-motion.png`) });

    await actions.first().click();
    await expect.poll(() => new URL(page.url()).hash).toContain("tab=record");
    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    results.push({ viewport, preferredMotion, geometry });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`Home guidance visual verification passed at ${viewports.map((item) => item.name).join(", ")}.`);
console.log(`Evidence: ${outputDir}`);
