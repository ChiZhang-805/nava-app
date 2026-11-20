import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.NAVA_TEST_OUTPUT ?? path.join(root, "artifacts", "navigation-icons");
const port = Number(process.env.NAVA_ICONS_PORT || 5196);
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
const engine = process.env.NAVA_LAYOUT_ENGINE || 'chromium';
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ locale: "zh-CN",
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({
        completed: true,
        completedAt: "2026-08-28T00:00:00.000Z",
        version: 3,
        answers: {},
        source: "local",
      }));
    });
    const page = await context.newPage();
    await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
      await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
    });
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
        surfaceLeft: Number.parseFloat(style.left),
        surfaceRight: home.width - Number.parseFloat(style.right),
        height: Number.parseFloat(style.height),
        radius: Number.parseFloat(style.borderTopLeftRadius),
        opacity: Number.parseFloat(style.opacity),
        width: home.width - Number.parseFloat(style.left) - Number.parseFloat(style.right),
        bottom: nav.getBoundingClientRect().top + nav.getBoundingClientRect().height / 2 + Number.parseFloat(style.height) / 2,
      } : null;
    });
    if (!collapsedDock || collapsedDock.width < viewport.width * 0.88 || collapsedDock.height < 68 || collapsedDock.radius < 30 || collapsedDock.opacity < 0.99) {
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

    const expandedDock = await page.locator(".bottom-nav").evaluate((nav) => {
      const style = getComputedStyle(nav, "::before");
      return {
        opacity: Number.parseFloat(style.opacity),
        background: style.backgroundColor,
        borderTopColor: style.borderTopColor,
        boxShadow: style.boxShadow,
      };
    });
    if (expandedDock.opacity > 0.02 || expandedDock.boxShadow !== "none") {
      throw new Error(`${viewport.label}: expanded wheel still has a separate dock surface ${JSON.stringify(expandedDock)}`);
    }

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
    const fan = await page.locator(".option-two-health-disc").boundingBox();
    const hint = await page.locator('.home-record-shortcut-hint').boundingBox();
    const orb = await page.locator('.ai-nav-button').boundingBox();
    if (!fan || !hint || !orb) throw new Error(`${viewport.label}: missing fan/dock geometry`);
    const closingGap = orb.y - hint.y - hint.height;
    const axisY = orb.y + orb.height / 2;
    const fanHeight = axisY - fan.y;
    if (Math.abs(fan.x - homeBounds.x - collapsedDock.surfaceLeft) > 1
      || Math.abs(fan.x + fan.width - homeBounds.x - collapsedDock.surfaceRight) > 1
      || Math.abs(fan.y + fan.height - collapsedDock.bottom) > 1
      || fanHeight < 130 || fanHeight > 181 || closingGap < 10 || closingGap > 15) {
      throw new Error(`${viewport.label}: fan must share the dock edges and leave a close-button gap ${JSON.stringify({ fan, collapsedDock, fanHeight, closingGap })}`);
    }
    for (const entry of healthEntryGeometry) {
      const centerX = homeBounds.x + entry.centerX * homeBounds.width;
      const centerY = homeBounds.y + entry.centerY * homeBounds.height;
      const radius = entry.width / 2;
      const edge = Array.from({ length: 24 }, (_, i) => {
        const angle = i * Math.PI / 12;
        return Math.hypot((centerX + radius * Math.cos(angle) - fan.x - fan.width / 2) / (fan.width / 2), (axisY - centerY - radius * Math.sin(angle)) / fanHeight);
      });
      if (Math.max(...edge) > 1 || entry.width < 43.9) throw new Error(`${viewport.label} ${entry.module}: fan control leaves the curve or lacks a 44px target`);
    }

    const dockGeometry = await page.locator(".bottom-nav .nav-button").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        tab: button.getAttribute("data-tab"),
        left: rect.left,
        right: rect.right,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    }));
    const dockCenters = dockGeometry.map(({ centerY }) => centerY);
    if (Math.max(...dockCenters) - Math.min(...dockCenters) > 0.75) {
      throw new Error(`${viewport.label}: dock button centers are not on one horizontal line ${JSON.stringify(dockGeometry)}`);
    }
    const dockGaps = dockGeometry.slice(1).map((button, index) => button.left - dockGeometry[index].right);
    if (Math.max(...dockGaps) - Math.min(...dockGaps) > .75) {
      throw new Error(`${viewport.label}: dock button edge gaps are not equal ${JSON.stringify({ dockGeometry, dockGaps })}`);
    }
    const dockSurfaceGaps = [
      dockGeometry[0].left - (homeBounds.x + collapsedDock.surfaceLeft),
      ...dockGaps,
      (homeBounds.x + collapsedDock.surfaceRight) - dockGeometry.at(-1).right,
    ];
    if (Math.min(...dockSurfaceGaps) < 10 || Math.max(...dockSurfaceGaps) - Math.min(...dockSurfaceGaps) > 1.25) {
      throw new Error(`${viewport.label}: dock circles must stay inside the capsule with equal edge whitespace ${JSON.stringify({ dockGeometry, dockSurfaceGaps, collapsedDock })}`);
    }
    const secondaryOpticalSizes = [];
    for (const tab of ["today", "record", "trends", "profile"]) {
      const screenshot = await page.locator(`.nav-button[data-tab="${tab}"] .figma-nav-icon`).screenshot();
      const opticalSize = await page.evaluate(async ({ dataUrl, ratio }) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context?.drawImage(image, 0, 0);
        const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels) return 0;
        let left = canvas.width;
        let right = -1;
        let top = canvas.height;
        let bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const offset = (y * canvas.width + x) * 4;
            const alpha = pixels[offset + 3];
            const luminance = pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
            if (alpha < 24 || luminance > 145) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
        return right < left ? 0 : Math.max(right - left + 1, bottom - top + 1) / ratio;
      }, { dataUrl: `data:image/png;base64,${screenshot.toString("base64")}`, ratio: 2 });
      secondaryOpticalSizes.push(opticalSize);
    }
    if (secondaryOpticalSizes.some((size) => size < 14 || size > 23)) {
      throw new Error(`${viewport.label}: secondary navigation glyphs need to match the compact dock ${JSON.stringify({ dockGeometry, secondaryOpticalSizes })}`);
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

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fallback = page.locator('.nava-mascot-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveCSS('transform', 'none');
    await page.screenshot({ path: path.join(outputDir, `home-reduced-expanded-${viewport.label}.png`), fullPage: true });

    await page.locator('[data-tab="ai"]').click();
    await expect(page.locator(".chat-composer")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);
    await page.screenshot({ path: path.join(outputDir, `ai-${viewport.label}.png`), fullPage: true });
    await context.close();
  }

  console.log(`Navigation icon verification passed for ${viewports.length} portrait viewports.`);
} finally {
  await browser.close();
  await server.close();
}
