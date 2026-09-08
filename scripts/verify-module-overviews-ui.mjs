import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = process.env.MODULE_OVERVIEW_OUTPUT_DIR
  ? path.resolve(process.env.MODULE_OVERVIEW_OUTPUT_DIR)
  : "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-module-overviews-v127-20260908";
const port = Number(process.env.PORT || 5217);
const modules = ["mood", "sleep", "exercise", "diet", "focus", "face"];
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

async function dismissLaunch(page) {
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) {
    await launch.click();
    await expect(launch).toBeHidden();
  }
}

async function completeOnboarding(page) {
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;
  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) await welcome.waitFor({ state: "hidden", timeout: 6_000 });
  const steps = [
    ["gender", false], ["occupation", false], ["ageGroup", false], ["hobbies", true],
    ["sleepDuration", false], ["exerciseDuration", false], ["dietPreferences", true],
  ];
  for (const [key, multi] of steps) {
    await expect(onboarding).toHaveAttribute("data-onboarding-step", key);
    await page.locator(".onboarding-option-grid button").first().click();
    if (multi) await page.locator(".onboarding-next").click();
  }
  await expect(onboarding).toHaveAttribute("data-onboarding-step", "privacy");
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(onboarding).toBeHidden();
}

async function signIn(page, baseUrl) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  await completeOnboarding(page);
  await expect(page.locator(".phone-frame")).toBeVisible();
  const reward = page.locator(".reward-celebration-layer");
  if (await reward.isVisible().catch(() => false)) await reward.locator("button").click();
}

async function inspectOverview(page, viewport, module) {
  const geometry = await page.evaluate(({ activeModule }) => {
    const rect = (value) => value ? ({
      top: value.top, right: value.right, bottom: value.bottom, left: value.left,
      width: value.width, height: value.height,
    }) : null;
    const frame = document.querySelector(".phone-frame");
    const content = document.querySelector(".app-content");
    const shell = document.querySelector(".record-module-dashboard-shell");
    const dashboard = shell?.querySelector(`:scope > [data-module-view="${activeModule}-overview"]`);
    const ai = shell?.querySelector(":scope > .module-overview-ai");
    const actions = shell?.querySelector(":scope > .module-cross-actions");
    const nav = frame?.querySelector(".bottom-nav");
    const visibleText = [...(shell?.querySelectorAll("h1,h2,h3,strong,p,span,button") ?? [])]
      .filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > .5 && box.height > .5;
      })
      .filter((node) => [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
      .map((node) => ({
        selector: `${node.tagName.toLowerCase()}.${[...node.classList].slice(0, 2).join(".")}`,
        clippedX: node.scrollWidth > node.clientWidth + 2 && !["ellipsis", "clip"].includes(getComputedStyle(node).textOverflow),
        clippedY: node.scrollHeight > node.clientHeight + 2 && ["hidden", "clip"].includes(getComputedStyle(node).overflowY),
      }));
    return {
      frameOverflowX: frame ? frame.scrollWidth - frame.clientWidth : null,
      content: rect(content?.getBoundingClientRect()),
      shell: rect(shell?.getBoundingClientRect()),
      dashboard: rect(dashboard?.getBoundingClientRect()),
      ai: rect(ai?.getBoundingClientRect()),
      actions: rect(actions?.getBoundingClientRect()),
      nav: rect(nav?.getBoundingClientRect()),
      aiState: ai?.getAttribute("data-ai-state") ?? null,
      clippedText: visibleText.filter((item) => item.clippedX || item.clippedY),
    };
  }, { activeModule: module });

  const fail = (message, evidence = geometry) => {
    throw new Error(`${viewport.name}/${module}: ${message} ${JSON.stringify(evidence)}`);
  };
  if (!geometry.content || !geometry.shell || !geometry.dashboard || !geometry.ai || !geometry.actions || !geometry.nav) fail("missing an overview region");
  if ((geometry.frameOverflowX ?? 0) > 1) fail("horizontal overflow");
  if (geometry.aiState !== "ready") fail(`AI card did not reach ready state (${geometry.aiState})`);
  if (geometry.clippedText.length) fail("visible text is clipped", geometry.clippedText);
  const dashboardAiGap = geometry.ai.top - geometry.dashboard.bottom;
  const aiActionGap = geometry.actions.top - geometry.ai.bottom;
  if (dashboardAiGap < 6 || dashboardAiGap > 14) fail(`dashboard/AI gap is ${dashboardAiGap.toFixed(1)}px`);
  if (aiActionGap < 6 || aiActionGap > 14) fail(`AI/action gap is ${aiActionGap.toFixed(1)}px`);

  if (module === "mood") {
    const mood = await page.evaluate(() => {
      const rect = (value) => value ? ({
        top: value.top, right: value.right, bottom: value.bottom, left: value.left,
        width: value.width, height: value.height,
      }) : null;
      const summary = document.querySelector(".mood-summary-card");
      const grid = document.querySelector(".mood-factor-chips > div");
      const buttons = [...document.querySelectorAll(".mood-factor-chips > div button")];
      const diary = document.querySelector(".mood-diary-trigger");
      return {
        summaryText: summary?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        hasSyncSubtitle: Boolean(document.querySelector(".mood-summary-sync")),
        grid: rect(grid?.getBoundingClientRect()),
        parent: rect(grid?.parentElement?.parentElement?.getBoundingClientRect()),
        buttonCount: buttons.length,
        buttonSizes: buttons.map((button) => rect(button.getBoundingClientRect())),
        diaryText: diary?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    });
    if (!mood.summaryText.includes("今日情绪") || mood.summaryText.includes("今日情绪摘要") || mood.hasSyncSubtitle) fail("mood summary copy is stale", mood);
    if (!mood.grid || !mood.parent || mood.buttonCount !== 9) fail("mood factor grid is incomplete", mood);
    if (mood.grid.width < mood.parent.width * .88) fail("mood factor grid does not use the card width", mood);
    if (mood.buttonSizes.some((button) => !button || Math.abs(button.width - button.height) > 1.5)) fail("mood factors are not square", mood);
    if (mood.diaryText !== "查看 / 修改今天的情绪日志") fail("recorded diary action is not state-aware", mood);
  }

  return { ...geometry, dashboardAiGap, aiActionGap };
}

async function inspectBottom(page, viewport, module) {
  await page.locator(".app-content").evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await page.waitForTimeout(180);
  const geometry = await page.evaluate(() => {
    const rect = (value) => value ? ({
      top: value.top, right: value.right, bottom: value.bottom, left: value.left,
      width: value.width, height: value.height,
    }) : null;
    const frame = document.querySelector(".phone-frame");
    const ai = document.querySelector(".module-overview-ai");
    const actions = document.querySelector(".module-cross-actions");
    const nav = frame?.querySelector(".bottom-nav");
    return {
      ai: rect(ai?.getBoundingClientRect()),
      actions: rect(actions?.getBoundingClientRect()),
      nav: rect(nav?.getBoundingClientRect()),
    };
  });
  if (!geometry.ai || !geometry.actions || !geometry.nav) throw new Error(`${viewport.name}/${module}: missing bottom-flow region ${JSON.stringify(geometry)}`);
  if (geometry.actions.bottom > geometry.nav.top - 6) {
    throw new Error(`${viewport.name}/${module}: AI/actions cannot clear the fixed navigation ${JSON.stringify(geometry)}`);
  }
  return geometry;
}

async function main() {
  applyProjectPublicEnv(root);
  await mkdir(outputDir, { recursive: true });
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const errors = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        timezoneId: "Asia/Shanghai",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${viewport.name}: ${error.message}`));
      page.on("console", (message) => { if (message.type() === "error") errors.push(`${viewport.name}: ${message.text()}`); });
      await signIn(page, baseUrl);
      const viewportDir = path.join(outputDir, viewport.name);
      await mkdir(viewportDir, { recursive: true });
      for (const module of modules) {
        await page.goto(`${baseUrl}?demo=1#tab=record&module=${module}`, { waitUntil: "networkidle" });
        await expect(page.locator(`[data-module-view="${module}-overview"]`)).toBeVisible();
        await expect(page.locator('.module-overview-ai[data-ai-state="ready"]')).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(220);
        const top = await inspectOverview(page, viewport, module);
        await page.screenshot({ path: path.join(viewportDir, `${module}-top.png`) });
        const bottom = await inspectBottom(page, viewport, module);
        await page.screenshot({ path: path.join(viewportDir, `${module}-bottom.png`) });
        report.push({ viewport: viewport.name, module, top, bottom });
      }
      await context.close();
    }
    if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
    await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(`Verified ${modules.length} module overviews across ${viewports.length} iPhone viewports.`);
    console.log(`Evidence: ${outputDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
