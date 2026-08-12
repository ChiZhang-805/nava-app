import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const viewportWidth = Number(process.env.VIEWPORT_WIDTH || 430);
const viewportHeight = Number(process.env.VIEWPORT_HEIGHT || 932);
const screenshotLabel = process.env.SCREENSHOT_LABEL?.trim();
const outputDir = path.join(root, "artifacts", screenshotLabel ? `interaction-review-${screenshotLabel}` : "interaction-review");
const port = Number(process.env.PORT || 5192);
const demoAccount = "13800138000";
const demoPassword = "12345678";
const demoOtp = "123456";
const samplePhoto = {
  name: "sample.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"),
};

async function dismissLaunch(page) {
  const launch = page.locator(".launch-sequence");
  await expect(launch).toBeVisible();
  await expect(page.locator(".launch-splash__texture img")).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "launch.png") });
  await launch.click();
  await expect(launch).toBeHidden();
}

async function loginWithPassword(page, baseUrl) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.screenshot({ path: path.join(outputDir, "auth-password.png") });
  await page.locator(".auth-submit").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
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
  await loginWithPassword(page, baseUrl);
  return { context, page };
}

async function verifyOtpLogin(browser, baseUrl, results, consoleErrors) {
  const { context, page } = await createBarePage(browser, consoleErrors);
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator(".auth-method-switch").click();
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator(".auth-code-button").click();
  await page.locator('input[autocomplete="one-time-code"]').fill(demoOtp);
  await page.screenshot({ path: path.join(outputDir, "auth-otp-login.png") });
  await page.locator(".auth-submit").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
  results.push("演示验证码登录");
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
  await page.locator('input[autocomplete="username"]').fill("review@nava.app");
  await page.locator(".auth-code-button").click();
  await page.locator('input[autocomplete="one-time-code"]').fill(demoOtp);
  await page.locator('.auth-consent input[type="checkbox"]').check();
  await page.locator(".auth-submit").click();
  await expect(page.locator('input[autocomplete="new-password"]')).toHaveCount(2);
  await page.waitForTimeout(900);
  await page.locator('input[autocomplete="new-password"]').first().fill("87654321");
  await page.locator('input[autocomplete="new-password"]').nth(1).fill("87654321");
  await page.screenshot({ path: path.join(outputDir, "auth-register.png") });
  await page.locator(".auth-submit").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
  results.push("演示邮箱验证码注册");
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
  for (const module of ["mood", "sleep", "exercise", "diet", "focus"]) {
    await page.locator(`[data-record-module="${module}"]`).click();
    await expect(page.locator(`[data-record-detail="${module}"]`)).toBeVisible();
    if (module === "diet") {
      await page.locator('[data-record-detail="diet"] input[type="file"][capture="environment"]').setInputFiles(samplePhoto);
      await expect(page.locator('[data-record-detail="diet"] .success-text')).toBeVisible();
    }
    await page.locator(`[data-record-detail="${module}"] form:not([hidden]) .action-button`).click();
    await expect(page.locator(`[data-record-detail="${module}"] .success-text`)).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, `record-${module}.png`) });
    await page.locator(".record-back-button").click();
  }
  await page.locator('[data-record-module="face"]').click();
  await page.locator('[data-record-detail="face"] input[type="file"][capture="user"]').setInputFiles(samplePhoto);
  await expect(page.locator('[data-record-detail="face"] .success-text')).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDir, "record-face.png") });
  await page.locator(".record-back-button").click();
  results.push("六类记录入口、保存与面部拍照分析");
}

async function verifyHomeShortcuts(page, results) {
  for (const [index, module] of ["exercise", "diet", "sleep", "face", "focus", "mood"].entries()) {
    await page.locator('[data-tab="today"]').click();
    const menuButton = page.locator(".option-two-side-actions button").first();
    if (!(await page.locator(".option-two-home").evaluate((node) => node.classList.contains("is-expanded")))) await menuButton.click();
    if (index === 0) await page.screenshot({ path: path.join(outputDir, "today-expanded.png") });
    await page.locator(`.option-two-health-entry--${module}`).click();
    await expect(page.locator(`[data-record-detail="${module}"]`)).toBeVisible();
  }
  results.push("首页展开菜单与六个健康快捷入口");
}

async function verifyAi(page, results) {
  await page.locator('[data-tab="ai"]').click();
  await expect(page.locator(".chat-message-row")).toHaveCount(3);
  await page.locator(".chat-composer input").fill("你是谁");
  await page.locator(".chat-send-button").click();
  await expect(page.locator(".chat-message-row")).toHaveCount(5);
  await expect(page.locator(".chat-message-row.assistant").last()).toContainText("NAVA");
  await page.screenshot({ path: path.join(outputDir, "ai-reply.png") });

  await page.locator('[data-tab="today"]').click();
  const aiButton = page.locator('[data-tab="ai"]');
  const box = await aiButton.boundingBox();
  if (!box) throw new Error("AI button has no visible bounds");
  const pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await expect(page.locator('[data-voice-state="recording"]')).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "voice-recording.png") });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect(page.locator("[data-voice-state]")).toBeHidden();
  await expect(page.locator(".chat-composer input")).toHaveValue("今天感觉很平稳");

  await page.locator('[data-tab="today"]').click();
  const cancelBox = await aiButton.boundingBox();
  if (!cancelBox) throw new Error("AI button has no bounds before cancel test");
  const cancelPointer = { x: cancelBox.x + cancelBox.width / 2, y: cancelBox.y + cancelBox.height / 2 };
  await page.mouse.move(cancelPointer.x, cancelPointer.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.move(cancelPointer.x, cancelPointer.y - 90, { steps: 4 });
  await expect(page.locator('[data-voice-state="cancel"]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-voice-state]")).toBeHidden();
  await expect(page.locator(".chat-composer input")).toHaveValue("");
  results.push("AI 对话、长按录音、松手结束与上滑取消");
}

async function verifyProfile(page, results) {
  await page.locator('[data-tab="profile"]').click();
  const accountName = page.locator(".profile-account-card .profile-row strong");
  await expect(accountName).toHaveText("NAVA Demo");
  const nickname = page.locator(".profile-personal-card input").first();
  await nickname.fill("功能验收");
  await expect(accountName).toHaveText("NAVA Demo");
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
      await expect(page.locator(".line-trend-chart")).toHaveCount(2);
      await expect(page.locator(".trend-line")).toHaveCount(2);
    }
    const animationName = await page.locator(`[data-tab="${tab}"]`).evaluate((button) => {
      const glyph = button.querySelector("svg");
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
  await expect.poll(() => recordButton.locator("svg").evaluate((glyph) => getComputedStyle(glyph).animationName)).toBe("semantic-icon-press");
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
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  try {
    await verifyAuthControls(browser, baseUrl, results, consoleErrors);
    await verifyOtpLogin(browser, baseUrl, results, consoleErrors);
    await verifyRegistration(browser, baseUrl, results, consoleErrors);
    const { context, page } = await createReviewPage(browser, baseUrl, consoleErrors);
    await verifyNavigationAndMotion(page, results);
    await verifyHomeShortcuts(page, results);
    await verifyRecordModules(page, results);
    await verifyAi(page, results);
    await verifyProfile(page, results);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, "final-profile.png") });
    await page.locator(".profile-stack > .action-button.ghost").click();
    await expect(page.locator(".auth-form")).toBeVisible();
    results.push("退出登录并返回登录页");
    await context.close();
    if (consoleErrors.length) throw new Error(`Browser errors:\n${consoleErrors.join("\n")}`);
    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify({ passed: results, consoleErrors }, null, 2)}\n`, "utf8");
    console.log(`Interaction checks passed (${results.length} groups).`);
    for (const result of results) console.log(`- ${result}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
