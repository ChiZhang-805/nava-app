import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", process.env.AUTH_REVIEW_DIR || "ui-review-2026-07-19-auth-final");
const baseUrl = "http://127.0.0.1:5173";

async function readSupabaseProjectRef() {
  const envFile = await readFile(path.join(root, ".env"), "utf8");
  const urlLine = envFile.split(/\r?\n/).find((line) => line.startsWith("VITE_SUPABASE_URL="));
  const rawUrl = urlLine?.slice("VITE_SUPABASE_URL=".length).trim().replace(/^['\"]|['\"]$/g, "");
  if (!rawUrl) throw new Error("VITE_SUPABASE_URL is required for auth-flow review.");
  return new URL(rawUrl).hostname.split(".")[0];
}

async function makeContext(browser, viewport) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
}

async function readCanvasMetrics(page) {
  return page.locator(".living-background__canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl");
    return {
      ready: canvas.dataset.ready === "true",
      renderCount: Number(canvas.dataset.renderCount || 0),
      cssSize: [canvas.clientWidth, canvas.clientHeight],
      bufferSize: [canvas.width, canvas.height],
      contextLost: gl?.isContextLost() ?? null,
      webgl: Boolean(gl),
    };
  });
}

async function measureCanvasRate(page, durationMs = 3000) {
  const before = await readCanvasMetrics(page);
  const startedAt = Date.now();
  await page.waitForTimeout(durationMs);
  const after = await readCanvasMetrics(page);
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  return {
    framesPerSecond: Number(((after.renderCount - before.renderCount) / elapsedSeconds).toFixed(1)),
    renderedFrames: after.renderCount - before.renderCount,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  const metrics = {};

  try {
    const launchContext = await makeContext(browser, { width: 430, height: 932 });
    const launchPage = await launchContext.newPage();
    await launchPage.goto(baseUrl, { waitUntil: "networkidle" });
    await launchPage.waitForTimeout(1400);
    await launchPage.screenshot({ path: path.join(outputDir, "01-launch-1s.png") });
    metrics.launchBackground = await readCanvasMetrics(launchPage);
    await launchPage.waitForTimeout(6000);
    await launchPage.screenshot({ path: path.join(outputDir, "02-launch-7s.png") });
    await launchPage.waitForTimeout(6000);
    await launchPage.screenshot({ path: path.join(outputDir, "03-launch-13s.png") });
    await launchPage.locator(".launch-sequence").tap({ position: { x: 24, y: 420 } });
    await launchPage.waitForTimeout(1320);
    await launchPage.locator(".launch-sequence").tap({ position: { x: 24, y: 420 } });
    await launchPage.waitForTimeout(1320);
    await launchPage.locator(".launch-sequence.ready .launch-start").waitFor();
    await launchPage.waitForTimeout(1500);
    await launchPage.screenshot({ path: path.join(outputDir, "03b-launch-ready.png") });
    await launchPage.locator(".launch-start").tap();
    await launchPage.waitForTimeout(700);
    await launchPage.screenshot({ path: path.join(outputDir, "03c-auth-after-launch.png") });
    metrics.launchAnimations = await launchPage.locator(".living-background").evaluate((element) =>
      element.getAnimations({ subtree: true }).map((animation) => ({
        name: animation instanceof CSSAnimation ? animation.animationName : "transition",
        currentTime: Math.round(Number(animation.currentTime ?? 0)),
        playState: animation.playState,
      })),
    );
    await launchContext.close();

    const authContext = await makeContext(browser, { width: 430, height: 932 });
    await authContext.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
    const authPage = await authContext.newPage();
    await authPage.goto(baseUrl, { waitUntil: "networkidle" });
    await authPage.waitForTimeout(800);
    await authPage.screenshot({ path: path.join(outputDir, "04-login-1s.png") });
    await authPage.waitForTimeout(1600);
    await authPage.screenshot({ path: path.join(outputDir, "05-login-2s.png") });
    await authPage.waitForTimeout(1600);
    await authPage.screenshot({ path: path.join(outputDir, "06-login-4s.png") });
    metrics.authBackground = await readCanvasMetrics(authPage);
    metrics.backgroundRenderRate = await measureCanvasRate(authPage);

    metrics.wordmarkAnimations = await authPage.locator(".nava-wordmark").evaluate((element) =>
      element.getAnimations({ subtree: true }).map((animation) => ({
        name: animation instanceof CSSAnimation ? animation.animationName : "transition",
        duration: Number(animation.effect?.getTiming().duration ?? 0),
        currentTime: Math.round(Number(animation.currentTime ?? 0)),
        playState: animation.playState,
      })),
    );

    metrics.login = await authPage.evaluate(() => {
      const screen = document.querySelector(".auth-screen")?.getBoundingClientRect();
      const form = document.querySelector(".auth-form")?.getBoundingClientRect();
      const inputs = [...document.querySelectorAll(".input-wrap")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      });
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: screen && { width: Math.round(screen.width), height: Math.round(screen.height) },
        form: form && { x: Math.round(form.x), y: Math.round(form.y), width: Math.round(form.width), height: Math.round(form.height) },
        inputs,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
      };
    });

    await authPage.locator('input[autocomplete="username"]').fill("hello@example.com");
    await authPage.locator('input[autocomplete="current-password"]').fill("sample-password");
    await authPage.screenshot({ path: path.join(outputDir, "06b-login-active.png") });

    await authPage.locator(".auth-mode-icon").tap();
    await authPage.waitForTimeout(900);
    await authPage.screenshot({ path: path.join(outputDir, "07-register.png") });
    metrics.register = await authPage.evaluate(() => ({
      title: document.querySelector(".auth-form-head h1")?.textContent,
      fields: [...document.querySelectorAll(".field-label")].map((element) => element.textContent),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
    }));
    metrics.emailRegistration = {
      confirmationVisible: await authPage.locator(".auth-email-confirmation").isVisible(),
      otpInputCount: await authPage.locator('input[autocomplete="one-time-code"]').count(),
    };
    if (!metrics.emailRegistration.confirmationVisible || metrics.emailRegistration.otpInputCount !== 0) {
      throw new Error("Email registration must use a confirmation link instead of a six-digit code field.");
    }

    const registerPasswordInputs = authPage.locator('input[autocomplete="new-password"]');
    const registerPasswordToggles = authPage.locator(".auth-input-icon-button");
    if ((await registerPasswordInputs.count()) !== 2 || (await registerPasswordToggles.count()) !== 2) {
      throw new Error("Registration must expose two password fields with independent visibility controls.");
    }
    await registerPasswordInputs.nth(0).fill("sample-password");
    await registerPasswordInputs.nth(1).fill("sample-password");
    await registerPasswordToggles.nth(1).tap();
    metrics.confirmPasswordVisibility = await registerPasswordInputs.evaluateAll((inputs) =>
      inputs.map((input) => ({ type: input.type, valueLength: input.value.length })),
    );
    if (
      metrics.confirmPasswordVisibility[0]?.type !== "password" ||
      metrics.confirmPasswordVisibility[1]?.type !== "text"
    ) {
      throw new Error("Confirm-password visibility control changed the wrong field.");
    }
    await authPage.screenshot({ path: path.join(outputDir, "07a-register-confirm-visible.png") });
    await registerPasswordToggles.nth(1).tap();

    await authPage.locator('input[autocomplete="username"]').fill("13800138000");
    await authPage.waitForTimeout(250);
    metrics.phoneRegistration = {
      confirmationCount: await authPage.locator(".auth-email-confirmation").count(),
      otpInputVisible: await authPage.locator('input[autocomplete="one-time-code"]').isVisible(),
    };
    if (!metrics.phoneRegistration.otpInputVisible || metrics.phoneRegistration.confirmationCount !== 0) {
      throw new Error("Phone registration must retain its six-digit SMS code field.");
    }
    await authPage.screenshot({ path: path.join(outputDir, "07b-register-phone.png") });
    await authPage.locator('input[autocomplete="username"]').fill("hello@example.com");
    await authPage.locator(".language-toggle").tap();
    await authPage.waitForTimeout(400);
    await authPage.screenshot({ path: path.join(outputDir, "07c-register-en.png") });
    metrics.registerEnglish = await authPage.evaluate(() => ({
      title: document.querySelector(".auth-form-head h1")?.textContent,
      fields: [...document.querySelectorAll(".field-label")].map((element) => element.textContent),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
    }));
    await authContext.close();

    const compactContext = await makeContext(browser, { width: 375, height: 667 });
    await compactContext.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
    const compactPage = await compactContext.newPage();
    await compactPage.goto(baseUrl, { waitUntil: "networkidle" });
    await compactPage.locator(".auth-mode-icon").tap();
    await compactPage.waitForTimeout(700);
    await compactPage.screenshot({ path: path.join(outputDir, "08-register-compact.png") });
    metrics.compact = await compactPage.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyScrollHeight: document.body.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    await compactContext.close();

    const signupContext = await makeContext(browser, { width: 430, height: 932 });
    await signupContext.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
    const signupPage = await signupContext.newPage();
    let signupRequest = null;
    await signupPage.route("**/auth/v1/signup**", async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      signupRequest = {
        email: body.email,
        hasPassword: typeof body.password === "string" && body.password.length >= 6,
        redirectTo: new URL(request.url()).searchParams.get("redirect_to"),
      };
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000099",
          aud: "authenticated",
          role: "authenticated",
          email: body.email,
          confirmation_sent_at: now,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: body.data ?? {},
          identities: [],
          created_at: now,
          updated_at: now,
        }),
      });
    });
    await signupPage.goto(baseUrl, { waitUntil: "networkidle" });
    await signupPage.locator(".auth-mode-icon").tap();
    await signupPage.locator('input[autocomplete="username"]').fill("qa@example.com");
    const signupPasswords = signupPage.locator('input[autocomplete="new-password"]');
    await signupPasswords.nth(0).fill("sample-password");
    await signupPasswords.nth(1).fill("sample-password");
    await signupPage.locator(".auth-submit").tap();
    await signupPage.locator(".auth-form--signIn .success-text").waitFor();
    metrics.emailSignupSubmission = {
      request: signupRequest,
      returnedToSignIn: await signupPage.locator(".auth-form--signIn").isVisible(),
      successVisible: await signupPage.locator(".success-text").isVisible(),
    };
    if (!signupRequest?.hasPassword || !metrics.emailSignupSubmission.returnedToSignIn) {
      throw new Error(`Email signup did not submit a password before confirmation: ${JSON.stringify(metrics.emailSignupSubmission)}`);
    }
    await signupPage.waitForTimeout(800);
    await signupPage.screenshot({ path: path.join(outputDir, "09-email-confirmation-sent.png") });
    await signupContext.close();

    const resetContext = await makeContext(browser, { width: 430, height: 932 });
    await resetContext.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
    const resetPage = await resetContext.newPage();
    let resetRequest = null;
    await resetPage.route("**/auth/v1/recover**", async (route) => {
      const request = route.request();
      resetRequest = {
        email: request.postDataJSON().email,
        redirectTo: new URL(request.url()).searchParams.get("redirect_to"),
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await resetPage.goto(baseUrl, { waitUntil: "networkidle" });
    await resetPage.locator('input[autocomplete="username"]').fill("recovery@example.com");
    await resetPage.locator(".auth-forgot").tap();
    await resetPage.locator(".success-text").waitFor();
    metrics.passwordResetRequest = resetRequest;
    if (!resetRequest?.redirectTo?.includes("auth=recovery")) {
      throw new Error(`Password reset is missing its recovery callback: ${JSON.stringify(resetRequest)}`);
    }
    await resetPage.screenshot({ path: path.join(outputDir, "09b-password-reset-sent.png") });
    await resetContext.close();

    const recoveryContext = await makeContext(browser, { width: 430, height: 932 });
    const projectRef = await readSupabaseProjectRef();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const recoveryUser = {
      id: "00000000-0000-4000-8000-000000000098",
      aud: "authenticated",
      role: "authenticated",
      email: "recovery@example.com",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const recoverySession = {
      access_token: "local-review-access-token",
      refresh_token: "local-review-refresh-token",
      expires_at: nowSeconds + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user: recoveryUser,
    };
    await recoveryContext.addInitScript(
      ({ authStorageKey, session }) => {
        window.sessionStorage.setItem("nava.launch.sequence.v1", "seen");
        window.localStorage.setItem(authStorageKey, JSON.stringify(session));
      },
      { authStorageKey: `sb-${projectRef}-auth-token`, session: recoverySession },
    );
    const recoveryPage = await recoveryContext.newPage();
    let recoveryUpdateRequest = null;
    await recoveryPage.route("**/auth/v1/user", async (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        recoveryUpdateRequest = { hasPassword: typeof body.password === "string" && body.password.length >= 6 };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(recoveryUser) });
    });
    await recoveryPage.goto(`${baseUrl}/?auth=recovery`, { waitUntil: "networkidle" });
    await recoveryPage.locator(".auth-form--signIn").waitFor();
    metrics.passwordRecovery = {
      passwordFields: await recoveryPage.locator('input[autocomplete="new-password"]').count(),
      visibilityControls: await recoveryPage.locator(".auth-input-icon-button").count(),
      horizontalOverflow: await recoveryPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    };
    if (metrics.passwordRecovery.passwordFields !== 2 || metrics.passwordRecovery.visibilityControls !== 2) {
      throw new Error("Password recovery must provide two independently visible password fields.");
    }
    await recoveryPage.screenshot({ path: path.join(outputDir, "10-password-recovery.png") });
    const recoveryPasswords = recoveryPage.locator('input[autocomplete="new-password"]');
    await recoveryPasswords.nth(0).fill("new-sample-password");
    await recoveryPasswords.nth(1).fill("new-sample-password");
    await recoveryPage.locator(".auth-submit").tap();
    await recoveryPage.locator(".phone-frame").waitFor();
    metrics.passwordRecovery.completed = true;
    metrics.passwordRecovery.updateRequest = recoveryUpdateRequest;
    if (!recoveryUpdateRequest?.hasPassword) {
      throw new Error("Password recovery did not submit the new password to Supabase.");
    }
    await recoveryPage.screenshot({ path: path.join(outputDir, "11-password-recovery-complete.png") });
    await recoveryContext.close();

    await writeFile(path.join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
  }

  console.log(`Auth screenshots saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
