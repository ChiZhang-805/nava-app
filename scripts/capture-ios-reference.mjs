import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-ios-reference";
const viewport = { width: 430, height: 932 };
const port = 5264;

await mkdir(outputDir, { recursive: true });
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port, strictPort: true },
  logLevel: "silent",
});
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const report = {
  builtArtifact: path.join(root, "dist"),
  device: "iPhone 430x932 @3x",
  generatedAt: new Date().toISOString(),
  screenshots: {},
  viewport: { ...viewport, deviceScaleFactor: 3 },
};

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function releaseFixtureSession() {
  const now = Math.floor(Date.now() / 1000);
  const id = "00000000-0000-4000-8000-000000000001";
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "ios-reference@nava.invalid",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "NAVA iPhone reference" },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return {
    access_token: `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ aud: "authenticated", exp: now + 3600, role: "authenticated", sub: id })}.reference-signature`,
    refresh_token: "ios-reference-refresh-token",
    expires_at: now + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}

async function makeContext() {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  });
}

async function authGeometry(page) {
  return page.evaluate(() => {
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return Object.fromEntries(["bottom", "height", "left", "right", "top", "width"].map((key) => [key, Number(rect[key].toFixed(2))]));
    };
    return {
      brand: box(document.querySelector(".auth-brand")),
      form: box(document.querySelector(".auth-form")),
      wordmark: box(document.querySelector(".auth-brand .nava-wordmark__text")),
    };
  });
}

async function save(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  report.screenshots[name] = file;
}

try {
  const authContext = await makeContext();
  try {
    const page = await authContext.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await expect(page.locator(".auth-screen--signIn")).toBeVisible();
    await page.waitForTimeout(900);
    report.login = await authGeometry(page);
    await save(page, "iphone-login");

    await page.locator(".auth-mode-icon").click();
    await expect(page.locator(".auth-screen--signUp")).toBeVisible();
    await page.waitForTimeout(700);
    report.registration = await authGeometry(page);
    await save(page, "iphone-registration");

    await page.locator(".auth-return-inline").click();
    await page.locator(".auth-forgot").click();
    await expect(page.locator(".auth-screen--reset")).toBeVisible();
    await page.waitForTimeout(700);
    report.resetPassword = await authGeometry(page);
    await save(page, "iphone-reset-password");

    for (const [name, geometry] of Object.entries({ registration: report.registration, resetPassword: report.resetPassword })) {
      if (
        Math.abs(geometry.brand.top - report.login.brand.top) > 1
        || Math.abs(geometry.wordmark.top - report.login.wordmark.top) > 1
        || Math.abs(geometry.form.left - report.registration.form.left) > 1
        || Math.abs(geometry.form.top - report.registration.form.top) > 1
      ) {
        throw new Error(`Canonical auth geometry differs in ${name}: ${JSON.stringify({ login: report.login, registration: report.registration, resetPassword: report.resetPassword })}`);
      }
    }
  } finally {
    await authContext.close();
  }

  const homeContext = await makeContext();
  try {
    await homeContext.addInitScript((session) => {
      const userId = "00000000-0000-4000-8000-000000000001";
      sessionStorage.setItem("sb-wxteapvwagvhhtrjrbim-auth-token", JSON.stringify(session));
      localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, version: 3, answers: {}, source: "local" }));
    }, releaseFixtureSession());
    const page = await homeContext.newPage();
    await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.route("**/rest/v1/profiles**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-4000-8000-000000000001",
        onboarding_completed_at: new Date().toISOString(),
        onboarding_version: 3,
        onboarding_answers: {},
        health_data_consent: false,
        ai_personalization_consent: false,
      }),
    }));
    await page.route("**/functions/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    if (await page.locator(".auth-screen").isVisible().catch(() => false)) {
      await page.locator('input[autocomplete="username"]').fill("13800138000");
      await page.locator('input[autocomplete="current-password"]').fill("12345678");
      await page.locator(".auth-submit").click();
    }
    await expect(page.locator(".phone-frame")).toBeVisible({ timeout: 20_000 });
    const reward = page.locator(".reward-celebration-layer");
    if (await reward.isVisible().catch(() => false)) await reward.locator(".reward-celebration-card > button").click();
    await expect(page.locator(".home-widget-grid")).toBeVisible();
    await page.waitForTimeout(450);

    report.home = await page.evaluate(() => {
      const box = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return Object.fromEntries(["bottom", "height", "left", "right", "top", "width"].map((key) => [key, Number(rect[key].toFixed(2))]));
      };
      const scores = box(document.querySelector(".option-two-scores"));
      const menu = box(document.querySelector(".option-two-menu-toggle"));
      const grid = box(document.querySelector(".home-widget-grid"));
      const cards = [...document.querySelectorAll(".home-health-widget, .home-widget-skeleton")].map(box);
      return {
        cards,
        gapBelowHeader: Number((grid.top - Math.max(scores.bottom, menu.bottom)).toFixed(2)),
        grid,
        menu,
        menuCenterY: Number(((menu.top + menu.bottom) / 2).toFixed(2)),
        scoreCenterY: Number(((scores.top + scores.bottom) / 2).toFixed(2)),
        scores,
      };
    });
    if (Math.abs(report.home.scoreCenterY - report.home.menuCenterY) > 1) {
      throw new Error(`Home header centers differ: ${JSON.stringify(report.home)}`);
    }
    if (report.home.gapBelowHeader < 12 || report.home.gapBelowHeader > 24) {
      throw new Error(`Home header-to-grid gap is unbalanced: ${JSON.stringify(report.home)}`);
    }
    if (report.home.cards.length !== 6 || report.home.cards.some((card) => card.height / card.width < 0.92 || card.height / card.width > 1.08)) {
      throw new Error(`Home cards are not a balanced 3x2 grid: ${JSON.stringify(report.home.cards)}`);
    }
    await save(page, "iphone-home");

    await page.locator(".option-two-menu-toggle").click();
    await expect(page.locator(".option-two-side-actions")).toHaveClass(/is-open/);
    await page.waitForTimeout(420);
    report.homeShortcuts = await page.locator(".option-two-side-actions").evaluate((rail) => {
      const box = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return Object.fromEntries(["bottom", "height", "left", "right", "top", "width"].map((key) => [key, Number(rect[key].toFixed(2))]));
      };
      return {
        background: getComputedStyle(rail).backgroundColor,
        buttons: [...rail.querySelectorAll(".option-two-side-shortcut")].map((button) => ({
          after: getComputedStyle(button, "::after").content,
          box: box(button),
        })),
        rail: box(rail),
      };
    });
    if (
      report.homeShortcuts.background !== "rgba(0, 0, 0, 0)"
      || report.homeShortcuts.buttons.length < 5
      || report.homeShortcuts.buttons.some(({ after, box: button }) => after !== "none" || Math.abs(button.width - 44) > 1 || Math.abs(button.height - 44) > 1)
    ) {
      throw new Error(`Home shortcuts are not an icon-only rail: ${JSON.stringify(report.homeShortcuts)}`);
    }
    await save(page, "iphone-home-shortcuts");
  } finally {
    await homeContext.close();
  }

  await writeFile(path.join(outputDir, "geometry.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Canonical iPhone screenshots saved to ${outputDir}`);
} finally {
  await browser.close();
  await server.close();
}
