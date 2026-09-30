import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";

const root = process.cwd();
const outputDir = process.env.SCREENSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUTPUT_DIR)
  : path.resolve(root, "..", "Build", "TestRuns", "nava-figma-pages");
const port = Number(process.env.PORT || 5194);
const demoAccount = "13800138000";
const demoPassword = "12345678";

const phoneViewports = [
  { name: "phone-360x740", width: 360, height: 740 },
  { name: "phone-375x812", width: 375, height: 812 },
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "phone-430x932", width: 430, height: 932 },
];
const catalogViewports = IPHONE_PREVIEW_DEVICES.map((device) => ({ name: device.id, width: 1365, height: 1050, device }));
const selectedNames = process.env.NAVA_LAYOUT_DEVICES?.split(",");
const viewports = [...phoneViewports, ...(process.argv.includes("--all-devices") ? catalogViewports : [])]
  .filter((viewport) => !selectedNames || selectedNames.includes(viewport.name));
applyProjectPublicEnv(root);

function contextOptions(viewport) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: !viewport.device,
    hasTouch: !viewport.device,
    reducedMotion: "reduce",
    ...(!viewport.device ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1" } : {}),
  };
}

async function selectDevice(page, viewport) {
  if (viewport.device) await page.locator(".nava-device-selector select").selectOption(viewport.device.id);
}

async function saveScreen(page, viewport, name) {
  const file = path.join(outputDir, viewport.name, `${name}.png`);
  const immersive = page.locator('[data-module-view="focus-immersive"]');
  if (await immersive.isVisible().catch(() => false)) await immersive.screenshot({ path: file });
  else if (viewport.device) await page.locator(".phone-frame,.auth-screen,.onboarding-screen").filter({ visible: true }).first().screenshot({ path: file });
  else await page.screenshot({ path: file });
}

async function dismissLaunch(page) {
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) {
    await launch.click();
    await expect(launch).toBeHidden();
  }
}

async function auditVisualGeometry(page, scopeSelector) {
  return page.locator(scopeSelector).first().evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const issues = [];
    const diagnostics = { maxFlowGap: 0, maxFlowGapContainer: "", checkedText: 0, checkedControls: 0 };
    const rendered = (element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01 && rect.width > 0.5 && rect.height > 0.5;
    };
    const visibleRect = (element) => {
      const rect = element.getBoundingClientRect();
      const box = { left: Math.max(0, rect.left), right: Math.min(innerWidth, rect.right), top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom) };
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { box.left = Math.max(box.left, clip.left); box.right = Math.min(box.right, clip.right); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { box.top = Math.max(box.top, clip.top); box.bottom = Math.min(box.bottom, clip.bottom); }
      }
      return { ...box, width: Math.max(0, box.right - box.left), height: Math.max(0, box.bottom - box.top) };
    };
    const selectorName = (element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = element.classList.length ? `.${[...element.classList].slice(0, 2).join(".")}` : "";
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    const textElements = [...root.querySelectorAll("h1,h2,h3,h4,p,li,label,button,a,strong,small,span")]
      .filter(rendered)
      .filter((element) => element.getBoundingClientRect().width > 2 && element.getBoundingClientRect().height > 2)
      .filter((element) => !element.matches(".sr-only,.visually-hidden"))
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()));
    diagnostics.checkedText = textElements.length;
    for (const element of textElements) {
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const lineClamp = style.getPropertyValue("-webkit-line-clamp");
      const renderedLineCount = Number.isFinite(lineHeight) && lineHeight > 0 ? element.clientHeight / lineHeight : 1;
      if (Number.isFinite(fontSize) && Number.isFinite(lineHeight) && fontSize >= 8 && renderedLineCount > 1.45 && lineHeight < fontSize * 1.08) {
        issues.push({ kind: "tight-line-height", element: selectorName(element), fontSize, lineHeight });
      }
      if (element instanceof HTMLElement
        && element.scrollHeight > element.clientHeight + 2
        && ["hidden", "clip"].includes(style.overflowY)
        && (!lineClamp || lineClamp === "none")
        && style.textOverflow !== "ellipsis") {
        issues.push({ kind: "text-clipped", element: selectorName(element), clientHeight: element.clientHeight, scrollHeight: element.scrollHeight });
      }
    }

    const controls = [...root.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button]")]
      .filter(rendered)
      .filter((element) => !element.matches(".sr-only,.visually-hidden"))
      .filter((element) => element.getAttribute("aria-hidden") !== "true")
      .filter((element) => { const box = visibleRect(element); return box.width > 1 && box.height > 1; });
    diagnostics.checkedControls = controls.length;
    for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
      const left = controls[leftIndex];
      const leftRect = visibleRect(left);
      if (!left.matches(".nava-mascot") && (leftRect.left < rootRect.left - 1 || leftRect.right > rootRect.right + 1)) {
        issues.push({ kind: "control-outside-horizontal-boundary", element: selectorName(left), left: leftRect.left, right: leftRect.right, rootLeft: rootRect.left, rootRight: rootRect.right });
      }
      for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
        const right = controls[rightIndex];
        if (left.contains(right) || right.contains(left)) continue;
        if ((left.matches(".option-two-guidance") && right.matches(".nava-mascot"))
          || (right.matches(".option-two-guidance") && left.matches(".nava-mascot"))) continue;
        if ((left.matches(".option-two-side-shortcut") && right.matches(".home-health-widget"))
          || (right.matches(".option-two-side-shortcut") && left.matches(".home-health-widget"))) continue;
        const rightRect = visibleRect(right);
        const overlapWidth = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
        const overlapHeight = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
        const overlapArea = overlapWidth * overlapHeight;
        const smallerArea = Math.min(leftRect.width * leftRect.height, rightRect.width * rightRect.height);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.18) {
          issues.push({ kind: "controls-overlap", left: selectorName(left), right: selectorName(right), ratio: Number((overlapArea / smallerArea).toFixed(3)) });
        }
      }
    }
    const singleLineSelectors = ".record-module-points > span,.home-calendar-overview > div,.weekly-score-card > div,.figma-app-header h1,.home-experience-header h1,.structured-field-row > span:first-child";
    for (const line of root.querySelectorAll(singleLineSelectors)) {
      if (!rendered(line)) continue;
      const boxes = [];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        boxes.push(...range.getClientRects());
      }
      const lineRect = line.getBoundingClientRect();
      const centers = boxes.map((box) => box.top + box.height / 2);
      if (centers.length && Math.max(...centers) - Math.min(...centers) > Math.max(...boxes.map((box) => box.height)) * .6) issues.push({ kind: "required-single-line-wrapped", element: selectorName(line) });
      if (boxes.some((box) => box.right > lineRect.right + 1 || box.left < lineRect.left - 1) || line.scrollWidth > line.clientWidth + 1) issues.push({ kind: "required-single-line-clipped", element: selectorName(line) });
    }
    for (const composer of root.querySelectorAll(".chat-composer,.chat-archive-return")) {
      if (!rendered(composer)) continue;
      const rect = composer.getBoundingClientRect();
      const chat = composer.closest(".chat-layout").getBoundingClientRect();
      if (rect.bottom > chat.bottom + 1 || rect.top < chat.top - 1) issues.push({ kind: "chat-action-outside", top: rect.top, bottom: rect.bottom, parentTop: chat.top, parentBottom: chat.bottom });
    }
    const notice = root.querySelector('.chat-media-notice');
    const list = root.querySelector('.chat-list');
    if (notice && list && rendered(notice) && rendered(list) && notice.getBoundingClientRect().bottom > list.getBoundingClientRect().top + 1) {
      issues.push({ kind: 'chat-notice-overlaps-conversation' });
    }
    for (const card of root.querySelectorAll('.sleep-trend-card')) {
      const bounds = card.getBoundingClientRect();
      for (const label of card.querySelectorAll('.bar-line-bars small')) {
        const box = label.getBoundingClientRect();
        if (rendered(label) && box.bottom > bounds.bottom - 5) issues.push({ kind: 'chart-date-outside-card-padding' });
      }
    }

    for (const header of root.querySelectorAll(".figma-app-header,.home-experience-header,.home-widget-editor-header,.notification-center-header")) {
      if (!rendered(header)) continue;
      const title = header.querySelector("h1");
      const children = [...header.children].filter(rendered);
      if (!title || children.length < 3 || !rendered(title)) continue;
      const titleRect = title.getBoundingClientRect();
      const titleCenter = titleRect.top + titleRect.height / 2;
      const leftRect = children[0].getBoundingClientRect();
      const rightRect = children.at(-1).getBoundingClientRect();
      const leftCenter = leftRect.top + leftRect.height / 2;
      const rightCenter = rightRect.top + rightRect.height / 2;
      if (Math.abs(titleCenter - leftCenter) > 1.5 || Math.abs(titleCenter - rightCenter) > 1.5) {
        issues.push({ kind: "header-not-centered", element: selectorName(header), titleCenter, leftCenter, rightCenter });
      }
    }

    const stackSelectors = [
      ".record-editor-stack", ".profile-stack", ".profile-device-stack", ".notification-list",
      ".record-module-grid", ".focus-dashboard", ".page-skeleton", ".page-skeleton-record-grid", ".page-skeleton-daily-metrics",
    ];
    for (const container of root.matches(stackSelectors.join(",")) ? [root] : root.querySelectorAll(stackSelectors.join(","))) {
      if (!rendered(container)) continue;
      const children = [...container.children]
        .filter(rendered)
        .filter((child) => !["absolute", "fixed"].includes(getComputedStyle(child).position))
        .map((child) => child.getBoundingClientRect())
        .sort((left, right) => left.top - right.top || left.left - right.left);
      for (let index = 1; index < children.length; index += 1) {
        const previous = children[index - 1];
        const current = children[index];
        const sameColumn = Math.min(previous.right, current.right) - Math.max(previous.left, current.left) > Math.min(previous.width, current.width) * 0.55;
        if (!sameColumn) continue;
        const gap = current.top - previous.bottom;
        if (gap < -1) issues.push({ kind: "flow-items-overlap", element: selectorName(container), overlap: Number((-gap).toFixed(2)) });
        if (container.matches('.focus-dashboard') && gap > 24) issues.push({ kind: 'excessive-focus-card-gap', gap });
        if (gap > diagnostics.maxFlowGap) {
          diagnostics.maxFlowGap = Number(gap.toFixed(2));
          diagnostics.maxFlowGapContainer = selectorName(container);
        }
      }
    }
    return { issues, diagnostics };
  });
}

async function captureOnboarding(page, viewport, name, report) {
  const target = page.locator(".onboarding-screen");
  await expect(target).toBeVisible();
  const layout = await target.evaluate((node) => ({
    frameWidth: node.clientWidth,
    frameScrollWidth: node.scrollWidth,
    contentHeight: node.clientHeight,
    contentScrollHeight: node.scrollHeight,
  }));
  if (layout.frameScrollWidth > layout.frameWidth + 1) {
    await saveScreen(page, viewport, `${name}-overflow`);
    throw new Error(`${viewport.name}/${name} has horizontal overflow: ${JSON.stringify(layout)}`);
  }
  const visual = await auditVisualGeometry(page, ".onboarding-screen");
  if (visual.issues.length) throw new Error(`${viewport.name}/${name} failed visual geometry: ${JSON.stringify(visual.issues)}`);
  report.push({ viewport: viewport.name, screen: name, state: "content", ...layout, ...visual.diagnostics });
  await saveScreen(page, viewport, name);
}

async function completeOnboarding(page, viewport, report) {
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) return;

  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) {
    await page.waitForFunction(() => [...document.querySelectorAll(".onboarding-welcome__message > span")]
      .some((node) => Number(getComputedStyle(node).opacity) >= 0.5));
    await captureOnboarding(page, viewport, "00-onboarding-welcome", report);
    await welcome.waitFor({ state: "hidden", timeout: 6_000 });
  }

  const steps = [
    { key: "gender", multi: false },
    { key: "occupation", multi: false },
    { key: "ageGroup", multi: false },
    { key: "hobbies", multi: true },
    { key: "sleepDuration", multi: false },
    { key: "exerciseDuration", multi: false },
    { key: "dietPreferences", multi: true },
  ];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    await expect(onboarding).toHaveAttribute("data-onboarding-step", step.key);
    await captureOnboarding(page, viewport, `00-onboarding-${index + 1}-${step.key}`, report);
    await page.locator(".onboarding-option-grid button").first().click();
    if (step.multi) await page.locator(".onboarding-next").click();
  }

  await expect(onboarding).toHaveAttribute("data-onboarding-step", "privacy");
  await captureOnboarding(page, viewport, "00-onboarding-privacy", report);
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function login(page, baseUrl, viewport, report) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "domcontentloaded" });
  await dismissLaunch(page);
  await selectDevice(page, viewport);
  await saveScreen(page, viewport, 'auth-login');
  report.push({ viewport: viewport.name, screen: 'auth-login', state: 'content', ...(await auditVisualGeometry(page, '.auth-screen')) });
  for (const [name, open, selector] of [
    ['auth-register', async () => page.locator('.auth-mode-icon').click(), '.auth-screen--signUp'],
    ['auth-recovery', async () => { await page.locator('.auth-mode-icon').click(); await page.locator('.auth-forgot').click(); }, '.auth-recovery-choice'],
    ['auth-otp-login', async () => page.locator('[data-recovery-option="otp"]').click(), '.auth-form--signInOtp'],
    ['auth-reset', async () => { await page.locator('.auth-mode-icon').click(); await page.locator('.auth-forgot').click(); await page.locator('[data-recovery-option="reset"]').click(); }, '.auth-form--reset'],
  ]) {
    await open(); await expect(page.locator(selector)).toBeVisible();
    await page.waitForTimeout(450);
    const visual = await auditVisualGeometry(page, '.auth-screen');
    report.push({ viewport: viewport.name, screen: name, state: 'content', issues: visual.issues, ...visual.diagnostics });
    await saveScreen(page, viewport, name);
  }
  await page.locator('.auth-mode-icon').click();
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.locator(".auth-submit").click();
  await completeOnboarding(page, viewport, report);
  await expect(page.locator(".phone-frame")).toBeVisible();
  await page.addStyleTag({ content: '*,*::before,*::after { animation-duration: 0s !important; transition-duration: 0s !important; }' });
  await page.waitForTimeout(350);
  const reward = page.locator(".reward-celebration-card > button");
  if (await reward.isVisible().catch(() => false)) await reward.click();
}

async function capture(page, viewport, name, selector, report) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  if (selector === '.report-share-overlay') {
    await expect(page.locator('.report-share-content > img')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => page.locator('.report-share-content > img').evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 20000 }).toBe(true);
  }
  await page.waitForTimeout(180);
  const layout = await page.locator(".phone-frame").evaluate((node) => {
    const content = node.querySelector(".app-content");
    return {
      frameWidth: node.clientWidth,
      frameHeight: node.clientHeight,
      frameScrollWidth: node.scrollWidth,
      contentHeight: content?.clientHeight ?? 0,
      contentScrollHeight: content?.scrollHeight ?? 0,
    };
  });
  if (layout.frameScrollWidth > layout.frameWidth + 1) {
    const bleed = await page.locator('.phone-frame').evaluate(frame => {
      const box = frame.getBoundingClientRect();
      const outside = [...frame.querySelectorAll('*')].filter(node=>node.getBoundingClientRect().right>box.right+1);
      const pseudo = getComputedStyle(frame, '::before');
      const backgroundLabel = { content:pseudo.content, width:pseudo.width, left:pseudo.left };
      const probe = document.createElement('style');
      probe.textContent = '.phone-frame::before { content:none !important; }';
      document.head.append(probe);
      const widthWithoutBackgroundLabel = frame.scrollWidth;
      probe.remove();
      return { overflowX:getComputedStyle(frame).overflowX, backgroundLabel, widthWithoutBackgroundLabel, elements:outside.map(node=>String(node.className)) };
    });
    await saveScreen(page, viewport, `${name}-overflow`);
    throw new Error(`${viewport.name}/${name} has horizontal overflow: ${JSON.stringify({layout,bleed})}`);
  }
  if (viewport.device && !name.includes('focus-immersive') && (Math.abs(layout.frameWidth - viewport.device.logicalWidth) > 1 || Math.abs(layout.frameHeight - viewport.device.logicalHeight) > 1)) {
    throw new Error(`Actual phone canvas does not match ${viewport.device.id}: ${JSON.stringify(layout)}`);
  }
  if (name === "07-focus") {
    const formGeometry = await page.locator(".focus-todo-plan-form").evaluate((form) => {
      const title = form.querySelector(".focus-todo-title-input")?.getBoundingClientRect();
      const controls = [...form.querySelectorAll("label")].map((node) => node.getBoundingClientRect());
      return {
        titleBottom: title?.bottom ?? 0,
        controlsTop: controls.length > 0 ? Math.min(...controls.map((rect) => rect.top)) : Number.POSITIVE_INFINITY,
      };
    });
    if (formGeometry.titleBottom > formGeometry.controlsTop + 1) {
      throw new Error(`${viewport.name}/${name} task planner rows overlap: ${JSON.stringify(formGeometry)}`);
    }
  }
  if (name === "06-exercise-device") {
    const cardGeometry = await page.locator(".device-subview-card").evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const lastChild = card.lastElementChild?.getBoundingClientRect();
      return { cardBottom: cardRect.bottom, contentBottom: lastChild?.bottom ?? cardRect.bottom };
    });
    if (cardGeometry.cardBottom - cardGeometry.contentBottom > 32) {
      throw new Error(`${viewport.name}/${name} leaves excessive empty space inside its card: ${JSON.stringify(cardGeometry)}`);
    }
  }
  if (name === "00g-home-widgets-sort") {
    const positions = await page.locator(".home-widget-sort > article").evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { index: Number(item.getAttribute("data-sort-index")), top: rect.top, left: rect.left };
    }));
    const byIndex = new Map(positions.map((position) => [position.index, position]));
    const first = byIndex.get(1);
    const second = byIndex.get(2);
    const third = byIndex.get(3);
    const fourth = byIndex.get(4);
    if (!first || !second || !third || !fourth
      || first.top >= second.top
      || Math.abs(second.top - third.top) > 1
      || Math.abs(second.top - fourth.top) > 1
      || !(second.left < third.left && third.left < fourth.left)) {
      throw new Error(`${viewport.name}/${name} does not mirror the home 1+3 slots: ${JSON.stringify(positions)}`);
    }
  }
  if (name === "00h-profile-details") {
    const profilePresentation = await page.locator(".advanced-profile-section").nth(1).evaluate((section) => ({
      selectedOptions: [...section.querySelectorAll(".advanced-profile-wheel > button")].map((button) => button.textContent?.trim() ?? ""),
      selectedDiet: [...section.querySelectorAll(".advanced-profile-diet-chips .is-selected")].map((button) => button.textContent?.trim() ?? ""),
    }));
    const rawCodes = new Set(["under_5h", "5_6h", "6_7h", "7_8h", "8_9h", "over_9h", "almost_none", "under_1h", "1_2h", "2_4h", "4_7h", "over_7h", "none"]);
    if (profilePresentation.selectedOptions.some((value) => rawCodes.has(value))
      || profilePresentation.selectedDiet.some((value) => rawCodes.has(value))) {
      throw new Error(`${viewport.name}/${name} exposes stored profile codes instead of localized labels: ${JSON.stringify(profilePresentation)}`);
    }
  }
  if (name === "00a-home-health-wheel") {
    const modules = await page.locator(".option-two-health-entry").evaluateAll((entries) => entries.map((entry) => ({
      id: entry.getAttribute("data-health-module"),
      visible: entry.getBoundingClientRect().width > 0 && entry.getBoundingClientRect().height > 0,
    })));
    const expected = ["exercise", "diet", "sleep", "face", "focus", "mood"];
    if (JSON.stringify(modules.map(({ id }) => id)) !== JSON.stringify(expected) || modules.some(({ visible }) => !visible)) {
      throw new Error(`${viewport.name}/${name} has an invalid six-module route wheel: ${JSON.stringify(modules)}`);
    }
  }
  const visual = await auditVisualGeometry(page, selector);
  report.push({ viewport: viewport.name, screen: name, state: "content", fixture: "local-demo-not-real-AI", surface: name.includes('focus-immersive') ? 'immersive-viewport' : viewport.device ? 'desktop-device-preview' : 'mobile-viewport', logicalWidth: viewport.device?.logicalWidth ?? viewport.width, logicalHeight: viewport.device?.logicalHeight ?? viewport.height, issues: visual.issues, ...layout, ...visual.diagnostics });
  await saveScreen(page, viewport, name);
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify({ passed: false, incomplete: true, screens: report }, null, 2));
  console.log(`${viewport.name}/${name}: ${visual.issues.length ? JSON.stringify(visual.issues) : "checked"}`);
}

const skeletonRoutes = [
  ["today", "#tab=today"],
  ["records", "#tab=record"],
  ...["mood", "sleep", "exercise", "diet", "focus", "face"].map((module) => [`record-detail-${module}`, `#tab=record&module=${module}`]),
  ["record-editor-mood", "#tab=record&module=mood&view=editor"],
  ["record-editor-sleep", "#tab=record&module=sleep&view=editor"],
  ["record-editor-exercise", "#tab=record&module=exercise&view=editor"],
  ["record-editor-diet", "#tab=record&module=diet&view=editor"],
  ["record-editor-focus", "#tab=record&module=focus&view=editor"],
  ["record-editor-face", "#tab=record&module=face&view=editor"],
  ["ai", "#tab=ai"],
  ["growth", "#tab=trends"],
  ["profile", "#tab=profile"],
  ["calendar", "#tab=today&view=calendar"],
  ["daily-report", "#tab=today&view=day-2026-09-03"],
  ["advanced-profile", "#tab=today&view=profile-details"],
];

async function captureSkeletonViewport(browser, baseUrl, viewport, report, errors) {
  const context = await browser.newContext(contextOptions(viewport));
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => false });
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
  });
  const page = await context.newPage();
  if (viewport.device) await context.addInitScript((id) => localStorage.setItem('nava.desktop-preview-device.v1', id), viewport.device.id);
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${viewport.name}/skeleton: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${viewport.name}/skeleton: ${error.message}`));
  await mkdir(path.join(outputDir, viewport.name), { recursive: true });

  await page.goto(`${baseUrl}?demo=1&qa=auth-skeleton`, { waitUntil: "networkidle" });
  await expect(page.locator('.nava-loading-scene')).toBeVisible();
  const authVisual = await auditVisualGeometry(page, '.nava-loading-scene');
  if (authVisual.issues.length) throw new Error(`${viewport.name}/loading-auth failed visual geometry: ${JSON.stringify(authVisual.issues)}`);
  const authLayout = await page.locator(".auth-screen").evaluate((node) => ({ frameWidth: node.clientWidth, frameScrollWidth: node.scrollWidth, contentHeight: node.clientHeight, contentScrollHeight: node.scrollHeight }));
  const authElements = await page.locator('.nava-loading-string').count();
  report.push({ viewport: viewport.name, screen: "loading-auth", state: "loading", animatedElements: authElements, ...authLayout, ...authVisual.diagnostics });
  await page.screenshot({ path: path.join(outputDir, viewport.name, "loading-auth.png") });

  for (const [variant, hash] of skeletonRoutes) {
    await page.goto(`${baseUrl}?demo=1&qa=skeleton${hash}`, { waitUntil: "networkidle" });
    const reward = page.locator(".reward-celebration-card > button");
    if (await reward.isVisible().catch(() => false)) await reward.click();
    const selector = `[data-page-skeleton="${variant}"]`;
    await expect(page.locator(selector)).toBeVisible();
    await page.waitForTimeout(160);
    const layout = await page.locator(".phone-frame").evaluate((node) => {
      const content = node.querySelector(".app-content");
      return { frameWidth: node.clientWidth, frameScrollWidth: node.scrollWidth, contentHeight: content?.clientHeight ?? 0, contentScrollHeight: content?.scrollHeight ?? 0 };
    });
    if (layout.frameScrollWidth > layout.frameWidth + 1) throw new Error(`${viewport.name}/loading-${variant} has horizontal overflow: ${JSON.stringify(layout)}`);
    const visual = await auditVisualGeometry(page, selector);
    if (visual.issues.length) throw new Error(`${viewport.name}/loading-${variant} failed visual geometry: ${JSON.stringify(visual.issues)}`);
    const blocks = await page.locator(`${selector} .nava-skeleton-block`).count();
    if (blocks < 4) throw new Error(`${viewport.name}/loading-${variant} has only ${blocks} skeleton blocks`);
    report.push({ viewport: viewport.name, screen: `loading-${variant}`, state: "loading", blocks, ...layout, ...visual.diagnostics });
    await page.screenshot({ path: path.join(outputDir, viewport.name, `loading-${variant}.png`) });
  }

  await page.goto(`${baseUrl}?demo=1&qa=home-widgets-loading#tab=today`, { waitUntil: "networkidle" });
  const reward = page.locator(".reward-celebration-card > button");
  if (await reward.isVisible().catch(() => false)) await reward.click();
  await expect(page.locator(".home-widget-skeleton").first()).toBeVisible();
  const homeWidgetVisual = await auditVisualGeometry(page, ".option-two-home");
  if (homeWidgetVisual.issues.length) throw new Error(`${viewport.name}/loading-home-widgets failed visual geometry: ${JSON.stringify(homeWidgetVisual.issues)}`);
  const homeWidgetLayout = await page.locator(".phone-frame").evaluate((node) => ({ frameWidth: node.clientWidth, frameScrollWidth: node.scrollWidth, contentHeight: node.clientHeight, contentScrollHeight: node.scrollHeight }));
  const homeWidgetBlocks = await page.locator(".home-widget-skeleton").count();
  report.push({ viewport: viewport.name, screen: "loading-home-widgets", state: "loading", blocks: homeWidgetBlocks, ...homeWidgetLayout, ...homeWidgetVisual.diagnostics });
  await page.screenshot({ path: path.join(outputDir, viewport.name, "loading-home-widgets.png") });
  await context.close();
}

async function navigateRoute(page, hash, selector) {
  await page.evaluate((nextHash) => { window.location.hash = nextHash; }, hash);
  await expect(page.locator(selector).first()).toBeVisible();
}

async function returnToHub(page) {
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator("[data-record-module]")).toHaveCount(6);
}

async function captureViewport(browser, baseUrl, viewport, report, errors) {
  const context = await browser.newContext(contextOptions(viewport));
  context.setDefaultTimeout(12000);
  await context.addInitScript(() => {
    window.SpeechRecognition = class { start() { window.__layoutRecognition = this; queueMicrotask(() => this.onstart?.()); } stop() { this.onend?.(); } abort() { this.onend?.(); } };
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${viewport.name}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${viewport.name}: ${error.message}`));

  await mkdir(path.join(outputDir, viewport.name), { recursive: true });
  await login(page, baseUrl, viewport, report);

  await capture(page, viewport, "00-home", ".option-two-home", report);
  const home = page.locator(".option-two-home");
  const homeBox = await home.boundingBox();
  if (!homeBox) throw new Error(`${viewport.name}/00a-home-health-wheel has no swipeable home bounds`);
  const healthWheelX = homeBox.x + homeBox.width * .5;
  const healthWheelY = homeBox.y + homeBox.height * .78;
  await page.mouse.move(healthWheelX, healthWheelY);
  await page.mouse.down();
  await page.mouse.move(healthWheelX + 4, healthWheelY - Math.max(160, homeBox.height / 5), { steps: 8 });
  await page.mouse.up();
  await expect(home).toHaveAttribute("data-health-menu-open", "true");
  await capture(page, viewport, "00a-home-health-wheel", ".option-two-health-menu", report);
  await page.locator(".option-two-scores").click();
  await expect(home).toHaveAttribute("data-health-menu-open", "false");
  await page.locator(".option-two-menu-toggle").click();
  await capture(page, viewport, "00b-home-shortcuts", '.option-two-home[data-health-menu-open="false"]', report);
  await page.getByRole('button',{ name:/功能导航|Utilities/ }).click();
  await capture(page, viewport, 'home-utilities', '.utility-drawer[role="dialog"]', report);
  await page.locator('.utility-drawer > header > button').click();

  await navigateRoute(page, "#tab=today&view=calendar", '[data-home-view="calendar"]');
  await expect(page.locator(".home-year-card")).toBeVisible();
  await expect(page.locator(".home-year-months > span")).toHaveCount(12);
  await expect(page.locator(".home-year-weekdays > span")).toHaveCount(7);
  await capture(page, viewport, "00c-home-calendar", '[data-home-view="calendar"]', report);
  await page.locator(".home-calendar-day.is-today").click();
  await capture(page, viewport, "00d-home-daily-report", '[data-home-view="daily"]', report);

  await navigateRoute(page, "#tab=today&view=notifications", "[data-notification-center]");
  await capture(page, viewport, "00e-notifications", "[data-notification-center]", report);

  await navigateRoute(page, "#tab=today&view=home-widgets", '[data-widget-editor-step="select"]');
  await capture(page, viewport, "00f-home-widgets-select", '[data-widget-editor-step="select"]', report);
  await page.locator(".home-widget-editor footer button").last().click();
  await capture(page, viewport, "00g-home-widgets-sort", '[data-widget-editor-step="sort"]', report);

  await navigateRoute(page, "#tab=today&view=profile-details", '[data-home-view="profile-details"]');
  await capture(page, viewport, "00h-profile-details", '[data-home-view="profile-details"]', report);

  await navigateRoute(page, "#tab=ai", ".chat-layout");
  await capture(page, viewport, "00i-ai", ".chat-layout", report);
  await page.locator(".chat-attachment-trigger").click();
  await capture(page, viewport, "00j-ai-attachment-menu", ".chat-layout", report);
  await page.keyboard.press("Escape");

  // Explicit local UI fixture: exercise growth without calling/claiming real AI.
  await page.locator(".chat-voice-button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".chat-voice-button")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(async () => (await import("/src/services/previewEnvironment.ts")).simulatePreviewInterruption("call"));
  await expect(page.locator(".chat-media-notice")).toHaveCount(0);
  await expect(page.locator(".chat-voice-button")).toHaveAttribute("aria-pressed", "false");
  await page.locator(".chat-list").evaluate((list) => {
    const message = list.querySelector(".chat-message-row");
    for (let i = 0; i < 12 && message; i++) {
      const clone = message.cloneNode(true); clone.dataset.layoutFixture = "long-conversation";
      clone.querySelector("p").textContent = "用于排版测试的长对话，不是模型回复。".repeat(12); list.append(clone);
    }
    list.scrollTop = list.scrollHeight;
  });
  await page.locator('.chat-document-input').setInputFiles({ name: '用于排版验收的长文件名称-会议记录与下一步计划.txt', mimeType: 'text/plain', buffer: Buffer.from('本地布局附件，不发送给模型。') });
  await expect(page.locator('.chat-pending-document')).toBeVisible();
  await capture(page, viewport, "00k-ai-interrupted-long", ".chat-layout", report);
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissLaunch(page);
  await expect(page.locator(".chat-layout")).toBeVisible();

  await navigateRoute(page, "#tab=record", "[data-record-module]");
  await page.locator('[data-tab="record"]').click();
  await capture(page, viewport, "01-record-hub", ".record-module-grid", report);

  await page.locator('[data-record-module="mood"]').click();
  await capture(page, viewport, "02-mood", '[data-module-view="mood-overview"]', report);
  await page.locator(".mood-diary-trigger").click();
  await capture(page, viewport, "03-mood-journal", '[role="dialog"]', report);
  await page.locator('[role="dialog"] button[type="button"]').last().click();
  await returnToHub(page);

  await page.locator('[data-record-module="sleep"]').click();
  await capture(page, viewport, "04-sleep", '[data-module-view="sleep-overview"]', report);
  await returnToHub(page);

  await page.locator('[data-record-module="exercise"]').click();
  await capture(page, viewport, "05-exercise", '[data-module-view="exercise-overview"]', report);
  await page.locator('[aria-label="查看运动设备"], [aria-label="View devices"]').click();
  await capture(page, viewport, "06-exercise-device", '[data-module-view="module-subview"]', report);
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator('[data-module-view="exercise-overview"]')).toBeVisible();
  await returnToHub(page);

  await page.locator('[data-record-module="focus"]').click();
  await capture(page, viewport, "07-focus", '[data-module-view="focus-overview"]', report);
  if (viewport.device) await page.setViewportSize({ width: viewport.device.logicalWidth, height: viewport.device.logicalHeight });
  await page.locator('[aria-label="开始专注"], [aria-label="Start focus"]').click();
  await capture(page, viewport, "08-focus-immersive", '[data-module-view="focus-immersive"]', report);
  await page.locator('[data-module-view="focus-immersive"] .focus-immersive-exit').click();
  if (viewport.device) await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await returnToHub(page);

  await page.locator('[data-record-module="diet"]').click();
  await capture(page, viewport, "09-diet", '[data-module-view="diet-overview"]', report);
  await page.locator('.diet-meals-card .module-card-icon-action').click();
  await capture(page, viewport, "09b-diet-editor", '[data-record-detail="diet"] .record-editor-stack', report);
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator('[data-module-view="diet-overview"]')).toBeVisible();
  await returnToHub(page);

  await page.locator('[data-record-module="face"]').click();
  await capture(page, viewport, "10-face", '[data-module-view="face-overview"]', report);
  await page.locator('[aria-label="使用前置摄像头拍照"], [aria-label="Take a front-camera photo"]').click();
  await capture(page, viewport, "10b-face-editor", '[data-record-detail="face"] .record-editor-stack', report);
  if (await page.locator(".camera-capture-overlay").isVisible().catch(() => false)) {
    await capture(page, viewport, "10c-camera-permission-error", ".camera-capture-overlay", report);
    await page.getByRole("button", { name: "关闭相机", exact: true }).click();
  }
  await navigateRoute(page, "#tab=record", ".record-module-grid");

  await page.locator('.health-report-tabs [role="tab"]').last().click();
  await capture(page, viewport, "11-weekly-dnb", "[data-weekly-health-report]", report);

  await page.locator('[data-tab="trends"]').click();
  await capture(page, viewport, "12-growth-tasks", "[data-growth-screen]", report);

  await page.locator('[data-tab="profile"]').click();
  await expect(page.locator(".profile-stack")).toBeVisible();
  await capture(page, viewport, "13-profile", ".profile-stack", report);
  if (await page.locator(".profile-next-section-button").isVisible()) await page.locator(".profile-next-section-button").click();
  else await page.locator('.profile-device-card').first().scrollIntoViewIfNeeded();
  await expect(page.locator(".profile-device-card").first()).toBeInViewport();
  await capture(page, viewport, "13-profile-devices", ".profile-device-stack", report);
  await captureAdditionalStates(page, viewport, report);
  await context.close();
}

// Every capture is a named page/state, not another copy of the report hub.
// Failures remain in the manifest and do not hide later pages from the audit.
async function captureAdditionalStates(page, viewport, report) {
  async function scenario(name, run) {
    try { await run(); }
    catch (error) {
      report.push({ viewport: viewport.name, screen: name, imageName: `${name}-failed`, state: 'failed-to-reach', issues: [{ kind: 'scenario-failed', message: error.message.slice(0, 1200) }] });
      await saveScreen(page, viewport, `${name}-failed`).catch(() => {});
      console.log(`${viewport.name}/${name}: FAILED ${error.message.slice(0, 180)}`);
      // Reset only this local test page; never operate on the Codex browser.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await dismissLaunch(page);
    }
  }
  async function shot(name, hash, selector) {
    await navigateRoute(page, hash, selector);
    await capture(page, viewport, name, selector, report);
  }
  async function bottom(name, selector) {
    await page.locator(selector).evaluate((root) => {
      for (const node of [root, ...root.querySelectorAll('*')]) {
        if (['auto','scroll'].includes(getComputedStyle(node).overflowY)) node.scrollTop = node.scrollHeight;
      }
    });
    await capture(page, viewport, name, selector, report);
  }
  for (const module of ['mood','sleep','exercise','diet','focus','face']) {
    await scenario(`${module}-editor`, async () => {
      const selector = `[data-record-detail="${module}"] .record-editor-stack`;
      await shot(`${module}-editor-top`, `#tab=record&module=${module}&view=editor`, selector);
      for (const textarea of await page.locator(`${selector} textarea`).all()) {
        if (await textarea.isVisible()) await textarea.fill('本地布局测试：较长的描述需要自然换行，保存操作仍应在卡片内。'.repeat(12));
      }
      await bottom(`${module}-editor-${module === 'face' ? 'bottom' : 'long-bottom'}`, selector);
      const action = page.locator(`${selector} > :is(form,div):not([hidden]) > .section-card > .action-button`).last();
      if (await action.count()) {
        await action.scrollIntoViewIfNeeded();
        const contained = await action.evaluate((node) => {
          const r = node.getBoundingClientRect(), card = node.closest('.section-card').getBoundingClientRect();
          return r.left >= card.left && r.right <= card.right && r.top >= card.top && r.bottom <= card.bottom && node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        });
        if (!contained) throw new Error('Save action is clipped or occluded after scrolling into view');
      }
    });
    await scenario(`${module}-history`, async () => {
      const selector = `[data-record-detail="${module}"] .module-history-report-card`;
      await shot(`${module}-history`, `#tab=record&module=${module}&view=history`, selector);
      await bottom(`${module}-history-bottom`, `[data-record-detail="${module}"]`);
      const share = page.locator('.module-history-share');
      if (await share.isVisible() && await share.isEnabled()) {
        await share.click();
        await capture(page, viewport, `${module}-share`, '.report-share-overlay', report);
        await page.getByRole('button',{name:'关闭分享预览',exact:true}).click();
      }
    });
  }
  const routes = [
    ['exercise-detail', 'exercise', 'detail', '[data-module-view="exercise-detail"]'],
    ...['vitals','heatmap','clock','sports'].map(view => [`exercise-${view}`, 'exercise', view, `.${view}-subview-card`]),
    ['sleep-alert','sleep','alert','.sleep-alert-modal'],
    ['face-compare','face','compare','.module-subview-card'],
    ['face-conditions','face','conditions','[data-face-condition-check]'],
  ];
  for (const [name,module,view,selector] of routes) await scenario(name, () => shot(name, `#tab=record&module=${module}&view=${view}`, selector));
  for (const module of ['mood','diet']) await scenario(`${module}-reminders`, async () => {
    await navigateRoute(page,`#tab=record&module=${module}`,`[data-module-view="${module}-overview"]`);
    if (!(await page.locator('.reminder-settings-body').isVisible())) await page.locator('.reminder-settings-heading').click();
    await page.locator('.reminder-settings-body').scrollIntoViewIfNeeded();
    await capture(page, viewport, `${module}-reminders`, '.reminder-settings', report);
  });
  await scenario('shop', async () => {
    await shot('shop-catalog','#tab=today&view=points-shop','[data-shop-route="catalog"]');
    await page.locator('.points-shop-product-open').first().click();
    await capture(page,viewport,'shop-product','[data-shop-route="product"]',report);
    await page.locator('.points-shop-cart-shortcut').click();
    await capture(page,viewport,'shop-empty-cart','[data-shop-route="cart"]',report);
  });
  await scenario('ai-history-and-voice', async () => {
    await navigateRoute(page,'#tab=ai','.chat-layout');
    await page.locator('.nava-more-trigger').click();
    await page.locator('.app-utility-popover button').filter({hasText:/^历史$|^History$/}).click();
    await capture(page,viewport,'ai-history','.ai-history-sheet',report);
    await page.locator('.ai-history-sheet > header button').click();
    await page.locator('.nava-more-trigger').click();
    await page.locator('.app-utility-popover button').filter({hasText:/^语音聊天$|^Voice chat$/}).click();
    await capture(page,viewport,'ai-voice','.ai-voice-call',report);
    await page.locator('.voice-call-end').click();
    await page.locator('.chat-input-shell input').fill('明天下午三点要交论文');
    await page.locator('.chat-send-button').click();
    await expect(page.locator('[data-structured-confirmation="todo"]')).toBeVisible();
    await page.locator('[data-structured-confirmation="todo"]').scrollIntoViewIfNeeded();
    await capture(page,viewport,'ai-confirmation','.chat-layout',report);
    await page.getByRole('button',{name:'逐项编辑',exact:true}).click();
    await page.locator('input[aria-label="事项数值"]').fill('明天要提交的课程论文，需要检查图表、引用和完整说明。'.repeat(4));
    await capture(page,viewport,'ai-confirmation-edit-long','.chat-layout',report);
    await page.getByRole('button',{name:'取消',exact:true}).click();
  });
  await scenario('morning-planning', async () => {
    await navigateRoute(page,'#tab=record&module=focus','[data-module-view="focus-overview"]');
    await page.locator('.morning-plan-entry').click();
    for (let i=0;i<3;i++) {
      await page.locator('.morning-plan-add input').fill(`本地排版任务${i+1}：完整阅读并整理小组报告中的重点，再核对所有数据与文献出处`);
      await page.locator('.morning-plan-add button').click();
    }
    await capture(page,viewport,'morning-collect','[data-morning-plan-step="0"]',report);
    await page.locator('.morning-plan-footer .primary').click();
    for(const button of (await page.locator('.morning-plan-choices > button').all()).slice(-3)) await button.click();
    await capture(page,viewport,'morning-priorities','[data-morning-plan-step="1"]',report);
    await page.locator('.morning-plan-footer .primary').click();
    for(const input of await page.locator('.morning-plan-timebox input').all()) await input.fill(await input.getAttribute('max'));
    await capture(page,viewport,'morning-timeboxes','[data-morning-plan-step="2"]',report);
    await page.locator('.morning-plan-footer .primary').click();
    await capture(page,viewport,'morning-review-long','[data-morning-plan-step="3"]',report);
    await page.locator('.morning-plan-close').click();
  });
  await scenario('profile-avatar',async()=>{
    await navigateRoute(page,'#tab=profile','.profile-stack');
    await page.locator('.avatar-button').click();
    await capture(page,viewport,'profile-avatar','.avatar-sheet',report);
    await page.locator('.avatar-picker > header button').click();
    await page.getByRole('button',{name:'删除账号与全部数据',exact:true}).click();
    await capture(page,viewport,'profile-delete-confirmation','.account-delete-sheet',report);
    await page.locator('.account-delete-sheet > header button').click();
  });
  for(const module of ['mood','sleep']) await scenario(`${module}-monthly-empty`,async()=>{
    await navigateRoute(page,`#tab=record&module=${module}`,`[data-module-view="${module}-overview"]`);
    const monthly = page.locator(`[data-monthly-wellbeing="${module}"]`);
    await monthly.getByRole('button',{name:'月度回顾'}).click();
    await monthly.locator('input[type="month"]').fill('2024-02');
    await monthly.scrollIntoViewIfNeeded();
    await capture(page,viewport,`${module}-monthly-empty`,`[data-monthly-wellbeing="${module}"]`,report);
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  if (!viewports.length) throw new Error('No device matched NAVA_LAYOUT_DEVICES');
  const report = [];
  const source = {
    commit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    appDiffSha256: createHash('sha256').update(execFileSync('git',['diff','HEAD','--','src'])).digest('hex'),
    startedAt: new Date().toISOString(),
  };
  const errors = [];
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      console.log(`Starting ${viewport.name}: complete page/state catalog`);
      try {
        if (process.platform === 'win32') {
          const freeKiB = Number(execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'], { encoding:'utf8' }).trim());
          if (!Number.isFinite(freeKiB) || freeKiB < 4 * 1024 * 1024) {
            throw new Error('Layout capture paused: less than 4 GiB available memory or memory check unavailable');
          }
        }
        await captureViewport(browser, baseUrl, viewport, report, errors);
        if (!process.argv.includes("--content-only")) await captureSkeletonViewport(browser, baseUrl, viewport, report, errors);
      } catch (error) {
        errors.push(`${viewport.name}: ${error.message}`);
        console.error(`${viewport.name}: ${error.message.slice(0, 600)}`);
      } finally {
        for (const context of browser.contexts()) await context.close();
      }
    }
    const expectedContent = `auth-login auth-register auth-recovery auth-otp-login auth-reset 00-onboarding-welcome 00-onboarding-1-gender 00-onboarding-2-occupation 00-onboarding-3-ageGroup 00-onboarding-4-hobbies 00-onboarding-5-sleepDuration 00-onboarding-6-exerciseDuration 00-onboarding-7-dietPreferences 00-onboarding-privacy 00-home 00a-home-health-wheel 00b-home-shortcuts home-utilities 00c-home-calendar 00d-home-daily-report 00e-notifications 00f-home-widgets-select 00g-home-widgets-sort 00h-profile-details 00i-ai 00j-ai-attachment-menu 00k-ai-interrupted-long 01-record-hub 02-mood 03-mood-journal 04-sleep 05-exercise 06-exercise-device 07-focus 08-focus-immersive 09-diet 09b-diet-editor 10-face 10b-face-editor 10c-camera-permission-error 11-weekly-dnb 12-growth-tasks 13-profile 13-profile-devices mood-editor-top mood-editor-long-bottom mood-history mood-history-bottom mood-share sleep-editor-top sleep-editor-long-bottom sleep-history sleep-history-bottom sleep-share exercise-editor-top exercise-editor-long-bottom exercise-history exercise-history-bottom exercise-share diet-editor-top diet-editor-long-bottom diet-history diet-history-bottom diet-share focus-editor-top focus-editor-long-bottom focus-history focus-history-bottom focus-share face-editor-top face-editor-bottom face-history face-history-bottom face-share exercise-detail exercise-vitals exercise-heatmap exercise-clock exercise-sports sleep-alert face-compare face-conditions mood-reminders diet-reminders shop-catalog shop-product shop-empty-cart ai-history ai-voice ai-confirmation ai-confirmation-edit-long morning-collect morning-priorities morning-timeboxes morning-review-long profile-avatar profile-delete-confirmation mood-monthly-empty sleep-monthly-empty`.split(' ');
    const expected = [...expectedContent, ...(process.argv.includes('--content-only') ? [] : ['loading-auth', ...skeletonRoutes.map(([variant])=>`loading-${variant}`), 'loading-home-widgets'])];
    for (const viewport of viewports) for (const screen of expected) {
      if (!report.some(row=>row.viewport===viewport.name && row.screen===screen)) report.push({viewport:viewport.name,screen,state:'not-reached',issues:[{kind:'required-state-not-reached'}]});
    }
    const passed = !report.some((screen) => screen.issues?.length) && !errors.length;
    const coverage = {
      fixture: 'Local demo and explicitly labeled long-input fixtures; no production records or real AI claims',
      runtime: 'Serial external headless Chromium, one context at a time, DPR 1',
      devices: viewports.map(v => ({id:v.name,width:v.device?.logicalWidth ?? v.width,height:v.device?.logicalHeight ?? v.height,screens:report.filter(r=>r.viewport===v.name).length})),
      limits: ['Not physical iPhone/Safari tests', 'Not a proof of all combinations of arbitrary user input', 'Empty AI history and empty shop cart are not populated-state acceptance', 'Fake media engine checks layout, not physical microphone/camera or AI availability'],
    };
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ passed, incomplete: false, source, coverage, expectedStatesPerDevice: expected, screens: report, errors }, null, 2)}\n`, "utf8");
    const escape = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const names = [...new Set(report.map(row=>row.screen))];
    const gallery = `<!doctype html><meta charset="utf-8"><title>NAVA 页面 × 机型验收</title><style>body{font:16px system-ui;margin:24px;background:#eff8fc;color:#163d51}nav{position:sticky;top:0;background:#eff8fc;padding:12px}section{display:flex;gap:12px;overflow:auto;margin-bottom:24px}figure{margin:0;min-width:230px;max-width:230px}img{width:230px;height:auto}figcaption{font-size:12px}a{color:#176988}</style><h1>页面 × 机型验收</h1><p>本地布局测试；${viewports.length} 个尺寸/机型，${report.length} 个页面状态。自动检查${passed?'通过':'仍有失败'}。不代表真机或真实 AI 验收。</p><nav><label>跳转页面 <select onchange="document.getElementById(this.value).scrollIntoView()">${names.map((name,i)=>`<option value="s${i}">${escape(name)}</option>`).join('')}</select></label> · <a href="report.json">完整机器检查清单</a></nav>${names.map((name,i)=>`<h2 id="s${i}">${escape(name)}</h2><section>${report.filter(row=>row.screen===name).map(row=>`<figure><figcaption>${escape(row.viewport)} · ${row.issues?.length?'有问题':'已检查'}</figcaption><a href="${encodeURIComponent(row.viewport)}/${encodeURIComponent(name)}.png"><img loading="lazy" src="${encodeURIComponent(row.viewport)}/${encodeURIComponent(name)}.png" alt="${escape(name)}"></a></figure>`).join('')}</section>`).join('')}`;
    await writeFile(path.join(outputDir,'index.html'),gallery,'utf8');
    console.log(`Captured ${report.length} Figma-aligned states across ${viewports.length} iPhone viewports.`);
    if (!passed) throw new Error("Layout issues remain; see the page/state matrix.");
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
