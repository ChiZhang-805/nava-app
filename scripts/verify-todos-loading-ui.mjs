import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\today-todos-loading";
const port = 5226;
const userId = "00000000-0000-4000-8000-000000000001";
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

function assertContained(label, geometry) {
  if (geometry.documentOverflow > 1 || geometry.frameOverflow > 1 || geometry.pageLeft < -1 || geometry.pageRight > geometry.viewportWidth + 1) {
    throw new Error(`${label}: page overflow ${JSON.stringify(geometry)}`);
  }
}

async function dismissLaunchAndReward(page) {
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click();
  const reward = page.locator(".reward-celebration-layer");
  if (await reward.isVisible().catch(() => false)) await reward.locator("button").first().click();
}

try {
  const loadingContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const loadingPage = await loadingContext.newPage();
  await loadingPage.goto(`${baseUrl}?demo=1&qa=auth-skeleton`, { waitUntil: "networkidle" });
  await expect(loadingPage.locator(".nava-loading-scene")).toBeVisible();
  await expect(loadingPage.locator(".nava-loading-string")).toHaveCount(3);
  const loadingGeometry = await loadingPage.locator(".nava-loading-scene").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, height: box.height, viewportHeight: window.innerHeight };
  });
  const loadingCenter = loadingGeometry.top + loadingGeometry.height / 2;
  if (Math.abs(loadingCenter - loadingGeometry.viewportHeight / 2) > 24) throw new Error(`loading scene is not centered: ${JSON.stringify(loadingGeometry)}`);
  const leftFrames = [];
  for (let index = 0; index < 30; index += 1) {
    leftFrames.push(await loadingPage.locator(".nava-loading-string.is-left").evaluate((element) => getComputedStyle(element).transform));
    await loadingPage.waitForTimeout(80);
  }
  if (new Set(leftFrames).size < 3 || leftFrames.every((frame) => frame === "none" || frame === "matrix(1, 0, 0, 1, 0, 0)")) throw new Error(`left cradle ball did not animate: ${JSON.stringify(leftFrames)}`);
  const dotFrames = [];
  for (let index = 0; index < 45; index += 1) {
    dotFrames.push(await loadingPage.locator(".nava-loading-word i").evaluateAll((items) => items.map((item) => Number(getComputedStyle(item).opacity))));
    await loadingPage.waitForTimeout(60);
  }
  if (!dotFrames.some((frame) => frame[0] === 1 && frame[1] === 0) || !dotFrames.some((frame) => frame[0] === 1 && frame[1] === 1 && frame[2] === 0) || !dotFrames.some((frame) => frame.every((value) => value === 1)) || !dotFrames.some((frame) => frame.every((value) => value === 0))) {
    throw new Error(`loading dots did not type and clear as a group: ${JSON.stringify(dotFrames)}`);
  }
  await loadingPage.screenshot({ path: path.join(outputDir, "loading-390x844.png") });
  report.push({ mode: "loading", loadingGeometry, leftFrames: [...new Set(leftFrames)], dotFrames });
  await loadingContext.close();

  const journalContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await journalContext.addInitScript(({ userId: demoUserId }) => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(`nava.onboarding.v3.${demoUserId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
  }, { userId });
  const journalPage = await journalContext.newPage();
  await journalPage.addLocatorHandler(journalPage.locator(".completion-celebration-layer"), async () => {
    await journalPage.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
  });
  await journalPage.route("**/journal/index.html*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.continue();
  });
  await journalPage.goto(`${baseUrl}?demo=1#tab=record&module=mood`, { waitUntil: "domcontentloaded" });
  const journalLaunch = journalPage.locator(".launch-sequence");
  if (await journalLaunch.isVisible().catch(() => false)) await journalLaunch.click();
  await expect(journalPage.locator(".journal-loading .nava-loading-scene")).toBeVisible();
  await journalPage.screenshot({ path: path.join(outputDir, "journal-loading-390x844.png") });
  report.push({ mode: "journal-loading", centeredScene: true });
  await journalPage.waitForTimeout(5200);
  await journalContext.close();

  for (const locale of ["zh", "en"]) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        locale: locale === "zh" ? "zh-CN" : "en-US",
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
        timezoneId: "Asia/Shanghai",
      });
      await context.addInitScript(({ userId: demoUserId, language }) => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.locale", language);
        localStorage.setItem(`nava.onboarding.v3.${demoUserId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
        class MockSpeechRecognition {
          continuous = false; interimResults = false; lang = ""; onresult = null; onerror = null; onend = null;
          start() { window.setTimeout(() => this.onresult?.({ results: [{ 0: { transcript: language === "zh" ? "完成一次48分钟的有氧跑" : "run for 48 minutes" }, isFinal: true, length: 1 }], resultIndex: 0 }), 20); }
          stop() { this.onend?.(); }
          abort() { this.onend?.(); }
        }
        Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
        Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
      }, { userId, language: locale });
      const page = await context.newPage();
      await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
        await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${baseUrl}?demo=1#tab=today`, { waitUntil: "networkidle" });
      await dismissLaunchAndReward(page);
      await expect(page.locator(".option-two-home")).toBeVisible();
      await page.locator(".option-two-menu-toggle").click();
      await expect(page.locator('[data-home-shortcut="shop"]')).toBeVisible();
      await expect(page.locator('[data-home-shortcut="today-todos"]')).toBeVisible();
      await page.locator('[data-home-shortcut="today-todos"]').click();
      const todoPage = page.locator("[data-today-todo-page]");
      await expect(todoPage).toBeVisible();
      await expect(page.locator(".bottom-nav")).toBeVisible();
      await expect(page.locator(".bottom-nav .nav-button")).toHaveCount(5);
      await expect(page.locator(".today-todo-header h1")).toHaveText(locale === "zh" ? "今日待办" : "Today's to-do");
      await expect(page.locator(".today-todo-header")).not.toContainText(/NAVA TODAY/i);
      await expect(page.locator(".today-todo-header .home-experience-back")).toBeVisible();
      await expect(page.locator(".today-todo-intro p")).toHaveCount(0);
      await expect(page.locator(".today-todo-empty p")).toHaveCount(0);
      await expect(page.locator(".today-todo-empty")).toContainText(locale === "zh" ? "这一天还没有待办" : "Nothing here yet");
      const estimateButton = page.locator(".today-todo-compose-heading button");
      await expect(estimateButton).toBeDisabled();

      const geometry = await todoPage.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const frame = document.querySelector(".phone-frame");
        return {
          viewportWidth: window.innerWidth,
          pageLeft: box.left,
          pageRight: box.right,
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : 0,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      });
      assertContained(`${locale}-${viewport.name}`, geometry);
      if (geometry.scrollHeight > geometry.clientHeight + 1) throw new Error(`${locale}-${viewport.name}: empty to-do page is not one screen ${JSON.stringify(geometry)}`);
      const emptyGeometry = await page.evaluate(() => {
        const empty = document.querySelector(".today-todo-empty");
        const emptyTitle = document.querySelector(".today-todo-empty strong");
        const emptyIcon = document.querySelector(".today-todo-empty svg");
        const list = document.querySelector(".today-todo-list-section");
        const selection = document.querySelector(".today-todo-list-section > header button");
        if (!empty || !emptyTitle || !emptyIcon || !list || !selection) return null;
        const emptyRect = empty.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const contentCenter = (emptyIcon.getBoundingClientRect().top + emptyTitle.getBoundingClientRect().bottom) / 2;
        return {
          centeredDelta: Math.abs(contentCenter - (emptyRect.top + emptyRect.bottom) / 2),
          listHeight: listRect.height,
          selectionBackground: getComputedStyle(selection).backgroundColor,
        };
      });
      if (!emptyGeometry || emptyGeometry.centeredDelta > 10 || emptyGeometry.selectionBackground !== "rgba(0, 0, 0, 0)") {
        throw new Error(`${locale}-${viewport.name}: empty state is not centered or selection action is not bare ${JSON.stringify(emptyGeometry)}`);
      }

      const voiceButton = page.locator(".today-todo-submit.is-voice");
      await expect(voiceButton).toContainText(locale === "zh" ? "和小猫说说今天想做的事" : "Tell the cat what you want to do");
      await voiceButton.click();
      await expect(page.locator(".today-todo-draft textarea")).toHaveValue(locale === "zh" ? "完成一次48分钟的有氧跑" : "run for 48 minutes");
      await expect(page.locator('[data-duration-field="minutes"] strong')).toHaveText("48");
      await expect(page.locator(".today-todo-duration > small")).toContainText(locale === "zh" ? "已识别句中时长" : "Duration found in task");
      await page.locator(".today-todo-draft textarea").fill("");
      await page.locator('[data-duration-field="minutes"]').click();
      await page.getByRole("listbox", { name: locale === "zh" ? "分钟" : "Minutes" }).getByRole("option", { name: "00", exact: true }).click();
      await expect(voiceButton).toBeVisible();

      const title = `${locale === "zh" ? "整理明天资料" : "Prepare tomorrow's notes"} ${viewport.name}`;
      await page.locator(".today-todo-draft textarea").fill(title);
      await expect(estimateButton).toBeEnabled();
      await expect(page.locator(".today-todo-duration-trigger")).toHaveCount(3);
      const durationGeometry = await page.locator(".today-todo-duration-trigger").evaluateAll((triggers) => triggers.map((trigger) => {
        const number = trigger.querySelector("strong")?.getBoundingClientRect();
        const unit = trigger.querySelector("small")?.getBoundingClientRect();
        return { number: number?.toJSON() ?? null, unit: unit?.toJSON() ?? null, svgCount: trigger.querySelectorAll("svg").length };
      }));
      if (durationGeometry.some(({ number, unit, svgCount }) => !number || !unit || svgCount !== 0 || number.left >= unit.left)) {
        throw new Error(`${locale}-${viewport.name}: duration fields did not keep number left and unit right ${JSON.stringify(durationGeometry)}`);
      }
      await page.locator('[data-duration-field="minutes"]').click();
      await expect(page.locator('[data-duration-initial="true"]')).toHaveAttribute("aria-label", locale === "zh" ? "分钟" : "Minutes");
      await expect(page.locator(".duration-wheel-overlay")).toHaveCount(0);
      const inlineGeometry = await page.evaluate(() => {
        const trigger = document.querySelector('[data-duration-field="minutes"]')?.getBoundingClientRect();
        const popup = document.querySelector('.duration-unit-popover')?.getBoundingClientRect();
        const frame = document.querySelector('.phone-frame')?.getBoundingClientRect();
        return trigger && popup && frame ? { trigger: trigger.toJSON(), popup: popup.toJSON(), frame: frame.toJSON() } : null;
      });
      if (!inlineGeometry || Math.abs((inlineGeometry.trigger.left + inlineGeometry.trigger.right) / 2 - (inlineGeometry.popup.left + inlineGeometry.popup.right) / 2) > 1
        || inlineGeometry.popup.top < inlineGeometry.trigger.bottom || inlineGeometry.popup.left < inlineGeometry.frame.left || inlineGeometry.popup.right > inlineGeometry.frame.right) {
        throw new Error(`${locale}-${viewport.name}: duration menu is not anchored to the selected field ${JSON.stringify(inlineGeometry)}`);
      }
      if (locale === "zh" && viewport.name === "390x844") await page.screenshot({ path: path.join(outputDir, "zh-390x844-duration-inline.png") });
      await page.getByRole("listbox", { name: locale === "zh" ? "分钟" : "Minutes" }).getByRole("option", { name: "02", exact: true }).click();
      await page.locator('[data-duration-field="hours"]').click();
      await page.getByRole("listbox", { name: locale === "zh" ? "小时" : "Hours" }).getByRole("option", { name: "01", exact: true }).click();
      await page.locator('[data-duration-field="seconds"]').click();
      await page.getByRole("listbox", { name: locale === "zh" ? "秒钟" : "Seconds" }).getByRole("option", { name: "03", exact: true }).click();
      await page.locator('.today-todo-submit').click();
      const row = page.locator(".today-todo-items article", { hasText: title });
      await expect(row).toBeVisible();
      await expect(row).toContainText(locale === "zh" ? "1小时 2分钟 3秒" : "1 h 2 m 3 s");
      await row.locator(".today-todo-check").click();
      await expect(row).toHaveClass(/is-completed/);
      const populatedGeometry = await todoPage.evaluate((element) => {
        const list = element.querySelector(".today-todo-list-section")?.getBoundingClientRect();
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, list: list?.toJSON() ?? null, nav: nav?.toJSON() ?? null };
      });
      if (populatedGeometry.scrollHeight > populatedGeometry.clientHeight + 1 || !populatedGeometry.list || !populatedGeometry.nav || populatedGeometry.list.bottom > populatedGeometry.nav.top + 1) {
        throw new Error(`${locale}-${viewport.name}: populated to-do page must remain one screen above navigation ${JSON.stringify(populatedGeometry)}`);
      }
      await page.screenshot({ path: path.join(outputDir, `${locale}-${viewport.name}-today-todos.png`), fullPage: true });

      await page.reload({ waitUntil: "networkidle" });
      await dismissLaunchAndReward(page);
      await expect(page.locator("[data-today-todo-page]")).toBeVisible();
      await expect(page.locator(".today-todo-items article", { hasText: title })).toHaveClass(/is-completed/);
      await page.locator(".today-todo-header .home-experience-back").click();
      await expect(page.locator(".option-two-home")).toBeVisible();
      const actionableErrors = errors.filter((message) => !/ERR_NETWORK_IO_SUSPENDED|ERR_ABORTED/.test(message));
      if (actionableErrors.length) throw new Error(`${locale}-${viewport.name}: browser errors ${JSON.stringify(actionableErrors)}`);
      report.push({ locale, viewport: viewport.name, geometry, persisted: true });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`Today to-do and loading UI verification passed (${report.length} scenarios).`);
