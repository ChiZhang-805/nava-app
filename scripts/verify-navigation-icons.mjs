import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.NAVA_TEST_OUTPUT ?? path.join(root, "artifacts", "navigation-icons");
const port = 5196;
const baseUrl = `http://127.0.0.1:${port}`;
const viewports = [
  { width: 360, height: 740, label: "360x740" },
  { width: 375, height: 812, label: "375x812" },
  { width: 390, height: 844, label: "390x844" },
  { width: 430, height: 932, label: "430x932" },
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
    const reward = page.locator(".reward-celebration-layer");
    if (await reward.isVisible().catch(() => false)) {
      await reward.locator(".reward-celebration-card > button").click();
      await expect(reward).toBeHidden();
    }
    await page.waitForTimeout(900);
    await expect(page.locator(".option-two-home")).not.toHaveClass(/is-health-menu-open/);
    await expect(page.locator(".option-two-health-menu")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".option-two-health-entry").first()).toHaveCSS("pointer-events", "none");

    const collapsedDock = await page.locator(".bottom-nav").evaluate((nav) => {
      const home = nav.closest(".phone-frame--option2")?.getBoundingClientRect();
      const style = getComputedStyle(nav, "::before");
      return home ? {
        left: Number.parseFloat(style.left),
        right: Number.parseFloat(style.right),
        height: Number.parseFloat(style.height),
        radius: Number.parseFloat(style.borderTopLeftRadius),
        width: home.width - Number.parseFloat(style.left) - Number.parseFloat(style.right),
      } : null;
    });
    if (!collapsedDock || collapsedDock.width < viewport.width * 0.88 || collapsedDock.height < 68 || collapsedDock.radius < 30) {
      throw new Error(`${viewport.label}: collapsed dock must remain a low rounded capsule ${JSON.stringify(collapsedDock)}`);
    }
    await page.screenshot({ path: path.join(outputDir, `home-collapsed-${viewport.label}.png`), fullPage: true });

    const shortcutToggle = page.locator(".option-two-menu-toggle");
    if (await shortcutToggle.getAttribute("aria-expanded") !== "true") {
      await shortcutToggle.click();
    }
    await expect(page.locator(".option-two-home")).toHaveClass(/shortcuts-open/);
    await page.waitForTimeout(650);

    await expect(page.locator(".option-two-health-entry")).toHaveCount(6);
    const homeBounds = await page.locator(".option-two-home").boundingBox();
    if (!homeBounds) throw new Error(`${viewport.label}: home bounds unavailable`);
    await page.mouse.move(homeBounds.x + homeBounds.width / 2, homeBounds.y + homeBounds.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(homeBounds.x + homeBounds.width / 2, homeBounds.y + homeBounds.height * 0.54, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".option-two-home")).toHaveClass(/is-health-menu-open/);
    await page.waitForTimeout(650);

    const healthIconSources = await page.locator("[data-health-icon]").evaluateAll((icons) => icons.map((icon) => icon.getAttribute("src")));
    if (new Set(healthIconSources).size !== 6) {
      throw new Error(`${viewport.label}: the health wheel must render six distinct module icons`);
    }
    for (const name of ["exercise", "diet", "sleep", "face", "focus", "mood"]) {
      const icon = page.locator(`.option-two-health-icon--${name}`);
      await expect(icon).toBeVisible();
      await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(icon).toHaveCSS("border-radius", "0px");
      await expect(icon).toHaveCSS("box-shadow", "none");
    }
    const obscuredHealthEntries = await page.locator(".option-two-health-entry").evaluateAll((entries) => entries.flatMap((entry) => {
      const rect = entry.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit?.closest(".option-two-health-entry") === entry ? [] : [entry.getAttribute("data-health-module")];
    }));
    if (obscuredHealthEntries.length > 0) {
      throw new Error(`${viewport.label}: health entries are obscured ${JSON.stringify(obscuredHealthEntries)}`);
    }
    const healthEntryGeometry = await page.locator(".option-two-health-entry").evaluateAll((entries) => entries.map((entry) => {
      const home = entry.closest(".option-two-home")?.getBoundingClientRect();
      const rect = entry.getBoundingClientRect();
      return home ? {
        module: entry.getAttribute("data-health-module"),
        centerX: (rect.left + rect.width / 2 - home.left) / home.width,
        centerY: (rect.top + rect.height / 2 - home.top) / home.height,
        width: rect.width,
        height: rect.height,
      } : null;
    }));
    if (healthEntryGeometry.some((entry) => !entry || Math.abs(entry.width - entry.height) > 0.75)) {
      throw new Error(`${viewport.label}: every expanded module control must remain circular ${JSON.stringify(healthEntryGeometry)}`);
    }
    const byModule = Object.fromEntries(healthEntryGeometry.map((entry) => [entry.module, entry]));
    for (const [left, right] of [["exercise", "mood"], ["diet", "focus"], ["sleep", "face"]]) {
      if (Math.abs(byModule[left].centerY - byModule[right].centerY) > 0.004) {
        throw new Error(`${viewport.label}: ${left}/${right} must share one arc level ${JSON.stringify(healthEntryGeometry)}`);
      }
    }
    if (!(byModule.sleep.centerY < byModule.diet.centerY && byModule.diet.centerY < byModule.exercise.centerY)) {
      throw new Error(`${viewport.label}: six module controls must follow the rising circular fan arc ${JSON.stringify(healthEntryGeometry)}`);
    }
    const discGeometry = await page.locator(".option-two-health-disc").evaluate((disc) => {
      const home = disc.closest(".option-two-home")?.getBoundingClientRect();
      const rect = disc.getBoundingClientRect();
      return home ? { topRatio: (rect.top - home.top) / home.height, widthRatio: rect.width / home.width } : null;
    });
    if (!discGeometry || discGeometry.topRatio < 0.707 || discGeometry.topRatio > 0.713 || discGeometry.widthRatio < 1.19 || discGeometry.widthRatio > 1.21) {
      throw new Error(`${viewport.label}: health disc geometry drifted ${JSON.stringify(discGeometry)}`);
    }
    const discCenterRatio = discGeometry.topRatio + ((discGeometry.widthRatio * homeBounds.width) / 2 / homeBounds.height);
    if (discCenterRatio < 0.985 || discCenterRatio > 1.01) {
      throw new Error(`${viewport.label}: health disc must emerge from a circle centered at the lower edge ${discCenterRatio.toFixed(3)}`);
    }

    const dockGeometry = await page.locator(".bottom-nav .nav-button").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { tab: button.getAttribute("data-tab"), centerY: rect.top + rect.height / 2 };
    }));
    const dockCenters = dockGeometry.map(({ centerY }) => centerY);
    if (Math.max(...dockCenters) - Math.min(...dockCenters) > 0.75) {
      throw new Error(`${viewport.label}: dock button centers are not on one horizontal line ${JSON.stringify(dockGeometry)}`);
    }

    const aiGeometry = await page.locator('[data-tab="ai"]').evaluate((button) => {
      const buttonRect = button.getBoundingClientRect();
      const orb = button.querySelector(".ai-nav-orb")?.getBoundingClientRect();
      const icon = button.querySelector(".figma-nav-ai-chat")?.getBoundingClientRect();
      return orb && icon ? {
        button: { width: buttonRect.width, height: buttonRect.height },
        orb: { width: orb.width, height: orb.height },
        icon: { width: icon.width, height: icon.height },
        glyphRatio: icon.width / orb.width,
      } : null;
    });
    if (!aiGeometry || Math.abs(aiGeometry.orb.width - aiGeometry.orb.height) > 0.75) {
      throw new Error(`${viewport.label}: AI orb is not circular ${JSON.stringify(aiGeometry)}`);
    }
    if (aiGeometry.glyphRatio < 0.4 || aiGeometry.glyphRatio > 0.48) {
      throw new Error(`${viewport.label}: AI glyph ratio ${aiGeometry.glyphRatio.toFixed(3)} is outside the intended optical size`);
    }
    await page.screenshot({ path: path.join(outputDir, `home-expanded-${viewport.label}.png`), fullPage: true });

    await page.locator('[data-tab="ai"]').click();
    await expect(page.locator('[data-tab="ai"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-tab="ai"] .figma-nav-ai-chat')).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, `ai-${viewport.label}.png`), fullPage: true });
    await context.close();
  }

  console.log(`Navigation icon verification passed for ${viewports.length} portrait viewports.`);
} finally {
  await browser.close();
  await server.close();
}
