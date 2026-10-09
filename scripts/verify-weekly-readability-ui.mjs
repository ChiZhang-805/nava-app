// Local, explicitly demo-only layout fixtures. No claim of live AI verification.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/weekly-readability";
await mkdir(output, { recursive: true });
await writeFile(`${output}/report.json`, JSON.stringify({ passed: false }));
const server = await createServer({ server: { host: "127.0.0.1", port: 5236, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width, height }, reducedMotion: "reduce", timezoneId: "Asia/Shanghai" });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
      });
      const page = await context.newPage();
      await page.addLocatorHandler(page.locator(".completion-celebration-layer"), async () => {
        await page.frameLocator(".completion-celebration-layer iframe").getByRole("button", { name: /Continue|继续/ }).click();
      });
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // A fixed local QA clock keeps recorded and missing weeks deterministic.
      await page.clock.setFixedTime(new Date("2026-09-30T12:00:00+08:00"));
      const open = async (fixture = true, locale = "zh") => {
        await page.addInitScript((value) => localStorage.setItem("nava.locale", value), locale);
        await page.goto(`http://127.0.0.1:5236/?demo=1${fixture ? "&qa=weekly-ai" : ""}#tab=record`, { waitUntil: "domcontentloaded" });
        if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
        await page.getByRole("tab", { name: /本周报告|Weekly/ }).click();
        await expect(page.locator(".weekly-insight-mascot")).toBeVisible();
      };
      await open();
      await expect(page.locator(".weekly-ai-summary-list li")).toHaveCount(4);
      const measure = async (state) => {
        const data = await page.locator(".weekly-health-report").evaluate((report) => {
          const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          const font = (node) => parseFloat(getComputedStyle(node).fontSize);
          const card = report.querySelector(".weekly-insight-card");
          const text = [...card.querySelectorAll("p, li button span")];
          const chart = report.querySelector(".weekly-trend-card");
          const svg = chart.querySelector("svg[role=img]") ?? chart.querySelector(".line-trend-chart svg, .weekly-radar-chart svg");
          const svgText = [...chart.querySelectorAll(".trend-date, .trend-value, .weekly-radar-caption, .weekly-radar-score")];
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            reportOverflow: report.scrollWidth - report.clientWidth,
            chart: box(chart), svg: svg ? box(svg) : null,
            chartText: svgText.map((node) => ({ ...box(node), font: font(node) })),
            card: box(card), mascot: box(card.querySelector(".weekly-insight-mascot")),
            text: text.map((node) => ({ ...box(node), font: font(node), clipped: node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1 })),
            stats: [...report.querySelectorAll(".weekly-score-card > div")].map((node) => ({ label: font(node.querySelector(":scope > span")), value: font(node.querySelector("strong")), labelBox: box(node.querySelector(":scope > span")), valueBox: box(node.querySelector("strong")), cell: box(node) })),
            date: font(report.querySelector(".weekly-period-controls strong")),
            heading: font(chart.querySelector("header strong")),
          };
        });
        assert(data.overflow <= 1 && data.reportOverflow <= 1, `${width}/${state}: horizontal overflow`);
        assert(data.stats.every(({ label, value, labelBox, valueBox, cell }) => label >= 11 && value >= 13 && labelBox.right + 3 <= valueBox.left && Math.abs((labelBox.top + labelBox.bottom - valueBox.top - valueBox.bottom) / 2) <= 1 && labelBox.left >= cell.left && valueBox.right <= cell.right), `${width}/${state}: stats must stay on one row`);
        assert(data.date >= 13);
        for (const item of data.text) {
          assert(item.font >= 14 && !item.clipped, `${width}/${state}: text is too small or clipped`);
          assert(item.left >= data.card.left && item.right <= data.card.right && item.bottom <= data.card.bottom, `${width}/${state}: text outside card`);
          const overlapsCat = item.right > data.mascot.left + 1 && item.left < data.mascot.right - 1 && item.bottom > data.mascot.top + 1 && item.top < data.mascot.bottom - 1;
          assert(!overlapsCat, `${width}/${state}: text overlaps mascot`);
        }
        for (const label of data.chartText) assert(label.left >= data.chart.left && label.right <= data.chart.right && label.top >= data.chart.top && label.bottom <= data.chart.bottom, `${width}/${state}: chart label outside card`);
        results.push({ width, height, state, ...data });
      };
      await measure("populated-trend");
      await expect(page.locator(".weekly-trend-card > header strong")).toHaveCSS("font-size", "16px");
      await page.screenshot({ path: `${output}/${width}-populated-top.png` });
      await page.locator(".weekly-ai-summary-list li").last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${width}-populated-insights.png` });
      const footerClear = await page.locator(".weekly-insight-card").evaluate((card) => {
        const main = card.closest(".figma-screen-scroll") ?? card.closest("main");
        if (main) main.scrollTop = main.scrollHeight;
        const cardBottom = card.getBoundingClientRect().bottom;
        const navTop = document.querySelector(".bottom-nav").getBoundingClientRect().top;
        return { clear: cardBottom <= navTop, cardBottom, navTop, scrollTop: main?.scrollTop ?? 0, scrollHeight: main?.scrollHeight ?? 0, clientHeight: main?.clientHeight ?? 0, mainClass: main?.className ?? "", paddingBottom: main ? getComputedStyle(main).paddingBottom : "" };
      });
      assert(footerClear.clear, `${width}: report cannot scroll clear of navigation ${JSON.stringify(footerClear)}`);
      await page.locator(".weekly-ai-summary-list li button").first().click();
      await expect(page.locator(".weekly-detail-dialog")).toBeVisible();
      await page.locator(".weekly-detail-dialog header button").click();
      await page.locator(".weekly-chart-switch").click();
      await expect(page.locator(".weekly-radar-caption")).toHaveCount(6);
      await measure("populated-radar");
      await page.screenshot({ path: `${output}/${width}-radar.png` });
      await open(false);
      for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "上一周", exact: true }).click();
      await expect(page.locator(".weekly-trajectory-placeholder-day")).toHaveCount(7);
      await expect(page.locator(".weekly-insight-body > p")).toBeVisible();
      await measure("empty");
      await page.screenshot({ path: `${output}/${width}-empty.png` });
      await open(true, "en");
      await expect(page.locator(".weekly-ai-summary-list li")).toHaveCount(4);
      await measure("english");
      await page.screenshot({ path: `${output}/${width}-english.png` });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, results }, null, 2));
  console.log("Weekly readability: populated, empty, radar, English and detail interactions passed at four viewports.");
} finally { await browser.close(); await server.close(); }
