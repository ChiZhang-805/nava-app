import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.SCREENSHOT_DIR || path.join(root, "artifacts", "screenshots");
const port = Number(process.env.PORT || 5174);
const baseUrl = `http://127.0.0.1:${port}`;
const samplePhoto = {
  name: "sample.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  ),
};

async function main() {
  await mkdir(outputDir, { recursive: true });
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port },
    logLevel: "silent",
  });

  try {
    await server.listen();
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });

    const page = await context.newPage();
    const metrics = {};

    const shot = (filename) => page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
    const scrollContent = async (top) => {
      await page.evaluate((scrollTop) => {
        document.querySelector(".app-content")?.scrollTo({ top: scrollTop, left: 0 });
      }, top);
      await page.waitForTimeout(300);
    };

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await shot("01-auth.png");

    await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
    await shot("02-today.png");

    metrics.today = await page.evaluate(() => {
      const stripCells = [...document.querySelectorAll(".algorithm-strip > div")];
      const stripWidths = stripCells.map((cell) => Number(cell.getBoundingClientRect().width.toFixed(2)));
      const recommendation = document.querySelector(".recommendation");
      const recommendationRect = recommendation?.getBoundingClientRect();
      const range = document.createRange();
      if (recommendation) range.selectNodeContents(recommendation);
      const visibleLineWidths = recommendation
        ? [...range.getClientRects()]
            .filter((rect) => rect.height > 0 && recommendationRect && rect.top < recommendationRect.bottom - 0.5)
            .map((rect) => Number(rect.width.toFixed(2)))
        : [];
      const allRecommendationLineWidths = recommendation
        ? [...range.getClientRects()].filter((rect) => rect.height > 0).map((rect) => Number(rect.width.toFixed(2)))
        : [];
      const metricValues = [...document.querySelectorAll(".metric-card > strong")].map((value) => ({
        text: value.textContent?.trim() ?? "",
        height: Number(value.getBoundingClientRect().height.toFixed(2)),
        lineHeight: Number.parseFloat(getComputedStyle(value).lineHeight),
      }));
      return {
        stripWidths,
        stripText: document.querySelector(".algorithm-strip")?.textContent ?? "",
        recommendationLineWidths: visibleLineWidths,
        allRecommendationLineWidths,
        recommendationWidth: Number((recommendationRect?.width ?? 0).toFixed(2)),
        metricValues,
        todayDataItems: document.querySelectorAll(".today-data-item").length,
      };
    });

    if (Math.max(...metrics.today.stripWidths) - Math.min(...metrics.today.stripWidths) > 1) {
      throw new Error(`Today overview is not split equally: ${metrics.today.stripWidths.join(", ")}`);
    }
    if (/ChronoState|模型/.test(metrics.today.stripText)) throw new Error("Today overview still exposes the model name");
    if (metrics.today.metricValues.some((metric) => metric.text.includes("分钟") || metric.height > metric.lineHeight * 1.25)) {
      throw new Error(`A Today metric wrapped unexpectedly: ${JSON.stringify(metrics.today.metricValues)}`);
    }
    if (metrics.today.todayDataItems !== 4) throw new Error(`Expected 4 Today data states, found ${metrics.today.todayDataItems}`);
    const zhRecommendationRatio = metrics.today.recommendationLineWidths[1] / metrics.today.recommendationWidth;
    if (metrics.today.recommendationLineWidths.length !== 2 || metrics.today.allRecommendationLineWidths.length !== 2 || zhRecommendationRatio < 0.78 || zhRecommendationRatio > 0.93) {
      throw new Error(`Chinese recommendation does not form a balanced two-line block: ${JSON.stringify(metrics.today.recommendationLineWidths)}`);
    }

    await page.locator(".today-data-section").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot("02-today-data.png");
    await scrollContent(9999);
    const firstNavigationStart = await page.evaluate(() => document.querySelector(".app-content")?.scrollTop ?? 0);

    const tabs = [
      ["record", "03-record-top.png"],
      ["ai", "04-ai.png"],
      ["trends", "05-trends.png"],
      ["profile", "06-profile-top.png"],
    ];

    for (const [tab, filename] of tabs) {
      await page.locator(`[data-tab="${tab}"]`).tap();
      await page.waitForTimeout(500);
      const tabScrollTop = await page.evaluate(() => document.querySelector(".app-content")?.scrollTop ?? 0);
      metrics.navigation ??= [];
      metrics.navigation.push({ tab, scrollTop: tabScrollTop });
      if (tabScrollTop > 1) throw new Error(`${tab} opened at scrollTop ${tabScrollTop} instead of the top`);
      await shot(filename);
      if (tab === "record") {
        await scrollContent(720);
        await shot("03-record-sleep.png");
        await scrollContent(1420);
        await shot("03-record-exercise-diet.png");
        await page.locator('input[capture="environment"]').setInputFiles(samplePhoto);
        await page.waitForTimeout(500);
        await scrollContent(1760);
        await shot("03-record-diet-result.png");
        await scrollContent(2140);
        await shot("03-record-focus-face.png");
        await scrollContent(9999);
        await shot("03-record-bottom.png");
        await page.locator('input[capture="user"]').setInputFiles(samplePhoto);
        await page.waitForTimeout(500);
        await scrollContent(9999);
        await shot("03-record-face-result.png");
      }
      if (tab === "ai") {
        metrics.ai = await page.evaluate(() => {
          const composer = document.querySelector(".chat-composer")?.getBoundingClientRect();
          const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
          return {
            messages: document.querySelectorAll(".chat-message-row").length,
            avatars: document.querySelectorAll(".chat-message-row .chat-avatar").length,
            composerBottom: Number((composer?.bottom ?? 0).toFixed(2)),
            navTop: Number((nav?.top ?? 0).toFixed(2)),
            gap: Number(((nav?.top ?? 0) - (composer?.bottom ?? 0)).toFixed(2)),
          };
        });
        if (metrics.ai.messages !== metrics.ai.avatars) throw new Error(`Expected one avatar per message: ${JSON.stringify(metrics.ai)}`);
        if (metrics.ai.gap < 0 || metrics.ai.gap > 48) throw new Error(`AI composer is not pinned above navigation: ${JSON.stringify(metrics.ai)}`);
      }
      if (tab === "trends") {
        metrics.trends = await page.evaluate(() => ({
          charts: document.querySelectorAll(".line-trend-chart").length,
          pointCounts: [...document.querySelectorAll(".line-trend-chart")].map((chart) => chart.querySelectorAll(".trend-point").length),
          text: document.querySelector(".screen-panel")?.textContent ?? "",
        }));
        if (metrics.trends.charts !== 2 || metrics.trends.pointCounts.some((count) => count !== 7)) {
          throw new Error(`Trend charts are incomplete: ${JSON.stringify(metrics.trends)}`);
        }
        if (/近 14 天|14 days/.test(metrics.trends.text)) throw new Error("Trend screen still uses the old 14-day window");
        await page.locator(".line-trend-chart.rhythm").scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await shot("05-trends-rhythm.png");
      }
      if (tab === "profile") {
        metrics.profile = await page.evaluate(() => ({
          environmentVisible: /环境|Environment/.test(document.querySelector(".screen-panel")?.textContent ?? ""),
          healthKitSubtitleVisible: /HealthKit|iPhone 同步|iPhone sync/.test(document.querySelector(".screen-panel")?.textContent ?? ""),
          saveActions: document.querySelectorAll('[aria-label="保存资料"], [aria-label="Save profile"]').length,
          exportActions: document.querySelectorAll('[aria-label="导出我的数据"], [aria-label="Export data"]').length,
        }));
        if (metrics.profile.environmentVisible || metrics.profile.healthKitSubtitleVisible) {
          throw new Error(`Profile still contains removed copy: ${JSON.stringify(metrics.profile)}`);
        }
        if (metrics.profile.saveActions !== 1 || metrics.profile.exportActions !== 1) {
          throw new Error(`Profile icon actions are incomplete: ${JSON.stringify(metrics.profile)}`);
        }
        await page.locator('[aria-label="保存资料"], [aria-label="Save profile"]').tap();
        await page.waitForTimeout(300);
        metrics.profile.savedState = await page.locator(".profile-form").evaluate((form) => form.classList.contains("saved"));
        if (!metrics.profile.savedState) throw new Error("Profile fields did not enter the saved state");
        await shot("06-profile-saved.png");
        await scrollContent(650);
        await shot("06-profile-mid.png");
        await scrollContent(9999);
        await shot("06-profile-bottom.png");
      }
    }

    metrics.navigationStart = firstNavigationStart;
    if (firstNavigationStart < 100) throw new Error(`Scroll reset check did not start from a scrolled Today page: ${firstNavigationStart}`);

    await page.locator('[data-tab="today"]').tap();
    await page.waitForTimeout(250);
    await page.locator('[data-tab="profile"]').tap();
    await page.waitForTimeout(350);
    metrics.profile.savedStateAfterReturn = await page.locator(".profile-form").evaluate((form) => form.classList.contains("saved"));
    if (metrics.profile.savedStateAfterReturn) throw new Error("Profile saved styling persisted after leaving and returning");

    await page.locator(".language-toggle").tap();
    await page.waitForTimeout(200);
    await page.locator('[data-tab="today"]').tap();
    await page.waitForTimeout(400);
    metrics.todayEnglish = await page.locator(".recommendation").evaluate((recommendation) => {
      const recommendationRect = recommendation.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(recommendation);
      return {
        allLineWidths: [...range.getClientRects()].filter((rect) => rect.height > 0).map((rect) => Number(rect.width.toFixed(2))),
        lineWidths: [...range.getClientRects()]
          .filter((rect) => rect.height > 0 && rect.top < recommendationRect.bottom - 0.5)
          .map((rect) => Number(rect.width.toFixed(2))),
        width: Number(recommendationRect.width.toFixed(2)),
      };
    });
    const enRecommendationRatio = metrics.todayEnglish.lineWidths[1] / metrics.todayEnglish.width;
    if (metrics.todayEnglish.lineWidths.length !== 2 || metrics.todayEnglish.allLineWidths.length !== 2 || enRecommendationRatio < 0.78 || enRecommendationRatio > 0.93) {
      throw new Error(`English recommendation does not form a balanced two-line block: ${JSON.stringify(metrics.todayEnglish)}`);
    }
    await shot("07-today-en.png");

    await writeFile(path.join(outputDir, "layout-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

    await browser.close();
  } catch (error) {
    throw error;
  } finally {
    await server.close();
  }

  console.log(`Screenshots saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
