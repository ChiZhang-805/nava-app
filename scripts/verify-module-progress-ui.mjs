import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
import { inspectRingPaint } from "./module-ring-paint.mjs";
import { inspectHealthExplorer } from "./health-explorer-checks.mjs";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";

const root = process.cwd();
const outputDir = "Q:\\NAVA-Workspace\\NAVA-App\\Build\\TestRuns\\App-Checks\\module-responsive-rings";
const port = 5198;
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  ...IPHONE_PREVIEW_DEVICES.map((device) => ({ name: device.id, width: 1365, height: 1050, device })),
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
    const context = await browser.newContext({ locale: "zh-CN",
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: !viewport.device,
      hasTouch: !viewport.device,
      timezoneId: "Asia/Shanghai",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    });
    await context.addInitScript(() => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
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
    if (viewport.device) await page.locator('.nava-device-selector select').selectOption(viewport.device.id);

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
    const homePaint = await inspectRingPaint(page, '.option-two-health-entry:not([data-module-state="missing"]) .module-progress-ring');
    if (process.argv.includes('--ring-baseline')) {
      await page.screenshot({ path: path.join(outputDir, 'ring-before.png') });
      await page.addStyleTag({ content: '.module-progress-ring circle { vector-effect: none !important; }' });
      const correctedPaint = await inspectRingPaint(page, '.option-two-health-entry:not([data-module-state="missing"]) .module-progress-ring');
      await page.screenshot({ path: path.join(outputDir, 'ring-after-diagnostic.png') });
      console.log(JSON.stringify({ before: homePaint, after: correctedPaint }));
      report.push({ viewport, baseline:homePaint, correctedPaint });
      await context.close();
      break;
    }
    for (const ring of homePaint) {
      if (ring.progress === 1 && ring.coverage < .99) throw new Error(`${viewport.name}: completed ring is not closed: ${JSON.stringify(ring)}`);
      if (ring.progress > 0 && ring.progress < 1 && Math.abs(ring.coverage - ring.progress) > .07) throw new Error(`${viewport.name}: partial ring paint does not match progress: ${JSON.stringify(ring)}`);
    }
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
          ringDashLength: ringValue ? Number.parseFloat(getComputedStyle(ringValue).strokeDasharray) : null,
          ringPathLength: ringValue && "getTotalLength" in ringValue ? ringValue.getTotalLength() : null,
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
      const expectedOffset = (entry.ringPathLength ?? 0) * (1 - Number(entry.progress));
      if (entry.ringDisplay === "none"
        || (expectsRing && (entry.ringOpacity ?? 0) < .99)
        || (!expectsRing && (entry.ringOpacity ?? 0) > .01)
        || (expectsRing && (!entry.ringPathLength || !entry.ringDashLength || entry.ringDashLength < entry.ringPathLength - .5))
        || (entry.state === "partial" && Math.abs((entry.ringDashOffset ?? entry.ringPathLength ?? 0) - expectedOffset) > 1)
        || (entry.state === "complete" && ((entry.ringDashOffset ?? entry.ringPathLength ?? 0) > .5 || (entry.completeOpacity ?? 0) < .99))
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

    // Render the actual component at all progress boundaries. Isolate green
    // stroke pixels from the completed button's green fill for arc measurement.
    const paintStyle = await page.addStyleTag({ content: '.option-two-health-entry::after { opacity: 0 !important; animation: none !important; } .option-two-health-entry .module-progress-ring { opacity: 1 !important; } .option-two-health-entry .module-progress-ring__value { animation: none !important; transition: none !important; }' });
    await page.locator('.option-two-health-entry .module-progress-ring').evaluateAll((rings) => rings.forEach((ring, index) => {
      const progress = [0, .25, .5, .75, 1, 1][index];
      ring.dataset.progress = String(progress);
      ring.style.setProperty('--module-progress-offset', String(2 * Math.PI * 21.5 * (1 - progress)));
      ring.querySelector('.module-progress-ring__value').style.strokeDashoffset = String(2 * Math.PI * 21.5 * (1 - progress));
    }));
    const boundaryPaint = await inspectRingPaint(page, '.option-two-health-entry .module-progress-ring');
    for (const ring of boundaryPaint) {
      if (ring.progress === 1 ? ring.coverage < .99 : Math.abs(ring.coverage - ring.progress) > .07) throw new Error(`${viewport.name}: rendered arc boundary mismatch ${JSON.stringify(ring)}`);
    }
    await paintStyle.evaluate((node) => node.remove());

    await page.locator('[data-tab="record"]').click();
    await expect(page.locator('[data-health-explorer]')).toBeVisible();
    await expect(page.locator('[data-health-category]')).toHaveCount(6);
    const populatedHubGeometry = await inspectHealthExplorer(page);
    await page.locator('.phone-frame').screenshot({ path: path.join(outputDir, `${viewport.name}-record-explorer.png`) });
    const dateInput = page.locator('.health-explorer-toolbar input[type=date]');
    const currentDate = await dateInput.inputValue();
    await page.evaluate(() => localStorage.setItem('nava.review.demo.empty-snapshot-date.v1', '2020-01-01'));
    await dateInput.fill('2020-01-01');
    await dateInput.dispatchEvent('change');
    await expect(page.locator('.health-explorer-card[aria-hidden="false"] .health-explorer-empty')).toBeVisible();
    const emptyHubGeometry = await inspectHealthExplorer(page);
    await page.locator('.phone-frame').screenshot({ path: path.join(outputDir, `${viewport.name}-record-empty.png`) });
    await dateInput.fill(currentDate);
    await dateInput.dispatchEvent('change');
    const hubDiet = page.locator('[data-health-category="diet"]');
    await hubDiet.scrollIntoViewIfNeeded();
    await hubDiet.click();
    await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category', 'diet');
    await page.locator('.health-explorer-record').click();
    await expect(page.locator('.journal-experience iframe')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.journal-loading')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.journal-loading.is-error')).toHaveCount(0);
    const journal = page.frameLocator('.journal-experience iframe');
    await expect(journal.locator('#screen')).toHaveAttribute('data-scene', 'entry');
    await expect(journal.locator('#entry-form')).toHaveAttribute('data-category', 'food');
    await expect.poll(() => new URL(page.url()).hash).toContain("module=diet");
    const detailOverflow = await page.locator(".phone-frame").evaluate((frame) => frame.scrollWidth - frame.clientWidth);
    if (detailOverflow > 1) throw new Error(`${viewport.name}: partial diet editor has ${detailOverflow}px horizontal overflow.`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-partial-diet-editor.png`) });
    const food = journal.locator('#field-foods');
    await food.fill('燕麦、鸡蛋、全麦面包、牛奶和新鲜蔬菜，分量按实际记录。');
    for (const deviceId of viewport.device ? [viewport.device.logicalWidth > 400 ? 'iphone-14' : 'iphone-17-pro-max', viewport.device.id] : [null]) {
      if (deviceId) await page.locator('.nava-device-selector select').selectOption(deviceId);
      await page.waitForTimeout(120);
      const textBounds = await food.evaluate((node) => ({ height: node.offsetHeight, clipped: node.scrollHeight > node.clientHeight + 1, overflow: getComputedStyle(node).overflowY }));
      if (textBounds.height > 180 || (textBounds.clipped && textBounds.overflow !== 'auto')) throw new Error(`Diet text cannot be reached after width change ${JSON.stringify(textBounds)}`);
    }
    const save = journal.locator('#confirm-entry');
    await expect(save).toBeVisible();
    const saveBounds = await save.evaluate((node) => {
      const b = node.getBoundingClientRect(), c = document.getElementById('screen').getBoundingClientRect();
      return { inside: b.left >= c.left && b.right <= c.right && b.top >= c.top && b.bottom <= c.bottom };
    });
    if (!saveBounds.inside) throw new Error(`${viewport.name}: diet action escaped its card`);

    if (errors.length) throw new Error(`${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    report.push({ viewport, homePaint, boundaryPaint, homeGeometry, populatedHubGeometry, emptyHubGeometry, detailOverflow });
    console.log(`${viewport.name}: home rings, chart explorer, empty state and record entry passed`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const diagnostic = process.argv.includes('--ring-baseline');
await writeFile(path.join(outputDir, diagnostic ? 'baseline.json' : 'report.json'), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(diagnostic ? 'Single-viewport ring diagnostic only; not a release acceptance.' : `Module progress visual verification passed at ${viewports.length} portrait viewports.`);
