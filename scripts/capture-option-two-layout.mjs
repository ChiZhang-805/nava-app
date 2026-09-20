import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const baseUrl = process.env.BASE_URL || "http://192.168.1.64:5207";
const outputDir = path.join(process.cwd(), "artifacts", "option-two-responsive-qa");
const viewports = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-15", width: 390, height: 844 },
  { name: "figma-base", width: 402, height: 874 },
  { name: "iphone-14-pro-max", width: 430, height: 932 },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ locale: "zh-CN",
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const launchSequence = page.locator(".launch-sequence");
  if (await launchSequence.count()) {
    await launchSequence.click();
  }
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await expect(page.locator(".option-two-home")).toBeVisible();
  await expect(page.locator(".option-two-collapse-trigger")).toHaveCount(0);
  await page.locator(".option-two-life-stage img").waitFor({ state: "attached" });
  await page.locator(".option-two-home img, .bottom-nav img").evaluateAll(async (images) => {
    await Promise.all(images.map(async (image) => {
      if (!image.complete) await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      });
      await image.decode?.();
    }));
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-collapsed.png`) });
  await page.locator(".option-two-side-actions button").first().click();
  await expect(page.locator(".option-two-home")).toHaveClass(/is-expanded/);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-expanded.png`) });

  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const health = [...document.querySelectorAll(".option-two-health-entry")].map(rect);
    const healthGlyphs = [...document.querySelectorAll(".option-two-health-entry .option-two-health-icon")].map(rect);
    const nav = [...document.querySelectorAll(".phone-frame--option2 .nav-button")].map(rect);
    const navGlyphs = [...document.querySelectorAll(".phone-frame--option2 .nav-button")]
      .map((button) => button.querySelector("img"))
      .map(rect);
    return { health, healthGlyphs, nav, navGlyphs };
  });

  if (geometry.health.length !== 6 || geometry.nav.length !== 5) {
    throw new Error(`${viewport.name}: expected six health entries and five navigation entries`);
  }
  for (const item of geometry.health) {
    if (item.x < -1 || item.right > viewport.width + 1 || item.y < -1 || item.bottom > viewport.height + 1) {
      throw new Error(`${viewport.name}: a health entry is outside the viewport`);
    }
  }
  const ordinary = geometry.nav.filter((_, index) => index !== 2);
  const ordinaryTopSpread = Math.max(...ordinary.map((item) => item.y)) - Math.min(...ordinary.map((item) => item.y));
  const ordinarySizeSpread = Math.max(...ordinary.map((item) => item.width)) - Math.min(...ordinary.map((item) => item.width));
  if (ordinaryTopSpread > 1 || ordinarySizeSpread > 1) {
    throw new Error(`${viewport.name}: ordinary navigation circles are not aligned`);
  }
  if (!(geometry.nav[2].width > ordinary[0].width && geometry.nav[2].y < ordinary[0].y)) {
    throw new Error(`${viewport.name}: center life button is not larger and raised`);
  }

  const assertSameSize = (name, items, tolerance = 1) => {
    const widthSpread = Math.max(...items.map((item) => item.width)) - Math.min(...items.map((item) => item.width));
    const heightSpread = Math.max(...items.map((item) => item.height)) - Math.min(...items.map((item) => item.height));
    if (widthSpread > tolerance || heightSpread > tolerance) {
      throw new Error(`${viewport.name}: ${name} do not use one shared size: ${JSON.stringify(items)}`);
    }
  };
  const assertCentered = (name, containers, glyphs, tolerance = 1) => {
    containers.forEach((container, index) => {
      const glyph = glyphs[index];
      const containerCenter = [container.x + container.width / 2, container.y + container.height / 2];
      const glyphCenter = [glyph.x + glyph.width / 2, glyph.y + glyph.height / 2];
      if (Math.abs(containerCenter[0] - glyphCenter[0]) > tolerance || Math.abs(containerCenter[1] - glyphCenter[1]) > tolerance) {
        throw new Error(`${viewport.name}: ${name} ${index + 1} is not centered in its button`);
      }
    });
  };
  assertSameSize("health buttons", geometry.health);
  assertSameSize("health glyphs", geometry.healthGlyphs);
  assertCentered("health glyph", geometry.health, geometry.healthGlyphs);
  const ordinaryButtons = geometry.nav.filter((_, index) => index !== 2);
  const ordinaryGlyphs = geometry.navGlyphs.filter((_, index) => index !== 2);
  assertSameSize("ordinary navigation glyphs", ordinaryGlyphs);
  assertCentered("ordinary navigation glyph", ordinaryButtons, ordinaryGlyphs);
  const mascotCenter = geometry.navGlyphs[2].x + geometry.navGlyphs[2].width / 2;
  const mascotButtonCenter = geometry.nav[2].x + geometry.nav[2].width / 2;
  const expectedOpticalShift = geometry.nav[2].width * 0.14;
  if (Math.abs((mascotCenter - mascotButtonCenter) - expectedOpticalShift) > 1) {
    throw new Error(`${viewport.name}: mascot optical centering offset is incorrect`);
  }

  const expectedHealthCenters = [
    [48 / 402, 737 / 874],
    [93 / 402, 664 / 874],
    [163.5 / 402, 622.5 / 874],
    [238 / 402, 623 / 874],
    [307 / 402, 661 / 874],
    [349 / 402, 737 / 874],
  ];
  const expectedNavCenters = [
    [52.5 / 402, 816.5 / 874],
    [113.5 / 402, 816.5 / 874],
    [201 / 402, 803 / 874],
    [288.5 / 402, 816.5 / 874],
    [349.5 / 402, 816.5 / 874],
  ];
  const centerRatio = (item) => [
    (item.x + item.width / 2) / viewport.width,
    (item.y + item.height / 2) / viewport.height,
  ];
  const assertCenters = (name, actual, expected, tolerance = 0.012) => {
    actual.forEach((item, index) => {
      const center = centerRatio(item);
      const [expectedX, expectedY] = expected[index];
      if (Math.abs(center[0] - expectedX) > tolerance || Math.abs(center[1] - expectedY) > tolerance) {
        throw new Error(`${viewport.name}: ${name} ${index + 1} center does not match the Figma ratio`);
      }
    });
  };
  assertCenters("health entry", geometry.health, expectedHealthCenters);
  assertCenters("navigation entry", geometry.nav, expectedNavCenters);

  report.push({ viewport, ...geometry, ordinaryTopSpread, ordinarySizeSpread });
  await context.close();
}

await browser.close();
await writeFile(path.join(outputDir, "geometry.json"), JSON.stringify(report, null, 2));
console.log(`Option two responsive QA passed for ${viewports.length} portrait viewports.`);
