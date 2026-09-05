import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.RECORD_EDITOR_LAYOUT_OUTPUT_DIR
  ? path.resolve(process.env.RECORD_EDITOR_LAYOUT_OUTPUT_DIR)
  : path.resolve(root, "..", "Build", "TestRuns", "nava-record-editor-layout-v93");
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
    const toolbar = detail.querySelector(".record-detail-toolbar--editor");
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
      toolbar: rect(toolbar),
      card: rect(card),
      nav: rect(nav),
    };
  });
}

function assertOneScreenCard(name, geometry) {
  const { card, contentOverflowY, frameOverflowX, nav, toolbar } = geometry;
  if (!card || !nav || !toolbar) throw new Error(`${name}: card geometry is incomplete ${JSON.stringify(geometry)}`);
  const cardNavGap = nav.top - card.bottom;
  const toolbarCardGap = card.top - toolbar.bottom;
  if ((frameOverflowX ?? 0) > 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(geometry)}`);
  if ((contentOverflowY ?? 0) > 1) throw new Error(`${name}: editor should fit one screen ${JSON.stringify(geometry)}`);
  if (cardNavGap < 8 || cardNavGap > 44) throw new Error(`${name}: card/navigation gap is ${cardNavGap.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (toolbarCardGap < 5 || toolbarCardGap > 16) throw new Error(`${name}: toolbar/card gap is ${toolbarCardGap.toFixed(1)}px ${JSON.stringify(geometry)}`);
  return { ...geometry, cardNavGap, toolbarCardGap };
}

async function readGeometry(page, module, fieldSelector) {
  return page.locator(`.record-detail[data-record-detail="${module}"]`).evaluate((detail, selector) => {
    const frame = detail.closest(".phone-frame");
    const content = detail.closest(".app-content");
    const toolbar = detail.querySelector(".record-detail-toolbar--editor");
    const card = detail.querySelector(".record-editor-stack > form:not([hidden]) > .section-card");
    const field = detail.querySelector(selector);
    const textarea = field?.querySelector("textarea");
    const save = field?.nextElementSibling;
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
      toolbar: rect(toolbar),
      card: rect(card),
      field: rect(field),
      textarea: rect(textarea),
      save: rect(save),
      nav: rect(nav),
    };
  }, fieldSelector);
}

function assertGeometry(name, geometry, expectedMinimum) {
  const { card, contentOverflowY, field, frameOverflowX, nav, save, textarea, toolbar } = geometry;
  if (!card || !field || !textarea || !save || !nav || !toolbar) throw new Error(`${name}: editor geometry is incomplete ${JSON.stringify(geometry)}`);
  const cardNavGap = nav.top - card.bottom;
  const toolbarCardGap = card.top - toolbar.bottom;
  if ((frameOverflowX ?? 0) > 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(geometry)}`);
  if ((contentOverflowY ?? 0) > 1) throw new Error(`${name}: normal editor should fit one screen ${JSON.stringify(geometry)}`);
  if (cardNavGap < 10 || cardNavGap > 44) throw new Error(`${name}: card/navigation gap is ${cardNavGap.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (toolbarCardGap < 5 || toolbarCardGap > 16) throw new Error(`${name}: toolbar/card gap is ${toolbarCardGap.toFixed(1)}px ${JSON.stringify(geometry)}`);
  if (field.top < card.top || field.bottom > save.top + 1 || save.bottom > card.bottom + 1) throw new Error(`${name}: journal or save action escapes/overlaps the card ${JSON.stringify(geometry)}`);
  if (textarea.top < field.top || textarea.bottom > field.bottom + 1) throw new Error(`${name}: textarea escapes its field ${JSON.stringify(geometry)}`);
  if (textarea.height < expectedMinimum - 1) throw new Error(`${name}: textarea is only ${textarea.height.toFixed(1)}px tall ${JSON.stringify(geometry)}`);
  return { ...geometry, cardNavGap, toolbarCardGap };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await signIn(page, baseUrl);
    const moodResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.record-detail[data-record-detail="mood"] .record-editor-stack > form:not([hidden])')).toBeVisible();
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
    await page.locator('[data-sleep-preset="early"]').click();
    await expect(page.locator('.record-detail[data-record-detail="sleep"] input[type="time"]').nth(0)).toHaveValue("22:30");
    await expect(page.locator('.record-detail[data-record-detail="sleep"] input[type="time"]').nth(1)).toHaveValue("06:30");
    await expect(page.locator('[data-sleep-preset="early"]')).toHaveAttribute("aria-pressed", "true");

    const dietResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=diet&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="diet"]');
      await expect(detail.locator('.record-editor-stack > form:not([hidden])')).toBeVisible();
      await expect(detail.locator(".diet-quick-food-icons button")).toHaveCount(4);
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
      await detail.locator(".diet-food-field textarea").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(outputDir, `diet-${viewport.name}.png`) });
    }

    const focusResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=focus&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="focus"]');
      await expect(detail.locator('.record-editor-stack > form:not([hidden])')).toBeVisible();
      await expect(detail.locator(".focus-entry-mode-icons button")).toHaveCount(2);
      await detail.locator('[data-focus-mode="countdown"]').click();
      await expect(detail.locator(".focus-duration-preset-icons button")).toHaveCount(3);
      await detail.locator('[data-focus-duration="45"]').click();
      await expect(detail.locator('.focus-entry-minutes-field > input')).toHaveValue("45");
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
    await page.locator('.record-detail[data-record-detail="focus"] .focus-entry-task-field input').fill("完成产品方案提纲");
    await page.locator('.record-detail[data-record-detail="focus"] form:not([hidden]) .action-button').click();
    await expect(page.locator('[data-module-view="focus-immersive"]')).toHaveAttribute("data-focus-state", "running");
    const runningDraft = await page.evaluate(() => {
      const key = Object.keys(window.sessionStorage).find((item) => item.startsWith("nava-focus-timer:"));
      return key ? JSON.parse(window.sessionStorage.getItem(key) ?? "null") : null;
    });
    if (!runningDraft || runningDraft.mode !== "countup" || runningDraft.title !== "完成产品方案提纲") throw new Error(`Focus launch did not start the real timer ${JSON.stringify(runningDraft)}`);
    await page.locator(".focus-immersive-exit").click();

    const faceResults = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}?demo=1#tab=record&module=face&view=editor`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const detail = page.locator('.record-detail[data-record-detail="face"]');
      await expect(detail.locator('.record-editor-stack > div:not([hidden])')).toBeVisible();
      await expect(detail.locator(".face-bare-guidance, .face-consent")).toHaveCount(0);
      await expect(detail.locator(".face-photo-actions button")).toHaveCount(2);
      await expect(detail.locator(".face-photo-actions button").first()).toBeEnabled();
      await expect(detail.locator(".face-ai-evaluation")).toBeVisible();
      await page.waitForTimeout(760);
      const geometry = assertOneScreenCard(`face/${viewport.name}`, await readCardGeometry(page, "face"));
      const alignment = await detail.evaluate((node) => {
        const active = node.querySelector(".record-editor-stack > div:not([hidden])");
        const title = active?.querySelector(".section-heading h2")?.getBoundingClientRect();
        const action = active?.querySelector(".face-camera-action")?.getBoundingClientRect();
        return { titleCenter: title ? title.top + title.height / 2 : null, actionCenter: action ? action.top + action.height / 2 : null };
      });
      if (alignment.titleCenter == null || alignment.actionCenter == null || Math.abs(alignment.titleCenter - alignment.actionCenter) > 3) throw new Error(`face/${viewport.name}: title and camera action are not aligned ${JSON.stringify(alignment)}`);
      faceResults.push({ name: viewport.name, geometry, alignment });
      await page.screenshot({ path: path.join(outputDir, `face-${viewport.name}.png`) });
    }
    await page.locator('input[aria-label="从相册选择面部照片"]').setInputFiles(path.join(root, "src", "assets", "mascot", "nava-face-insight-v2.webp"));
    await expect(page.locator(".face-ai-evaluation.has-result li")).toHaveCount(4);
    await expect(page.locator('.record-detail[data-record-detail="face"]')).toBeVisible();
    const resultGeometry = assertOneScreenCard("face/430x932-result", await readCardGeometry(page, "face"));
    const resultScrollY = await page.evaluate(() => window.scrollY);
    if (resultScrollY > 1) throw new Error(`face/430x932-result: upload shifted the page by ${resultScrollY}px ${JSON.stringify(resultGeometry)}`);
    await page.screenshot({ path: path.join(outputDir, "face-430x932-result.png") });

    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`${baseUrl}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "networkidle" });
    await expect(page.locator(".mood-diary-field textarea")).toBeVisible();
    await page.locator(".mood-diary-field textarea").focus();
    await page.setViewportSize({ width: 390, height: 600 });
    await page.locator(".mood-diary-field textarea").scrollIntoViewIfNeeded();
    await expect(page.locator(".mood-diary-field textarea")).toBeInViewport();
    await page.locator(".mood-diary-field textarea").fill("键盘出现时，日记仍可编辑并可通过页面滚动访问保存按钮。");
    await page.locator(".mood-diary-field + .action-button").scrollIntoViewIfNeeded();
    await expect(page.locator(".mood-diary-field + .action-button")).toBeInViewport();
    await page.screenshot({ path: path.join(outputDir, "390x600-keyboard-proxy.png") });

    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ moodResults, sleepResults, dietResults, focusResults, faceResults, errors }, null, 2)}\n`, "utf8");
    console.log(`Mood, sleep, diet, focus, and face editor layouts passed ${viewports.length} required phone sizes plus a keyboard-height proxy.`);
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
