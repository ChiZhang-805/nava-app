import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\App-Checks\\focus-preview-current";
const userId = "00000000-0000-4000-8000-000000000001";
const viewports = [
  { name: "desktop", width: 1365, height: 1000 },
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5218, strictPort: true }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "http://127.0.0.1:5218";
const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      locale: "zh-CN", viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
      isMobile: viewport.width <= 430, hasTouch: viewport.width <= 430,
    });
    await context.addInitScript(({ userId }) => {
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
      localStorage.setItem("nava.review.demo.journal-settings.v1", JSON.stringify({
        "fluffy-first-guide-focus": true,
      }));
      window.__wakeMock = { requests: 0, releases: 0 };
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => {
        window.__wakeMock.requests += 1;
        const sentinel = new EventTarget();
        sentinel.released = false;
        sentinel.release = async () => { if (!sentinel.released) { sentinel.released = true; window.__wakeMock.releases += 1; sentinel.dispatchEvent(new Event("release")); } };
        return sentinel;
      } } });
    }, { userId });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseUrl}?demo=1#tab=record&module=focus`, { waitUntil: "networkidle" });
    await expect(page.locator(".journal-loading")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('.journal-loading[role="alert"]')).toHaveCount(0);
    const journal = page.frameLocator(".journal-experience iframe");
    await expect(journal.locator('#entry-form[data-category="focus"]')).toBeVisible();
    await journal.locator("#field-task").fill("整理上线检查清单");
    await journal.locator("#field-durationMinutes").fill("25");
    await journal.locator("#confirm-entry").click();
    await expect(journal.locator("#focus-page")).toBeVisible();
    await expect(journal.locator("#timer-pause")).toHaveAttribute("aria-label", "暂停");
    await journal.locator(".journal-awake").click();
    await expect(journal.locator(".journal-awake")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => window.__wakeMock.requests)).toBe(1);
    const background = await journal.locator('#screen[data-scene="focus"]').evaluate((screen) => ({
      image: getComputedStyle(screen).backgroundImage,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      screenWidth: screen.getBoundingClientRect().width,
      viewportWidth: innerWidth,
    }));
    assert.match(background.image, /focus-ambient-gradient-v1\.png/, `${viewport.name}: dedicated focus background was not loaded`);
    assert.ok(background.overflowX <= 1 && background.screenWidth <= background.viewportWidth + 1, `${viewport.name}: focus screen overflows ${JSON.stringify(background)}`);

    const simulator = page.locator('[data-preview-only="focus-event-simulator"]');
    if (viewport.name === "desktop") {
      await expect(simulator).toBeVisible();
      await expect(simulator.locator("[data-preview-event]:enabled")).toHaveCount(3);
      await simulator.locator('[data-preview-event="call"]').click();
      await expect(journal.locator("#timer-pause")).toHaveAttribute("aria-label", "继续");
      const paused = await journal.locator("#timer-time").textContent();
      await page.waitForTimeout(1_100);
      assert.equal(await journal.locator("#timer-time").textContent(), paused, "desktop call must freeze the focus timer");
      await page.locator('[data-phone-action="end-call"]').click();
      await page.locator('[data-phone-action="app"]').click();
      await journal.locator("#timer-pause").click();
      await expect(journal.locator("#timer-pause")).toHaveAttribute("aria-label", "暂停");
    } else {
      await expect(simulator).toBeHidden();
    }
    await journal.locator(".journal-awake").click();
    await expect(journal.locator(".journal-awake")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => page.evaluate(() => window.__wakeMock.releases)).toBe(1);
    await journal.locator("#timer-stop").click();
    assert.deepEqual(errors, [], `${viewport.name}: browser errors`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
    report.push({ viewport: viewport.name, background, desktopSimulator: viewport.name === "desktop", wakeLock: await page.evaluate(() => window.__wakeMock) });
    await context.close();
    console.log(`${viewport.name}: current focus timer, background, wake lock, and preview isolation passed`);
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log("Current focus preview verification passed at desktop and four mobile viewports.");
} finally {
  await browser.close();
  await server.close();
}
