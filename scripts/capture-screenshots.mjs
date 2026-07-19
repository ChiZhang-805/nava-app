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
      await page.waitForTimeout(800);
      const tabScrollTop = await page.evaluate(() => document.querySelector(".app-content")?.scrollTop ?? 0);
      metrics.navigation ??= [];
      metrics.navigation.push({ tab, scrollTop: tabScrollTop });
      if (tabScrollTop > 1) throw new Error(`${tab} opened at scrollTop ${tabScrollTop} instead of the top`);
      await shot(filename);
      if (tab === "record") {
        metrics.recordHub = await page.evaluate(() => {
          const content = document.querySelector(".app-content");
          const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
          const entries = [...document.querySelectorAll("[data-record-module]")].map((entry) => {
            const rect = entry.getBoundingClientRect();
            return {
              id: entry.getAttribute("data-record-module"),
              top: Number(rect.top.toFixed(2)),
              bottom: Number(rect.bottom.toFixed(2)),
              height: Number(rect.height.toFixed(2)),
            };
          });
          return {
            count: entries.length,
            entries,
            scrollHeight: content?.scrollHeight ?? 0,
            clientHeight: content?.clientHeight ?? 0,
            navTop: Number((nav?.top ?? 0).toFixed(2)),
          };
        });
        if (metrics.recordHub.count !== 6) throw new Error(`Expected 6 record entrances: ${JSON.stringify(metrics.recordHub)}`);
        if (metrics.recordHub.scrollHeight > metrics.recordHub.clientHeight + 2) {
          throw new Error(`Record hub is not a one-screen layout: ${JSON.stringify(metrics.recordHub)}`);
        }
        if (metrics.recordHub.entries.some((entry) => entry.bottom > metrics.recordHub.navTop + 0.5)) {
          throw new Error(`A record entrance is hidden behind navigation: ${JSON.stringify(metrics.recordHub)}`);
        }
        const recordHeights = metrics.recordHub.entries.map((entry) => entry.height);
        if (Math.max(...recordHeights) - Math.min(...recordHeights) > 1) {
          throw new Error(`Record entrances are not equal height: ${recordHeights.join(", ")}`);
        }

        const openRecordModule = async (module, screenshot) => {
          await page.locator(`[data-record-module="${module}"]`).tap();
          await page.waitForTimeout(300);
          const detailScrollTop = await page.evaluate(() => document.querySelector(".app-content")?.scrollTop ?? 0);
          if (detailScrollTop > 1) throw new Error(`${module} detail opened at scrollTop ${detailScrollTop}`);
          await shot(screenshot);
        };
        const closeRecordModule = async () => {
          await page.locator('[aria-label="返回记录入口"], [aria-label="Back to records"]').tap();
          await page.waitForTimeout(250);
        };

        await openRecordModule("mood", "03-record-mood.png");
        await closeRecordModule();
        await openRecordModule("sleep", "03-record-sleep.png");
        await closeRecordModule();
        await openRecordModule("exercise", "03-record-exercise.png");
        await closeRecordModule();
        await openRecordModule("diet", "03-record-diet.png");
        await page.locator('[data-record-detail="diet"] input[capture="environment"]').setInputFiles(samplePhoto);
        await page.waitForTimeout(500);
        await shot("03-record-diet-result.png");
        await closeRecordModule();
        await openRecordModule("focus", "03-record-focus.png");
        await closeRecordModule();
        await openRecordModule("face", "03-record-face.png");
        await page.locator('[data-record-detail="face"] input[capture="user"]').setInputFiles(samplePhoto);
        await page.waitForTimeout(500);
        await shot("03-record-face-result.png");
        await closeRecordModule();
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
        metrics.trends = await page.evaluate(() => {
          const content = document.querySelector(".app-content");
          const dashboard = document.querySelector(".trend-dashboard")?.getBoundingClientRect();
          const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
          return {
            charts: document.querySelectorAll(".line-trend-chart").length,
            pointCounts: [...document.querySelectorAll(".line-trend-chart")].map((chart) => chart.querySelectorAll(".trend-point").length),
            text: document.querySelector(".screen-panel")?.textContent ?? "",
            integratedPanels: document.querySelectorAll(".trend-chart-section > .section-card").length,
            visibleSubtitles: document.querySelectorAll(".trend-dashboard .section-heading p, .trend-metric-grid .metric-card > p").length,
            metricHeights: [...document.querySelectorAll(".trend-metric-grid .metric-card")].map((card) => Number(card.getBoundingClientRect().height.toFixed(2))),
            dashboardBottom: Number((dashboard?.bottom ?? 0).toFixed(2)),
            navTop: Number((nav?.top ?? 0).toFixed(2)),
            scrollHeight: content?.scrollHeight ?? 0,
            clientHeight: content?.clientHeight ?? 0,
          };
        });
        if (metrics.trends.charts !== 2 || metrics.trends.pointCounts.some((count) => count !== 7)) {
          throw new Error(`Trend charts are incomplete: ${JSON.stringify(metrics.trends)}`);
        }
        if (metrics.trends.integratedPanels !== 1) throw new Error(`Trend charts are not integrated: ${JSON.stringify(metrics.trends)}`);
        if (metrics.trends.metricHeights.some((height) => height > 100)) throw new Error(`Trend metrics are still too tall: ${JSON.stringify(metrics.trends)}`);
        if (metrics.trends.visibleSubtitles !== 0) throw new Error(`Trend screen still contains repeated subtitles: ${JSON.stringify(metrics.trends)}`);
        if (/近 14 天|14 days/.test(metrics.trends.text)) throw new Error("Trend screen still uses the old 14-day window");
        if (metrics.trends.dashboardBottom > metrics.trends.navTop + 0.5 || metrics.trends.scrollHeight > metrics.trends.clientHeight + 2) {
          throw new Error(`Trend dashboard is not fully visible: ${JSON.stringify(metrics.trends)}`);
        }
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

    await context.close();
    metrics.viewports = {};
    const viewportChecks = [
      { name: "tall", width: 430, height: 932 },
      { name: "compact", width: 375, height: 812 },
    ];

    for (const viewport of viewportChecks) {
      const viewportContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      });
      const viewportPage = await viewportContext.newPage();
      const viewportShot = (suffix) => viewportPage.screenshot({
        path: path.join(outputDir, `08-${viewport.name}-${suffix}.png`),
        fullPage: false,
      });
      await viewportPage.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
      await viewportPage.waitForTimeout(900);

      const todayLayout = await viewportPage.evaluate(() => {
        const section = document.querySelector(".today-data-section")?.getBoundingClientRect();
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        return {
          sectionTop: Number((section?.top ?? 0).toFixed(2)),
          navTop: Number((nav?.top ?? 0).toFixed(2)),
        };
      });
      if (todayLayout.sectionTop < todayLayout.navTop - 0.5) {
        throw new Error(`${viewport.name} Today exposes an incomplete next section: ${JSON.stringify(todayLayout)}`);
      }
      await viewportShot("today");

      await viewportPage.locator('[data-tab="record"]').tap();
      await viewportPage.waitForTimeout(800);
      const recordLayout = await viewportPage.evaluate(() => {
        const content = document.querySelector(".app-content");
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        const entries = [...document.querySelectorAll("[data-record-module]")].map((entry) => {
          const rect = entry.getBoundingClientRect();
          return { height: Number(rect.height.toFixed(2)), bottom: Number(rect.bottom.toFixed(2)) };
        });
        return {
          entries,
          navTop: Number((nav?.top ?? 0).toFixed(2)),
          scrollHeight: content?.scrollHeight ?? 0,
          clientHeight: content?.clientHeight ?? 0,
        };
      });
      const viewportRecordHeights = recordLayout.entries.map((entry) => entry.height);
      if (
        recordLayout.entries.length !== 6
        || recordLayout.scrollHeight > recordLayout.clientHeight + 2
        || recordLayout.entries.some((entry) => entry.bottom > recordLayout.navTop + 0.5)
        || Math.max(...viewportRecordHeights) - Math.min(...viewportRecordHeights) > 1
      ) {
        throw new Error(`${viewport.name} record hub does not fit evenly: ${JSON.stringify(recordLayout)}`);
      }
      await viewportShot("record-hub");

      await viewportPage.locator('[data-tab="trends"]').tap();
      await viewportPage.waitForTimeout(800);
      const trendLayout = await viewportPage.evaluate(() => {
        const content = document.querySelector(".app-content");
        const dashboard = document.querySelector(".trend-dashboard")?.getBoundingClientRect();
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        const normalLabel = document.querySelector(".nav-button:not(.ai-nav-button) > span:last-child");
        const aiLabel = document.querySelector(".ai-nav-button > span:last-child");
        const normalIcon = document.querySelector(".nav-button:not(.ai-nav-button) > svg")?.getBoundingClientRect();
        const aiIcon = document.querySelector(".ai-nav-orb > svg")?.getBoundingClientRect();
        return {
          dashboardBottom: Number((dashboard?.bottom ?? 0).toFixed(2)),
          navTop: Number((nav?.top ?? 0).toFixed(2)),
          scrollHeight: content?.scrollHeight ?? 0,
          clientHeight: content?.clientHeight ?? 0,
          normalLabelSize: Number.parseFloat(normalLabel ? getComputedStyle(normalLabel).fontSize : "0"),
          aiLabelSize: Number.parseFloat(aiLabel ? getComputedStyle(aiLabel).fontSize : "0"),
          normalIconSize: Number((normalIcon?.width ?? 0).toFixed(2)),
          aiIconSize: Number((aiIcon?.width ?? 0).toFixed(2)),
        };
      });
      if (trendLayout.dashboardBottom > trendLayout.navTop + 0.5 || trendLayout.scrollHeight > trendLayout.clientHeight + 2) {
        throw new Error(`${viewport.name} trend dashboard is not one screen: ${JSON.stringify(trendLayout)}`);
      }
      if (
        trendLayout.normalLabelSize < 11
        || trendLayout.aiLabelSize <= trendLayout.normalLabelSize
        || trendLayout.normalIconSize < 22
        || trendLayout.aiIconSize < 23
      ) {
        throw new Error(`${viewport.name} navigation remains undersized: ${JSON.stringify(trendLayout)}`);
      }
      await viewportShot("trends");

      metrics.viewports[viewport.name] = { today: todayLayout, record: recordLayout, trends: trendLayout };
      await viewportContext.close();
    }

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
