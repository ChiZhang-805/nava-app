import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", process.env.AUTH_REVIEW_DIR || "ui-review-2026-07-19-auth-final");
const baseUrl = "http://127.0.0.1:5173";

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
    await launchPage.waitForTimeout(6000);
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
    await authPage.locator(".language-toggle").tap();
    await authPage.waitForTimeout(400);
    await authPage.screenshot({ path: path.join(outputDir, "07b-register-en.png") });
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
