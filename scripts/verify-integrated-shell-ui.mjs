import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());

const output = "Q:/NAVA-Workspace/Build/TestRuns/integrated-shell";
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const pages = [
  ["home", "tab=today"],
  ["records", "tab=record"],
  ["chat", "tab=ai"],
  ["growth", "tab=trends"],
  ["profile", "tab=profile"],
  ["profile-personal", "tab=profile&view=personal"],
  ["profile-skin", "tab=profile&view=skin"],
  ["profile-account", "tab=profile&view=account"],
  ["profile-health", "tab=profile&view=health"],
  ["profile-watch", "tab=profile&view=watch"],
  ["profile-privacy", "tab=profile&view=privacy"],
  ["calendar", "tab=today&view=calendar"],
  ["daily-record", "tab=today&view=day-2026-10-09"],
  ["body-profile", "tab=today&view=profile-details"],
  ["notifications", "tab=today&view=notifications"],
  ["reminder-settings", "tab=today&view=reminder-settings"],
  ["home-widgets", "tab=today&view=home-widgets"],
  ["today-todos", "tab=today&view=today-todos"],
  ["admin-console", "tab=today&view=admin-console"],
  ["points-shop", "tab=today&view=points-shop"],
  ["points-shop-category", "tab=today&view=points-shop-category-all"],
  ["points-shop-product", "tab=today&view=points-shop-product-preview"],
  ["points-shop-cart", "tab=today&view=points-shop-cart"],
  ["points-shop-cards", "tab=today&view=points-shop-cards"],
  ["points-shop-add-card", "tab=today&view=points-shop-add-card"],
];

assert.equal(pages.length, 25);
assert.equal(new Set(pages.map(([name]) => name)).size, 25);

await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), passed: false, results: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5262, strictPort: true }, logLevel: "silent" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const homeDockByViewport = new Map();

async function initialize(context) {
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: {} } }));
  await context.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
  });
}

const transparent = (value) => value === "rgba(0, 0, 0, 0)" || value === "transparent";

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce", locale: "zh-CN" });
    await initialize(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(`${width}x${height}: ${error.message}`));
    await page.goto(`${base}?demo=1#tab=today`, { waitUntil: "networkidle" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) await page.keyboard.press("Escape");

    for (const [name, hash] of pages) {
      await page.evaluate((nextHash) => { location.hash = nextHash; }, hash);
      const frame = page.locator(".phone-frame");
      await expect(frame).toHaveAttribute("data-shell-integrated", "true", { timeout: 20000 });
      await expect(frame).toHaveAttribute("data-shell-page", name, { timeout: 20000 });
      if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) await page.keyboard.press("Escape");
      await page.waitForTimeout(80);

      const geometry = await frame.evaluate((root) => {
        const paint = (element, pseudo = null) => {
          if (!element) return null;
          const style = getComputedStyle(element, pseudo);
          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            borderTopWidth: style.borderTopWidth,
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            content: style.content,
            height: style.height,
            left: style.left,
            right: style.right,
            top: style.top,
            backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
          };
        };
        const visible = (element) => element && element.getBoundingClientRect().height > 0 && getComputedStyle(element).display !== "none";
        const localHeaders = [...root.querySelectorAll(".home-experience-header, .home-widget-editor-header, .notification-center-header, .admin-console-header, .points-shop-header")]
          .filter(visible)
          .map((element) => paint(element));
        const appContent = root.querySelector(".app-content");
        const appContentStyle = appContent ? getComputedStyle(appContent) : null;
        const dock = root.querySelector(":scope > .bottom-nav");
        const dockRect = visible(dock) ? dock.getBoundingClientRect() : null;
        const dockButtons = visible(dock)
          ? [...dock.querySelectorAll(":scope > .nav-button")].filter(visible).map((button) => {
              const rect = button.getBoundingClientRect();
              return {
                left: rect.left,
                right: rect.right,
                width: rect.width,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                orbWidth: button.querySelector(".ai-nav-orb")?.getBoundingClientRect().width ?? null,
                orbHeight: button.querySelector(".ai-nav-orb")?.getBoundingClientRect().height ?? null,
              };
            })
          : [];
        return {
          frameOverflow: root.scrollWidth - root.clientWidth,
          contentOverflow: appContent ? appContent.scrollWidth - appContent.clientWidth : 0,
          scrollbarWidth: appContent ? getComputedStyle(appContent).scrollbarWidth : "",
          contentPaddingTop: appContentStyle ? parseFloat(appContentStyle.paddingTop) : 0,
          globalHeader: paint(root.querySelector(":scope > .figma-app-header")),
          localHeaders,
          dock: visible(dock) ? paint(dock) : null,
          dockFrost: visible(dock) ? paint(dock, "::before") : null,
          dockRect: dockRect ? { top: dockRect.top, height: dockRect.height } : null,
          dockButtons,
          isHomeDock: root.classList.contains("phone-frame--option2"),
        };
      });

      assert.ok(geometry.frameOverflow <= 1, `${width}x${height} ${name}: frame overflow ${geometry.frameOverflow}`);
      assert.ok(geometry.contentOverflow <= 1, `${width}x${height} ${name}: content overflow ${geometry.contentOverflow}`);
      assert.equal(geometry.scrollbarWidth, "none", `${width}x${height} ${name}: scrollbar chrome must be hidden`);
      if (geometry.globalHeader) {
        const headerHeight = parseFloat(geometry.globalHeader.height);
        assert.ok(headerHeight >= 48 && headerHeight <= 52.5, `${width}x${height} ${name}: global header height ${headerHeight}px is outside the compact contract`);
        assert.ok(geometry.contentPaddingTop <= 7.5, `${width}x${height} ${name}: first-module gap ${geometry.contentPaddingTop}px is too large`);
      }
      for (const header of geometry.localHeaders) {
        assert.ok(parseFloat(header.height) <= 50.5, `${width}x${height} ${name}: local header height ${header.height} is too large`);
      }
      for (const [kind, paints] of [["global header", geometry.globalHeader ? [geometry.globalHeader] : []], ["local header", geometry.localHeaders], ["bottom navigation", geometry.dock ? [geometry.dock] : []]]) {
        for (const paint of paints) {
          assert.ok(transparent(paint.backgroundColor), `${width}x${height} ${name}: ${kind} background ${paint.backgroundColor}`);
          assert.equal(paint.backgroundImage, "none", `${width}x${height} ${name}: ${kind} has a background image`);
          assert.equal(paint.boxShadow, "none", `${width}x${height} ${name}: ${kind} has a box shadow`);
        }
      }
      if (geometry.dockFrost) {
        assert.notEqual(geometry.dockFrost.content, "none", `${width}x${height} ${name}: floating dock capsule is missing`);
        assert.match(geometry.dockFrost.borderRadius, /px|999/, `${width}x${height} ${name}: dock capsule is not rounded`);
        assert.match(geometry.dockFrost.backdropFilter, /blur\(/, `${width}x${height} ${name}: dock capsule is not frosted`);
        assert.ok(parseFloat(geometry.dockFrost.left) >= 10, `${width}x${height} ${name}: dock capsule touches the left edge`);
        assert.ok(parseFloat(geometry.dockFrost.right) >= 10, `${width}x${height} ${name}: dock capsule touches the right edge`);
        assert.ok(parseFloat(geometry.dockFrost.height) <= 74, `${width}x${height} ${name}: dock capsule is too tall`);
      }
      if (geometry.dockButtons.length) {
        assert.equal(geometry.dockButtons.length, 5, `${width}x${height} ${name}: dock must contain five buttons`);
        const centerY = geometry.dockButtons[0].centerY;
        for (const button of geometry.dockButtons) {
          assert.ok(Math.abs(button.centerY - centerY) <= 0.5, `${width}x${height} ${name}: button centers are not on one horizontal line`);
        }
        const edgeGaps = geometry.dockButtons.slice(1).map((button, index) => button.left - geometry.dockButtons[index].right);
        assert.ok(Math.min(...edgeGaps) >= 0, `${width}x${height} ${name}: dock buttons overlap`);
        assert.ok(Math.max(...edgeGaps) - Math.min(...edgeGaps) <= 0.5, `${width}x${height} ${name}: button edge gaps are not equal (${edgeGaps.join(", ")})`);
        assert.ok(
          Math.abs(geometry.dockButtons[2].orbWidth - geometry.dockButtons[2].orbHeight) <= 0.5
          && geometry.dockButtons[2].orbWidth >= geometry.dockButtons[2].width - 0.5
          && geometry.dockButtons[2].orbWidth <= geometry.dockButtons[2].width * 1.13,
          `${width}x${height} ${name}: center AI orb must fill one large circle ${JSON.stringify(geometry.dockButtons[2])}`,
        );
        if (!geometry.isHomeDock) {
          const frostCenterY = geometry.dockRect.top + geometry.dockRect.height / 2;
          assert.ok(Math.abs(centerY - frostCenterY) <= 0.5, `${width}x${height} ${name}: button center ${centerY} misses capsule center ${frostCenterY}`);
          const homeDock = homeDockByViewport.get(`${width}x${height}`);
          assert.ok(homeDock, `${width}x${height} ${name}: home dock reference is missing`);
          assert.ok(Math.abs(geometry.dockButtons[2].width - homeDock.centerWidth) <= 0.5, `${width}x${height} ${name}: center AI button must reuse the home size`);
          assert.ok(Math.abs(geometry.dockButtons[0].width - homeDock.sideWidth) <= 0.5, `${width}x${height} ${name}: side buttons must reuse the home size`);
        } else {
          homeDockByViewport.set(`${width}x${height}`, {
            centerWidth: geometry.dockButtons[2].width,
            sideWidth: geometry.dockButtons[0].width,
          });
        }
      }

      report.results.push({ viewport: `${width}x${height}`, page: name, ...geometry });
      if (width === 390) await page.screenshot({ path: `${output}/${String(pages.indexOf(pages.find(([candidate]) => candidate === name)) + 1).padStart(2, "0")}-${name}.png`, fullPage: true });
    }
    await context.close();
  }

  assert.deepEqual(report.errors, []);
  assert.equal(report.results.length, 100);
  report.passed = true;
  console.log("25 integrated pages passed across four portrait sizes (100 route states).\n");
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
