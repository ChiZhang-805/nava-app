import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "navigation-icons");
const port = 5196;
const baseUrl = `http://127.0.0.1:${port}`;
const viewports = [
  { width: 430, height: 932, label: "430x932" },
  { width: 375, height: 812, label: "375x812" },
];

await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port } });
await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({
        completed: true,
        completedAt: "2026-08-28T00:00:00.000Z",
        version: 2,
        answers: {},
        source: "local",
      }));
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });

    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();

    await page.locator('input[autocomplete="username"]').fill("13800138000");
    await page.locator('input[autocomplete="current-password"]').fill("12345678");
    await page.locator(".auth-submit").click();
    await expect(page.locator(".option-two-home")).toBeVisible();
    const shortcutToggle = page.locator(".option-two-menu-toggle");
    if (await shortcutToggle.getAttribute("aria-expanded") !== "true") {
      await shortcutToggle.click();
    }
    await expect(page.locator(".option-two-home")).toHaveClass(/shortcuts-open/);
    await page.waitForTimeout(650);

    await expect(page.locator(".option-two-health-entry")).toHaveCount(6);
    for (const name of ["exercise", "focus"]) {
      const icon = page.locator(`.option-two-health-icon--${name}`);
      await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(icon).toHaveCSS("border-radius", "0px");
      await expect(icon).toHaveCSS("box-shadow", "none");
    }

    const mascot = page.locator('[data-mascot-media-slot="true"] .figma-nav-mascot');
    await expect(mascot).toBeVisible();
    await expect(mascot).toHaveAttribute("src", /raw-01/);
    await page.screenshot({ path: path.join(outputDir, `home-${viewport.label}.png`), fullPage: true });

    await page.locator('[data-tab="ai"]').click();
    await expect(page.locator('[data-tab="ai"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-tab="ai"] [data-mascot-media-slot="true"] .figma-nav-mascot')).toHaveAttribute("src", /raw-01/);
    await page.screenshot({ path: path.join(outputDir, `ai-${viewport.label}.png`), fullPage: true });
    await context.close();
  }

  console.log(`Navigation icon verification passed for ${viewports.length} portrait viewports.`);
} finally {
  await browser.close();
  await server.close();
}
