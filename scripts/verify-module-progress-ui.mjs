import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-module-progress-v126-20260908";
const port = 5198;
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

const rectanglesOverlap = (a, b, gap = 0) => !(
  a.right + gap <= b.left
  || b.right + gap <= a.left
  || a.bottom + gap <= b.top
  || b.bottom + gap <= a.top
);

async function inspectRecordHub(page, viewportName, stateName) {
  const geometry = await page.evaluate(() => {
    const toRect = (rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const textRect = (element) => {
      const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!textNode) return toRect(element.getBoundingClientRect());
      const range = document.createRange();
      range.selectNodeContents(textNode);
      return toRect(range.getBoundingClientRect());
    };
    const cards = [...document.querySelectorAll(".record-module-entry")].map((card) => {
      const header = card.querySelector(".record-module-header");
      const title = header?.querySelector("strong");
      const icon = card.querySelector(".record-module-icon");
      const points = card.querySelector(".record-module-points");
      const arrow = card.querySelector(".record-module-arrow");
      const lines = [...card.querySelectorAll(".record-module-points > span")].map((line) => {
        const style = getComputedStyle(line);
        return {
          text: line.textContent?.trim() ?? "",
          rect: toRect(line.getBoundingClientRect()),
          textRect: textRect(line),
          clientWidth: line.clientWidth,
          scrollWidth: line.scrollWidth,
          clientHeight: line.clientHeight,
          scrollHeight: line.scrollHeight,
          visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0,
        };
      });
      return {
        module: card.getAttribute("data-record-module"),
        state: card.getAttribute("data-record-state"),
        summarySource: card.getAttribute("data-summary-source"),
        rect: toRect(card.getBoundingClientRect()),
        header: header ? toRect(header.getBoundingClientRect()) : null,
        title: title ? { rect: toRect(title.getBoundingClientRect()), textRect: textRect(title) } : null,
        icon: icon ? toRect(icon.getBoundingClientRect()) : null,
        points: points ? {
          rect: toRect(points.getBoundingClientRect()),
          clientHeight: points.clientHeight,
          scrollHeight: points.scrollHeight,
        } : null,
        arrow: arrow ? toRect(arrow.getBoundingClientRect()) : null,
        lines,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
      };
    });
    const frame = document.querySelector(".phone-frame");
    const hub = document.querySelector(".record-hub");
    const date = document.querySelector(".record-hub-date");
    const grid = document.querySelector(".record-module-grid");
    const nav = document.querySelector(".bottom-nav");
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      frameOverflow: frame ? frame.scrollWidth - frame.clientWidth : null,
      frame: frame ? toRect(frame.getBoundingClientRect()) : null,
      hub: hub ? toRect(hub.getBoundingClientRect()) : null,
      date: date ? toRect(date.getBoundingClientRect()) : null,
      grid: grid ? toRect(grid.getBoundingClientRect()) : null,
      nav: nav ? toRect(nav.getBoundingClientRect()) : null,
      cards,
    };
  });

  const fail = (message, evidence = geometry) => {
    throw new Error(`${viewportName} ${stateName}: ${message} ${JSON.stringify(evidence)}`);
  };
  if (!geometry.frame || !geometry.hub || !geometry.date || !geometry.grid || !geometry.nav) fail("missing a required layout region");
  if (geometry.cards.length !== 6) fail(`expected 6 cards, found ${geometry.cards.length}`);
  if (geometry.documentOverflow > 1 || geometry.frameOverflow > 1) fail("horizontal overflow", { documentOverflow: geometry.documentOverflow, frameOverflow: geometry.frameOverflow });
  if (rectanglesOverlap(geometry.date, geometry.grid, 4)) fail("date selector intersects the card grid", { date: geometry.date, grid: geometry.grid });
  if (rectanglesOverlap(geometry.grid, geometry.nav, 8)) fail("card grid does not preserve an 8px safety gap above navigation", { grid: geometry.grid, nav: geometry.nav });
  if (geometry.grid.left < geometry.hub.left - 1 || geometry.grid.right > geometry.hub.right + 1) fail("card grid escapes its hub horizontally", { hub: geometry.hub, grid: geometry.grid });

  for (let index = 0; index < geometry.cards.length; index += 1) {
    const card = geometry.cards[index];
    if (!card.header || !card.title || !card.icon || !card.points || !card.arrow) fail("card is missing an inspected child", card);
    if (card.lines.length !== 4) fail(`card ${card.module} must contain exactly four lines`, card);
    if (card.scrollHeight > card.clientHeight + 1 || card.points.scrollHeight > card.points.clientHeight + 1) fail(`card ${card.module} clips vertical content`, card);
    if (rectanglesOverlap(card.title.textRect, card.icon, 4)) fail(`card ${card.module} title intersects its icon`, card);
    for (const child of [card.header, card.icon, card.points, card.arrow]) {
      if (child.left < card.rect.left - 1 || child.right > card.rect.right + 1 || child.top < card.rect.top - 1 || child.bottom > card.rect.bottom + 1) {
        fail(`card ${card.module} has content outside its boundary`, card);
      }
    }
    for (const line of card.lines) {
      if (!line.visible || line.rect.height < 1 || line.textRect.height < 1) fail(`card ${card.module} has a hidden summary line`, { card, line });
      if (line.scrollWidth > line.clientWidth + 1 || line.scrollHeight > line.clientHeight + 1) fail(`card ${card.module} truncates summary text`, { card, line });
      if (line.rect.left < card.points.rect.left - 1 || line.rect.right > card.points.rect.right + 1 || line.rect.top < card.points.rect.top - 1 || line.rect.bottom > card.points.rect.bottom + 1) {
        fail(`card ${card.module} summary line escapes its list`, { card, line });
      }
      if (rectanglesOverlap(line.textRect, card.arrow, 4)) fail(`card ${card.module} summary text intersects its arrow`, { card, line });
      if (/^[\p{Script=Han}]+$/u.test(line.text) && [...line.text].length !== 7) fail(`card ${card.module} compact Chinese line is not exactly seven characters`, { card, line });
    }
    for (let otherIndex = index + 1; otherIndex < geometry.cards.length; otherIndex += 1) {
      if (rectanglesOverlap(card.rect, geometry.cards[otherIndex].rect, 3)) {
        fail(`cards ${card.module} and ${geometry.cards[otherIndex].module} do not preserve a 3px gap`, { card: card.rect, other: geometry.cards[otherIndex].rect });
      }
    }
    const usedBottom = Math.max(card.points.rect.bottom, card.arrow.bottom);
    const bottomWhitespace = card.rect.bottom - usedBottom;
    if (bottomWhitespace > Math.max(18, card.rect.height * 0.16)) fail(`card ${card.module} has excessive unused space below its content`, { card: card.rect, usedBottom, bottomWhitespace });
  }
  return geometry;
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      timezoneId: "Asia/Shanghai",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    });
    await context.addInitScript(() => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 2, answers: {}, source: "local" }));
      localStorage.setItem("nava.review.demo.records.v1", JSON.stringify({
        sleeps: {},
        exercises: {},
        nutritions: {
          [date]: {
            id: `partial-diet-${date}`,
            record_date: date,
            total_calories: 360,
            breakfast_items: [{ name: "燕麦", calories: 360, amount: "1 碗" }],
            lunch_items: [],
            dinner_items: [],
            pantry_items: [],
            protein_grams: 16,
            carbohydrate_grams: 52,
            fat_grams: 9,
            hydration_ml: 300,
            health_rating: 4,
            ai_feedback: null,
          },
        },
        focus: {},
        faces: {},
      }));
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true });
    });

    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${baseUrl}?demo=1#tab=today`, { waitUntil: "networkidle" });
    const launch = page.locator(".launch-sequence");
    if (await launch.isVisible().catch(() => false)) await launch.click();
    await expect(page.locator(".option-two-home")).toBeVisible();
    const reward = page.locator(".reward-celebration-layer");
    if (await reward.isVisible().catch(() => false)) await reward.locator("button").click();

    const home = page.locator(".option-two-home");
    const homeBox = await home.boundingBox();
    if (!homeBox) throw new Error(`${viewport.name}: Today screen has no swipe bounds.`);
    const x = homeBox.x + homeBox.width * .5;
    const startY = homeBox.y + homeBox.height * .78;
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x + 4, startY - Math.max(150, homeBox.height / 5), { steps: 8 });
    await page.mouse.up();
    await expect(home).toHaveAttribute("data-health-menu-open", "true");
    await page.waitForTimeout(1300);

    const diet = page.locator(".option-two-health-entry--diet");
    await expect(diet).toHaveAttribute("data-module-progress", "0.25");
    await expect(diet).toHaveAttribute("data-module-state", "partial");
    const homeGeometry = await page.evaluate(() => {
      const frame = document.querySelector(".phone-frame")?.getBoundingClientRect();
      const entries = [...document.querySelectorAll(".option-two-health-entry")].map((entry) => {
        const button = entry.getBoundingClientRect();
        const ringNode = entry.querySelector(".module-progress-ring");
        const ringValue = entry.querySelector(".module-progress-ring__value");
        const ringRect = ringNode?.getBoundingClientRect();
        const icon = entry.querySelector(".option-two-health-icon")?.getBoundingClientRect();
        const completeIcon = entry.querySelector(".option-two-health-complete-icon");
        return {
          state: entry.getAttribute("data-module-state"),
          progress: entry.getAttribute("data-module-progress"),
          button: { left: button.left, right: button.right, top: button.top, bottom: button.bottom, width: button.width, height: button.height },
          ringDisplay: ringNode ? getComputedStyle(ringNode).display : null,
          ringOpacity: ringNode ? Number(getComputedStyle(ringNode).opacity) : null,
          ringDashOffset: ringValue ? Number.parseFloat(getComputedStyle(ringValue).strokeDashoffset) : null,
          ringBox: ringRect ? { left: ringRect.left, right: ringRect.right, top: ringRect.top, bottom: ringRect.bottom, width: ringRect.width, height: ringRect.height } : null,
          completeOpacity: completeIcon ? Number(getComputedStyle(completeIcon).opacity) : null,
          icon: icon ? { left: icon.left, right: icon.right, top: icon.top, bottom: icon.bottom, width: icon.width, height: icon.height } : null,
        };
      });
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        frame: frame ? { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom } : null,
        entries,
      };
    });
    if (homeGeometry.overflow > 1 || !homeGeometry.frame || homeGeometry.entries.length !== 6) {
      throw new Error(`${viewport.name}: invalid Today progress layout ${JSON.stringify(homeGeometry)}`);
    }
    for (const entry of homeGeometry.entries) {
      const expectsRing = entry.state === "partial" || entry.state === "complete";
      if (entry.ringDisplay === "none"
        || (expectsRing && (entry.ringOpacity ?? 0) < .99)
        || (!expectsRing && (entry.ringOpacity ?? 0) > .01)
        || (entry.state === "partial" && Math.abs((entry.ringDashOffset ?? 100) - (100 - Number(entry.progress) * 100)) > 1)
        || (entry.state === "complete" && ((entry.ringDashOffset ?? 100) > 1 || (entry.completeOpacity ?? 0) < .99))
        || (entry.state !== "complete" && (entry.completeOpacity ?? 0) > .01)
        || !entry.ringBox
        || entry.ringBox.width <= entry.button.width
        || entry.ringBox.height <= entry.button.height
        || !entry.icon
        || Math.abs((entry.icon.left + entry.icon.right - entry.button.left - entry.button.right) / 2) > 1
        || Math.abs((entry.icon.top + entry.icon.bottom - entry.button.top - entry.button.bottom) / 2) > 1
        || entry.button.left < homeGeometry.frame.left - 1
        || entry.button.right > homeGeometry.frame.right + 1
        || entry.button.top < homeGeometry.frame.top - 1
        || entry.button.bottom > homeGeometry.frame.bottom + 1) {
        throw new Error(`${viewport.name}: a Today progress ring, completion check, or module icon is misaligned ${JSON.stringify(entry)}`);
      }
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-today-progress.png`) });

    await page.locator('[data-tab="record"]').click();
    const hubDiet = page.locator('[data-record-module="diet"]');
    await expect(hubDiet).toHaveAttribute("data-record-state", "partial");
    await expect(hubDiet).toHaveAttribute("data-module-progress", "0.25");
    await expect(page.locator(".record-module-entry .module-progress-ring")).toHaveCount(6);
    await page.waitForTimeout(620);
    const populatedHubGeometry = await inspectRecordHub(page, viewport.name, "populated record hub");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-record-progress.png`) });

    const dateInput = page.locator(".record-hub-date input[type=date]");
    await page.evaluate(() => localStorage.setItem("nava.review.demo.empty-snapshot-date.v1", "2020-01-01"));
    await dateInput.fill("2020-01-01");
    await dateInput.dispatchEvent("change");
    await expect(page.locator('.record-module-entry[data-summary-source="module-dictionary"]')).toHaveCount(6);
    await page.waitForTimeout(220);
    const emptyHubGeometry = await inspectRecordHub(page, viewport.name, "empty record hub");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-record-empty.png`) });

    const browserLocalDate = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    });
    await dateInput.fill(browserLocalDate);
    await dateInput.dispatchEvent("change");
    await expect(hubDiet).toHaveAttribute("data-record-state", "partial");

    await hubDiet.click();
    await expect(page.locator('[data-record-detail="diet"] .record-editor-stack > form:not([hidden])')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toContain("view=editor");
    await page.waitForTimeout(620);
    const detailOverflow = await page.locator(".phone-frame").evaluate((frame) => frame.scrollWidth - frame.clientWidth);
    if (detailOverflow > 1) throw new Error(`${viewport.name}: partial diet editor has ${detailOverflow}px horizontal overflow.`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-partial-diet-editor.png`) });

    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    report.push({ viewport, homeGeometry, populatedHubGeometry, emptyHubGeometry, detailOverflow });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Module progress visual verification passed at ${viewports.length} portrait viewports.`);
