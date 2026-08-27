import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
applyProjectPublicEnv(root);
const viewportWidth = Number(process.env.VIEWPORT_WIDTH || 430);
const viewportHeight = Number(process.env.VIEWPORT_HEIGHT || 932);
const screenshotLabel = process.env.SCREENSHOT_LABEL?.trim();
const outputDir = path.join(root, "artifacts", screenshotLabel ? `interaction-review-${screenshotLabel}` : "interaction-review");
const port = Number(process.env.PORT || 5192);
const reviewBaseUrl = process.env.REVIEW_BASE_URL?.trim().replace(/\/$/, "");
const demoAccount = "13800138000";
const demoPassword = "12345678";
const demoOtp = "123456";
const samplePhoto = {
  name: "sample.svg",
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="#176b8e"/><text x="80" y="104" text-anchor="middle" font-family="Arial,sans-serif" font-size="72" font-weight="700" fill="#fff">N</text></svg>',
    "utf8",
  ),
};

async function dismissLaunch(page) {
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) {
    await expect(page.locator(".launch-splash__texture img")).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, "launch.png") });
    await launch.click();
    await expect(launch).toBeHidden();
  }
}

async function completeOnboardingIfNeeded(page) {
  const onboarding = page.locator(".onboarding-screen");
  if (!(await onboarding.isVisible().catch(() => false))) {
    await expect(page.locator(".phone-frame")).toBeVisible();
    return;
  }

  const welcome = page.locator(".onboarding-welcome");
  if (await welcome.isVisible().catch(() => false)) {
    await expect(page.locator(".onboarding-welcome__message")).toContainText("Hi! 很高兴认识你");
    await expect(welcome).toBeHidden({ timeout: 5000 });
  }

  const profileSteps = [
    { key: "gender", multi: false },
    { key: "occupation", multi: false },
    { key: "ageGroup", multi: false },
    { key: "hobbies", multi: true },
    { key: "sleepDuration", multi: false },
    { key: "exerciseDuration", multi: false },
    { key: "dietPreferences", multi: true },
  ];

  for (const profileStep of profileSteps) {
    await expect(onboarding).toHaveAttribute("data-onboarding-step", profileStep.key);
    await page.locator(".onboarding-option-grid button").first().click();
    if (profileStep.multi) {
      await page.locator(".onboarding-next").click();
    }
  }

  await expect(onboarding).toHaveAttribute("data-onboarding-step", "privacy");
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function loginWithPassword(page, baseUrl) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.screenshot({ path: path.join(outputDir, "auth-password.png") });
  await page.locator(".auth-submit").click();
  await completeOnboardingIfNeeded(page);
}

async function createReviewPage(browser, baseUrl, consoleErrors) {
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onend = null;
      onerror = null;
      onresult = null;
      transcriptTimer = null;

      start() {
        this.transcriptTimer = window.setTimeout(() => {
          const result = [{ transcript: "今天感觉很平稳" }];
          result.isFinal = false;
          this.onresult?.({ resultIndex: 0, results: [result] });
        }, 80);
      }

      stop() {
        if (this.transcriptTimer) window.clearTimeout(this.transcriptTimer);
        window.queueMicrotask(() => this.onend?.());
      }

      abort() {
        if (this.transcriptTimer) window.clearTimeout(this.transcriptTimer);
        window.queueMicrotask(() => this.onerror?.({ error: "aborted" }));
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (request.url().includes("/functions/v1/")) {
      consoleErrors.push(`edge request failed: ${request.failure()?.errorText ?? "unknown error"}`);
    }
  });
  page.on("response", (response) => {
    if (!response.url().includes("/functions/v1/") || response.ok()) return;
    void response.text()
      .then((body) => consoleErrors.push(`edge response ${response.status()}: ${body.slice(0, 500)}`))
      .catch(() => consoleErrors.push(`edge response ${response.status()}: unreadable body`));
  });
  await loginWithPassword(page, baseUrl);
  return { context, page };
}

async function verifyOtpLogin(browser, baseUrl, results, consoleErrors) {
  const { context, page } = await createBarePage(browser, consoleErrors);
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator(".auth-forgot").click();
  await expect(page.locator(".auth-recovery-options > button")).toHaveCount(2);
  await page.locator('[data-recovery-option="otp"]').click();
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator(".auth-code-button").click();
  await page.locator('input[autocomplete="one-time-code"]').fill(demoOtp);
  await page.screenshot({ path: path.join(outputDir, "auth-otp-login.png") });
  await page.locator(".auth-submit").click();
  await completeOnboardingIfNeeded(page);
  results.push("隔离评审验证码登录");
  await context.close();
}

async function verifyAuthControls(browser, baseUrl, results, consoleErrors) {
  const { context, page } = await createBarePage(browser, consoleErrors);
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  const password = page.locator('input[autocomplete="current-password"]');
  await expect(password).toHaveAttribute("type", "password");
  await page.locator(".auth-input-icon-button").click();
  await expect(password).toHaveAttribute("type", "text");
  await page.locator(".language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.locator(".language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  await page.locator(".auth-forgot").click();
  await expect(page.locator(".auth-recovery-options > button")).toHaveCount(2);
  await page.locator('[data-recovery-option="reset"]').click();
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator(".auth-code-button").click();
  await page.locator('input[autocomplete="one-time-code"]').fill(demoOtp);
  await page.locator('input[autocomplete="new-password"]').first().fill("87654321");
  await page.locator('input[autocomplete="new-password"]').nth(1).fill("87654321");
  await page.screenshot({ path: path.join(outputDir, "auth-reset.png") });
  await page.locator(".auth-submit").click();
  await expect(page.locator(".success-text")).toBeVisible();
  results.push("密码显隐、中英文切换与验证码重置密码");
  await context.close();
}

async function verifyRegistration(browser, baseUrl, results, consoleErrors) {
  const { context, page } = await createBarePage(browser, consoleErrors);
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator(".auth-mode-icon").click();
  await expect(page.locator('input[autocomplete="new-password"]')).toHaveCount(2);
  await expect(page.locator(".field-label").filter({ hasText: "新密码" })).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill("review@nava.app");
  await page.locator(".auth-code-button").click();
  await page.locator('input[autocomplete="one-time-code"]').fill(demoOtp);
  await page.locator('input[autocomplete="new-password"]').first().fill("87654321");
  await page.locator('input[autocomplete="new-password"]').nth(1).fill("87654321");
  await page.locator('.auth-consent input[type="checkbox"]').check();
  const consentMetrics = await page.locator(".auth-consent--screen").evaluate((label) => {
    const checkbox = label.querySelector("input");
    const text = label.querySelector("span");
    if (!checkbox || !text) throw new Error("Missing consent controls.");
    const labelRect = label.getBoundingClientRect();
    const checkboxRect = checkbox.getBoundingClientRect();
    const fontSize = Number.parseFloat(window.getComputedStyle(text).fontSize);
    return {
      centerOffset: Math.abs((labelRect.left + labelRect.right) / 2 - window.innerWidth / 2),
      checkboxWidth: checkboxRect.width,
      checkboxHeight: checkboxRect.height,
      fontSize,
    };
  });
  if (consentMetrics.centerOffset > 1
    || Math.abs(consentMetrics.checkboxWidth - consentMetrics.fontSize) > 0.6
    || Math.abs(consentMetrics.checkboxHeight - consentMetrics.fontSize) > 0.6) {
    throw new Error(`Consent alignment or sizing is incorrect: ${JSON.stringify(consentMetrics)}`);
  }
  await page.screenshot({ path: path.join(outputDir, "auth-register.png") });
  await page.locator(".auth-submit").click();
  await completeOnboardingIfNeeded(page);
  results.push("隔离评审邮箱验证码注册");
  await context.close();
}

async function createBarePage(browser, consoleErrors) {
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`page: ${error.message}`));
  return { context, page };
}

async function verifyRecordModules(page, results) {
  await page.locator('[data-tab="record"]').click();
  await expect(page.locator("[data-record-module]")).toHaveCount(6);
  const openModule = async (module) => {
    await page.locator(`[data-record-module="${module}"]`).click();
    await expect(page.locator(`[data-record-detail="${module}"]`)).toBeVisible();
    await expect.poll(() => page.locator(".app-content").evaluate((node) => node.scrollTop)).toBe(0);
  };
  const returnToHub = async () => {
    await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
    await expect(page.locator("[data-record-module]")).toHaveCount(6);
  };

  await openModule("mood");
  await expect(page.locator('[data-module-view="mood-overview"]')).toBeVisible();
  await expect(page.locator('[data-ui-revision="mood-curve-v2"]')).toBeVisible();
  const moodCurve = page.locator(".mood-chart .trend-line");
  await expect(page.locator(".mood-chart .trend-area")).toHaveCount(1);
  const curveBefore = await moodCurve.getAttribute("d");
  if (!curveBefore?.includes(" C ")) throw new Error(`Mood trend is not a smooth cubic curve: ${curveBefore}`);
  const pieBefore = await page.locator(".mood-pie").evaluate((node) => node.style.background);
  await page.locator(".mood-face-row button").first().click();
  await expect.poll(() => moodCurve.getAttribute("d")).not.toBe(curveBefore);
  await expect.poll(() => page.locator(".mood-pie").evaluate((node) => node.style.background)).not.toBe(pieBefore);
  await page.locator('[aria-label="填写情绪日记"], [aria-label="Write mood journal"]').click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.locator('[role="dialog"] textarea').fill("今天节律平稳，午后状态更好。");
  await page.locator('[role="dialog"] button[type="submit"]').click();
  await expect(page.locator('[data-module-view="mood-overview"] button[aria-label="情绪已保存"], [data-module-view="mood-overview"] button[aria-label="Mood saved"]')).toBeVisible();
  await page.locator('[aria-label="查看情绪趋势"], [aria-label="View mood trend"]').click();
  await expect(page.locator('[data-record-detail="mood"] .line-trend-chart')).toBeVisible();
  await page.locator(".module-inline-back").click();
  await expect(page.locator('[data-module-view="mood-overview"]')).toBeVisible();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outputDir, "record-mood.png") });
  await returnToHub();

  await openModule("sleep");
  await expect(page.locator('[data-module-view="sleep-overview"]')).toBeVisible();
  const alertCopy = page.locator(".sleep-alert-copy");
  if (await alertCopy.isVisible().catch(() => false)) {
    await alertCopy.click();
    await expect(page.locator(".lock-screen-preview")).toBeVisible();
    await page.locator(".sleep-alert-modal header button").click();
  }
  await page.locator('[aria-label="查看睡眠趋势"], [aria-label="View sleep trend"]').click();
  await expect(page.locator('[data-record-detail="sleep"] .line-trend-chart')).toBeVisible();
  await page.locator(".module-inline-back").click();
  await page.locator('[aria-label="更新睡眠记录"], [aria-label="Update sleep record"]').click();
  await page.locator('[data-record-detail="sleep"] form:not([hidden]) .action-button').click();
  await expect(page.locator('[data-record-detail="sleep"] .success-text')).toBeVisible();
  await expect(page.locator('[data-module-view="sleep-overview"]')).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outputDir, "record-sleep.png") });
  await returnToHub();

  await openModule("exercise");
  await expect(page.locator('[data-module-view="exercise-overview"]')).toBeVisible();
  await page.locator(".exercise-device-card header button").click();
  await expect(page.locator(".device-picker")).toBeVisible();
  await page.locator(".module-inline-back").click();
  await page.locator(".health-card").click();
  await expect(page.locator(".metric-detail-grid")).toBeVisible();
  await page.locator(".module-inline-back").click();
  await page.locator(".heat-card").click();
  await expect(page.locator(".detail-heatmap")).toBeVisible();
  await page.locator(".module-inline-back").click();
  await page.locator(".clock-sync-card").click();
  await expect(page.locator(".clock-alignment")).toBeVisible();
  await page.locator(".module-inline-back").click();
  await page.locator(".module-assistant-card.is-interactive").click();
  await expect(page.locator(".sports-plan")).toBeVisible();
  await page.locator(".module-inline-back").click();
  await page.locator('[aria-label="查看运动详情"], [aria-label="View activity details"]').click();
  await expect(page.locator('[data-module-view="exercise-detail"]')).toBeVisible();
  await expect(page).toHaveURL(/tab=record.*module=exercise.*view=detail/);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator('[data-module-view="exercise-detail"]')).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "record-exercise-detail.png") });
  await page.locator('[data-module-view="exercise-detail"] .module-inline-back').click();
  await page.locator('[aria-label="填写运动自评"], [aria-label="Edit self assessment"]').click();
  await page.locator('[data-record-detail="exercise"] form:not([hidden]) .action-button').click();
  await expect(page.locator('[data-record-detail="exercise"] .success-text')).toBeVisible();
  await expect(page.locator('[data-module-view="exercise-overview"]')).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outputDir, "record-exercise.png") });
  await returnToHub();

  await openModule("diet");
  await expect(page.locator('[data-module-view="diet-overview"]')).toBeVisible();
  await page.locator('[aria-label="记录饮食"], [aria-label="Log a meal"]').click();
  await page.locator('[data-record-detail="diet"] input[type="file"][capture="environment"]').setInputFiles(samplePhoto);
  await expect(page.locator('[data-record-detail="diet"] .success-text')).toBeVisible();
  await page.locator('[data-record-detail="diet"] form:not([hidden]) .action-button').click();
  await page.screenshot({ path: path.join(outputDir, "record-diet.png") });
  await returnToHub();

  await openModule("focus");
  await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible();
  const focusDuration = page.locator('.focus-quick-card input[aria-label="专注分钟数"], .focus-quick-card input[aria-label="Focus duration in minutes"]');
  await focusDuration.fill("37");
  await page.locator('[aria-label="开始专注"], [aria-label="Start focus"]').click();
  await expect(page.locator('[data-module-view="focus-immersive"]')).toBeVisible();
  await expect(page.locator(".focus-timer-ring strong")).toHaveText("37:00");
  await expect(page.locator(".focus-timer-ring span")).toContainText(/准备开始|Ready/);
  await page.locator(".focus-interruption-trigger").click();
  await expect(page.locator(".focus-interruption")).toBeVisible();
  await page.locator(".focus-interruption button").nth(1).click();
  await page.locator('[data-module-view="focus-immersive"] [aria-label="开始"], [data-module-view="focus-immersive"] [aria-label="Start"]').click();
  await page.waitForTimeout(1100);
  await page.locator('[data-module-view="focus-immersive"] [aria-label="结束"], [data-module-view="focus-immersive"] [aria-label="Finish"]').click();
  await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible();
  await expect(page.locator('[aria-label="专注已记录"], [aria-label="Focus saved"]')).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outputDir, "record-focus.png") });
  await returnToHub();

  await page.locator('[data-record-module="face"]').click();
  await expect(page.locator('[data-module-view="face-overview"]')).toBeVisible();
  await page.locator('[aria-label="使用前置摄像头拍照"], [aria-label="Take a front-camera photo"]').click();
  await page.locator('[data-record-detail="face"] .face-consent input').check();
  await page.locator('[data-record-detail="face"] input[type="file"][capture="user"]').setInputFiles(samplePhoto);
  await expect(page.locator('[data-record-detail="face"] .success-text')).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDir, "record-face.png") });
  await returnToHub();
  results.push("六类记录入口、四类 Figma 概览/二级页、保存、计时与拍照分析");
}

async function verifyHomeShortcuts(page, results) {
  for (const [index, module] of ["exercise", "diet", "sleep", "face", "focus", "mood"].entries()) {
    await page.locator('[data-tab="today"]').click();
    const menuButton = page.locator(".option-two-side-actions button").first();
    if (!(await page.locator(".option-two-home").evaluate((node) => node.classList.contains("is-expanded")))) await menuButton.click();
    if (index === 0) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(outputDir, "today-expanded.png") });
    }
    await page.locator(`.option-two-health-entry--${module}`).click();
    await expect(page.locator(`[data-record-detail="${module}"]`)).toBeVisible();
  }
  results.push("首页展开菜单与六个健康快捷入口");
}

async function verifyAi(page, results, diagnostics) {
  await page.locator('[data-tab="ai"]').click();
  await expect(page.locator(".chat-message-row")).toHaveCount(3);
  await page.locator(".chat-composer input").fill("我今天吃什么好？请直接推荐一份午餐。");
  await page.locator(".chat-send-button").click();
  await page.waitForFunction(() => {
    const replyReady = document.querySelectorAll(".chat-message-row").length === 5;
    const errorText = document.querySelector(".error-text")?.textContent?.trim();
    return replyReady || Boolean(errorText);
  }, null, { timeout: 30_000 });
  const aiError = (await page.locator(".error-text").textContent().catch(() => null))?.trim();
  if (aiError) {
    const edgeDiagnostics = diagnostics.filter((entry) => entry.startsWith("edge ")).join("\n");
    throw new Error(`AI UI error: ${aiError}${edgeDiagnostics ? `\n${edgeDiagnostics}` : ""}`);
  }
  await expect(page.locator(".chat-message-row")).toHaveCount(5, { timeout: 30_000 });
  const realReply = (await page.locator(".chat-message-row.assistant .chat-bubble p").last().innerText()).trim();
  if (Array.from(realReply).length > 180) throw new Error(`AI reply exceeded 180 Chinese characters: ${realReply}`);
  if (!/午餐|主食|蛋白|蔬菜|鸡|鱼|蛋|豆|饭|面|餐/.test(realReply)) {
    throw new Error(`AI reply did not directly answer the meal question: ${realReply}`);
  }
  if (/Edge Function|数据库|JSON|系统提示词|模型名称/.test(realReply)) {
    throw new Error(`AI reply exposed implementation details: ${realReply}`);
  }
  await page.locator(".figma-header-action").last().click();
  await page.locator(".app-utility-popover button").filter({ hasText: /新会话|New chat/ }).click();
  await expect(page.locator(".chat-message-row")).toHaveCount(0);
  await page.locator(".figma-header-action").last().click();
  await page.locator(".app-utility-popover button").filter({ hasText: /历史|History/ }).click();
  await expect(page.locator(".ai-history-sheet")).toBeVisible();
  await page.locator(".ai-history-sheet > div > button").first().click();
  await expect(page.locator(".chat-message-row")).toHaveCount(5);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(outputDir, "ai-reply.png") });

  await page.locator('[data-tab="today"]').click();
  const aiButton = page.locator('[data-tab="ai"]');
  const box = await aiButton.boundingBox();
  if (!box) throw new Error("AI button has no visible bounds");
  const pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.waitForTimeout(520);
  await expect(page).toHaveURL(/tab=ai/);
  await expect(page.locator(".chat-composer.voice-active")).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "voice-recording.png") });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect(page.locator(".chat-composer.voice-active")).toBeHidden();
  await expect(page.locator(".chat-composer input")).toHaveValue("今天感觉很平稳");
  const inputBeforeCancelledVoice = await page.locator(".chat-composer input").inputValue();

  await page.locator('[data-tab="today"]').click();
  const cancelBox = await aiButton.boundingBox();
  if (!cancelBox) throw new Error("AI button has no bounds before cancel test");
  const cancelPointer = { x: cancelBox.x + cancelBox.width / 2, y: cancelBox.y + cancelBox.height / 2 };
  await page.mouse.move(cancelPointer.x, cancelPointer.y);
  await page.mouse.down();
  await page.waitForTimeout(520);
  await expect(page).toHaveURL(/tab=ai/);
  await expect(page.locator(".chat-composer.voice-active")).toBeVisible();
  await page.mouse.move(cancelPointer.x, cancelPointer.y - 90, { steps: 4 });
  await expect(page.locator(".chat-voice-button.cancel-armed")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".chat-composer.voice-active")).toBeHidden();
  await expect(page.locator(".chat-composer input")).toHaveValue(inputBeforeCancelledVoice);
  results.push("AI 对话、回复方向与 180 字上限、按住即进入录音、松手结束与上滑取消");
}

async function verifyProfile(page, results) {
  await page.locator('[data-tab="profile"]').click();
  const accountName = page.locator(".profile-account-card .profile-row strong");
  await expect(accountName).toHaveText("NAVA 用户");
  const nickname = page.locator(".profile-personal-card input").first();
  await nickname.fill("功能验收");
  await expect(accountName).toHaveText("NAVA 用户");
  const save = page.locator(".profile-personal-card .section-icon-action");
  await save.click();
  await expect(save).toHaveClass(/success/);
  await expect(accountName).toHaveText("功能验收");

  await page.locator(".avatar-button").click();
  await expect(page.locator(".avatar-sheet")).toBeVisible();
  await page.locator('.profile-account-card input[type="file"]:not([capture])').setInputFiles(samplePhoto);
  await expect(page.locator(".avatar-button img")).toBeVisible();

  const healthActions = page.locator(".profile-device-card").first().locator(".section-icon-action");
  await healthActions.nth(0).click();
  await healthActions.nth(1).click();
  const watchActions = page.locator(".profile-device-card").nth(1).locator(".section-icon-action");
  await watchActions.nth(0).click();
  await watchActions.nth(1).click();
  await page.locator(".profile-device-card").nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "profile-devices.png") });

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".profile-stack > .section-card").last().locator(".section-icon-action").click();
  const download = await downloadPromise;
  await download.cancel();

  await page.locator(".app-content").evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
  await page.locator('[data-tab="record"]').click();
  await expect.poll(() => page.locator(".app-content").evaluate((node) => node.scrollTop)).toBe(0);
  await page.locator('[data-tab="profile"]').click();
  await expect(accountName).toHaveText("功能验收");
  results.push("资料延迟保存、持久化、头像上传、Health、Watch、导出与页面滚动复位");
}

async function verifyNavigationAndMotion(page, results) {
  for (const tab of ["today", "record", "ai", "trends", "profile"]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await expect(page.locator(`[data-tab="${tab}"]`)).toHaveAttribute("aria-current", "page");
    if (tab === "trends") {
      await expect(page.locator("[data-growth-screen]")).toBeVisible();
      await expect(page.locator("[data-growth-task]")).toHaveCount(8);
      await expect(page.locator(".growth-task-group")).toHaveCount(2);
      await expect(page.locator(".growth-task-group").first().locator("[data-growth-task]")).toHaveCount(2);
      await expect(page.locator(".growth-task-group").last().locator("[data-growth-task]")).toHaveCount(6);
    }
    const animationName = await page.locator(`[data-tab="${tab}"]`).evaluate((button) => {
      const glyph = button.querySelector("svg, .figma-nav-icon");
      return glyph ? getComputedStyle(glyph).animationName : getComputedStyle(button.querySelector(".ai-nav-orb")).animationName;
    });
    if (tab !== "ai" && animationName !== "nav-icon-construct") throw new Error(`${tab} icon motion did not replay: ${animationName}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, `tab-${tab}.png`) });
  }
  const recordButton = page.locator('[data-tab="record"]');
  const recordBox = await recordButton.boundingBox();
  if (!recordBox) throw new Error("Record navigation button has no bounds");
  await page.mouse.move(recordBox.x + recordBox.width / 2, recordBox.y + recordBox.height / 2);
  await page.mouse.down();
  await expect.poll(() => recordButton.locator("svg, .figma-nav-icon").evaluate((glyph) => getComputedStyle(glyph).animationName)).toBe("semantic-icon-press");
  await page.mouse.up();
  await page.locator(".figma-header-action").last().click();
  await expect(page.locator(".app-utility-popover")).toBeVisible();
  await page.locator(".figma-header-action").last().click();
  await expect(page.locator(".app-utility-popover")).toBeHidden();
  results.push("五项底部导航、趋势折线、图标构建立体动效与页头工具菜单");
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const results = [];
  const consoleErrors = [];
  const server = reviewBaseUrl
    ? null
    : await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server?.listen();
  const baseUrl = reviewBaseUrl ?? server?.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  try {
    await verifyAuthControls(browser, baseUrl, results, consoleErrors);
    await verifyOtpLogin(browser, baseUrl, results, consoleErrors);
    await verifyRegistration(browser, baseUrl, results, consoleErrors);
    const { context, page } = await createReviewPage(browser, baseUrl, consoleErrors);
    await verifyNavigationAndMotion(page, results);
    await verifyHomeShortcuts(page, results);
    await verifyRecordModules(page, results);
    await verifyAi(page, results, consoleErrors);
    await verifyProfile(page, results);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, "final-profile.png") });
    await page.getByRole("button", { name: /退出登录|Sign out/ }).click();
    await expect(page.locator(".auth-form")).toBeVisible();
    results.push("退出登录并返回登录页");
    await context.close();
    if (consoleErrors.length) throw new Error(`Browser errors:\n${consoleErrors.join("\n")}`);
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ passed: results, consoleErrors }, null, 2)}\n`, "utf8");
    console.log(`Interaction checks passed (${results.length} groups).`);
    for (const result of results) console.log(`- ${result}`);
  } finally {
    await browser.close();
    await server?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
