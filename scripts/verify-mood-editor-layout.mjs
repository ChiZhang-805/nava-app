import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.RECORD_EDITOR_LAYOUT_OUTPUT_DIR
  ? path.resolve(process.env.RECORD_EDITOR_LAYOUT_OUTPUT_DIR)
  : path.resolve(root, "..", "Build", "TestRuns", "nava-record-editor-layout-v123");
const port = Number(process.env.PORT || 5209);
const demoAccount = "13800138000";
const demoPassword = "12345678";
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
    ["gender", false],
    ["occupation", false],
    ["ageGroup", false],
    ["hobbies", true],
    ["sleepDuration", false],
    ["exerciseDuration", false],
    ["dietPreferences", true],
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

async function dismissReward(page) {
  const reward = page.locator(".reward-celebration-layer");
  if (!(await reward.isVisible().catch(() => false))) return;
  await reward.locator(".reward-celebration-card > button").click();
  await expect(reward).toBeHidden();
}

async function signIn(page, baseUrl) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor({ state: "visible", timeout: 10_000 });
  await completeOnboarding(page);
  await expect(page.locator(".phone-frame")).toBeVisible({ timeout: 10_000 });
  await dismissReward(page);
}

async function readCardGeometry(page, module) {
  return page.locator(`.record-detail[data-record-detail="${module}"]`).evaluate((detail) => {
    const frame = detail.closest(".phone-frame");
    const content = detail.closest(".app-content");
    const noticeToolbar = detail.querySelector(".record-detail-toolbar--notice-only");
    const card = detail.querySelector(".record-editor-stack > form:not([hidden]) > .section-card, .record-editor-stack > div:not([hidden]) > .section-card");
    const nav = frame?.querySelector(".bottom-nav");
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height } : null;
    };
    return {
      frameOverflowX: frame ? frame.scrollWidth - frame.clientWidth : null,
      contentOverflowY: content ? content.scrollHeight - content.clientHeight : null,
      content: rect(content),
      contentMetrics: content ? { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight } : null,
      detail: rect(detail),
      detailMetrics: { clientHeight: detail.clientHeight, scrollHeight: detail.scrollHeight },
      cardMetrics: card ? { clientHeight: card.clientHeight, scrollHeight: card.scrollHeight } : null,
      cardChildren: card ? Array.from(card.children).map((node) => ({
        className: node.className,
        display: getComputedStyle(node).display,
        minHeight: getComputedStyle(node).minHeight,
        marginTop: getComputedStyle(node).marginTop,
        marginBottom: getComputedStyle(node).marginBottom,
        rect: rect(node),
      })) : [],
      card: rect(card),
      noticeToolbar: rect(noticeToolbar),
      nav: rect(nav),
    };
  });
}

function assertOneScreenCard(name, geometry) {
  const { card, contentOverflowY, detail, frameOverflowX, nav, noticeToolbar } = geometry;
  if (!card || !detail || !nav) throw new Error(`${name}: card geometry is incomplete ${JSON.stringify(geometry)}`);
  const cardNavGap = nav.top - card.bottom;
  const detailCardInset = card.top - (noticeToolbar?.bottom ?? detail.top);
  if ((frameOverflowX ?? 0) > 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(geometry)}`);
  if ((contentOverflowY ?? 0) > 1) throw new Error(`${name}: editor should fit one screen ${JSON.stringify(geometry)}`);
  if (cardNavGap < 8 || cardNavGap > 44) throw new Error(`${name}: card/navigation gap is ${cardNavGap.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (detailCardInset < (noticeToolbar ? -12 : -1) || detailCardInset > 16) throw new Error(`${name}: editor card top inset is ${detailCardInset.toFixed(1)}px ${JSON.stringify(geometry)}`);
  return { ...geometry, cardNavGap, detailCardInset };
}

async function readGeometry(page, module, fieldSelector) {
  return page.locator(`.record-detail[data-record-detail="${module}"]`).evaluate((detail, selector) => {
    const frame = detail.closest(".phone-frame");
    const content = detail.closest(".app-content");
    const card = detail.querySelector(".record-editor-stack > form:not([hidden]) > .section-card");
    const field = detail.querySelector(selector);
    const textarea = field?.querySelector("textarea");
    const save = card?.querySelector(':scope > .action-button');
    const nav = frame?.querySelector(".bottom-nav");
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height } : null;
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      frameOverflowX: frame ? frame.scrollWidth - frame.clientWidth : null,
      contentOverflowY: content ? content.scrollHeight - content.clientHeight : null,
      detail: rect(detail),
      card: rect(card),
      cardChildren: card ? Array.from(card.children).map((node) => ({
        className: node.className,
        marginTop: getComputedStyle(node).marginTop,
        marginBottom: getComputedStyle(node).marginBottom,
        minHeight: getComputedStyle(node).minHeight,
        flex: getComputedStyle(node).flex,
        rect: rect(node),
      })) : [],
      field: rect(field),
      textarea: rect(textarea),
      save: rect(save),
      nav: rect(nav),
    };
  }, fieldSelector);
}

function assertGeometry(name, geometry, expectedMinimum) {
  const { card, contentOverflowY, detail, field, frameOverflowX, nav, save, textarea } = geometry;
  if (!card || !detail || !field || !textarea || !save || !nav) throw new Error(`${name}: editor geometry is incomplete ${JSON.stringify(geometry)}`);
  const cardNavGap = nav.top - card.bottom;
  const detailCardInset = card.top - detail.top;
  const actionBottomInset = card.bottom - save.bottom;
  if ((frameOverflowX ?? 0) > 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(geometry)}`);
  if ((contentOverflowY ?? 0) > 1) throw new Error(`${name}: normal editor should fit one screen ${JSON.stringify(geometry)}`);
  if (cardNavGap < 10 || cardNavGap > 44) throw new Error(`${name}: card/navigation gap is ${cardNavGap.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (detailCardInset < -1 || detailCardInset > 16) throw new Error(`${name}: editor card top inset is ${detailCardInset.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (actionBottomInset < 8 || actionBottomInset > 28) throw new Error(`${name}: save action bottom inset is ${actionBottomInset.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (field.top < card.top || field.bottom > save.top + 1 || save.bottom > card.bottom + 1) throw new Error(`${name}: journal or save action escapes/overlaps the card ${JSON.stringify(geometry)}`);
  if (textarea.top < field.top || textarea.bottom > field.bottom + 1) throw new Error(`${name}: textarea escapes its field ${JSON.stringify(geometry)}`);
  if (textarea.height < expectedMinimum - 1) throw new Error(`${name}: textarea is only ${textarea.height.toFixed(1)}px tall ${JSON.stringify(geometry)}`);
  return { ...geometry, cardNavGap, detailCardInset, actionBottomInset };
}

async function assertEditorHeader(page, module, expectedShortcutCount) {
  const detail = page.locator(`.record-detail[data-record-detail="${module}"]`);
  await expect(detail.locator(".record-detail-date")).toHaveCount(0);
  await expect(detail.locator(".record-editor-stack > form:not([hidden]) .record-editor-title-icon, .record-editor-stack > div:not([hidden]) .record-editor-title-icon")).toHaveCount(1);
  await expect(detail.locator(".record-editor-stack > form:not([hidden]) .record-section-date, .record-editor-stack > div:not([hidden]) .record-section-date")).toHaveCount(1);
  const header = await detail.evaluate((node) => {
    const active = node.querySelector(".record-editor-stack > form:not([hidden]), .record-editor-stack > div:not([hidden])");
    const title = active?.querySelector(".record-editor-title")?.getBoundingClientRect();
    const icon = active?.querySelector(".record-editor-title-icon")?.getBoundingClientRect();
    const date = active?.querySelector(".record-section-date")?.getBoundingClientRect();
    const dateStyle = active?.querySelector(".record-section-date") ? getComputedStyle(active.querySelector(".record-section-date")) : null;
    const headingActions = active?.querySelector(".record-editor-heading-actions");
    const shortcuts = headingActions ? [...headingActions.querySelectorAll("button")].length : 0;
    return {
      titleCenter: title ? title.top + title.height / 2 : null,
      iconCenter: icon ? icon.top + icon.height / 2 : null,
      dateCenter: date ? date.top + date.height / 2 : null,
      dateBackground: dateStyle?.backgroundColor ?? null,
      shortcuts,
    };
  });
  if (header.titleCenter == null || header.iconCenter == null || header.dateCenter == null) throw new Error(`${module}: incomplete editor heading ${JSON.stringify(header)}`);
  if (Math.abs(header.titleCenter - header.iconCenter) > 2 || Math.abs(header.titleCenter - header.dateCenter) > 3) throw new Error(`${module}: title/icon/date are not vertically aligned ${JSON.stringify(header)}`);
  if (header.dateBackground !== "rgba(0, 0, 0, 0)") throw new Error(`${module}: date action has an unexpected background ${JSON.stringify(header)}`);
  if (header.shortcuts !== expectedShortcutCount) throw new Error(`${module}: expected ${expectedShortcutCount} shortcuts before date action ${JSON.stringify(header)}`);
}

async function assertContainedAction(page, module, state) {
  const card = page.locator(`.record-detail[data-record-detail="${module}"] .record-editor-stack > :is(form,div):not([hidden]) > .section-card`).first();
  const action = card.locator(':scope > .action-button').last();
  await action.scrollIntoViewIfNeeded();
  const states = [];
  for (const end of [false, true]) {
    await card.evaluate((card, end) => { const node = card.querySelector('.record-editor-fields') ?? card; node.scrollTop = end ? node.scrollHeight : 0; }, end);
    const geometry = await action.evaluate((node) => {
      const card = node.closest('.section-card');
      const box = node.getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      const nav = node.closest('.phone-frame').querySelector('.bottom-nav').getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
        cardTop: bounds.top, cardBottom: bounds.bottom, cardLeft: bounds.left, cardRight: bounds.right,
        navTop: nav.top, hit: hit === node || node.contains(hit),
        overflowX: card.scrollWidth - card.clientWidth, scrollTop: card.scrollTop,
        escapes: [...card.querySelectorAll('*')].filter((child) => child.getBoundingClientRect().right > bounds.right).map((child) => ({ class:child.className, width:child.getBoundingClientRect().width, right:child.getBoundingClientRect().right })) };
    });
    if (geometry.top < geometry.cardTop || geometry.bottom > geometry.cardBottom
      || geometry.left < geometry.cardLeft || geometry.right > geometry.cardRight
      || geometry.bottom > geometry.navTop - 4 || !geometry.hit || geometry.overflowX > 1) {
      throw new Error(`${module}/${state}: action escapes card or is obscured ${JSON.stringify(geometry)}`);
    }
    states.push(geometry);
  }
  return states;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const context = await browser.newContext({ locale: "zh-CN",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => {
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
  });
  const page = await context.newPage();
  await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
    await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
  });
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await signIn(page, baseUrl);
    if (process.argv.includes('--profile-only')) {
      const profileResults = [];
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${baseUrl}?demo=1#tab=today&view=profile-details`, { waitUntil: "domcontentloaded" });
        const profile = page.locator('[data-home-view="profile-details"]');
        await expect(profile).toBeVisible();
        await expect(profile.locator('.advanced-profile-completeness')).toHaveCount(0);
        await expect(profile.locator('.advanced-profile-wheel')).toHaveCount(4);
        await expect(profile.locator('select')).toHaveCount(0);
        await expect(profile.locator('.home-experience-back svg')).toHaveClass(/lucide-house/);
        const identityTypography = await profile.locator('.advanced-profile-identity > div:nth-child(2)').evaluate((node) => ({
          title: Number.parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),
          account: Number.parseFloat(getComputedStyle(node.querySelector('small')).fontSize),
        }));
        if (identityTypography.title < 16 || identityTypography.account < 10) throw new Error(`profile/${viewport.name}: identity typography is too small ${JSON.stringify(identityTypography)}`);
        const firstWheel = profile.locator('.advanced-profile-wheel').first();
        await firstWheel.locator(':scope > button').click();
        const wheelList = firstWheel.locator('.advanced-profile-wheel-list');
        await expect(wheelList).toBeVisible();
        const wheelGeometry = await wheelList.evaluate((node) => ({ height: node.getBoundingClientRect().height, overflow: node.scrollHeight - node.clientHeight, right: node.getBoundingClientRect().right, viewportWidth: window.innerWidth }));
        if (wheelGeometry.height < 160 || wheelGeometry.height > 184 || wheelGeometry.overflow <= 0 || wheelGeometry.right > wheelGeometry.viewportWidth + 1) throw new Error(`profile/${viewport.name}: wheel geometry is invalid ${JSON.stringify(wheelGeometry)}`);
        await firstWheel.getByRole('option').nth(2).click();
        const overflow = await profile.evaluate((node) => node.scrollWidth - node.clientWidth);
        if (overflow > 1) throw new Error(`profile/${viewport.name}: profile overflows horizontally by ${overflow}px`);
        await page.screenshot({ path: path.join(outputDir, `profile-wheel-${viewport.name}.png`) });
        profileResults.push({ viewport: viewport.name, identityTypography, wheelGeometry });
      }
      await writeFile(path.join(outputDir, 'profile-report.json'), JSON.stringify(profileResults, null, 2));
      console.log(`Advanced profile visual verification passed at ${viewports.length} phone viewports.`);
      return;
    }
    if (process.argv.includes('--keyboard-only')) {
      await page.setViewportSize({ width:390,height:480 });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=mood&view=journal`, { waitUntil:'networkidle' });
      const dialog = page.locator('.module-modal--journal');
      await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeInViewport({ratio:1});
      await page.waitForTimeout(600);
      await page.screenshot({path:path.join(outputDir,'journal-keyboard-diagnostic.png')});
      return;
    }
    const moodResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.record-detail[data-record-detail="mood"] .record-editor-stack > form:not([hidden])')).toBeVisible();
      await assertEditorHeader(page, "mood", 0);
      await page.waitForTimeout(760);
      const minimum = viewport.height <= 780 ? 52 : 88;
      const geometry = assertGeometry(`mood/${viewport.name}`, await readGeometry(page, "mood", ".mood-diary-field"), minimum);
      moodResults.push({ name: viewport.name, ...geometry });
      await page.screenshot({ path: path.join(outputDir, `mood-${viewport.name}.png`) });
    }
    const shortTextarea = moodResults[0].textarea.height;
    const tallTextarea = moodResults.at(-1).textarea.height;
    if (tallTextarea < shortTextarea + 80) throw new Error(`Journal does not absorb taller viewports: ${shortTextarea}px -> ${tallTextarea}px`);

    const sleepResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=sleep&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.record-detail[data-record-detail="sleep"] .record-editor-stack > form:not([hidden])')).toBeVisible();
      await expect(page.locator(".sleep-preset-icons button")).toHaveCount(3);
      await assertEditorHeader(page, "sleep", 3);
      await page.waitForTimeout(760);
      const minimum = viewport.height <= 780 ? 60 : viewport.height <= 844 ? 64 : 82;
      const geometry = assertGeometry(`sleep/${viewport.name}`, await readGeometry(page, "sleep", ".sleep-note-field"), minimum);
      const presetGeometry = await page.locator('.record-detail[data-record-detail="sleep"]').evaluate((detail) => {
        const active = detail.querySelector(".record-editor-stack > form:not([hidden])");
        const title = active?.querySelector(".section-heading h2")?.getBoundingClientRect();
        const group = active?.querySelector(".sleep-preset-icons")?.getBoundingClientRect();
        const buttons = [...(active?.querySelectorAll(".sleep-preset-icons button") ?? [])].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        return {
          titleCenter: title ? title.top + title.height / 2 : null,
          groupCenter: group ? group.top + group.height / 2 : null,
          buttons,
        };
      });
      if (presetGeometry.titleCenter == null || presetGeometry.groupCenter == null || Math.abs(presetGeometry.titleCenter - presetGeometry.groupCenter) > 3) {
        throw new Error(`sleep/${viewport.name}: title and presets are not horizontally aligned ${JSON.stringify(presetGeometry)}`);
      }
      if (presetGeometry.buttons.some((button) => Math.abs(button.width - button.height) > .5 || button.width < 32 || button.width > 38)) {
        throw new Error(`sleep/${viewport.name}: preset controls are not compact circles ${JSON.stringify(presetGeometry)}`);
      }
      sleepResults.push({ name: viewport.name, ...geometry, presetGeometry });
      await page.screenshot({ path: path.join(outputDir, `sleep-${viewport.name}.png`) });
    }
    const shortSleepNote = sleepResults[0].textarea.height;
    const tallSleepNote = sleepResults.at(-1).textarea.height;
    if (tallSleepNote < shortSleepNote + 60) throw new Error(`Sleep note does not absorb taller viewports: ${shortSleepNote}px -> ${tallSleepNote}px`);
    const sleepStagesBeforePreset = await page.locator('.record-detail[data-record-detail="sleep"] input[type="number"]').evaluateAll((inputs) => inputs.map((input) => input.value));
    await page.locator('[data-sleep-preset="early"]').click();
    await expect(page.locator('.record-detail[data-record-detail="sleep"] input[type="time"]').nth(0)).toHaveValue("22:30");
    await expect(page.locator('.record-detail[data-record-detail="sleep"] input[type="time"]').nth(1)).toHaveValue("06:30");
    await expect(page.locator('[data-sleep-preset="early"]')).toHaveAttribute("aria-pressed", "true");
    const sleepStagesAfterPreset = await page.locator('.record-detail[data-record-detail="sleep"] input[type="number"]').evaluateAll((inputs) => inputs.map((input) => input.value));
    if (JSON.stringify(sleepStagesAfterPreset.slice(1)) !== JSON.stringify(sleepStagesBeforePreset.slice(1))) throw new Error(`Sleep preset invented stage values: ${JSON.stringify({ sleepStagesBeforePreset, sleepStagesAfterPreset })}`);

    const exerciseResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=exercise&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="exercise"]');
      await expect(detail.locator('.record-editor-stack > form:not([hidden])')).toBeVisible();
      await expect(detail.locator('.exercise-self-check-grid .exercise-rating-field')).toHaveCount(3);
      await expect(detail.locator('.exercise-injury-toggle')).toBeVisible();
      await expect(detail.locator('.exercise-recovery-estimate')).toBeVisible();
      await assertEditorHeader(page, "exercise", 0);
      await page.waitForTimeout(500);
      const geometry = assertOneScreenCard(`exercise/${viewport.name}`, await readCardGeometry(page, "exercise"));
      const action = await detail.locator('form:not([hidden]) .action-button').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const nav = node.closest('.phone-frame')?.querySelector('.bottom-nav')?.getBoundingClientRect();
        return { bottom: rect.bottom, navTop: nav?.top ?? null };
      });
      if (action.navTop == null || action.bottom > action.navTop - 8) throw new Error(`exercise/${viewport.name}: save action is clipped ${JSON.stringify(action)}`);
      exerciseResults.push({ name: viewport.name, ...geometry, action });
      await page.screenshot({ path: path.join(outputDir, `exercise-${viewport.name}.png`) });
      await detail.locator('.exercise-injury-toggle input').check();
      await detail.locator('.exercise-injury-note input').fill('膝部不适，需要减少负荷并观察恢复情况。'.repeat(8));
      await detail.locator('.exercise-note-field textarea').fill('训练记录和恢复观察。'.repeat(200));
      await page.waitForTimeout(700);
      await expect(detail.locator('.exercise-recovery-estimate.is-caution')).toBeVisible();
      const ratingsFit = await detail.locator('.exercise-rating-field > span').evaluateAll((labels) => labels.every((node) => node.scrollWidth <= node.clientWidth + 1 && getComputedStyle(node).whiteSpace === 'nowrap'));
      if (!ratingsFit) throw new Error(`${viewport.name}: exercise rating label/value is truncated`);
      exerciseResults.at(-1).expanded = await assertContainedAction(page, 'exercise', viewport.name);
      await page.screenshot({ path: path.join(outputDir, `exercise-expanded-${viewport.name}.png`) });
    }

    const dietResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=diet&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="diet"]');
      await expect(detail.locator('.record-editor-stack > form:not([hidden])')).toBeVisible();
      await expect(detail.locator(".diet-quick-food-icons button")).toHaveCount(4);
      await assertEditorHeader(page, "diet", 4);
      const shortcutGeometry = await detail.evaluate((node) => {
        const active = node.querySelector(".record-editor-stack > form:not([hidden])");
        const title = active?.querySelector(".section-heading h2")?.getBoundingClientRect();
        const group = active?.querySelector(".diet-quick-food-icons")?.getBoundingClientRect();
        const buttons = [...(active?.querySelectorAll(".diet-quick-food-icons button") ?? [])].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        return {
          titleCenter: title ? title.top + title.height / 2 : null,
          groupCenter: group ? group.top + group.height / 2 : null,
          buttons,
          frameOverflowX: node.closest(".phone-frame")?.scrollWidth - node.closest(".phone-frame")?.clientWidth,
        };
      });
      if (shortcutGeometry.titleCenter == null || shortcutGeometry.groupCenter == null || Math.abs(shortcutGeometry.titleCenter - shortcutGeometry.groupCenter) > 3) throw new Error(`diet/${viewport.name}: title and shortcuts are not aligned ${JSON.stringify(shortcutGeometry)}`);
      if (shortcutGeometry.buttons.some((button) => Math.abs(button.width - button.height) > .5 || button.width < 32 || button.width > 38)) throw new Error(`diet/${viewport.name}: shortcuts are not compact circles ${JSON.stringify(shortcutGeometry)}`);
      if ((shortcutGeometry.frameOverflowX ?? 0) > 1) throw new Error(`diet/${viewport.name}: horizontal overflow ${JSON.stringify(shortcutGeometry)}`);
      await detail.locator('[data-quick-food="rice"]').click();
      await expect(detail.locator(".diet-food-field textarea")).toHaveValue("米饭 1 碗（估算）");
      await expect(detail.locator('[data-quick-food="rice"]')).toHaveAttribute("aria-pressed", "true");
      await detail.locator(".diet-food-field textarea").fill("1. 蔬菜沙拉（可见配料：西红柿、青菜、玉米）\n2. 烤三文鱼配柠檬和香草\n3. 全麦面包");
      await expect.poll(() => detail.locator(".diet-food-field textarea").evaluate((textarea) => textarea.getBoundingClientRect().height)).toBeGreaterThanOrEqual(78);
      const textareaGeometry = await detail.locator(".diet-food-field textarea").evaluate((textarea) => ({ height: textarea.getBoundingClientRect().height, scrollHeight: textarea.scrollHeight, clientHeight: textarea.clientHeight }));
      if (textareaGeometry.height < 78 || textareaGeometry.scrollHeight > textareaGeometry.clientHeight + 1) throw new Error(`diet/${viewport.name}: recognized dishes do not auto-fit ${JSON.stringify(textareaGeometry)}`);
      dietResults.push({ name: viewport.name, shortcutGeometry, textareaGeometry });
      const saveAction = detail.locator("form:not([hidden]) .action-button");
      await detail.locator('form:not([hidden]) .record-editor-fields').evaluate((node) => { node.scrollTop = node.scrollHeight; });
      await saveAction.scrollIntoViewIfNeeded();
      const bottomGeometry = await detail.evaluate((node) => {
        const action = node.querySelector("form:not([hidden]) .action-button")?.getBoundingClientRect();
        const macros = node.querySelector("form:not([hidden]) .nutrition-macro-fields")?.getBoundingClientRect();
        const rating = node.querySelector("form:not([hidden]) .diet-rating-field")?.getBoundingClientRect();
        const nav = node.closest(".phone-frame")?.querySelector(".bottom-nav")?.getBoundingClientRect();
        const content = node.closest(".app-content");
        return {
          action: action ? { top: action.top, bottom: action.bottom } : null,
          macros: macros ? { top: macros.top, bottom: macros.bottom } : null,
          rating: rating ? { top: rating.top, bottom: rating.bottom } : null,
          navTop: nav?.top ?? null,
          scrollTop: content?.scrollTop ?? null,
          scrollHeight: content?.scrollHeight ?? null,
          clientHeight: content?.clientHeight ?? null,
        };
      });
      if (!bottomGeometry.action || bottomGeometry.navTop == null || bottomGeometry.action.bottom > bottomGeometry.navTop - 8) {
        throw new Error(`diet/${viewport.name}: final controls cannot clear the fixed navigation ${JSON.stringify(bottomGeometry)}`);
      }
      if (!bottomGeometry.macros || !bottomGeometry.rating
        || bottomGeometry.rating.top - bottomGeometry.macros.bottom > 30
        || bottomGeometry.action.top - bottomGeometry.rating.bottom > 30) {
        throw new Error(`diet/${viewport.name}: final form groups have excessive whitespace ${JSON.stringify(bottomGeometry)}`);
      }
      dietResults.at(-1).bottomGeometry = bottomGeometry;
      await page.screenshot({ path: path.join(outputDir, `diet-${viewport.name}.png`) });
    }

    const focusResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=focus&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="focus"]');
      await expect(detail.locator('.record-editor-stack > form:not([hidden])')).toBeVisible();
      await assertEditorHeader(page, "focus", 2);
      await expect(detail.locator(".focus-entry-mode-icons button")).toHaveCount(2);
      await detail.locator('[data-focus-mode="countdown"]').click();
      await expect(detail.locator(".focus-duration-preset-icons, [data-focus-duration]")).toHaveCount(0);
      const durationSelect = detail.locator('.focus-entry-minutes-field select');
      await expect(durationSelect.locator("option")).toHaveCount(4);
      await durationSelect.selectOption("45");
      await expect(durationSelect).toHaveValue("45");
      await expect(detail.locator('input[aria-label="自定义分钟"]')).toHaveCount(0);
      await durationSelect.selectOption("custom");
      await detail.locator('input[aria-label="自定义分钟"]').fill("37");
      await expect(detail.locator('input[aria-label="自定义分钟"]')).toHaveValue("37");
      await detail.locator(".focus-entry-note-field textarea").fill("先完成资料梳理，再写出第一版提纲。\n遇到分心时先记下，不立刻切换任务。");
      const minimum = viewport.height <= 780 ? 74 : 126;
      const countdownGeometry = assertGeometry(`focus-countdown/${viewport.name}`, await readGeometry(page, "focus", ".focus-entry-note-field"), minimum);
      await page.screenshot({ path: path.join(outputDir, `focus-countdown-${viewport.name}.png`) });
      await detail.locator('[data-focus-mode="countup"]').click();
      await expect(detail.locator(".focus-entry-minutes-field")).toBeHidden();
      const countupGeometry = assertGeometry(`focus-countup/${viewport.name}`, await readGeometry(page, "focus", ".focus-entry-note-field"), minimum);
      focusResults.push({ name: viewport.name, countdownGeometry, countupGeometry });
      await page.screenshot({ path: path.join(outputDir, `focus-countup-${viewport.name}.png`) });
    }
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=focus&view=editor`, { waitUntil: "networkidle" });
      const detail = page.locator('.record-detail[data-record-detail="focus"]');
      await detail.locator('.focus-entry-task-field input').fill("完成产品方案提纲");
      await detail.locator('[data-focus-mode="countup"]').click();
      await detail.locator('form:not([hidden]) .action-button').click();
      const immersive = page.locator('[data-module-view="focus-immersive"]');
      await expect(immersive).toHaveAttribute("data-focus-state", "running");
      await expect(immersive).toHaveAttribute("data-fullscreen", /active|viewport/);
      await expect(immersive).toHaveAttribute("data-wake-lock", /^(active|requesting|off|unsupported|failed)$/);
      if (await immersive.getAttribute("data-wake-lock") === "failed") {
        await expect(immersive.locator(".focus-capability-message")).toBeVisible();
      }
      const supportTools = immersive.locator(".focus-immersive-tools > button");
      await expect(supportTools).toHaveCount(5);
      await expect(supportTools).toContainText([/常亮/, /全屏/, /背景音/, /进入状态/, /AI 鼓励/]);
      await expect(supportTools.nth(4)).toBeDisabled();
      await supportTools.nth(2).click();
      await expect(immersive.locator(".focus-noise-panel")).toBeVisible();
      await expect(immersive.locator(".focus-noise-options button")).toHaveCount(4);
      await immersive.getByRole("button", { name: "白噪音" }).click();
      await expect(supportTools.nth(2)).toHaveAttribute("aria-pressed", "true");
      await immersive.getByRole("button", { name: "关闭背景声音面板" }).click();
      await supportTools.nth(3).click();
      await expect(immersive.locator(".focus-guide-overlay")).toBeVisible();
      await immersive.getByRole("button", { name: /开始专注|继续专注/ }).click();
      await page.waitForTimeout(520);
      const immersiveGeometry = await immersive.evaluate((root) => {
        const rect = root.getBoundingClientRect();
        const title = root.querySelector(".focus-title-field")?.getBoundingClientRect();
        const timer = root.querySelector(".focus-timer-ring")?.getBoundingClientRect();
        const controls = root.querySelector(".focus-controls")?.getBoundingClientRect();
        return {
          root: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          title: title ? { top: title.top, bottom: title.bottom } : null,
          timer: timer ? { top: timer.top, bottom: timer.bottom } : null,
          controls: controls ? { top: controls.top, bottom: controls.bottom } : null,
        };
      });
      if (Math.abs(immersiveGeometry.root.left) > 1 || Math.abs(immersiveGeometry.root.top) > 1
        || Math.abs(immersiveGeometry.root.right - viewport.width) > 1 || Math.abs(immersiveGeometry.root.bottom - viewport.height) > 1
        || !immersiveGeometry.title || !immersiveGeometry.timer || !immersiveGeometry.controls
        || immersiveGeometry.title.top < 58
        || immersiveGeometry.timer.top - immersiveGeometry.title.bottom < 12
        || immersiveGeometry.controls.top - immersiveGeometry.timer.bottom < 8
        || immersiveGeometry.controls.bottom > viewport.height - 8) {
        throw new Error(`focus-immersive/${viewport.name}: viewport fill or spacing failed ${JSON.stringify(immersiveGeometry)}`);
      }
      const runningDraft = await page.evaluate(() => {
        const key = Object.keys(window.sessionStorage).find((item) => item.startsWith("nava-focus-timer:"));
        return key ? JSON.parse(window.sessionStorage.getItem(key) ?? "null") : null;
      });
      if (!runningDraft || runningDraft.mode !== "countup" || runningDraft.title !== "完成产品方案提纲") throw new Error(`Focus launch did not start the real timer ${JSON.stringify(runningDraft)}`);
      focusResults.find((item) => item.name === viewport.name).immersiveGeometry = immersiveGeometry;
      await page.screenshot({ path: path.join(outputDir, `focus-immersive-${viewport.name}.png`) });
      await page.locator(".focus-immersive-exit").click();
    }

    const faceResults = [];
    await page.evaluate(() => localStorage.setItem("nava.review.demo.empty-snapshot-date.v1", "2020-01-01"));
    await page.addInitScript(() => Object.keys(sessionStorage).filter((key) => key.startsWith("nava-face-capture-readiness:")).forEach((key) => sessionStorage.removeItem(key)));
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=face&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="face"]');
      await expect(detail.locator('.record-editor-stack > div:not([hidden])')).toBeVisible();
      await assertEditorHeader(page, "face", 2);
      await detail.locator('.record-editor-stack > div:not([hidden]) .record-section-date input[type="date"]').fill("2020-01-01");
      await detail.locator('.record-editor-stack > div:not([hidden]) .record-section-date input[type="date"]').blur();
      await expect(detail.locator(".face-bare-guidance, .face-consent")).toHaveCount(0);
      await expect(detail.locator(".face-photo-actions button")).toHaveCount(2);
      await expect(detail.locator(".face-mode-icon-actions button")).toHaveCount(2);
      await expect(detail.locator(".face-mode-picker")).toHaveCount(0);
      await expect(detail.locator(".face-ai-evaluation footer")).toHaveCount(0);
      await expect(detail.locator(".face-capture-readiness")).toHaveCount(0);
      await expect(detail.locator(".face-photo-actions button").first()).toBeEnabled();
      await expect(detail.locator(".face-ai-evaluation")).toBeVisible();
      await expect(detail.locator(".face-ai-evaluation")).toHaveClass(/is-empty/);
      await page.waitForTimeout(760);
      const geometry = assertOneScreenCard(`face/${viewport.name}`, await readCardGeometry(page, "face"));
      const alignment = await detail.evaluate((node) => {
        const active = node.querySelector(".record-editor-stack > div:not([hidden])");
        const title = active?.querySelector(".section-heading h2")?.getBoundingClientRect();
        const action = active?.querySelector(".face-mode-icon-actions")?.getBoundingClientRect();
        const buttons = [...(active?.querySelectorAll(".face-mode-icon-actions button") ?? [])].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        const photo = active?.querySelector(".photo-picker.face")?.getBoundingClientRect();
        const mascot = active?.querySelector(".face-ai-evaluation > img")?.getBoundingClientRect();
        const ai = active?.querySelector(".face-ai-evaluation")?.getBoundingClientRect();
        return {
          titleCenter: title ? title.top + title.height / 2 : null,
          actionCenter: action ? action.top + action.height / 2 : null,
          buttons,
          photoHeight: photo?.height ?? null,
          mascot: mascot ? { width: mascot.width, height: mascot.height, right: mascot.right, bottom: mascot.bottom } : null,
          ai: ai ? { top: ai.top, right: ai.right, bottom: ai.bottom, left: ai.left } : null,
        };
      });
      if (alignment.titleCenter == null || alignment.actionCenter == null || Math.abs(alignment.titleCenter - alignment.actionCenter) > 3) throw new Error(`face/${viewport.name}: title and mode actions are not aligned ${JSON.stringify(alignment)}`);
      if (alignment.buttons.some((button) => Math.abs(button.width - button.height) > .5 || button.width < 32 || button.width > 38)) throw new Error(`face/${viewport.name}: mode actions are not compact circles ${JSON.stringify(alignment)}`);
      if (alignment.photoHeight == null || alignment.photoHeight < (viewport.height <= 780 ? 108 : 138)) throw new Error(`face/${viewport.name}: capture surface is not tall enough ${JSON.stringify(alignment)}`);
      if (!alignment.mascot || !alignment.ai || alignment.mascot.width < 70 || alignment.mascot.right > alignment.ai.right + 1 || alignment.mascot.bottom > alignment.ai.bottom + 1) throw new Error(`face/${viewport.name}: mascot sizing escapes the AI card ${JSON.stringify(alignment)}`);
      await detail.locator('[data-face-mode="makeup"]').click();
      await expect(detail.locator('[data-face-mode="makeup"]')).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({ path: path.join(outputDir, `face-${viewport.name}.png`) });
      await page.locator('.figma-app-header .figma-header-action').last().click();
    await page.getByRole('menuitem', { name: '条件检验' }).click();
      await expect(page).toHaveURL(/view=conditions/);
      const readinessButtons = detail.locator(".face-capture-readiness > div button");
      await expect(readinessButtons).toHaveCount(3);
      await expect(detail.locator(".face-photo-actions button").first()).toBeEnabled();
      for (let readinessIndex = 0; readinessIndex < 3; readinessIndex += 1) await readinessButtons.nth(readinessIndex).click();
      const conditionGeometry = assertOneScreenCard(`face-conditions/${viewport.name}`, await readCardGeometry(page, "face"));
      faceResults.push({ name: viewport.name, geometry, alignment, conditionGeometry });
      await page.screenshot({ path: path.join(outputDir, `face-conditions-${viewport.name}.png`) });
    }
    await page.evaluate(() => localStorage.removeItem("nava.review.demo.empty-snapshot-date.v1"));
    const readinessButtons = page.locator('.record-detail[data-record-detail="face"] .face-capture-readiness > div button');
    for (let readinessIndex = 0; readinessIndex < 3; readinessIndex += 1) {
      if (await readinessButtons.nth(readinessIndex).getAttribute("aria-pressed") === "true") await readinessButtons.nth(readinessIndex).click();
    }
    await page.locator('input[aria-label="从相册选择面部照片"]').setInputFiles(path.join(root, "src", "assets", "mascot", "nava-face-insight-v2.webp"));
    await expect(page.locator('.face-capture-readiness > div button.selected')).toHaveCount(3);
    await expect(page.locator(".face-ai-evaluation.has-result li")).toHaveCount(4);
    const faceInsightGeometry = await page.locator(".face-ai-evaluation.has-result li").evaluateAll((items) => items.map((item) => ({
      text: item.textContent,
      clientWidth: item.clientWidth,
      scrollWidth: item.scrollWidth,
      clientHeight: item.clientHeight,
      scrollHeight: item.scrollHeight,
    })));
    if (faceInsightGeometry.some((item) => item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1)) {
      throw new Error(`face/430x932-result: an AI insight is clipped ${JSON.stringify(faceInsightGeometry)}`);
    }
    await expect(page.locator('.record-detail[data-record-detail="face"]')).toBeVisible();
    const resultGeometry = assertOneScreenCard("face/430x932-result", await readCardGeometry(page, "face"));
    const resultScrollY = await page.evaluate(() => window.scrollY);
    if (resultScrollY > 1) throw new Error(`face/430x932-result: upload shifted the page by ${resultScrollY}px ${JSON.stringify(resultGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, "face-430x932-result.png") });

    const profileResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=today&view=profile-details`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const profile = page.locator('[data-home-view="profile-details"]');
      await expect(profile).toBeVisible();
      await expect(profile.locator('[data-profile-details-avatar]')).toBeVisible();
      await expect(profile.locator('.advanced-profile-completeness')).toHaveCount(0);
      await expect(profile.locator('.advanced-profile-wheel')).toHaveCount(4);
      await expect(profile.locator('select')).toHaveCount(0);
      await expect(profile.locator('.home-experience-back svg')).toHaveClass(/lucide-house/);
      const firstWheel = profile.locator('.advanced-profile-wheel').first();
      await firstWheel.locator(':scope > button').click();
      const wheelList = firstWheel.locator('.advanced-profile-wheel-list');
      await expect(wheelList).toBeVisible();
      const wheelGeometry = await wheelList.evaluate((node) => ({ height: node.getBoundingClientRect().height, overflow: node.scrollHeight - node.clientHeight }));
      if (wheelGeometry.height < 160 || wheelGeometry.height > 184 || wheelGeometry.overflow <= 0) throw new Error(`profile/${viewport.name}: wheel does not keep a fixed visible row count ${JSON.stringify(wheelGeometry)}`);
      await firstWheel.getByRole('option').nth(2).click();
      await expect(profile.locator('.advanced-profile-header-icon')).toHaveAttribute('aria-label', /更多资料操作|More profile actions/);
      await expect(page.locator('.bottom-nav')).toHaveCount(0);
      const geometry = await profile.evaluate((node) => {
        const frame = node.closest('.phone-frame');
        const header = node.querySelector('.home-experience-header')?.getBoundingClientRect();
        const identity = node.querySelector('.advanced-profile-identity')?.getBoundingClientRect();
        const avatar = node.querySelector('[data-profile-details-avatar]')?.getBoundingClientRect();
        const menuButton = node.querySelector('.advanced-profile-header-icon')?.getBoundingClientRect();
        return {
          frameOverflowX: frame ? frame.scrollWidth - frame.clientWidth : null,
          header: header ? { top: header.top, right: header.right, bottom: header.bottom, left: header.left } : null,
          identity: identity ? { top: identity.top, right: identity.right, bottom: identity.bottom, left: identity.left } : null,
          avatar: avatar ? { top: avatar.top, right: avatar.right, bottom: avatar.bottom, left: avatar.left, width: avatar.width, height: avatar.height } : null,
          menuButton: menuButton ? { top: menuButton.top, right: menuButton.right, bottom: menuButton.bottom, left: menuButton.left } : null,
        };
      });
      if ((geometry.frameOverflowX ?? 0) > 1 || !geometry.header || !geometry.identity || !geometry.avatar || !geometry.menuButton) throw new Error(`profile/${viewport.name}: incomplete or overflowing profile layout ${JSON.stringify(geometry)}`);
      if (Math.abs(geometry.avatar.width - geometry.avatar.height) > .5 || geometry.avatar.left < geometry.identity.left || geometry.avatar.right > geometry.identity.right) throw new Error(`profile/${viewport.name}: avatar escapes identity card ${JSON.stringify(geometry)}`);
      await profile.locator('.advanced-profile-header-icon').click();
      const menu = profile.locator('.app-utility-popover');
      await expect(menu).toBeVisible();
      await expect(menu.locator('button')).toHaveCount(4);
      const menuGeometry = await menu.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
      });
      if (menuGeometry.left < 0 || menuGeometry.right > menuGeometry.viewportWidth + 1 || menuGeometry.top < 0 || menuGeometry.bottom > menuGeometry.viewportHeight + 1) throw new Error(`profile/${viewport.name}: menu escapes viewport ${JSON.stringify(menuGeometry)}`);
      await page.screenshot({ path: path.join(outputDir, `profile-menu-${viewport.name}.png`) });
      await profile.locator('.advanced-profile-header-icon').click();
      await profile.locator('[data-profile-details-avatar]').click();
      const sheet = page.locator('.phone-frame > .avatar-picker-overlay .avatar-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('.avatar-sheet-actions button')).toHaveCount(2);
      await page.waitForTimeout(260);
      const sheetGeometry = await sheet.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const overlay = node.closest('.avatar-sheet-overlay');
        const actions = [...node.querySelectorAll('.avatar-sheet-actions button')].map((button) => {
          const buttonRect = button.getBoundingClientRect();
          return { top: buttonRect.top, right: buttonRect.right, bottom: buttonRect.bottom, left: buttonRect.left };
        });
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, overflowX: node.scrollWidth - node.clientWidth, overlayOpacity: overlay ? Number(getComputedStyle(overlay).opacity) : 0, actions };
      });
      if (sheetGeometry.left < 0 || sheetGeometry.right > sheetGeometry.viewportWidth + 1 || sheetGeometry.top < 0 || sheetGeometry.bottom > sheetGeometry.viewportHeight + 1 || sheetGeometry.overflowX > 1 || sheetGeometry.overlayOpacity < .99 || sheetGeometry.actions.some((action) => action.left < sheetGeometry.left || action.right > sheetGeometry.right || action.top < sheetGeometry.top || action.bottom > sheetGeometry.bottom)) throw new Error(`profile/${viewport.name}: avatar sheet escapes viewport or is not fully visible ${JSON.stringify(sheetGeometry)}`);
      profileResults.push({ name: viewport.name, geometry, menuGeometry, sheetGeometry });
      await page.screenshot({ path: path.join(outputDir, `profile-avatar-sheet-${viewport.name}.png`) });
      await page.locator('.avatar-sheet-overlay').click({ position: { x: 2, y: 2 } });
    }

    const skeletonResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const module of ['mood', 'sleep', 'exercise', 'diet', 'focus', 'face']) {
        const variant = `record-editor-${module}`;
        await page.goto(`${baseUrl}?demo=1&qa=skeleton#tab=record&module=${module}&view=editor`, { waitUntil: 'networkidle' });
        const skeleton = page.locator(`[data-page-skeleton="${variant}"]`);
        await expect(skeleton).toBeVisible();
        const geometry = await skeleton.evaluate((node) => {
          const frame = node.closest('.phone-frame');
          const content = node.closest('.app-content');
          const nav = frame?.querySelector('.bottom-nav')?.getBoundingClientRect();
          const rect = node.getBoundingClientRect();
          return {
            frameOverflowX: frame ? frame.scrollWidth - frame.clientWidth : null,
            contentOverflowY: content ? content.scrollHeight - content.clientHeight : null,
            blockCount: node.querySelectorAll('.nava-skeleton-block').length,
            skeletonBottom: rect.bottom,
            navTop: nav?.top ?? null,
          };
        });
        if ((geometry.frameOverflowX ?? 0) > 1 || (geometry.contentOverflowY ?? 0) > 1 || geometry.blockCount < 8 || geometry.navTop == null || geometry.skeletonBottom > geometry.navTop + 1) throw new Error(`skeleton/${variant}/${viewport.name}: target-state skeleton overflowed or was incomplete ${JSON.stringify(geometry)}`);
        skeletonResults.push({ name: viewport.name, variant, ...geometry });
        await page.screenshot({ path: path.join(outputDir, `skeleton-${module}-${viewport.name}.png`) });
      }
    }

    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`${baseUrl}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "networkidle" });
    await expect(page.locator(".mood-diary-field textarea")).toBeVisible();
    await page.locator(".mood-diary-field textarea").focus();
    await page.setViewportSize({ width: 390, height: 600 });
    await page.locator(".mood-diary-field textarea").scrollIntoViewIfNeeded();
    await expect(page.locator(".mood-diary-field textarea")).toBeInViewport();
    await page.locator(".mood-diary-field textarea").fill("键盘出现时，日记仍可编辑并可通过页面滚动访问保存按钮。");
    await page.locator('[data-record-detail="mood"] form:not([hidden]) > .section-card > .action-button').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-record-detail="mood"] form:not([hidden]) > .section-card > .action-button')).toBeInViewport();
    await page.screenshot({ path: path.join(outputDir, "390x600-keyboard-proxy.png") });
    await assertContainedAction(page, 'mood', 'keyboard-height proxy');

    const journalResults = [];
    for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 480 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}?demo=1#tab=record&module=mood&view=journal`, { waitUntil: 'networkidle' });
      const dialog = page.locator('.module-modal-card:has(.module-modal-body)');
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(600);
      await dialog.locator('textarea').fill('日记长文字测试。'.repeat(200));
      const bounds = await dialog.evaluate((node) => {
        const card = node.getBoundingClientRect();
        const overlay = node.closest('.module-modal').getBoundingClientRect();
        const footer = node.querySelector('.module-modal-actions').getBoundingClientRect();
        return { cardTop: card.top, cardBottom: card.bottom, overlayTop: overlay.top, overlayBottom: overlay.bottom, footerBottom: footer.bottom };
      });
      if (bounds.cardTop < bounds.overlayTop || bounds.cardBottom > bounds.overlayBottom || bounds.footerBottom > bounds.cardBottom) throw new Error(`Journal footer escaped: ${JSON.stringify(bounds)}`);
      await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport({ ratio: 1 });
      journalResults.push({ viewport, bounds });
      await page.screenshot({ path: path.join(outputDir, `journal-${viewport.height}.png`) });
      const save = dialog.getByRole('button', { name:'保存', exact:true });
      await expect(save).toBeEnabled();
      expect(await save.evaluate((node) => node.form?.id)).toBe('mood-record-form');
      await save.click();
      await expect(dialog).toBeHidden();
      await dismissReward(page);
    }

    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ moodResults, sleepResults, exerciseResults, dietResults, focusResults, faceResults, profileResults, skeletonResults, journalResults, errors }, null, 2)}\n`, "utf8");
    console.log(`Mood, sleep, exercise, diet, focus, face, profile, and target-state skeleton layouts passed ${viewports.length} required phone sizes plus a keyboard-height proxy.`);
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
