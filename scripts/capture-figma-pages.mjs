import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.SCREENSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUTPUT_DIR)
  : path.resolve(root, "..", "Build", "TestRuns", "nava-figma-pages");
const port = Number(process.env.PORT || 5194);
const demoAccount = "13800138000";
const demoPassword = "12345678";

const viewports = [
  { name: "phone-360x740", width: 360, height: 740 },
  { name: "phone-375x812", width: 375, height: 812 },
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "phone-430x932", width: 430, height: 932 },
];

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
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01 && rect.width > 0.5 && rect.height > 0.5;
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
      const renderedLineCount = Number.isFinite(lineHeight) && lineHeight > 0 ? element.getBoundingClientRect().height / lineHeight : 1;
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

    const controls = [...root.querySelectorAll("button:not([disabled]),a[href],input:not([type=hidden]),select,textarea,[role=button]")]
      .filter(rendered)
      .filter((element) => !element.matches(".sr-only,.visually-hidden"))
      .filter((element) => element.getAttribute("aria-hidden") !== "true");
    diagnostics.checkedControls = controls.length;
    for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
      const left = controls[leftIndex];
      const leftRect = left.getBoundingClientRect();
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
        const rightRect = right.getBoundingClientRect();
        const overlapWidth = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
        const overlapHeight = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
        const overlapArea = overlapWidth * overlapHeight;
        const smallerArea = Math.min(leftRect.width * leftRect.height, rightRect.width * rightRect.height);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.18) {
          issues.push({ kind: "controls-overlap", left: selectorName(left), right: selectorName(right), ratio: Number((overlapArea / smallerArea).toFixed(3)) });
        }
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
      ".record-module-grid", ".page-skeleton", ".page-skeleton-record-grid", ".page-skeleton-daily-metrics",
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
    throw new Error(`${viewport.name}/${name} has horizontal overflow: ${JSON.stringify(layout)}`);
  }
  const visual = await auditVisualGeometry(page, ".onboarding-screen");
  if (visual.issues.length) throw new Error(`${viewport.name}/${name} failed visual geometry: ${JSON.stringify(visual.issues)}`);
  report.push({ viewport: viewport.name, screen: name, state: "content", ...layout, ...visual.diagnostics });
  await page.screenshot({ path: path.join(outputDir, viewport.name, `${name}.png`) });
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
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.locator(".auth-submit").click();
  await completeOnboarding(page, viewport, report);
  await expect(page.locator(".phone-frame")).toBeVisible();
  await page.waitForTimeout(350);
  const reward = page.locator(".reward-celebration-card > button");
  if (await reward.isVisible().catch(() => false)) await reward.click();
}

async function capture(page, viewport, name, selector, report) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  await page.waitForTimeout(650);
  const layout = await page.locator(".phone-frame").evaluate((node) => {
    const content = node.querySelector(".app-content");
    return {
      frameWidth: node.clientWidth,
      frameScrollWidth: node.scrollWidth,
      contentHeight: content?.clientHeight ?? 0,
      contentScrollHeight: content?.scrollHeight ?? 0,
    };
  });
  if (layout.frameScrollWidth > layout.frameWidth + 1) {
    throw new Error(`${viewport.name}/${name} has horizontal overflow: ${JSON.stringify(layout)}`);
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
      selectedOptions: [...section.querySelectorAll("select")].map((select) => select.selectedOptions[0]?.textContent?.trim() ?? ""),
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
  if (visual.issues.length) throw new Error(`${viewport.name}/${name} failed visual geometry: ${JSON.stringify(visual.issues)}`);
  report.push({ viewport: viewport.name, screen: name, state: "content", ...layout, ...visual.diagnostics });
  await page.screenshot({ path: path.join(outputDir, viewport.name, `${name}.png`) });
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
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => false });
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
  });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${viewport.name}/skeleton: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${viewport.name}/skeleton: ${error.message}`));
  await mkdir(path.join(outputDir, viewport.name), { recursive: true });

  await page.goto(`${baseUrl}?demo=1&qa=auth-skeleton`, { waitUntil: "networkidle" });
  await expect(page.locator('[data-page-skeleton="auth"]')).toBeVisible();
  const authVisual = await auditVisualGeometry(page, '[data-page-skeleton="auth"]');
  if (authVisual.issues.length) throw new Error(`${viewport.name}/loading-auth failed visual geometry: ${JSON.stringify(authVisual.issues)}`);
  const authLayout = await page.locator(".auth-screen").evaluate((node) => ({ frameWidth: node.clientWidth, frameScrollWidth: node.scrollWidth, contentHeight: node.clientHeight, contentScrollHeight: node.scrollHeight }));
  const authBlocks = await page.locator('[data-page-skeleton="auth"] .nava-skeleton-block').count();
  report.push({ viewport: viewport.name, screen: "loading-auth", state: "loading", blocks: authBlocks, ...authLayout, ...authVisual.diagnostics });
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
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
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

  await navigateRoute(page, "#tab=today&view=calendar", '[data-home-view="calendar"]');
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
  await page.locator('[aria-label="开始专注"], [aria-label="Start focus"]').click();
  await capture(page, viewport, "08-focus-immersive", '[data-module-view="focus-immersive"]', report);
  await page.locator('[data-module-view="focus-immersive"] .focus-immersive-exit').click();
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
  await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
  await expect(page.locator('[data-module-view="face-overview"]')).toBeVisible();
  await returnToHub(page);

  await page.locator('.health-report-tabs [role="tab"]').last().click();
  await capture(page, viewport, "11-weekly-dnb", "[data-weekly-health-report]", report);

  await page.locator('[data-tab="trends"]').click();
  await capture(page, viewport, "12-growth-tasks", "[data-growth-screen]", report);

  await page.locator('[data-tab="profile"]').click();
  await expect(page.locator(".profile-stack")).toBeVisible();
  await capture(page, viewport, "13-profile", ".profile-stack", report);
  await page.locator(".profile-next-section-button").click();
  await expect(page.locator(".profile-device-card").first()).toBeInViewport();
  await capture(page, viewport, "13-profile-devices", ".profile-device-stack", report);
  await context.close();
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const report = [];
  const errors = [];
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      await captureViewport(browser, baseUrl, viewport, report, errors);
      await captureSkeletonViewport(browser, baseUrl, viewport, report, errors);
    }
    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ screens: report, errors }, null, 2)}\n`, "utf8");
    console.log(`Captured ${report.length} Figma-aligned states across ${viewports.length} iPhone viewports.`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
