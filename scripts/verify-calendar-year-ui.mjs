import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\calendar-readability";
const port = 5213;
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 2, answers: {} }));
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.setDefaultTimeout(15000);
    await page.goto(`${baseUrl}?demo=1#tab=today&view=calendar`, { waitUntil: "domcontentloaded" });
    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();
    const reward = page.locator(".reward-celebration-layer");
    if (await reward.isVisible().catch(() => false)) await reward.locator("button").first().click();

    const annual = page.locator(".home-year-card");
    await expect(annual).toBeVisible();
    const currentYear = Number(await annual.getAttribute("data-year"));
    const yearDays = (year) => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
    const more = page.getByRole("button", { name: "更多月历操作" });
    const originalMonth = await page.locator(".home-calendar-month-switcher h2").textContent();
    await expect(more.locator("svg.lucide-ellipsis")).toHaveCount(1);
    await expect(annual.locator(".home-year-header strong svg")).toHaveCount(1);
    await page.getByRole("button", { name: "上个月", exact: true }).click();
    await expect(page.locator(".home-calendar-month-switcher h2")).not.toHaveText(originalMonth);
    await more.click();
    await expect(page.getByRole("menuitem", { name: "回到本月" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await page.getByRole("menuitem", { name: "回到本月" }).click();
    await expect(page.locator(".home-calendar-month-switcher h2")).toHaveText(originalMonth);
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await page.locator(".home-experience-header h1").click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".home-year-months > span")).toHaveCount(12);
    await expect(page.locator(".home-year-weekdays > span")).toHaveCount(7);
    await expect(page.locator(`.home-year-day[data-date^="${currentYear}-"]`)).toHaveCount(yearDays(currentYear));
    await expect(annual).toHaveAttribute("data-week-count", /^(53|54)$/);

    const geometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame");
      const screen = document.querySelector(".home-calendar-screen");
      const annualCard = document.querySelector(".home-year-card");
      const heatmap = document.querySelector(".home-year-weeks");
      const dock = document.querySelector(".bottom-nav");
      const months = [...document.querySelectorAll(".home-year-months > span")];
      const weekdays = [...document.querySelectorAll(".home-year-weekdays > span")];
      const cells = [...document.querySelectorAll(".home-year-day:not(.is-outside)")];
      const rect = (element) => {
        const box = element?.getBoundingClientRect();
        return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null;
      };
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
        screenOverflow: screen ? screen.scrollWidth - screen.clientWidth : null,
        card: rect(annualCard),
        heatmap: rect(heatmap),
        dock: rect(dock),
        monthRects: months.map(rect),
        weekdayRects: weekdays.map(rect),
        cellRects: cells.slice(0, 16).map(rect),
        summary: [...document.querySelectorAll('.home-calendar-overview > div')].map((card) => ({
          card: rect(card),
          label: rect(card.querySelector(':scope > span')),
          value: rect(card.querySelector('strong')),
          icon: rect(card.querySelector('svg')),
          labelFont: parseFloat(getComputedStyle(card.querySelector(':scope > span')).fontSize),
          valueFont: parseFloat(getComputedStyle(card.querySelector('[data-animated-number]') ?? card.querySelector('strong')).fontSize),
        })),
      };
    });
    for (const item of geometry.summary) {
      if (item.labelFont !== 14 || item.valueFont !== 16 || item.icon.width !== 22) throw new Error(`${viewport.name}: summary size differs from the compact single-line design`);
      const center = (rect) => (rect.top + rect.bottom) / 2;
      if (Math.abs(center(item.label) - center(item.value)) > 1 || item.icon.right + 4 > item.label.left || item.label.right + 4 > item.value.left || item.value.right > item.card.right - 7) throw new Error(`${viewport.name}: summary must fit on one row without overlap`);
    }
    if (geometry.documentOverflow > 1 || geometry.frameOverflow > 1 || geometry.screenOverflow > 1) throw new Error(`${viewport.name}: annual calendar overflows horizontally ${JSON.stringify(geometry)}`);
    if (!geometry.card || !geometry.heatmap || !geometry.dock || geometry.card.left < -1 || geometry.card.right > viewport.width + 1) throw new Error(`${viewport.name}: annual card escaped the phone ${JSON.stringify(geometry)}`);
    if (geometry.card.bottom > geometry.dock.top - 5) throw new Error(`${viewport.name}: annual card is hidden behind the bottom navigation ${JSON.stringify(geometry)}`);
    if (geometry.cellRects.some((cell) => !cell || cell.width < 3.5 || Math.abs(cell.width - cell.height) > 1)) throw new Error(`${viewport.name}: annual cells are not readable squares ${JSON.stringify(geometry.cellRects)}`);
    if (geometry.monthRects.some((month) => !month || month.left < geometry.heatmap.left - 1 || month.right > geometry.heatmap.right + 22)) throw new Error(`${viewport.name}: month labels escaped the annual grid ${JSON.stringify(geometry.monthRects)}`);
    if (geometry.weekdayRects.some((weekday) => !weekday || weekday.top < geometry.heatmap.top - 1 || weekday.bottom > geometry.heatmap.bottom + 1)) throw new Error(`${viewport.name}: weekday labels do not align with all seven rows ${JSON.stringify(geometry.weekdayRects)}`);

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-calendar-year.png`) });
    // Layout-only boundary fixtures; never create or persist user records.
    for (const locale of ["zh", "en"]) {
      await page.evaluate((language) => { document.documentElement.lang = language; }, locale);
      for (const values of [["31", "100"], ["0", "--"]]) {
        const rows = await page.locator('.home-calendar-overview > div').evaluateAll((cards, { language, numbers }) => cards.map((card, index) => {
          const label = card.querySelector(':scope > span');
          label.textContent = language === "zh" ? ["本月记录", "平均节律"][index] : ["Recorded", "Avg. rhythm"][index];
          const value = card.querySelector('strong');
          value.textContent = numbers[index];
          const unit = document.createElement('small');
          unit.textContent = language === "zh" ? [" 天", " 分"][index] : [" days", " pts"][index];
          value.append(unit);
          const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, center: (r.top + r.bottom) / 2 }; };
          return { card: rect(card), label: rect(label), value: rect(value), clipped: label.scrollWidth > label.clientWidth + 1 };
        }), { language: locale, numbers: values });
        if (rows.some((row) => row.clipped || row.label.right + 3 > row.value.left || row.value.right > row.card.right - 6 || Math.abs(row.label.center - row.value.center) > 1)) throw new Error(`${viewport.name}/${locale}: single-row boundary values overlap ${JSON.stringify(rows)}`);
      }
    }
    await page.evaluate(() => { document.documentElement.lang = "zh-CN"; });
    await page.getByRole("button", { name: "上一年" }).click();
    await expect(annual).toHaveAttribute("data-year", String(currentYear - 1));
    await expect(page.locator(`.home-year-day[data-date^="${currentYear - 1}-"]`)).toHaveCount(yearDays(currentYear - 1));
    await page.getByRole("button", { name: "下一年" }).click();
    await expect(annual).toHaveAttribute("data-year", String(currentYear));
    report.push({ viewport: viewport.name, ...geometry, consoleErrors: errors });
    if (errors.length) throw new Error(`${viewport.name}: browser errors ${errors.join(" | ")}`);
    await context.close();
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Calendar annual heatmap visual verification passed at ${viewports.length} phone viewports.`);
} finally {
  await browser.close();
  await server.close();
}
