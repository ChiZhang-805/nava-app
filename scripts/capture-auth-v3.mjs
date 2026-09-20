import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "ui-review-2026-07-19-auth-otp");
const port = Number(process.env.AUTH_SCREENSHOT_PORT || 5175);
const baseUrl = `http://127.0.0.1:${port}`;

async function makeContext(browser, viewport = { width: 430, height: 932 }) {
  const context = await browser.newContext({ locale: "zh-CN",
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
  return context;
}

async function openAppPage(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible()) {
    await launch.tap();
    await launch.waitFor({ state: "detached", timeout: 3000 });
  }
  await page.locator(".auth-screen").waitFor({ state: "visible", timeout: 10000 });
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeSession(email, suffix) {
  const now = Math.floor(Date.now() / 1000);
  const id = `00000000-0000-4000-8000-${suffix}`;
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: email },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const accessToken = `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ aud: "authenticated", exp: now + 3600, role: "authenticated", sub: id })}.local-signature`;
  return {
    access_token: accessToken,
    refresh_token: `local-refresh-${suffix}`,
    expires_at: now + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}

async function installAuthMocks(page, { email, passwordMatches = false, smsSendErrorCode, suffix = "000000000101" }) {
  const session = makeSession(email, suffix);
  const calls = { otp: [], verify: [], smsSend: [], smsVerify: [], userUpdates: [], passwordChecks: 0, profileCalls: 0 };

  await page.route("**/auth/v1/otp**", async (route) => {
    calls.otp.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/auth/v1/verify**", async (route) => {
    calls.verify.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
  });
  await page.route("**/auth/v1/user**", async (route) => {
    if (route.request().method() === "PUT") calls.userUpdates.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) });
  });
  await page.route("**/functions/v1/auth-account-status**", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: request.purpose !== "register" }),
    });
  });
  await page.route("**/functions/v1/aliyun-sms-send**", async (route) => {
    calls.smsSend.push(route.request().postDataJSON());
    if (smsSendErrorCode) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "请求过于频繁，请稍后再试。", code: smsSendErrorCode }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sent: true, expiresInSeconds: 600, cooldownSeconds: 60 }),
    });
  });
  await page.route("**/functions/v1/aliyun-sms-verify**", async (route) => {
    const request = route.request().postDataJSON();
    calls.smsVerify.push(request);
    const verificationType = request.purpose === "register" ? "signup" : "recovery";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token_hash: `local-${verificationType}-token`,
        verification_type: verificationType,
        email: `${request.phone}@phone.nava.app`,
      }),
    });
  });
  await page.route("**/rest/v1/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/rpc/nava_password_matches_current**", async (route) => {
    calls.passwordChecks += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(passwordMatches) });
  });
  await page.route("**/rest/v1/profiles**", async (route) => {
    calls.profileCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: session.user.id }) });
  });
  return calls;
}

async function fillNewPasswords(page, password) {
  const fields = page.locator('input[autocomplete="new-password"]');
  await fields.nth(0).fill(password);
  await fields.nth(1).fill(password);
}

async function readWordmarkPixels(page, selector) {
  const png = await page.locator(selector).screenshot({ animations: "disabled" });
  return page.evaluate(async ({ base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let right = -1;
    let top = canvas.height;
    let bottom = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const [red, green, blue, alpha] = pixels.slice(index, index + 4);
        if (alpha > 160 && red < 45 && green < 65 && blue < 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }

    if (right < left || bottom < top) return null;
    const leftSafety = left;
    const rightSafety = canvas.width - 1 - right;
    return {
      bottom,
      centerDelta: Number((((left + right) / 2) - ((canvas.width - 1) / 2)).toFixed(2)),
      height: canvas.height,
      left,
      leftSafety,
      right,
      rightSafety,
      safetyDelta: leftSafety - rightSafety,
      top,
      width: canvas.width,
    };
  }, { base64: png.toString("base64") });
}

async function readLayout(page) {
  const layout = await page.evaluate(() => {
    const form = document.querySelector(".auth-form")?.getBoundingClientRect();
    const mark = document.querySelector(".auth-brand .nava-wordmark__text")?.getBoundingClientRect();
    const brand = document.querySelector(".auth-brand")?.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".field-label")].map((element) => element.textContent?.trim());
    return {
      brandCenterDelta: mark && brand ? Number(((mark.left + mark.width / 2) - (brand.left + brand.width / 2)).toFixed(2)) : null,
      fields: labels,
      form: form && { height: Math.round(form.height), width: Math.round(form.width), x: Math.round(form.x), y: Math.round(form.y) },
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      title: document.querySelector(".auth-form-head h1")?.textContent?.trim(),
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
      viewport: { height: window.innerHeight, width: window.innerWidth },
      wordmark: mark && { left: Math.round(mark.left), right: Math.round(mark.right), width: Math.round(mark.width) },
    };
  });
  return {
    ...layout,
    wordmarkPixels: await readWordmarkPixels(page, ".auth-brand .nava-wordmark__text"),
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port },
    logLevel: "silent",
  });
  await server.listen();
  const browser = await chromium.launch();
  const metrics = {};
  const errors = [];

  try {
    const uiContext = await makeContext(browser);
    const uiPage = await uiContext.newPage();
    uiPage.on("pageerror", (error) => errors.push(error.message));
    uiPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await openAppPage(uiPage);
    await uiPage.waitForTimeout(900);
    metrics.login = await readLayout(uiPage);
    await uiPage.screenshot({ path: path.join(outputDir, "01-login.png") });

    await uiPage.locator(".auth-mode-icon").tap();
    await uiPage.locator('input[autocomplete="username"]').fill("hello@example.com");
    await uiPage.waitForTimeout(350);
    metrics.emailRegistration = await readLayout(uiPage);
    metrics.emailRegistration.otpVisible = await uiPage.locator('input[autocomplete="one-time-code"]').isVisible();
    metrics.emailRegistration.codeButtonEnabled = await uiPage.locator(".auth-code-button").isEnabled();
    await uiPage.screenshot({ path: path.join(outputDir, "02-register-email-otp.png") });

    await fillNewPasswords(uiPage, "sample-password");
    const toggles = uiPage.locator(".auth-input-icon-button");
    await toggles.nth(1).tap();
    metrics.confirmPasswordTypes = await uiPage.locator('input[autocomplete="new-password"]').evaluateAll((inputs) => inputs.map((input) => input.type));
    await uiPage.screenshot({ path: path.join(outputDir, "03-register-password-eye.png") });
    await toggles.nth(1).tap();

    await uiPage.locator('input[autocomplete="username"]').fill("13800138000");
    await uiPage.waitForTimeout(250);
    metrics.phoneRegistration = await readLayout(uiPage);
    metrics.phoneRegistration.otpVisible = await uiPage.locator('input[autocomplete="one-time-code"]').isVisible();
    await uiPage.screenshot({ path: path.join(outputDir, "04-register-phone-otp.png") });

    await uiPage.locator(".auth-mode-icon").tap();
    await uiPage.locator(".auth-forgot").tap();
    await uiPage.locator('input[autocomplete="username"]').fill("reset@example.com");
    await uiPage.waitForTimeout(350);
    metrics.reset = await readLayout(uiPage);
    metrics.reset.passwordCount = await uiPage.locator('input[autocomplete="new-password"]').count();
    metrics.reset.otpVisible = await uiPage.locator('input[autocomplete="one-time-code"]').isVisible();
    await uiPage.screenshot({ path: path.join(outputDir, "05-reset-email-otp.png") });

    await uiPage.locator(".language-toggle").tap();
    await uiPage.waitForTimeout(250);
    metrics.resetEnglish = await readLayout(uiPage);
    await uiPage.screenshot({ path: path.join(outputDir, "06-reset-email-otp-en.png") });
    await uiContext.close();

    const compactContext = await makeContext(browser, { width: 375, height: 667 });
    const compactPage = await compactContext.newPage();
    compactPage.on("pageerror", (error) => errors.push(error.message));
    await openAppPage(compactPage);
    await compactPage.locator(".auth-forgot").tap();
    await compactPage.locator('input[autocomplete="username"]').fill("reset@example.com");
    await compactPage.waitForTimeout(500);
    metrics.compactReset = await readLayout(compactPage);
    await compactPage.screenshot({ path: path.join(outputDir, "07-reset-compact.png") });
    await compactContext.close();

    const emailLoginContext = await makeContext(browser);
    const emailLoginPage = await emailLoginContext.newPage();
    const emailLoginCalls = await installAuthMocks(emailLoginPage, { email: "login@example.com", suffix: "000000000108" });
    await openAppPage(emailLoginPage);
    await emailLoginPage.locator(".auth-method-switch").tap();
    await emailLoginPage.locator('input[autocomplete="username"]').fill("login@example.com");
    await emailLoginPage.locator(".auth-code-button").tap();
    await emailLoginPage.locator('input[autocomplete="one-time-code"]').fill("65432109");
    await emailLoginPage.screenshot({ path: path.join(outputDir, "08-email-otp-login.png") });
    await emailLoginPage.locator(".auth-submit").tap();
    await emailLoginPage.locator(".phone-frame").waitFor({ timeout: 10000 });
    metrics.emailOtpLoginFlow = { ...emailLoginCalls, enteredApp: true };
    await emailLoginContext.close();

    const phoneLoginContext = await makeContext(browser);
    const phoneLoginPage = await phoneLoginContext.newPage();
    const phoneLoginCalls = await installAuthMocks(phoneLoginPage, { email: "13700137000@phone.nava.app", suffix: "000000000109" });
    await openAppPage(phoneLoginPage);
    await phoneLoginPage.locator(".auth-method-switch").tap();
    await phoneLoginPage.locator('input[autocomplete="username"]').fill("13700137000");
    await phoneLoginPage.locator(".auth-code-button").tap();
    await phoneLoginPage.locator('input[autocomplete="one-time-code"]').fill("765432");
    await phoneLoginPage.screenshot({ path: path.join(outputDir, "09-phone-otp-login.png") });
    await phoneLoginPage.locator(".auth-submit").tap();
    await phoneLoginPage.locator(".phone-frame").waitFor({ timeout: 10000 });
    metrics.phoneOtpLoginFlow = { ...phoneLoginCalls, enteredApp: true };
    await phoneLoginContext.close();

    const signupContext = await makeContext(browser);
    const signupPage = await signupContext.newPage();
    const signupCalls = await installAuthMocks(signupPage, { email: "signup@example.com", suffix: "000000000102" });
    await openAppPage(signupPage);
    await signupPage.locator(".auth-mode-icon").tap();
    await signupPage.locator('input[autocomplete="username"]').fill("signup@example.com");
    await signupPage.locator(".auth-code-button").tap();
    await signupPage.locator('input[autocomplete="one-time-code"]').fill("12345678");
    await fillNewPasswords(signupPage, "new-sample-password");
    metrics.emailSignupAgreement = {
      visible: await signupPage.locator(".auth-consent").isVisible(),
      submitDisabledBeforeCheck: !(await signupPage.locator(".auth-submit").isEnabled()),
    };
    await signupPage.screenshot({ path: path.join(outputDir, "10-email-signup-consent.png") });
    await signupPage.locator(".auth-consent input").check();
    metrics.emailSignupAgreement.submitEnabledAfterCheck = await signupPage.locator(".auth-submit").isEnabled();
    await signupPage.locator(".auth-submit").tap();
    await signupPage.locator(".phone-frame").waitFor({ timeout: 10000 });
    await signupPage.waitForTimeout(500);
    metrics.emailSignupFlow = signupCalls;
    metrics.emailSignupFlow.enteredApp = true;
    await signupPage.screenshot({ path: path.join(outputDir, "11-email-signup-complete.png") });
    await signupContext.close();

    const phoneSignupContext = await makeContext(browser);
    const phoneSignupPage = await phoneSignupContext.newPage();
    const phoneSignupCalls = await installAuthMocks(phoneSignupPage, { email: "13800138000@phone.nava.app", suffix: "000000000105" });
    await openAppPage(phoneSignupPage);
    await phoneSignupPage.locator(".auth-mode-icon").tap();
    await phoneSignupPage.locator('input[autocomplete="username"]').fill("13800138000");
    await phoneSignupPage.locator(".auth-code-button").tap();
    await phoneSignupPage.locator('input[autocomplete="one-time-code"]').fill("456789");
    await fillNewPasswords(phoneSignupPage, "phone-sample-password");
    metrics.phoneSignupAgreement = {
      submitDisabledBeforeCheck: !(await phoneSignupPage.locator(".auth-submit").isEnabled()),
    };
    await phoneSignupPage.locator(".auth-consent input").check();
    metrics.phoneSignupAgreement.submitEnabledAfterCheck = await phoneSignupPage.locator(".auth-submit").isEnabled();
    await phoneSignupPage.locator(".auth-submit").tap();
    await phoneSignupPage.locator(".phone-frame").waitFor({ timeout: 10000 });
    await phoneSignupPage.waitForTimeout(700);
    metrics.phoneSignupFlow = phoneSignupCalls;
    metrics.phoneSignupFlow.enteredApp = true;
    await phoneSignupPage.screenshot({ path: path.join(outputDir, "12-phone-signup-complete.png") });
    await phoneSignupContext.close();

    const resetContext = await makeContext(browser);
    const resetPage = await resetContext.newPage();
    const resetCalls = await installAuthMocks(resetPage, { email: "reset@example.com", passwordMatches: false, suffix: "000000000103" });
    await openAppPage(resetPage);
    await resetPage.locator(".auth-forgot").tap();
    await resetPage.locator('input[autocomplete="username"]').fill("reset@example.com");
    await resetPage.locator(".auth-code-button").tap();
    await resetPage.locator('input[autocomplete="one-time-code"]').fill("234567");
    await fillNewPasswords(resetPage, "different-password");
    await resetPage.locator(".auth-submit").tap();
    await resetPage.locator(".phone-frame").waitFor({ timeout: 10000 });
    await resetPage.waitForTimeout(500);
    metrics.passwordResetFlow = resetCalls;
    metrics.passwordResetFlow.enteredApp = true;
    await resetPage.screenshot({ path: path.join(outputDir, "13-password-reset-complete.png") });
    await resetContext.close();

    const phoneResetContext = await makeContext(browser);
    const phoneResetPage = await phoneResetContext.newPage();
    const phoneResetCalls = await installAuthMocks(phoneResetPage, { email: "13900139000@phone.nava.app", passwordMatches: false, suffix: "000000000106" });
    await openAppPage(phoneResetPage);
    await phoneResetPage.locator(".auth-forgot").tap();
    await phoneResetPage.locator('input[autocomplete="username"]').fill("13900139000");
    await phoneResetPage.locator(".auth-code-button").tap();
    await phoneResetPage.locator('input[autocomplete="one-time-code"]').fill("567890");
    await fillNewPasswords(phoneResetPage, "different-phone-password");
    await phoneResetPage.locator(".auth-submit").tap();
    await phoneResetPage.locator(".phone-frame").waitFor({ timeout: 10000 });
    await phoneResetPage.waitForTimeout(700);
    metrics.phoneResetFlow = phoneResetCalls;
    metrics.phoneResetFlow.enteredApp = true;
    await phoneResetPage.screenshot({ path: path.join(outputDir, "14-phone-reset-complete.png") });
    await phoneResetContext.close();

    const sameContext = await makeContext(browser);
    const samePage = await sameContext.newPage();
    const sameCalls = await installAuthMocks(samePage, { email: "same@example.com", passwordMatches: true, suffix: "000000000104" });
    await openAppPage(samePage);
    await samePage.locator(".auth-forgot").tap();
    await samePage.locator('input[autocomplete="username"]').fill("same@example.com");
    await samePage.locator(".auth-code-button").tap();
    await samePage.locator('input[autocomplete="one-time-code"]').fill("345678");
    await fillNewPasswords(samePage, "same-password");
    await samePage.locator(".auth-submit").tap();
    await samePage.locator(".error-text").waitFor({ timeout: 10000 });
    metrics.samePasswordRejection = {
      calls: sameCalls,
      error: await samePage.locator(".error-text").innerText(),
      stayedSignedOut: (await samePage.locator(".auth-screen--reset").count()) === 1,
    };
    await samePage.screenshot({ path: path.join(outputDir, "15-same-password-rejected.png") });
    await sameContext.close();

    const englishErrorContext = await makeContext(browser);
    const englishErrorPage = await englishErrorContext.newPage();
    await installAuthMocks(englishErrorPage, {
      email: "13800138000@phone.nava.app",
      smsSendErrorCode: "OTP_PHONE_RATE_LIMIT",
      suffix: "000000000107",
    });
    await openAppPage(englishErrorPage);
    await englishErrorPage.locator(".language-toggle").tap();
    await englishErrorPage.locator(".auth-mode-icon").tap();
    await englishErrorPage.locator('input[autocomplete="username"]').fill("13800138000");
    await englishErrorPage.locator(".auth-code-button").tap();
    await englishErrorPage.locator(".error-text").waitFor({ timeout: 10000 });
    metrics.englishServiceError = await englishErrorPage.locator(".error-text").innerText();
    await englishErrorPage.screenshot({ path: path.join(outputDir, "16-english-service-error.png") });
    await englishErrorContext.close();

    metrics.errors = errors;
    if (errors.length > 0) throw new Error(`Auth UI emitted errors: ${JSON.stringify(errors)}`);
    if (!metrics.emailRegistration.otpVisible || !metrics.emailRegistration.codeButtonEnabled || !metrics.phoneRegistration.otpVisible) {
      throw new Error(`Registration does not expose a code for both channels: ${JSON.stringify(metrics)}`);
    }
    if (metrics.reset.title !== "重置密码" || !metrics.reset.otpVisible || metrics.reset.passwordCount !== 2) {
      throw new Error(`Reset mode is incomplete: ${JSON.stringify(metrics.reset)}`);
    }
    if (metrics.resetEnglish.title !== "Reset password") throw new Error(`English reset label is inconsistent: ${JSON.stringify(metrics.resetEnglish)}`);
    if (metrics.confirmPasswordTypes[0] !== "password" || metrics.confirmPasswordTypes[1] !== "text") {
      throw new Error(`Password visibility controls are not independent: ${JSON.stringify(metrics.confirmPasswordTypes)}`);
    }
    if (Math.abs(metrics.login.brandCenterDelta) > 2 || Math.abs(metrics.emailRegistration.brandCenterDelta) > 2) {
      throw new Error(`NAVA wordmark is not centered: ${JSON.stringify({ login: metrics.login, signup: metrics.emailRegistration })}`);
    }
    for (const layout of [metrics.login, metrics.emailRegistration, metrics.reset, metrics.compactReset]) {
      if (layout.horizontalOverflow) throw new Error(`Auth layout overflowed horizontally: ${JSON.stringify(layout)}`);
      if (
        !layout.wordmarkPixels ||
        Math.abs(layout.wordmarkPixels.centerDelta) > 4 ||
        Math.min(layout.wordmarkPixels.leftSafety, layout.wordmarkPixels.rightSafety) < 8 ||
        Math.abs(layout.wordmarkPixels.safetyDelta) > 8
      ) {
        throw new Error(`NAVA glyph pixels are off-center or clipped: ${JSON.stringify(layout.wordmarkPixels)}`);
      }
    }
    if (metrics.emailSignupFlow.otp[0]?.email !== "signup@example.com" || metrics.emailSignupFlow.verify[0]?.token !== "12345678" || !metrics.emailSignupFlow.userUpdates[0]?.password) {
      throw new Error(`Email OTP registration sequence is incomplete: ${JSON.stringify(metrics.emailSignupFlow)}`);
    }
    if (
      metrics.emailOtpLoginFlow.otp[0]?.email !== "login@example.com"
      || metrics.emailOtpLoginFlow.otp[0]?.create_user !== false
      || metrics.emailOtpLoginFlow.verify[0]?.token !== "65432109"
      || metrics.emailOtpLoginFlow.verify[0]?.type !== "email"
    ) {
      throw new Error(`Email OTP login sequence is incomplete: ${JSON.stringify(metrics.emailOtpLoginFlow)}`);
    }
    if (
      metrics.phoneOtpLoginFlow.smsSend[0]?.purpose !== "login"
      || metrics.phoneOtpLoginFlow.smsVerify[0]?.purpose !== "login"
      || metrics.phoneOtpLoginFlow.verify[0]?.type !== "recovery"
    ) {
      throw new Error(`Phone OTP login sequence is incomplete: ${JSON.stringify(metrics.phoneOtpLoginFlow)}`);
    }
    if (
      !metrics.emailSignupAgreement.visible
      || !metrics.emailSignupAgreement.submitDisabledBeforeCheck
      || !metrics.emailSignupAgreement.submitEnabledAfterCheck
      || !metrics.phoneSignupAgreement.submitDisabledBeforeCheck
      || !metrics.phoneSignupAgreement.submitEnabledAfterCheck
    ) {
      throw new Error(`Registration agreement is not enforced: ${JSON.stringify({ email: metrics.emailSignupAgreement, phone: metrics.phoneSignupAgreement })}`);
    }
    if (
      metrics.phoneSignupFlow.smsSend[0]?.purpose !== "register" ||
      metrics.phoneSignupFlow.smsVerify[0]?.purpose !== "register" ||
      !metrics.phoneSignupFlow.smsVerify[0]?.password ||
      metrics.phoneSignupFlow.verify[0]?.type !== "signup"
    ) {
      throw new Error(`Phone OTP registration sequence is incomplete: ${JSON.stringify(metrics.phoneSignupFlow)}`);
    }
    if (metrics.passwordResetFlow.passwordChecks !== 1 || !metrics.passwordResetFlow.userUpdates[0]?.password) {
      throw new Error(`Password reset did not check reuse before updating: ${JSON.stringify(metrics.passwordResetFlow)}`);
    }
    if (
      metrics.phoneResetFlow.smsSend[0]?.purpose !== "reset" ||
      metrics.phoneResetFlow.smsVerify[0]?.purpose !== "reset" ||
      metrics.phoneResetFlow.verify[0]?.type !== "recovery" ||
      metrics.phoneResetFlow.passwordChecks !== 1 ||
      !metrics.phoneResetFlow.userUpdates[0]?.password
    ) {
      throw new Error(`Phone OTP reset sequence is incomplete: ${JSON.stringify(metrics.phoneResetFlow)}`);
    }
    if (!metrics.samePasswordRejection.stayedSignedOut || metrics.samePasswordRejection.calls.userUpdates.length !== 0) {
      throw new Error(`Same-password reset was not rejected safely: ${JSON.stringify(metrics.samePasswordRejection)}`);
    }
    if (metrics.englishServiceError !== "Too many requests. Try again later.") {
      throw new Error(`English auth errors are not localized: ${JSON.stringify(metrics.englishServiceError)}`);
    }
    await writeFile(path.join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`Auth screenshots saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
