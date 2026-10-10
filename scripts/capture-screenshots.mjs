import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.SCREENSHOT_DIR || path.join(root, "artifacts", "screenshots");
const port = Number(process.env.PORT || 5174);
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
    const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
    const browser = await chromium.launch();
    const context = await browser.newContext({ locale: "zh-CN",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });
    await context.addInitScript(() => {
      class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = "";
        onend = null;
        onerror = null;
        onresult = null;

        start() {
          window.setTimeout(() => {
            const result = [{ transcript: "今天感觉很平稳" }];
            result.isFinal = false;
            this.onresult?.({ resultIndex: 0, results: [result] });
          }, 80);
        }

        stop() {
          window.queueMicrotask(() => this.onend?.());
        }

        abort() {
          window.queueMicrotask(() => this.onerror?.({ error: "aborted" }));
        }
      }

      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
    });

    const page = await context.newPage();
    const metrics = {};
    const dismissLaunch = async () => {
      const launch = page.locator(".launch-sequence");
      if (await launch.isVisible().catch(() => false)) {
        await launch.click();
        await launch.waitFor({ state: "hidden" });
      }
    };
    const loginReviewAccount = async () => {
      await dismissLaunch();
      await page.locator('input[autocomplete="username"]').fill("13800138000");
      await page.locator('input[autocomplete="current-password"]').fill("12345678");
      await page.locator(".auth-submit").click();
      await page.locator(".phone-frame").waitFor({ state: "visible" });
    };

    const shot = (filename) => page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
    const scrollContent = async (top) => {
      await page.evaluate((scrollTop) => {
        document.querySelector(".app-content")?.scrollTo({ top: scrollTop, left: 0 });
      }, top);
      await page.waitForTimeout(300);
    };

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await dismissLaunch();
    await shot("01-auth.png");

    await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
    await loginReviewAccount();
    await shot("02-today.png");

    metrics.today = await page.evaluate(() => {
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
      const hero = document.querySelector(".today-hero")?.getBoundingClientRect();
      const todayMetricCards = [...document.querySelectorAll(".today-metric-grid .metric-card")].map((card) => Number(card.getBoundingClientRect().height.toFixed(2)));
      const dataItems = [...document.querySelectorAll(".today-data-item")];
      const dataGrid = document.querySelector(".today-data-grid")?.getBoundingClientRect();
      const dataAction = document.querySelector(".today-data-action .action-button")?.getBoundingClientRect();
      const dataSection = document.querySelector(".today-data-section")?.getBoundingClientRect();
      const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
      const content = document.querySelector(".app-content");
      return {
        recommendationLineWidths: visibleLineWidths,
        allRecommendationLineWidths,
        recommendationWidth: Number((recommendationRect?.width ?? 0).toFixed(2)),
        metricValues,
        heroHeight: Number((hero?.height ?? 0).toFixed(2)),
        todayMetricCards,
        metricDetailCount: document.querySelectorAll(".today-metric-grid .metric-card p").length,
        adviceSubtitleCount: document.querySelectorAll(".today-advice .section-heading p").length,
        detailTriggerCount: document.querySelectorAll(".rhythm-detail-trigger").length,
        initialDetailStripCount: document.querySelectorAll(".rhythm-detail-overlay .algorithm-strip > div").length,
        todayDataItems: dataItems.length,
        todayDataHeights: dataItems.map((item) => Number(item.getBoundingClientRect().height.toFixed(2))),
        todayDataButtonRatio: Number(((dataAction?.width ?? 0) / Math.max(dataGrid?.width ?? 1, 1)).toFixed(3)),
        initialDataSectionTop: Number((dataSection?.top ?? 0).toFixed(2)),
        initialDataSectionBottom: Number((dataSection?.bottom ?? 0).toFixed(2)),
        initialDataActionBottom: Number((dataAction?.bottom ?? 0).toFixed(2)),
        navTop: Number((nav?.top ?? 0).toFixed(2)),
        scrollHeight: content?.scrollHeight ?? 0,
        clientHeight: content?.clientHeight ?? 0,
      };
    });

    if (metrics.today.metricValues.some((metric) => metric.text.includes("分钟") || metric.height > metric.lineHeight * 1.25)) {
      throw new Error(`A Today metric wrapped unexpectedly: ${JSON.stringify(metrics.today.metricValues)}`);
    }
    if (
      metrics.today.todayDataItems !== 6
      || Math.max(...metrics.today.todayDataHeights) - Math.min(...metrics.today.todayDataHeights) > 1
      || metrics.today.todayDataButtonRatio < 0.99
    ) {
      throw new Error(`Expected six equal Today data states and a full-width action: ${JSON.stringify(metrics.today)}`);
    }
    const defaultDataSectionGap = metrics.today.navTop - metrics.today.initialDataSectionBottom;
    if (
      metrics.today.scrollHeight > metrics.today.clientHeight + 2
      || metrics.today.initialDataActionBottom > metrics.today.navTop + 0.5
      || defaultDataSectionGap < 14
      || defaultDataSectionGap > 24
    ) {
      throw new Error(`Default Today viewport is not one screen: ${JSON.stringify(metrics.today)}`);
    }
    const zhRecommendationRatio = metrics.today.recommendationLineWidths.at(-1) / metrics.today.recommendationWidth;
    if (metrics.today.recommendationLineWidths.length !== 3 || metrics.today.allRecommendationLineWidths.length !== metrics.today.recommendationLineWidths.length || zhRecommendationRatio < 0.75 || zhRecommendationRatio > 0.9) {
      throw new Error(`Chinese recommendation does not form a balanced three-line block: ${JSON.stringify(metrics.today.recommendationLineWidths)}`);
    }
    if (
      metrics.today.heroHeight > 120
      || metrics.today.todayMetricCards.some((height) => height > 82)
      || metrics.today.metricDetailCount !== 0
      || metrics.today.adviceSubtitleCount !== 0
      || metrics.today.detailTriggerCount !== 1
      || metrics.today.initialDetailStripCount !== 0
    ) {
      throw new Error(`Today spacing remains oversized or incomplete: ${JSON.stringify(metrics.today)}`);
    }

    await page.locator(".rhythm-detail-trigger").click({ force: true });
    await page.waitForTimeout(250);
    metrics.todayDetail = await page.evaluate(() => {
      const stripCells = [...document.querySelectorAll(".rhythm-detail-overlay .algorithm-strip > div")];
      const stripWidths = stripCells.map((cell) => Number(cell.getBoundingClientRect().width.toFixed(2)));
      return {
        stripWidths,
        stripText: document.querySelector(".rhythm-detail-overlay .algorithm-strip")?.textContent ?? "",
      };
    });
    if (
      metrics.todayDetail.stripWidths.length !== 3
      || Math.max(...metrics.todayDetail.stripWidths) - Math.min(...metrics.todayDetail.stripWidths) > 1
      || /ChronoState|模型/.test(metrics.todayDetail.stripText)
    ) {
      throw new Error(`Today rhythm detail dialog is incomplete: ${JSON.stringify(metrics.todayDetail)}`);
    }
    await shot("02-today-detail.png");
    await page.locator('.rhythm-detail-overlay [aria-label="关闭"], .rhythm-detail-overlay [aria-label="Close"]').tap();
    await page.waitForTimeout(200);
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
              summaries: [...entry.querySelectorAll(".record-module-points span")].map((item) => item.textContent?.trim() ?? ""),
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
        if (
          metrics.recordHub.entries.some((entry) => (
            entry.summaries.length !== 4
            || entry.summaries.some((summary) => [...summary].length !== 7)
          ))
        ) {
          throw new Error(`Record summaries must be four seven-character Chinese lines: ${JSON.stringify(metrics.recordHub.entries)}`);
        }
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
        metrics.recordFace = await page.evaluate(() => ({
          cameraActions: document.querySelectorAll('[data-record-detail="face"] .face-camera-action').length,
          centerText: document.querySelector('[data-record-detail="face"] .photo-picker.face')?.textContent?.trim() ?? "",
        }));
        if (metrics.recordFace.cameraActions !== 1 || !metrics.recordFace.centerText.includes("拍照分析面部状态")) {
          throw new Error(`Face record camera action or center prompt is incomplete: ${JSON.stringify(metrics.recordFace)}`);
        }
        await page.locator('[data-record-detail="face"] input[capture="user"]').setInputFiles(samplePhoto);
        await page.waitForTimeout(500);
        await shot("03-record-face-result.png");
        await closeRecordModule();
      }
      if (tab === "ai") {
        metrics.ai = await page.evaluate(() => {
          const composer = document.querySelector(".chat-composer")?.getBoundingClientRect();
          const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
          const header = document.querySelector(".app-header")?.getBoundingClientRect();
          const firstBubble = document.querySelector(".chat-message-row .chat-bubble")?.getBoundingClientRect();
          const avatarOffsets = [...document.querySelectorAll(".chat-message-row")].map((row) => {
            const avatar = row.querySelector(".chat-avatar")?.getBoundingClientRect();
            const bubble = row.querySelector(".chat-bubble")?.getBoundingClientRect();
            return Number(Math.abs((avatar?.top ?? 0) - (bubble?.top ?? 0)).toFixed(2));
          });
          const bubbleRatios = [...document.querySelectorAll(".chat-message-row")].map((row) => {
            const bubble = row.querySelector(".chat-bubble")?.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            return {
              role: row.classList.contains("user") ? "user" : "assistant",
              width: Number((bubble?.width ?? 0).toFixed(2)),
              ratio: Number(((bubble?.width ?? 0) / rowRect.width).toFixed(3)),
            };
          });
          return {
            messages: document.querySelectorAll(".chat-message-row").length,
            avatars: document.querySelectorAll(".chat-message-row .chat-avatar").length,
            avatarOffsets,
            bubbleRatios,
            composerBottom: Number((composer?.bottom ?? 0).toFixed(2)),
            navigationCount: document.querySelectorAll(".bottom-nav").length,
            bottomGap: Number(((frame?.bottom ?? 0) - (composer?.bottom ?? 0)).toFixed(2)),
            firstMessageGap: Number(((firstBubble?.top ?? 0) - (header?.bottom ?? 0)).toFixed(2)),
            summaryCards: document.querySelectorAll(".chat-layout > .section-card, .ai-prompt").length,
            sendText: document.querySelector(".chat-send-button")?.textContent?.trim() ?? "",
            muteButtons: document.querySelectorAll(".chat-voice-stop").length,
          };
        });
        if (metrics.ai.messages !== metrics.ai.avatars) throw new Error(`Expected one avatar per message: ${JSON.stringify(metrics.ai)}`);
        if (metrics.ai.avatarOffsets.some((offset) => offset > 1)) throw new Error(`Chat avatars are not top-aligned: ${JSON.stringify(metrics.ai)}`);
        if (metrics.ai.bubbleRatios.some((bubble) => bubble.ratio > (bubble.role === "user" ? 0.725 : 0.785))) {
          throw new Error(`Chat bubbles remain wider than the conversational layout limit: ${JSON.stringify(metrics.ai.bubbleRatios)}`);
        }
        if (metrics.ai.navigationCount !== 0 || metrics.ai.bottomGap < 16 || metrics.ai.bottomGap > 50) throw new Error(`AI composer is not the sole bottom control: ${JSON.stringify(metrics.ai)}`);
        if (metrics.ai.summaryCards !== 0 || metrics.ai.firstMessageGap < 12 || metrics.ai.firstMessageGap > 44) {
          throw new Error(`AI first message is not positioned cleanly below the header wordmark: ${JSON.stringify(metrics.ai)}`);
        }
        if (metrics.ai.sendText || metrics.ai.muteButtons) throw new Error(`AI composer still contains text or a mute button: ${JSON.stringify(metrics.ai)}`);

        await page.evaluate(() => { location.hash = "tab=today"; });
        const aiButton = page.locator('[data-tab="ai"]');
        await aiButton.waitFor({ state: "visible" });
        const composerInput = page.locator(".chat-input-shell input");
        const aiBox = await aiButton.boundingBox();
        if (!aiBox) throw new Error("AI navigation control has no measurable bounds");
        const voiceX = aiBox.x + aiBox.width / 2;
        const voiceY = aiBox.y + aiBox.height / 2;

        await composerInput.fill("录音前内容");
        await page.mouse.move(voiceX, voiceY);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.locator(".voice-gesture-overlay:not(.cancel-armed)").waitFor({ state: "visible" });
        await page.waitForTimeout(120);
        await shot("04-ai-voice-listening.png");
        const liveTranscript = await composerInput.inputValue();
        await page.mouse.up();
        await page.locator(".voice-gesture-overlay").waitFor({ state: "detached" });
        const releasedTranscript = await composerInput.inputValue();
        if (liveTranscript !== "今天感觉很平稳" || releasedTranscript !== liveTranscript) {
          throw new Error(`Voice release did not keep the transcript: ${JSON.stringify({ liveTranscript, releasedTranscript })}`);
        }

        await composerInput.fill("取消后保留");
        await page.mouse.move(voiceX, voiceY);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.move(voiceX, voiceY - 82, { steps: 5 });
        await page.locator(".voice-gesture-overlay.cancel-armed").waitFor({ state: "visible" });
        await shot("04-ai-voice-cancel.png");
        await page.mouse.up();
        await page.locator(".voice-gesture-overlay").waitFor({ state: "detached" });
        const cancelledTranscript = await composerInput.inputValue();
        if (cancelledTranscript !== "取消后保留") {
          throw new Error(`Voice slide-to-cancel did not restore the previous draft: ${cancelledTranscript}`);
        }
        metrics.ai.voice = { liveTranscript, releasedTranscript, cancelledTranscript };
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
        const initialAccountName = await page.locator(".profile-row strong").innerText();
        const nicknameInput = page.locator(".profile-form .field input").first();
        const goalInput = page.locator(".profile-form .field input").nth(3);
        const occupationInput = page.locator(".profile-form .field input").nth(4);
        const originalGoal = await goalInput.inputValue();
        const originalOccupation = await occupationInput.inputValue();
        await nicknameInput.fill("待保存昵称");
        await goalInput.fill("");
        await occupationInput.fill("");
        const accountNameBeforeSave = await page.locator(".profile-row strong").innerText();
        if (accountNameBeforeSave !== initialAccountName) {
          throw new Error(`Profile account name changed before save: ${initialAccountName} -> ${accountNameBeforeSave}`);
        }
        metrics.profile = await page.evaluate(() => {
          const measurements = [...document.querySelectorAll(".profile-measure-input")].map((container) => {
            const input = container.querySelector("input")?.getBoundingClientRect();
            const unit = container.querySelector(".profile-input-unit")?.getBoundingClientRect();
            return {
              unit: container.querySelector(".profile-input-unit")?.textContent?.trim() ?? "",
              inside: Boolean(input && unit && unit.left > input.left && unit.right < input.right),
              gap: Number(((input?.right ?? 0) - (unit?.right ?? 0)).toFixed(2)),
            };
          });
          const account = document.querySelector(".profile-account-card")?.getBoundingClientRect();
          const personal = document.querySelector(".profile-personal-card")?.getBoundingClientRect();
          const deviceCards = [...document.querySelectorAll(".profile-device-card")].map((card) => ({
            top: Number(card.getBoundingClientRect().top.toFixed(2)),
            bottom: Number(card.getBoundingClientRect().bottom.toFixed(2)),
            height: Number(card.getBoundingClientRect().height.toFixed(2)),
            actions: card.querySelectorAll(".section-icon-action").length,
            actionText: [...card.querySelectorAll(".section-icon-action")].map((button) => button.textContent?.trim() ?? ""),
            statusRows: card.querySelectorAll(".device-connection-row").length,
            statusIcons: card.querySelectorAll(".device-connection-icon").length,
          }));
          const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
          return {
            environmentVisible: /环境|Environment/.test(document.querySelector(".screen-panel")?.textContent ?? ""),
            healthKitSubtitleVisible: /HealthKit|iPhone 同步|iPhone sync/.test(document.querySelector(".screen-panel")?.textContent ?? ""),
            availablePillVisible: [...document.querySelectorAll(".status-pill")].some((pill) => /可用|Ready/.test(pill.textContent ?? "")),
            saveActions: document.querySelectorAll('[aria-label="保存资料"], [aria-label="Save profile"]').length,
            exportActions: document.querySelectorAll('[aria-label="导出我的数据"], [aria-label="Export data"]').length,
            measurements,
            deviceCards,
            sectionGaps: account && personal && deviceCards.length === 2
              ? [
                  Number((personal.top - account.bottom).toFixed(2)),
                  Number((deviceCards[0].top - personal.bottom).toFixed(2)),
                  Number((deviceCards[1].top - deviceCards[0].bottom).toFixed(2)),
                ]
              : [],
            initialDeviceGap: deviceCards.length === 2
              ? {
                  navTop: Number((nav?.top ?? 0).toFixed(2)),
                  gapMidpoint: Number(((deviceCards[0].bottom + deviceCards[1].top) / 2).toFixed(2)),
                  healthClearance: Number(((nav?.top ?? 0) - deviceCards[0].bottom).toFixed(2)),
                }
              : null,
          };
        });
        if (metrics.profile.environmentVisible || metrics.profile.healthKitSubtitleVisible || metrics.profile.availablePillVisible) {
          throw new Error(`Profile still contains removed copy: ${JSON.stringify(metrics.profile)}`);
        }
        if (metrics.profile.saveActions !== 1 || metrics.profile.exportActions !== 1) {
          throw new Error(`Profile icon actions are incomplete: ${JSON.stringify(metrics.profile)}`);
        }
        if (
          metrics.profile.measurements.length !== 2
          || metrics.profile.measurements.some((measurement) => !measurement.inside || measurement.gap < 10)
          || metrics.profile.measurements.map((measurement) => measurement.unit).join(",") !== "cm,kg"
        ) {
          throw new Error(`Profile measurement units are not inside the fields: ${JSON.stringify(metrics.profile.measurements)}`);
        }
        const deviceHeights = metrics.profile.deviceCards.map((card) => card.height);
        if (
          metrics.profile.deviceCards.length !== 2
          || metrics.profile.deviceCards.some((card) => (
            card.actions !== 2
            || card.actionText.some(Boolean)
            || card.statusRows !== 1
            || card.statusIcons !== 1
          ))
          || Math.max(...deviceHeights) - Math.min(...deviceHeights) > 0.5
        ) {
          throw new Error(`Profile device cards are not structurally aligned: ${JSON.stringify(metrics.profile.deviceCards)}`);
        }
        if (
          metrics.profile.sectionGaps.length !== 3
          || Math.max(...metrics.profile.sectionGaps) - Math.min(...metrics.profile.sectionGaps) > 0.75
          || metrics.profile.sectionGaps.some((gap) => gap < 15.5 || gap > 16.5)
        ) {
          throw new Error(`Profile module gaps are not consistent: ${JSON.stringify(metrics.profile.sectionGaps)}`);
        }
        if (
          !metrics.profile.initialDeviceGap
          || metrics.profile.initialDeviceGap.healthClearance < 17.5
          || metrics.profile.initialDeviceGap.healthClearance > 18.5
          || metrics.profile.deviceCards.some((card) => Math.abs(card.height - 114) > 0.5)
        ) {
          throw new Error(`Default Profile device cards were not reduced by 10px cleanly: ${JSON.stringify(metrics.profile)}`);
        }
        await page.locator(".avatar-button").tap();
        await page.locator(".avatar-sheet").waitFor({ state: "visible" });
        metrics.profile.avatarSheet = await page.evaluate(() => ({
          actionLabels: [...document.querySelectorAll(".avatar-sheet-actions button")].map((button) => button.textContent?.trim() ?? ""),
          closeActions: document.querySelectorAll('.avatar-sheet [aria-label="关闭"], .avatar-sheet [aria-label="Close"]').length,
        }));
        if (
          metrics.profile.avatarSheet.closeActions !== 1
          || metrics.profile.avatarSheet.actionLabels.length !== 2
          || !metrics.profile.avatarSheet.actionLabels.some((label) => /相册|Photo library/.test(label))
          || !metrics.profile.avatarSheet.actionLabels.some((label) => /拍照|Take photo/.test(label))
        ) {
          throw new Error(`Profile avatar sheet is incomplete: ${JSON.stringify(metrics.profile.avatarSheet)}`);
        }
        await shot("06-profile-avatar-sheet.png");
        await page.locator('.profile-account-card input[type="file"]').first().setInputFiles(samplePhoto);
        await page.locator(".avatar-sheet-overlay").waitFor({ state: "detached" });
        await page.locator('.avatar-button img[src^="data:image/png"]').waitFor({ state: "visible" });
        metrics.profile.avatarUpdated = await page.locator('.avatar-button img[src^="data:image/png"]').count();
        if (metrics.profile.avatarUpdated !== 1) {
          throw new Error(`Profile avatar upload did not update the account image: ${JSON.stringify(metrics.profile.avatarUpdated)}`);
        }
        for (const label of ["请求授权", "立即同步", "连接 Apple Watch", "同步 Apple Watch"]) {
          await page.locator(`[aria-label="${label}"]`).tap();
          await page.waitForTimeout(120);
        }
        metrics.profile.deviceActions = await page.evaluate(() => ({
          errorVisible: Boolean(document.querySelector(".error-text")),
          healthSyncKeys: Object.keys(localStorage).filter((key) => key.startsWith("nava.health.last-sync.v1")),
          watchSnapshotKeys: Object.keys(localStorage).filter((key) => key.startsWith("nava.watch.snapshot")),
        }));
        if (
          metrics.profile.deviceActions.errorVisible
          || metrics.profile.deviceActions.healthSyncKeys.length !== 1
          || metrics.profile.deviceActions.healthSyncKeys[0] === "nava.health.last-sync.v1"
          || metrics.profile.deviceActions.watchSnapshotKeys.length !== 1
          || metrics.profile.deviceActions.watchSnapshotKeys[0] === "nava.watch.snapshot"
        ) {
          throw new Error(`Profile device actions or account-scoped sync state failed: ${JSON.stringify(metrics.profile.deviceActions)}`);
        }
        await page.locator('[aria-label="保存资料"], [aria-label="Save profile"]').tap();
        await page.waitForTimeout(300);
        metrics.profile.accountNameBeforeSave = accountNameBeforeSave;
        metrics.profile.accountNameAfterSave = await page.locator(".profile-row strong").innerText();
        metrics.profile.blankFieldsPreserved =
          await goalInput.inputValue() === originalGoal
          && await occupationInput.inputValue() === originalOccupation;
        if (metrics.profile.accountNameAfterSave !== "待保存昵称" || !metrics.profile.blankFieldsPreserved) {
          throw new Error(`Profile save boundary is incorrect: ${JSON.stringify(metrics.profile)}`);
        }
        metrics.profile.savedState = {
          formTinted: await page.locator(".profile-form").evaluate((form) => form.classList.contains("saved")),
          greenCheckVisible: await page.locator(".section-icon-action.success .lucide-check").isVisible(),
          successTextVisible: await page.getByText("资料已保存", { exact: true }).count() > 0,
        };
        if (metrics.profile.savedState.formTinted || !metrics.profile.savedState.greenCheckVisible || metrics.profile.savedState.successTextVisible) {
          throw new Error(`Profile save feedback is not limited to the green check icon: ${JSON.stringify(metrics.profile.savedState)}`);
        }
        await shot("06-profile-saved.png");
        await scrollContent(650);
        await shot("06-profile-mid.png");
        await scrollContent(9999);
        await shot("06-profile-bottom.png");
      }
    }

    metrics.navigationStart = firstNavigationStart;
    if (firstNavigationStart > 1) throw new Error(`Today page should not scroll in one-screen mode: ${firstNavigationStart}`);

    await page.locator('[data-tab="today"]').tap();
    await page.waitForTimeout(250);
    await page.locator('[data-tab="profile"]').tap();
    await page.waitForTimeout(350);
    metrics.profile.afterReturn = {
      accountName: await page.locator(".profile-row strong").innerText(),
      nickname: await page.locator(".profile-form .field input").first().inputValue(),
      greenCheckVisible: await page.locator(".section-icon-action.success .lucide-check").count() > 0,
    };
    if (
      metrics.profile.afterReturn.accountName !== "待保存昵称"
      || metrics.profile.afterReturn.nickname !== "待保存昵称"
      || metrics.profile.afterReturn.greenCheckVisible
    ) {
      throw new Error(`Profile did not preserve its saved data cleanly after navigation: ${JSON.stringify(metrics.profile.afterReturn)}`);
    }

    await page.locator(".nava-more-trigger").tap();
    await page.locator(".more-menu-language").tap();
    await page.getByRole("menuitemradio", { name: "English" }).tap();
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
    const enRecommendationRatio = metrics.todayEnglish.lineWidths.at(-1) / metrics.todayEnglish.width;
    if (metrics.todayEnglish.lineWidths.length !== 3 || metrics.todayEnglish.allLineWidths.length !== metrics.todayEnglish.lineWidths.length || enRecommendationRatio < 0.75 || enRecommendationRatio > 0.9) {
      throw new Error(`English recommendation does not form a balanced three-line block: ${JSON.stringify(metrics.todayEnglish)}`);
    }
    await shot("07-today-en.png");

    await context.close();
    metrics.viewports = {};
    const viewportChecks = [
      { name: "tall", width: 430, height: 932 },
      { name: "compact", width: 375, height: 812 },
    ];

    for (const viewport of viewportChecks) {
      const viewportContext = await browser.newContext({ locale: "zh-CN",
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
      await viewportPage.locator('[data-tab="record"]').waitFor({ state: "visible", timeout: 30000 });
      await viewportPage.waitForTimeout(900);

      const todayLayout = await viewportPage.evaluate(() => {
        const content = document.querySelector(".app-content");
        const action = document.querySelector(".today-data-action .action-button")?.getBoundingClientRect();
        const dataSection = document.querySelector(".today-data-section")?.getBoundingClientRect();
        const metrics = [...document.querySelectorAll(".today-metric-grid .metric-card")].map((card) => Number(card.getBoundingClientRect().height.toFixed(2)));
        const recommendation = document.querySelector(".recommendation");
        const recommendationRect = recommendation?.getBoundingClientRect();
        const range = document.createRange();
        if (recommendation) range.selectNodeContents(recommendation);
        const lineWidths = recommendation
          ? [...range.getClientRects()]
              .filter((rect) => rect.height > 0 && recommendationRect && rect.top < recommendationRect.bottom - 0.5)
              .map((rect) => Number(rect.width.toFixed(2)))
          : [];
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        return {
          scrollHeight: content?.scrollHeight ?? 0,
          clientHeight: content?.clientHeight ?? 0,
          actionBottom: Number((action?.bottom ?? 0).toFixed(2)),
          dataSectionBottom: Number((dataSection?.bottom ?? 0).toFixed(2)),
          navTop: Number((nav?.top ?? 0).toFixed(2)),
          metricHeights: metrics,
          recommendationLineCount: lineWidths.length,
          recommendationLastRatio: Number(((lineWidths.at(-1) ?? 0) / Math.max(recommendationRect?.width ?? 1, 1)).toFixed(3)),
          detailTriggerCount: document.querySelectorAll(".rhythm-detail-trigger").length,
        };
      });
      if (
        todayLayout.scrollHeight > todayLayout.clientHeight + 2
        || todayLayout.actionBottom > todayLayout.navTop + 0.5
        || todayLayout.navTop - todayLayout.dataSectionBottom < 14
        || todayLayout.navTop - todayLayout.dataSectionBottom > 24
        || todayLayout.metricHeights.some((height) => height > 82)
        || todayLayout.recommendationLineCount !== 3
        || todayLayout.recommendationLastRatio < 0.75
        || todayLayout.recommendationLastRatio > 0.9
        || todayLayout.detailTriggerCount !== 1
      ) {
        throw new Error(`${viewport.name} Today is not a one-screen layout: ${JSON.stringify(todayLayout)}`);
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

      await viewportPage.locator('[data-tab="profile"]').tap();
      await viewportPage.waitForTimeout(800);
      const profileLayout = await viewportPage.evaluate(() => {
        const account = document.querySelector(".profile-account-card")?.getBoundingClientRect();
        const personal = document.querySelector(".profile-personal-card")?.getBoundingClientRect();
        const cards = [...document.querySelectorAll(".profile-device-card")].map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            top: Number(rect.top.toFixed(2)),
            bottom: Number(rect.bottom.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
          };
        });
        const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
        return {
          cards,
          navTop: Number((nav?.top ?? 0).toFixed(2)),
          gapMidpoint: cards.length === 2 ? Number(((cards[0].bottom + cards[1].top) / 2).toFixed(2)) : 0,
          healthClearance: cards.length === 2 ? Number(((nav?.top ?? 0) - cards[0].bottom).toFixed(2)) : 0,
          sectionGaps: account && personal && cards.length === 2
            ? [
                Number((personal.top - account.bottom).toFixed(2)),
                Number((cards[0].top - personal.bottom).toFixed(2)),
                Number((cards[1].top - cards[0].bottom).toFixed(2)),
              ]
            : [],
        };
      });
      if (
        profileLayout.sectionGaps.length !== 3
        || Math.max(...profileLayout.sectionGaps) - Math.min(...profileLayout.sectionGaps) > 0.75
        || profileLayout.sectionGaps.some((gap) => gap < 15.5 || gap > 16.5)
      ) {
        throw new Error(`${viewport.name} Profile module gaps are not consistent: ${JSON.stringify(profileLayout)}`);
      }
      if (
        profileLayout.cards.length !== 2
        || profileLayout.healthClearance < 17.5
        || profileLayout.healthClearance > 18.5
        || profileLayout.cards.some((card) => Math.abs(card.height - (viewport.name === "tall" ? 174 : 118)) > 0.5)
      ) {
        throw new Error(`${viewport.name} Profile device cards were not reduced by 10px cleanly: ${JSON.stringify(profileLayout)}`);
      }
      await viewportShot("profile-devices");

      metrics.viewports[viewport.name] = { today: todayLayout, record: recordLayout, trends: trendLayout, profile: profileLayout };
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
