// Browser-only demo fixtures. No production account, notification or report writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/detail-sheets";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "silent" });
await server.listen();
const report = { passed: false, results: [], errors: [] };
try {
  for (const [engine, launcher] of Object.entries({ webkit, chromium })) {
    const browser = await launcher.launch();
    try {
      for (const locale of ["zh", "en"]) for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce", timezoneId: "Asia/Shanghai" });
        try {
          await context.addInitScript((language) => {
            sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
            localStorage.setItem("nava.locale", language);
            localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
          }, locale);
          await context.route("**/*.supabase.co/**", (route) => route.fulfill({ json: [] }));
          const page = await context.newPage();
          page.on("pageerror", (error) => report.errors.push(`${engine}/${width}/${locale}: ${error.message}`));
          const open = async (hash) => {
            await page.goto(`${server.resolvedUrls.local[0]}?demo=1&qa=weekly-ai#${hash}`, { waitUntil: "networkidle" });
            if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
            await expect(page.locator(".page-skeleton")).toHaveCount(0);
          };
          const check = async (name, selector) => {
            const sheet = page.locator(selector);
            await expect(sheet).toBeVisible();
            await expect(sheet.locator(".nava-bottom-sheet-grabber")).toBeFocused();
            await expect(sheet.locator(".lucide-x")).toHaveCount(0);
            const geometry = await sheet.evaluate((element) => {
              const layer = element.parentElement;
              const frame = layer.parentElement.getBoundingClientRect();
              const bounds = element.getBoundingClientRect();
              const style = getComputedStyle(layer);
              const content = element.querySelector(".nava-bottom-sheet-content");
              return { background: style.backgroundColor, blur: style.backdropFilter || style.webkitBackdropFilter, inside: bounds.left >= frame.left && bounds.right <= frame.right + 1 && bounds.top >= frame.top && bounds.bottom <= frame.bottom + 1, gap: frame.bottom - bounds.bottom, overflow: content.scrollWidth - content.clientWidth, backgroundInert: [...layer.parentElement.children].filter((node) => node !== layer).every((node) => node.inert) };
            });
            assert.equal(geometry.background, "rgba(0, 0, 0, 0)");
            assert.equal(geometry.blur, "none");
            assert.ok(geometry.inside && geometry.gap <= 35 && geometry.overflow <= 1 && geometry.backgroundInert, JSON.stringify(geometry));
            await page.screenshot({ path: `${output}/${engine}-${locale}-${width}-${name}.png` });
            report.results.push({ engine, locale, width, height, name, geometry });
          };
          const dragClose = async (selector) => {
            const handle = page.locator(`${selector} .nava-bottom-sheet-grabber`);
            const box = await handle.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 75, { steps: 8 });
            await page.mouse.up();
            await expect(page.locator(selector)).toHaveCount(0);
            assert.equal(await page.locator(".app-content").evaluate((node) => node.inert), false);
          };

          await open("tab=today&view=today-todos");
          const openDate = async () => {
            await page.locator(".today-todo-more .nava-more-trigger").click();
            await page.getByRole("menuitem", { name: locale === "zh" ? "切换日期" : "Switch date" }).click();
          };
          await openDate();
          await check("date", ".today-todo-date-sheet");
          const selectedDate = await page.locator('.today-todo-date-sheet input[type="date"]').inputValue();
          await dragClose(".today-todo-date-sheet");
          await openDate();
          assert.equal(await page.locator('.today-todo-date-sheet input[type="date"]').inputValue(), selectedDate);
          await page.locator(".today-todo-date-presets button").last().click();
          await expect(page.locator(".today-todo-date-sheet")).toHaveCount(0);
          await openDate();
          assert.notEqual(await page.locator('.today-todo-date-sheet input[type="date"]').inputValue(), selectedDate);
          await page.keyboard.press("Escape");
          await expect(page.locator(".today-todo-date-sheet")).toHaveCount(0);

          await open("tab=record");
          await page.locator('[data-health-category="all"]').click();
          const detailTrigger = page.locator(".weekly-ai-summary-list li button").first();
          await detailTrigger.focus();
          await detailTrigger.press("Enter");
          await check("weekly", ".weekly-detail-sheet");
          await expect(page.locator(".weekly-detail-content > section")).toHaveCount(3);
          await page.locator(".weekly-detail-content footer").scrollIntoViewIfNeeded();
          await expect(page.locator(".weekly-detail-content footer")).toContainText(/医疗诊断|not a diagnosis/);
          await dragClose(".weekly-detail-sheet");
          await expect(detailTrigger).toBeFocused();

          await open("tab=today&view=notifications");
          await page.evaluate(async () => {
            const { publishNavaNotification } = await import("/src/services/notifications.ts");
            publishNavaNotification("00000000-0000-4000-8000-000000000001", { id: "sheet-notification-fixture", category: "exercise", source: "contextual", title: "Sheet interaction fixture", body: "Local notification body for layout verification.", target: { tab: "record", module: "exercise" } }, { replace: true });
          });
          const notification = page.locator(".notification-row-main").filter({ hasText: "Sheet interaction fixture" });
          await notification.focus();
          await notification.press("Enter");
          await check("notification", ".notification-detail-sheet");
          await expect(page.locator(".notification-detail-content")).toContainText("Local notification body");
          await dragClose(".notification-detail-sheet");
          await expect(notification).toBeFocused();
          await notification.click();
          await page.locator(".notification-detail-target").click();
          await expect(page.locator(".notification-detail-sheet")).toHaveCount(0);
          await expect.poll(() => page.evaluate(() => location.hash)).toContain("module=exercise");
        } finally { await context.close(); }
        console.log(`${engine} ${locale} ${width}x${height}: date, weekly and notification sheets passed`);
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await server.close();
}
