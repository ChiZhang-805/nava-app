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
const reviewLocale = process.env.REVIEW_LOCALE === "en" ? "en" : "zh";
const skipAuthAudit = process.env.SKIP_AUTH_AUDIT === "1";
const demoAccount = "13800138000";
const demoPassword = "12345678";
const demoSmsOtp = "123456";
const demoEmailOtp = "12345678";
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
    await expect(page.locator(".onboarding-header small")).toHaveCount(0);
    await expect(page.locator(".onboarding-question-copy > span")).toHaveCount(0);
    await expect(page.locator(".onboarding-question-copy > p")).toHaveCount(0);
    await expect(page.locator(".onboarding-gender-mascot")).toHaveCount(profileStep.key === "gender" ? 1 : 0);
    if (profileStep.key === "gender") {
      await expect(page.locator(".onboarding-gender-mascot img")).toHaveAttribute("src", /raw-01/);
    }
    await page.locator(".onboarding-option-grid button").first().click();
    if (profileStep.multi) {
      await page.locator(".onboarding-next").click();
    }
  }

  await expect(onboarding).toHaveAttribute("data-onboarding-step", "privacy");
  await expect(page.locator(".onboarding-question-copy > span")).toHaveCount(0);
  await expect(page.locator(".onboarding-question-copy > p")).toHaveCount(0);
  await page.locator(".onboarding-consent-row input").first().check({ force: true });
  await page.locator(".onboarding-next").click();
  await expect(page.locator(".phone-frame")).toBeVisible();
}

async function beginLoginInterstitialWatch(page) {
  await page.evaluate(() => {
    const state = { loadingSeen: false };
    const scan = () => {
      if (document.querySelector(".centered-screen")) state.loadingSeen = true;
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__navaLoginInterstitialWatch = { observer, state };
    scan();
  });
}

async function expectNoLoginInterstitial(page) {
  const loadingSeen = await page.evaluate(() => {
    const watch = window.__navaLoginInterstitialWatch;
    watch?.observer.disconnect();
    return watch?.state.loadingSeen ?? false;
  });
  if (loadingSeen) throw new Error("A full-screen loading interstitial appeared after authentication.");
}

async function loginWithPassword(page, baseUrl) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  await dismissLaunch(page);
  await page.locator('input[autocomplete="username"]').fill(demoAccount);
  await page.locator('input[autocomplete="current-password"]').fill(demoPassword);
  await page.screenshot({ path: path.join(outputDir, "auth-password.png") });
  await beginLoginInterstitialWatch(page);
  await page.locator(".auth-submit").click();
  await completeOnboardingIfNeeded(page);
  await expectNoLoginInterstitial(page);
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
  if (reviewLocale === "en") {
    await page.evaluate(() => window.localStorage.setItem("nava.locale", "en"));
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  }
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
  const otp = page.locator('input[autocomplete="one-time-code"]');
  await expect(otp).toHaveAttribute("maxlength", "6");
  await otp.fill(demoSmsOtp);
  await page.screenshot({ path: path.join(outputDir, "auth-otp-login.png") });
  await beginLoginInterstitialWatch(page);
  await page.locator(".auth-submit").click();
  await completeOnboardingIfNeeded(page);
  await expectNoLoginInterstitial(page);
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
  const otp = page.locator('input[autocomplete="one-time-code"]');
  await expect(otp).toHaveAttribute("maxlength", "6");
  await otp.fill(demoSmsOtp);
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
  const otp = page.locator('input[autocomplete="one-time-code"]');
  await expect(otp).toHaveAttribute("maxlength", "8");
  await expect(otp).toHaveAttribute("placeholder", "8 位邮箱验证码");
  await otp.fill(demoEmailOtp);
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
  await beginLoginInterstitialWatch(page);
  await page.locator(".auth-submit").click();
  await completeOnboardingIfNeeded(page);
  await expectNoLoginInterstitial(page);
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

async function assertStaticLayout(page, label) {
  const audit = await page.evaluate((auditLabel) => {
    const frame = document.querySelector(".phone-frame");
    if (!frame) return { auditLabel, error: "phone frame missing" };
    const frameRect = frame.getBoundingClientRect();
    const visible = (node) => {
      if (node.closest('[aria-hidden="true"], [inert]')) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const selectors = [
      "[data-record-module]",
      ".figma-module-card",
      ".section-card",
      ".weekly-score-card",
      ".weekly-trend-card",
      ".weekly-insight-card",
      ".weekly-module-status",
      ".growth-summary-card",
      ".growth-task-group",
      ".growth-task-card",
      ".growth-badge-card",
      ".rhythm-detail-sheet",
      ".utility-drawer",
      ".drawer-todo-section",
      ".drawer-points-card",
      ".drawer-placeholder-card",
      ".profile-account-card",
      ".profile-personal-card",
      ".profile-device-card",
      ".module-modal-card",
      ".focus-interruption",
      ".chat-bubble",
      ".chat-recognition-card",
    ].join(",");
    const horizontalOffenders = [...document.querySelectorAll(selectors)]
      .filter(visible)
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < frameRect.left - 1 || rect.right > frameRect.right + 1)
      .slice(0, 5)
      .map(({ node, rect }) => ({
        className: node.className,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
      }));
    const nav = document.querySelector(".bottom-nav");
    const navTop = nav?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const bottomNavOffenders = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')]
      .filter((node) => !node.closest(".bottom-nav") && visible(node))
      // Growth tasks intentionally live in the page scroller. A card peeking
      // above the fixed navigation is normal while scrolling; the dedicated
      // growth audit below verifies that every card can become fully visible.
      .filter((node) => !node.closest("[data-growth-screen]"))
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.top < navTop - 1 && rect.bottom > navTop + 1)
      .filter(({ node, rect }) => {
        const hit = document.elementFromPoint(rect.left + rect.width / 2, Math.max(rect.top + 1, navTop - 2));
        return hit === node || (hit instanceof Node && node.contains(hit));
      })
      .slice(0, 5)
      .map(({ node, rect }) => ({
        tagName: node.tagName.toLowerCase(),
        className: node.className,
        text: (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        top: Math.round(rect.top * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
        navTop: Math.round(navTop * 10) / 10,
      }));
    const header = document.querySelector(".figma-app-header");
    let headerAlignment = null;
    if (header && visible(header)) {
      const actions = [...header.querySelectorAll(":scope > button")].filter(visible);
      const heading = header.querySelector("h1");
      if (actions.length >= 2 && heading) {
        const first = actions[0].getBoundingClientRect();
        const last = actions.at(-1).getBoundingClientRect();
        const title = heading.getBoundingClientRect();
        headerAlignment = {
          actionCenterOffset: Math.abs((first.top + first.height / 2) - (last.top + last.height / 2)),
          titleCenterOffset: Math.abs((title.left + title.width / 2) - (frameRect.left + frameRect.width / 2)),
        };
      }
    }
    const chartDateAlignmentOffenders = [
      ...[...document.querySelectorAll(".bar-line-trend-chart.is-score-scale .bar-line-bars > span")].map((slot) => ({
        bar: slot.querySelector("i"),
        date: slot.querySelector("small"),
      })),
      ...[...document.querySelectorAll(".report-history-trend-chart .diet-history-bar")].map((group) => ({
        bar: group.querySelector("rect"),
        date: group.querySelector(".diet-history-date"),
      })),
    ]
      .filter(({ bar, date }) => bar && date && visible(bar) && visible(date))
      .map(({ bar, date }) => {
        const barRect = bar.getBoundingClientRect();
        const dateRect = date.getBoundingClientRect();
        const barCenter = barRect.left + barRect.width / 2;
        const dateCenter = dateRect.left + dateRect.width / 2;
        return {
          label: (date.textContent ?? "").trim(),
          barCenter: Math.round(barCenter * 10) / 10,
          dateCenter: Math.round(dateCenter * 10) / 10,
          offset: Math.round(Math.abs(barCenter - dateCenter) * 10) / 10,
        };
      })
      .filter(({ offset }) => offset > 0.75)
      .slice(0, 7);
    return {
      auditLabel,
      horizontalOffenders,
      bottomNavOffenders,
      chartDateAlignmentOffenders,
      frameOverflow: Math.max(0, frame.scrollWidth - frame.clientWidth),
      headerAlignment,
    };
  }, label);
  if (audit.error) throw new Error(`${label}: ${audit.error}`);
  if (audit.frameOverflow > 1 || audit.horizontalOffenders.length > 0) {
    throw new Error(`${label}: horizontal layout overflow ${JSON.stringify(audit)}`);
  }
  if (audit.bottomNavOffenders.length > 0) {
    throw new Error(`${label}: an interactive control is partially hidden by the bottom navigation ${JSON.stringify(audit.bottomNavOffenders)}`);
  }
  if (audit.chartDateAlignmentOffenders.length > 0) {
    throw new Error(`${label}: chart dates are not centered below their bars ${JSON.stringify(audit.chartDateAlignmentOffenders)}`);
  }
  if (audit.headerAlignment && (audit.headerAlignment.actionCenterOffset > 1 || audit.headerAlignment.titleCenterOffset > 1)) {
    throw new Error(`${label}: header controls are not aligned ${JSON.stringify(audit.headerAlignment)}`);
  }
}

async function assertNoBottomNavClipping(page, label, selectors) {
  const offenders = await page.evaluate(({ auditLabel, query }) => {
    const nav = document.querySelector(".bottom-nav");
    if (!nav) return [{ auditLabel, error: "bottom navigation missing" }];
    const navTop = nav.getBoundingClientRect().top;
    return [...document.querySelectorAll(query)]
      .filter((node) => {
        if (node.closest('[aria-hidden="true"], [inert], [hidden]')) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity) > 0.01
          && rect.width > 0
          && rect.height > 0
          && rect.top < navTop - 1
          && rect.bottom > navTop + 1;
      })
      .slice(0, 6)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          auditLabel,
          tagName: node.tagName.toLowerCase(),
          className: node.className,
          text: (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          top: Math.round(rect.top * 10) / 10,
          bottom: Math.round(rect.bottom * 10) / 10,
          navTop: Math.round(navTop * 10) / 10,
        };
      });
  }, { auditLabel: label, query: selectors });
  if (offenders.length > 0) {
    throw new Error(`${label}: an interactive row is clipped by the bottom navigation ${JSON.stringify(offenders)}`);
  }
}

async function assertAnimation(locator, expectedName, label) {
  const animationNames = await locator.first().evaluate((node) => getComputedStyle(node).animationName.split(",").map((name) => name.trim()));
  if (!animationNames.includes(expectedName)) {
    throw new Error(`${label}: expected ${expectedName}, found ${animationNames.join(", ") || "none"}`);
  }
}

async function assertWholeGrowthTaskCards(page, label) {
  const taskGeometry = await page.locator(".growth-task-list").evaluate((node) => {
    const listRect = node.getBoundingClientRect();
    const cards = [...node.querySelectorAll("[data-growth-task]")]
      .map((task) => {
        const rect = task.getBoundingClientRect();
        return { id: task.getAttribute("data-growth-task"), top: rect.top, bottom: rect.bottom };
      });
    return {
      cards,
      listTop: listRect.top,
      listBottom: listRect.bottom,
      scrollTop: node.scrollTop,
      scrollHeight: node.scrollHeight,
    };
  });
  const clippedTasks = taskGeometry.cards.filter(({ top, bottom }) => (top < taskGeometry.listTop - 0.1 && bottom > taskGeometry.listTop + 0.1)
    || (top < taskGeometry.listBottom - 0.1 && bottom > taskGeometry.listBottom + 0.1));
  if (clippedTasks.length > 0) throw new Error(`${label}: growth task cards are clipped ${JSON.stringify({ clippedTasks, ...taskGeometry })}`);
}

async function assertMoodCardSeparation(page, label) {
  const audit = await page.locator('[data-module-view="mood-overview"]').evaluate((dashboard) => {
    const entry = dashboard.querySelector(".mood-entry-card");
    const diary = dashboard.querySelector(".mood-diary-trigger");
    const trend = dashboard.querySelector(".mood-trend-card");
    if (!entry || !diary || !trend) return { error: "mood cards missing" };
    const entryRect = entry.getBoundingClientRect();
    const diaryRect = diary.getBoundingClientRect();
    const trendRect = trend.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      media390: window.matchMedia("(max-width: 390px)").matches,
      gridRows: getComputedStyle(dashboard).gridTemplateRows,
      entryBottom: entryRect.bottom,
      diaryTop: diaryRect.top,
      diaryBottom: diaryRect.bottom,
      trendTop: trendRect.top,
      diaryOverflow: diaryRect.bottom - entryRect.bottom,
      cardOverlap: diaryRect.bottom - trendRect.top,
    };
  });
  if (audit.error || audit.diaryOverflow > 0.5 || audit.cardOverlap > -0.5) {
    throw new Error(`${label}: mood entry controls overlap the trend card ${JSON.stringify(audit)}`);
  }
}

async function verifyRecordModules(page, results) {
  await page.locator('[data-tab="record"]').click();
  await expect(page.locator("[data-record-module]")).toHaveCount(6);
  const openModule = async (module) => {
    await page.locator(`[data-record-module="${module}"]`).click();
    await expect(page.locator(`[data-record-detail="${module}"]`)).toBeVisible();
    await expect.poll(() => page.locator(".app-content").evaluate((node) => node.scrollTop)).toBe(0);
    await assertStaticLayout(page, `record-${module}-overview`);
  };
  const returnFromSubview = async () => {
    const routeLabel = await page.locator("[data-record-detail]").evaluate((root) => {
      const detail = root.getAttribute("data-record-detail") ?? "unknown";
      const view = root.querySelector("[data-module-view]")?.getAttribute("data-module-view") ?? "subview";
      return `record-${detail}-${view}`;
    });
    await assertStaticLayout(page, routeLabel);
    await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
    await expect(page.locator('[data-module-view$="-overview"]')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).not.toContain("view=");
  };
  const returnToHub = async () => {
    await expect.poll(() => new URL(page.url()).hash).not.toContain("view=");
    await page.locator('.figma-app-header [aria-label="返回记录入口"], .figma-app-header [aria-label="Back to records"]').click();
    await expect(page.locator("[data-record-module]")).toHaveCount(6);
    await expect.poll(() => new URL(page.url()).hash).not.toContain("module=");
  };

  await openModule("mood");
  await expect(page.locator('[data-module-view="mood-overview"]')).toBeVisible();
  await expect(page.locator('[data-ui-revision="mood-bar-line-v3"]')).toBeVisible();
  await expect(page.locator(".mood-entry-card > header button")).toHaveCount(0);
  await expect(page.locator(".mood-chart .bar-line-bars > span")).toHaveCount(7);
  const expectedMoodDates = await page.evaluate(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }));
  await expect(page.locator(".mood-chart .bar-line-bars small")).toHaveText(expectedMoodDates);
  const moodCurve = page.locator(".mood-chart .bar-line-path");
  const curveBefore = await moodCurve.getAttribute("d");
  if (!curveBefore?.includes(" C ")) throw new Error(`Mood trend is not a smooth cubic curve: ${curveBefore}`);
  const lastMoodBar = page.locator(".mood-chart .bar-line-bars i").last();
  const lastBarBefore = await lastMoodBar.getAttribute("style");
  const pieBefore = await page.locator(".mood-pie > svg").evaluate((node) => [...node.querySelectorAll("circle")]
    .map((circle) => `${circle.getAttribute("stroke-dasharray")}:${circle.getAttribute("stroke-dashoffset")}`)
    .join("|"));
  await page.locator(".mood-face-row button").first().click();
  await expect.poll(() => moodCurve.getAttribute("d")).not.toBe(curveBefore);
  await expect.poll(() => lastMoodBar.getAttribute("style")).not.toBe(lastBarBefore);
  await expect.poll(() => page.locator(".mood-pie > svg").evaluate((node) => [...node.querySelectorAll("circle")]
    .map((circle) => `${circle.getAttribute("stroke-dasharray")}:${circle.getAttribute("stroke-dashoffset")}`)
    .join("|"))).not.toBe(pieBefore);
  await page.screenshot({ path: path.join(outputDir, "record-mood-before-journal.png") });
  await assertMoodCardSeparation(page, "record-mood-before-journal");
  await page.locator('[aria-label="填写情绪日记"], [aria-label="Write mood journal"]').click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.locator('[role="dialog"] textarea').fill("今天节律平稳，午后状态更好。");
  await page.waitForTimeout(350);
  await assertStaticLayout(page, "record-mood-journal");
  await page.screenshot({ path: path.join(outputDir, "record-mood-journal.png") });
  await page.locator('[role="dialog"] button[type="submit"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await expect(page.locator(".mood-entry-card > header button")).toHaveCount(0);
  await assertMoodCardSeparation(page, "record-mood-after-journal");
  await page.locator('[aria-label="查看情绪趋势报告"], [aria-label="View mood trend report"]').click();
  await expect(page.locator('[data-record-detail="mood"] .report-history-trend-chart')).toBeVisible();
  await assertAnimation(page.locator('[data-record-detail="mood"] .diet-history-line'), "trend-line-draw", "mood report line");
  await expect(page.locator('[data-record-detail="mood"] .module-ai-report li')).toHaveCount(4);
  await expect(page.locator('[data-record-detail="mood"] .module-ai-mascot')).toBeVisible();
  await page.waitForTimeout(2_250);
  await page.screenshot({ path: path.join(outputDir, "record-mood-trend.png") });
  await returnFromSubview();
  await expect(page.locator('[data-module-view="mood-overview"]')).toBeVisible();
  await page.waitForTimeout(2_250);
  await assertStaticLayout(page, "record-mood-saved");
  await page.screenshot({ path: path.join(outputDir, "record-mood.png") });
  await returnToHub();

  await openModule("sleep");
  await expect(page.locator('[data-module-view="sleep-overview"]')).toBeVisible();
  await assertAnimation(page.locator('[data-module-view="sleep-overview"] .sleep-stage-shape i'), "sleep-stage-rise", "sleep-stage bars");
  const alertCopy = page.locator(".sleep-alert-copy");
  if (await alertCopy.isVisible().catch(() => false)) {
    await alertCopy.click();
    await expect(page.locator(".lock-screen-preview")).toBeVisible();
    await page.waitForTimeout(500);
    await assertStaticLayout(page, "record-sleep-alert");
    await page.screenshot({ path: path.join(outputDir, "record-sleep-alert.png") });
    await page.locator(".sleep-alert-modal header button").click();
  }
  await page.locator('[aria-label="查看睡眠趋势报告"], [aria-label="View sleep trend report"]').click();
  await expect(page.locator('[data-record-detail="sleep"] .report-history-trend-chart')).toBeVisible();
  await assertAnimation(page.locator('[data-record-detail="sleep"] .diet-history-line'), "trend-line-draw", "sleep report line");
  await expect(page.locator('[data-record-detail="sleep"] .module-ai-report li')).toHaveCount(4);
  await expect(page.locator('[data-record-detail="sleep"] .module-ai-mascot')).toBeVisible();
  await page.waitForTimeout(2_150);
  await page.screenshot({ path: path.join(outputDir, "record-sleep-trend.png") });
  await returnFromSubview();
  await page.locator('[aria-label="更新睡眠记录"], [aria-label="Update sleep record"]').click();
  await expect(page.locator('[data-record-detail="sleep"] form:not([hidden])')).toBeVisible();
  await page.waitForTimeout(450);
  await assertNoBottomNavClipping(page, "sleep-editor", '[data-record-detail="sleep"] form:not([hidden]) .field, [data-record-detail="sleep"] form:not([hidden]) .action-button');
  await page.screenshot({ path: path.join(outputDir, "record-sleep-editor.png") });
  await page.locator('[data-record-detail="sleep"] form:not([hidden]) .action-button').click();
  await expect(page.locator('[data-record-detail="sleep"]')).toHaveAttribute("data-record-status", "success");
  await expect(page.locator('[data-module-view="sleep-overview"]')).toBeVisible();
  await page.waitForTimeout(650);
  await assertStaticLayout(page, "record-sleep-saved");
  await page.screenshot({ path: path.join(outputDir, "record-sleep.png") });
  await returnToHub();

  await openModule("exercise");
  await expect(page.locator('[data-module-view="exercise-overview"]')).toBeVisible();
  await expect(page.locator('[data-module-view="exercise-overview"] > .module-assistant-card')).toHaveCount(0);
  await assertAnimation(page.locator('[data-module-view="exercise-overview"] .exercise-trend-card .bar-line-bars i').first(), "chart-bar-rise", "exercise trend bars");
  await page.locator('.exercise-health-card header .module-card-nav-button').click();
  await expect(page.locator(".device-picker")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "record-exercise-devices.png") });
  await returnFromSubview();
  await page.locator(".exercise-health-links button").nth(0).click();
  await expect(page.locator(".metric-detail-grid")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "record-exercise-vitals.png") });
  await returnFromSubview();
  await page.locator(".exercise-health-links button").nth(1).click();
  await expect(page.locator(".detail-heatmap")).toBeVisible();
  await assertAnimation(page.locator(".detail-heatmap i"), "heat-cell-in", "exercise heatmap cells");
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(outputDir, "record-exercise-heatmap.png") });
  await returnFromSubview();
  await page.locator(".exercise-health-links button").nth(2).click();
  await expect(page.locator(".clock-alignment")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "record-exercise-clock.png") });
  await returnFromSubview();
  await page.locator('.exercise-trend-card .module-card-nav-button').click();
  await expect(page.locator('[data-record-detail="exercise"] .report-history-trend-chart')).toBeVisible();
  await expect(page.locator('[data-record-detail="exercise"] .module-ai-report li')).toHaveCount(4);
  await expect(page.locator('[data-record-detail="exercise"] .module-ai-mascot')).toBeVisible();
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(outputDir, "record-exercise-trend.png") });
  await returnFromSubview();
  await page.locator('[aria-label="记录今日运动"], [aria-label="Log today activity"]').click();
  await expect(page.locator('[data-record-detail="exercise"] form:not([hidden])')).toBeVisible();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outputDir, "record-exercise-editor.png") });
  await assertNoBottomNavClipping(page, "exercise-editor", '[data-record-detail="exercise"] form:not([hidden]) .field, [data-record-detail="exercise"] form:not([hidden]) .action-button');
  await page.locator('[data-record-detail="exercise"] form:not([hidden]) .action-button').click();
  await expect(page.locator('[data-record-detail="exercise"]')).toHaveAttribute("data-record-status", "success");
  await expect(page.locator('[data-module-view="exercise-overview"]')).toBeVisible();
  await page.waitForTimeout(650);
  await assertStaticLayout(page, "record-exercise-saved");
  await page.screenshot({ path: path.join(outputDir, "record-exercise.png") });
  await returnToHub();

  await openModule("diet");
  await expect(page.locator('[data-module-view="diet-overview"]')).toBeVisible();
  await expect(page.locator(".diet-nutrition-summary > span")).toHaveCount(4);
  await expect(page.locator(".diet-nutrition-summary small")).toHaveText(reviewLocale === "zh" ? ["蛋白质", "碳水化合物", "脂肪", "饮水量"] : ["Protein", "Carbohydrates", "Fat", "Water"]);
  await expect(page.locator(".diet-completion, .diet-macro-summary")).toHaveCount(0);
  await expect(page.locator(".diet-summary-card header small")).toHaveCount(0);
  await expect(page.locator(".diet-dashboard > .module-assistant-card")).toHaveCount(0);
  const dietHeadingStyles = await page.locator(".diet-summary-card header > strong, .diet-meals-card header > strong, .diet-trend-card header > strong").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight };
  }));
  if (new Set(dietHeadingStyles.map((style) => JSON.stringify(style))).size !== 1) throw new Error(`Diet card headings do not match: ${JSON.stringify(dietHeadingStyles)}`);
  const dietTrendGeometry = await page.locator(".diet-trend-card .line-trend-chart svg").evaluate((svg) => ({
    dateY: [...svg.querySelectorAll(".trend-date")].map((node) => Number(node.getAttribute("y"))),
    pointY: [...svg.querySelectorAll(".trend-point circle")].map((node) => Number(node.getAttribute("cy"))),
  }));
  if (dietTrendGeometry.dateY.length === 0 || Math.min(...dietTrendGeometry.dateY) < 300) {
    throw new Error(`Diet trend dates are not positioned near the chart bottom: ${dietTrendGeometry.dateY.join(", ")}`);
  }
  if (dietTrendGeometry.pointY.length > 1 && Math.max(...dietTrendGeometry.pointY) - Math.min(...dietTrendGeometry.pointY) < 80) {
    throw new Error(`Diet trend does not use enough vertical range: ${dietTrendGeometry.pointY.join(", ")}`);
  }
  await page.locator("input[data-diet-quick-camera]").setInputFiles(samplePhoto);
  await expect(page.locator('[data-record-detail="diet"] form:not([hidden])')).toBeVisible();
  const dietForm = page.locator('[data-record-detail="diet"] form:not([hidden])');
  await expect(page.locator('[data-record-detail="diet"] .record-upload-toast')).toBeVisible();
  await expect(dietForm.locator(".diet-photo-action")).toHaveCount(2);
  await expect(dietForm.locator('input[type="file"][capture="environment"]')).toHaveCount(1);
  await expect(dietForm.locator('input[type="file"]:not([capture])')).toHaveCount(1);
  await expect(dietForm.locator(".nutrition-unit-input b")).toHaveText(["kcal", "g", "g", "g", "ml"]);
  const unitOffsets = await dietForm.locator(".nutrition-unit-input").evaluateAll((nodes) => nodes.map((node) => {
    const unit = node.querySelector("b");
    if (!unit) return Number.POSITIVE_INFINITY;
    return Math.abs((node.getBoundingClientRect().right - unit.getBoundingClientRect().right) - 14);
  }));
  if (unitOffsets.some((offset) => offset > 1.5)) throw new Error(`Diet units are not right aligned: ${unitOffsets.join(", ")}`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outputDir, "record-diet-editor.png") });
  await assertNoBottomNavClipping(page, "diet-editor", '[data-record-detail="diet"] form:not([hidden]) .field, [data-record-detail="diet"] form:not([hidden]) .action-button');
  await expect(dietForm.locator(".detected-list")).toHaveCount(0);
  await expect(dietForm.getByLabel(/食物|Food/)).not.toHaveValue("");
  await expect(dietForm.getByLabel(/热量|Calorie/)).not.toHaveValue("0");
  await page.locator('[data-record-detail="diet"] form:not([hidden]) .action-button').click();
  await expect(page.locator('[data-module-view="diet-overview"]')).toBeVisible();
  await page.locator('.diet-trend-card .module-card-nav-button').click();
  await expect(page.locator('[data-record-detail="diet"] .diet-history-trend-chart')).toBeVisible();
  await assertAnimation(page.locator('[data-record-detail="diet"] .diet-history-bar rect'), "chart-bar-rise", "diet history bars");
  await assertAnimation(page.locator('[data-record-detail="diet"] .diet-history-line'), "trend-line-draw", "diet history line");
  await expect(page.locator('[data-record-detail="diet"] .diet-ai-report li')).toHaveCount(4);
  await expect(page.locator('[data-record-detail="diet"] .diet-ai-mascot')).toBeVisible();
  const dietHistoryGeometry = await page.locator('[data-record-detail="diet"] .diet-history-trend-chart svg').evaluate((svg) => ({
    dateY: [...svg.querySelectorAll(".diet-history-date")].map((node) => Number(node.getAttribute("y"))),
    pointY: [...svg.querySelectorAll(".diet-history-dot")].map((node) => Number(node.getAttribute("cy"))),
  }));
  if (Math.min(...dietHistoryGeometry.dateY) < 425) throw new Error(`Diet history dates are not low enough: ${dietHistoryGeometry.dateY.join(", ")}`);
  if (Math.max(...dietHistoryGeometry.pointY) - Math.min(...dietHistoryGeometry.pointY) < 110) throw new Error(`Diet history chart does not use enough vertical depth: ${dietHistoryGeometry.pointY.join(", ")}`);
  await page.waitForTimeout(2_150);
  await assertNoBottomNavClipping(page, "diet-history", '[data-record-detail="diet"] .module-history-list p, [data-record-detail="diet"] .module-history-share');
  const reportFooterGap = await page.locator('[data-record-detail="diet"] .module-history-report-card').evaluate((card) => {
    const share = card.querySelector(".module-history-share");
    if (!share) return Number.POSITIVE_INFINITY;
    return Math.round(card.getBoundingClientRect().bottom - share.getBoundingClientRect().bottom);
  });
  if (reportFooterGap > 30) throw new Error(`Diet history share action is not anchored to the report bottom: ${reportFooterGap}px`);
  await page.screenshot({ path: path.join(outputDir, "record-diet-trend.png") });
  await returnFromSubview();
  // Let the staged chart animation reach its settled geometry before the
  // screenshot is used for visual-regression review.
  await page.waitForTimeout(1_250);
  await assertStaticLayout(page, "record-diet-saved");
  await page.screenshot({ path: path.join(outputDir, "record-diet.png") });
  await returnToHub();

  await openModule("focus");
  await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible();
  await assertAnimation(page.locator('[data-module-view="focus-overview"] .focus-pie'), "ring-progress-fill", "focus goal ring");
  const focusDuration = page.locator('.focus-quick-card input[aria-label="专注分钟数"], .focus-quick-card input[aria-label="Focus duration in minutes"]');
  await focusDuration.fill("37");
  await page.locator('[aria-label="开始专注"], [aria-label="Start focus"]').click();
  await expect(page.locator('[data-module-view="focus-immersive"]')).toBeVisible();
  await assertAnimation(page.locator('[data-module-view="focus-immersive"] .focus-timer-ring'), "timer-progress-fill", "focus timer ring");
  await expect(page.locator('.focus-timer-ring input[aria-label="分钟"], .focus-timer-ring input[aria-label="Minutes"]')).toHaveValue("37");
  await expect(page.locator('.focus-timer-ring input[aria-label="秒钟"], .focus-timer-ring input[aria-label="Seconds"]')).toHaveValue("00");
  await expect(page.locator(".focus-timer-status")).toContainText(/轻触数字可修改|Tap the time to edit/);
  await expect(page.locator(".focus-presets")).toHaveCount(0);
  await expect(page.getByText(/一次只做一件事|One thing at a time/)).toHaveCount(0);
  await expect(page.getByLabel(/专注事项|Focus activity/)).toHaveAttribute("placeholder", /请填写今日要完成的任务|Enter today's task/);
  const focusSeconds = page.locator('.focus-timer-ring input[aria-label="秒钟"], .focus-timer-ring input[aria-label="Seconds"]');
  await focusSeconds.fill("30");
  await expect(focusSeconds).toHaveValue("30");
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.join(outputDir, "record-focus-immersive.png") });
  await page.locator(".focus-interruption-trigger").click();
  await expect(page.locator(".focus-interruption")).toBeVisible();
  await page.waitForTimeout(350);
  await assertStaticLayout(page, "record-focus-interruption");
  await page.screenshot({ path: path.join(outputDir, "record-focus-interruption.png") });
  await page.locator(".focus-interruption button").nth(1).click();
  await page.locator('[data-module-view="focus-immersive"] [aria-label="开始"], [data-module-view="focus-immersive"] [aria-label="Start"]').click();
  await page.waitForTimeout(1100);
  await page.locator('[data-module-view="focus-immersive"] [aria-label="结束"], [data-module-view="focus-immersive"] [aria-label="Finish"]').click();
  await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible();
  await expect(page.locator('[aria-label="专注已记录"], [aria-label="Focus saved"]')).toBeVisible();
  await page.waitForTimeout(650);
  await assertStaticLayout(page, "record-focus-saved");
  await page.screenshot({ path: path.join(outputDir, "record-focus.png") });
  await returnToHub();

  await page.locator('[data-record-module="face"]').click();
  await expect(page.locator('[data-module-view="face-overview"]')).toBeVisible();
  await assertAnimation(page.locator('[data-module-view="face-overview"] .face-score-ring'), "face-score-fill", "face score ring");
  await page.locator('.face-trend-card .module-card-nav-button').click();
  await expect(page.locator('[data-record-detail="face"] .report-history-trend-chart')).toBeVisible();
  await expect(page.locator('[data-record-detail="face"] .module-ai-report li')).toHaveCount(4);
  await expect(page.locator('[data-record-detail="face"] .module-ai-mascot')).toBeVisible();
  await page.waitForTimeout(1_050);
  await page.screenshot({ path: path.join(outputDir, "record-face-trend.png") });
  await assertNoBottomNavClipping(page, "face-history", '[data-record-detail="face"] .module-history-list p, [data-record-detail="face"] .module-history-share');
  await returnFromSubview();
  await page.locator('[aria-label="使用前置摄像头拍照"], [aria-label="Take a front-camera photo"]').click();
  await expect(page.locator('[data-record-detail="face"] .face-consent')).toBeVisible();
  await page.waitForTimeout(450);
  await assertNoBottomNavClipping(page, "face-editor", '[data-record-detail="face"] .field, [data-record-detail="face"] .action-button, [data-record-detail="face"] .photo-picker.face');
  await page.screenshot({ path: path.join(outputDir, "record-face-editor.png") });
  await page.locator('[data-record-detail="face"] .face-consent input').check();
  await page.locator('[data-record-detail="face"] input[type="file"][capture="user"]').setInputFiles(samplePhoto);
  await expect(page.locator('[data-record-detail="face"] .record-upload-toast')).toBeVisible();
  await page.waitForTimeout(900);
  await assertStaticLayout(page, "record-face-saved");
  await assertNoBottomNavClipping(page, "face-result", '[data-record-detail="face"] .face-result .detected-list div, [data-record-detail="face"] .face-result-meta span');
  await page.screenshot({ path: path.join(outputDir, "record-face.png") });
  await returnFromSubview();
  await returnToHub();
  results.push("六类记录入口、四类 Figma 概览/二级页、保存、计时与拍照分析");
}

async function verifyHomeShortcuts(page, results) {
  await page.locator('[data-tab="today"]').click();
  const homeScores = page.locator(".option-two-scores");
  await expect(homeScores).toContainText(reviewLocale === "zh" ? "我的积分" : "My points");
  await expect(homeScores).not.toContainText(reviewLocale === "zh" ? "数据完整度" : "Data complete");

  const mascot = page.locator(".nava-mascot");
  await expect(mascot).toHaveAttribute("data-next-motion", "wave");
  await mascot.click();
  await expect(mascot).toHaveAttribute("data-mascot-motion", "wave");
  await expect(mascot).toHaveAttribute("data-animation-fps", "24");
  const waveMotion = await page.locator(".nava-mascot-animation--wave").evaluate((node) => {
    const style = getComputedStyle(node);
    return { backgroundImage: style.backgroundImage, backgroundPosition: style.backgroundPosition, transform: style.transform };
  });
  if (!waveMotion.backgroundImage.includes("nava-wave-sprite") || waveMotion.transform === "none") {
    throw new Error(`home mascot wave motion is invalid: ${JSON.stringify(waveMotion)}`);
  }
  await page.waitForTimeout(420);
  const waveDisplayFrame = Number(await mascot.getAttribute("data-display-frame"));
  if (waveDisplayFrame < 7 || waveDisplayFrame > 14) throw new Error(`home mascot is not advancing near 24 fps: ${waveDisplayFrame}`);
  const advancedWavePosition = await page.locator(".nava-mascot-animation--wave").evaluate((node) => getComputedStyle(node).backgroundPosition);
  if (advancedWavePosition === waveMotion.backgroundPosition) throw new Error("home mascot sprite did not advance to a new hand-drawn frame");
  await page.screenshot({ path: path.join(outputDir, "today-mascot-wave.png") });
  await page.waitForTimeout(3_650);
  await expect(mascot).toHaveAttribute("data-mascot-motion", "idle");
  await expect(mascot).toHaveAttribute("data-next-motion", "tail");
  await mascot.click();
  await expect(mascot).toHaveAttribute("data-mascot-motion", "tail");
  const tailMotion = await page.locator(".nava-mascot-animation--tail").evaluate((node) => {
    const style = getComputedStyle(node);
    return { backgroundImage: style.backgroundImage, backgroundPosition: style.backgroundPosition };
  });
  if (!tailMotion.backgroundImage.includes("nava-tail-sprite")) {
    throw new Error(`home mascot tail motion is invalid: ${JSON.stringify(tailMotion)}`);
  }

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
  await page.locator('[data-tab="today"]').click();
  await page.locator(".option-two-side-actions button").nth(1).click();
  await expect(page.locator("[data-record-module]")).toHaveCount(6);
  await page.locator('[data-tab="today"]').click();
  await page.locator(".option-two-side-actions button").nth(2).click();
  await expect(page.locator(".chat-layout")).toBeVisible();
  await page.locator('[data-tab="today"]').click();
  await page.locator(".option-two-side-actions button").nth(3).click();
  await expect(page.locator('.utility-drawer[role="dialog"]')).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, "today-utilities.png") });
  const todoDraft = page.locator('.utility-drawer input[placeholder*="添加"], .utility-drawer input[placeholder*="Add"]');
  await todoDraft.fill(reviewLocale === "zh" ? "晚饭后散步 20 分钟" : "Walk for 20 minutes after dinner");
  await page.locator('.drawer-todo-section form button[type="submit"]').click();
  const newTodo = page.locator(".drawer-todo-list button").first();
  await expect(newTodo).toBeVisible();
  await newTodo.click();
  await expect(newTodo.locator("svg")).toBeVisible();
  await assertStaticLayout(page, "today-utilities-with-todo");
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(outputDir, "today-utilities-with-todo.png") });
  await page.locator('.utility-drawer[role="dialog"] header button').click();
  await expect(page.locator('.utility-drawer[role="dialog"]')).toBeHidden();
  results.push("首页真实积分、顺序小猫动作、展开菜单、六个健康快捷入口与三类侧边跳转");
}

async function verifyAi(page, results, diagnostics) {
  await page.locator('[data-tab="ai"]').click();
  await expect(page.locator(".chat-message-row")).toHaveCount(3);
  await page.locator(".chat-input-shell input").fill("我今天吃什么好？请直接推荐一份午餐。");
  await page.locator(".chat-send-button").click();
  await expect(page.locator("[data-ai-streaming=true]")).toBeVisible();
  await assertStaticLayout(page, "ai-processing");
  await page.screenshot({ path: path.join(outputDir, "ai-processing.png") });
  await page.waitForFunction(() => {
    const replyReady = document.querySelectorAll(".chat-message-row").length === 5
      && !document.querySelector("[data-ai-streaming=true]");
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
  const replyLength = reviewLocale === "en" ? realReply.split(/\s+/).filter(Boolean).length : Array.from(realReply).length;
  const replyLimit = reviewLocale === "en" ? 100 : 180;
  const replyUnit = reviewLocale === "en" ? "words" : "characters";
  if (replyLength > replyLimit) throw new Error(`AI reply exceeded ${replyLimit} ${replyUnit}: ${realReply}`);
  if (/(?:…|\.{3,})\s*$/.test(realReply)) throw new Error(`AI reply ended with a display-layer ellipsis: ${realReply}`);
  const completeReply = reviewLocale === "en" ? /[.!?]["')\]\s]*$/.test(realReply) : /[。！？]\s*$/.test(realReply);
  if (!completeReply) throw new Error(`AI reply did not end on a complete sentence: ${realReply}`);
  if (!/午餐|主食|蛋白|蔬菜|鸡|鱼|蛋|豆|饭|面|餐|meal|lunch|calorie|protein|vegetable|chicken|fish|egg|tofu|rice|noodle/i.test(realReply)) {
    throw new Error(`AI reply did not directly answer the meal question: ${realReply}`);
  }
  if (/Edge Function|数据库|JSON|系统提示词|模型名称|database|system prompt|model name/i.test(realReply)) {
    throw new Error(`AI reply exposed implementation details: ${realReply}`);
  }
  const headerMenuButton = page.locator(".figma-header-action").last();
  await headerMenuButton.click();
  await page.locator(".app-utility-popover button").filter({ hasText: /新会话|New chat/ }).click();
  await expect(page.locator(".chat-message-row")).toHaveCount(0);
  await page.locator(".figma-header-action").last().click();
  await page.locator(".app-utility-popover button").filter({ hasText: /历史|History/ }).click();
  await expect(page.locator(".ai-history-sheet")).toBeVisible();
  await assertAnimation(page.locator(".ai-history-sheet"), "sheet-rise", "AI history sheet");
  const historyBackdrop = await page.locator(".chat-layout").evaluate((node) => ({
    content: getComputedStyle(node, "::before").content,
    background: getComputedStyle(node, "::before").backgroundColor,
  }));
  if (historyBackdrop.content === "none" || historyBackdrop.background === "rgba(0, 0, 0, 0)") {
    throw new Error(`AI history sheet backdrop is missing: ${JSON.stringify(historyBackdrop)}`);
  }
  await page.waitForTimeout(350);
  await assertStaticLayout(page, "ai-history");
  await page.screenshot({ path: path.join(outputDir, "ai-history.png") });
  await page.locator(".ai-history-sheet > div > button").first().click();
  await expect(page.locator(".chat-message-row")).toHaveCount(5);
  await page.waitForTimeout(100);
  await assertStaticLayout(page, "ai-reply");
  await page.screenshot({ path: path.join(outputDir, "ai-reply.png") });

  await headerMenuButton.click();
  const utilityPopover = page.locator(".app-utility-popover");
  await expect(utilityPopover).toBeVisible();
  const speechToggle = utilityPopover.locator("button").filter({ hasText: /朗读|voice/i });
  if (await speechToggle.isEnabled()) {
    await speechToggle.click();
    await expect(utilityPopover).toBeVisible();
    await speechToggle.click();
    await expect(utilityPopover).toBeVisible();
  }
  const languageToggle = utilityPopover.locator(".language-toggle");
  await languageToggle.click();
  await expect(utilityPopover).toBeVisible();
  await languageToggle.click();
  await expect(utilityPopover).toBeVisible();
  await page.locator(".chat-input-shell input").click();
  await expect(utilityPopover).toBeHidden();
  await headerMenuButton.click();
  await expect(utilityPopover).toBeVisible();
  await headerMenuButton.click();
  await expect(utilityPopover).toBeHidden();

  const composerMic = page.locator(".chat-voice-button");
  const composerMicBox = await composerMic.boundingBox();
  if (!composerMicBox) throw new Error("Chat microphone has no visible bounds");
  const composerPointer = { x: composerMicBox.x + composerMicBox.width / 2, y: composerMicBox.y + composerMicBox.height / 2 };
  await page.mouse.move(composerPointer.x, composerPointer.y);
  await page.mouse.down();
  await page.waitForTimeout(380);
  await expect(page.locator(".chat-camera-shortcut")).toBeVisible();
  await page.mouse.move(composerPointer.x, composerPointer.y - 72, { steps: 4 });
  await expect(page.locator(".chat-camera-shortcut.selected")).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 1500 }).catch(() => null);
  await page.mouse.up();
  const fileChooser = await fileChooserPromise;
  await expect(page.locator(".chat-camera-shortcut")).toBeHidden();
  if (fileChooser) {
    await fileChooser.setFiles(samplePhoto);
  } else {
    // Chromium may route capture="environment" through its camera surface
    // without exposing a desktop file chooser. Inject the captured file into
    // the same input so the remainder of the recognition flow is still tested.
    await page.locator(".chat-camera-input").setInputFiles(samplePhoto);
  }
  await expect(page.locator('[data-chat-photo="analyzing"], [data-chat-photo="saved"]')).toBeVisible();
  await expect(page.locator('[data-structured-confirmation="nutrition"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-chat-photo="saved"]')).toBeVisible();
  await expect(page.locator('[data-structured-record="nutrition"]')).toContainText(/鸡胸肉|Chicken|蓝莓|yogurt/i);
  await page.locator('[data-confirm-structured]').click();
  await expect(page.locator('[data-structured-confirmation="nutrition"]')).toBeHidden();

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
  await assertStaticLayout(page, "voice-recording");
  await page.screenshot({ path: path.join(outputDir, "voice-recording.png") });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect(page.locator(".chat-composer.voice-active")).toBeHidden();
  await expect(page.locator(".chat-input-shell input")).toHaveValue("今天感觉很平稳");
  const inputBeforeCancelledVoice = await page.locator(".chat-input-shell input").inputValue();

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
  await expect(page.locator(".chat-input-shell input")).toHaveValue(inputBeforeCancelledVoice);
  results.push("AI 对话、完整短答与模型侧字数契约、菜单交互、长按麦克风上滑拍照、视觉餐食确认保存、按住录音与上滑取消");
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

  const nextProfileSection = page.locator(".profile-next-section-button");
  if (await nextProfileSection.isVisible().catch(() => false)) {
    await nextProfileSection.click();
    await expect(page.locator(".profile-device-card").first()).toBeInViewport();
  }

  await page.locator(".avatar-button").click();
  await expect(page.locator(".avatar-sheet")).toBeVisible();
  await page.waitForTimeout(420);
  await assertStaticLayout(page, "profile-avatar-sheet");
  await page.screenshot({ path: path.join(outputDir, "profile-avatar-sheet.png") });
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
  await assertStaticLayout(page, "profile-devices");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".profile-stack > .section-card").last().locator(".section-icon-action").click();
  const download = await downloadPromise;
  await download.cancel();

  const deleteButton = page.getByRole("button", { name: /删除账号与全部数据|Delete account and all data/ });
  await deleteButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await assertStaticLayout(page, "profile-bottom");
  await page.screenshot({ path: path.join(outputDir, "profile-bottom.png") });
  await deleteButton.click();
  await expect(page.locator(".account-delete-sheet")).toBeVisible();
  await page.waitForTimeout(420);
  await assertStaticLayout(page, "profile-delete-sheet");
  await page.screenshot({ path: path.join(outputDir, "profile-delete-sheet.png") });
  await page.locator(".account-delete-sheet header button").click();
  await expect(page.locator(".account-delete-sheet")).toBeHidden();

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
      await assertAnimation(page.locator(".growth-progress-track span"), "growth-progress-in", "growth progress bar");
      await expect(page.locator("[data-growth-task]")).toHaveCount(11);
      await expect(page.locator(".growth-task-group")).toHaveCount(2);
      await expect(page.locator(".growth-task-group").first().locator("[data-growth-task]")).toHaveCount(2);
      await expect(page.locator(".growth-task-group").last().locator("[data-growth-task]")).toHaveCount(9);
    }
    const animationName = await page.locator(`[data-tab="${tab}"]`).evaluate((button) => {
      const glyph = button.querySelector("svg, .figma-nav-icon");
      return glyph ? getComputedStyle(glyph).animationName : getComputedStyle(button.querySelector(".ai-nav-orb")).animationName;
    });
    if (tab !== "ai" && animationName !== "nav-icon-construct") throw new Error(`${tab} icon motion did not replay: ${animationName}`);
    await page.waitForTimeout(900);
    await assertStaticLayout(page, `tab-${tab}`);
    if (tab === "trends") await assertWholeGrowthTaskCards(page, "tab-trends");
    await page.screenshot({ path: path.join(outputDir, `tab-${tab}.png`) });
    if (tab === "trends") {
      const growthScroller = page.locator(".app-content--trends");
      await growthScroller.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
      await expect(page.locator("[data-growth-task]").last()).toBeVisible();
      await page.waitForTimeout(180);
      await assertWholeGrowthTaskCards(page, "tab-trends-lower");
      await assertStaticLayout(page, "tab-trends-lower");
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(outputDir, "tab-trends-lower.png") });
      await growthScroller.evaluate((node) => node.scrollTo({ top: 0 }));
    }
  }

  const growthTargetRoutes = [
    ["profile-foundation", "profile", null, null],
    ["profile-goal", "profile", null, null],
    ["daily-checkin", "today", null, null],
    ["share-card", "record", "diet", "history"],
    ["ai-conversation", "ai", null, null],
    ["sleep-window", "record", "sleep", null],
    ["move-break", "record", "exercise", null],
    ["mood-checkin", "record", "mood", null],
    ["nutrition-log", "record", "diet", null],
    ["focus-block", "record", "focus", null],
    ["face-check", "record", "face", null],
  ];
  await page.locator('[data-tab="trends"]').click();
  for (const [taskId, targetTab, targetModule, targetView] of growthTargetRoutes) {
    const task = page.locator(`[data-growth-task="${taskId}"]`);
    await expect(task).toHaveJSProperty("tagName", "BUTTON");
    const completed = await task.getAttribute("data-completed") === "true";
    if (completed) {
      await expect(task).toBeDisabled();
      await expect(task.locator(".growth-task-meta svg")).toHaveCount(0);
      continue;
    }
    await expect(task.locator(".growth-task-meta svg")).toBeVisible();
    await task.scrollIntoViewIfNeeded();
    await task.click();
    await expect(page.locator(`[data-tab="${targetTab}"]`)).toHaveAttribute("aria-current", "page");
    if (targetModule) {
      await expect(page.locator(`[data-record-detail="${targetModule}"]`)).toBeVisible();
      if (targetView === "history") await expect(page.locator(".module-history-report-card")).toBeVisible();
    } else if (targetTab === "profile") await expect(page.locator(".profile-stack")).toBeVisible();
    else if (targetTab === "ai") await expect(page.locator(".chat-layout")).toBeVisible();
    else if (targetTab === "today") await expect(page.locator(".option-two-home")).toBeVisible();
    await page.goBack();
    await expect(page.locator("[data-growth-screen]")).toBeVisible();
    await expect(page.locator('[data-tab="trends"]')).toHaveAttribute("aria-current", "page");
  }

  await page.locator('[data-tab="record"]').click();
  await page.getByRole("tab", { name: /本周报告|Weekly/ }).click();
  await expect(page.locator("[data-weekly-health-report]")).toBeVisible();
  await assertAnimation(page.locator(".weekly-trend-card .trend-line"), "trend-line-draw", "weekly rhythm line");
  await page.waitForTimeout(1_050);
  await assertStaticLayout(page, "record-weekly");
  const weeklyOverflow = await page.locator(".weekly-insight-card").evaluate((card) => {
    const cardRect = card.getBoundingClientRect();
    return [...card.children]
      .map((node) => ({ className: node.className, tagName: node.tagName.toLowerCase(), top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, cardTop: cardRect.top, cardBottom: cardRect.bottom }))
      .filter(({ bottom }) => bottom > cardRect.bottom + 1);
  });
  if (weeklyOverflow.length > 0) throw new Error(`Weekly insight content overflowed its card: ${JSON.stringify(weeklyOverflow)}`);
  await page.screenshot({ path: path.join(outputDir, "record-weekly.png") });
  for (const [index, module] of ["mood", "sleep", "exercise", "diet", "focus", "face"].entries()) {
    await page.locator(".weekly-module-status button").nth(index).click();
    await expect(page.locator(`[data-record-detail="${module}"] [data-module-view="${module}-overview"]`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`tab=record.*module=${module}`));
    await page.goBack();
    await expect(page.locator("[data-weekly-health-report]")).toBeVisible();
  }
  await page.getByRole("tab", { name: /分项报告|Modules/ }).click();
  const recordButton = page.locator('[data-tab="record"]');
  const recordBox = await recordButton.boundingBox();
  if (!recordBox) throw new Error("Record navigation button has no bounds");
  await page.mouse.move(recordBox.x + recordBox.width / 2, recordBox.y + recordBox.height / 2);
  await page.mouse.down();
  await expect.poll(() => recordButton.locator("svg, .figma-nav-icon").evaluate((glyph) => getComputedStyle(glyph).animationName)).toBe("semantic-icon-press");
  await page.mouse.up();
  await page.locator(".figma-header-action").last().click();
  const utilityPopover = page.locator(".app-utility-popover");
  await expect(utilityPopover).toBeVisible();
  await expect(utilityPopover.locator(".network-badge")).toHaveCount(0);
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(outputDir, "header-utility-menu.png") });
  const utilityAlignment = await utilityPopover.evaluate((popover) => {
    const regularIcon = popover.querySelector("button:not(.language-toggle) svg");
    const languageIcon = popover.querySelector(".language-toggle svg");
    if (!regularIcon || !languageIcon) throw new Error("Utility menu icons are missing.");
    const regularRect = regularIcon.getBoundingClientRect();
    const languageRect = languageIcon.getBoundingClientRect();
    return {
      leftOffset: Math.abs(regularRect.left - languageRect.left),
      widthOffset: Math.abs(regularRect.width - languageRect.width),
      heightOffset: Math.abs(regularRect.height - languageRect.height),
    };
  });
  if (utilityAlignment.leftOffset > 0.6 || utilityAlignment.widthOffset > 0.6 || utilityAlignment.heightOffset > 0.6) {
    throw new Error(`Utility menu icons are not aligned: ${JSON.stringify(utilityAlignment)}`);
  }
  const utilityBackground = await utilityPopover.evaluate((popover) => getComputedStyle(popover).backgroundColor);
  const utilityAlpha = Number(utilityBackground.match(/[\d.]+/g)?.[3] ?? 1);
  if (utilityAlpha < 0.96) throw new Error(`Utility menu background is too transparent: ${utilityBackground}`);
  await page.locator(".figma-header-action").last().click();
  await expect(utilityPopover).toBeHidden();
  results.push("五项底部导航、十一个成长任务入口、六个周报模块入口、浏览器返回、趋势折线、图标动效与页头工具菜单");
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
    if (!skipAuthAudit) {
      await verifyAuthControls(browser, baseUrl, results, consoleErrors);
      await verifyOtpLogin(browser, baseUrl, results, consoleErrors);
      await verifyRegistration(browser, baseUrl, results, consoleErrors);
    }
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
