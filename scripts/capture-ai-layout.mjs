import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const outputDir = process.env.SCREENSHOT_DIR || path.join(root, "artifacts", "ai-layout-qa");
const port = Number(process.env.PORT || 5194);
const externalBaseUrl = process.env.BASE_URL?.replace(/\/$/, "") || null;
const viewports = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-standard", width: 390, height: 844 },
  { name: "iphone-14-pro-max", width: 430, height: 932 },
];

async function openAi(page, baseUrl) {
  await page.goto(`${baseUrl}?demo=1`, { waitUntil: "networkidle" });
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) {
    await launch.click();
    await launch.waitFor({ state: "hidden" });
  }

  const username = page.locator('input[autocomplete="username"]');
  const aiTab = page.locator('[data-tab="ai"]');
  if (!(await aiTab.isVisible().catch(() => false))) {
    await username.waitFor({ state: "visible" });
    await username.fill("13800138000");
    await page.locator('input[autocomplete="current-password"]').fill("12345678");
    await page.locator(".auth-submit").click();
  }

  await aiTab.waitFor({ state: "visible" });
  await aiTab.click();
  await page.locator(".chat-composer").waitFor({ state: "visible" });
  await page.waitForTimeout(450);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const server = externalBaseUrl ? null : await createServer({
    root,
    server: { host: "127.0.0.1", port },
    logLevel: "silent",
  });

  try {
    await server?.listen();
    const baseUrl = externalBaseUrl ?? server?.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
    const browser = await chromium.launch();
    const report = [];

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      });
      const page = await context.newPage();
      await openAi(page, baseUrl);

      const metrics = await page.evaluate(() => {
        const rect = (selector) => {
          const bounds = document.querySelector(selector)?.getBoundingClientRect();
          return bounds ? {
            top: Number(bounds.top.toFixed(2)),
            right: Number(bounds.right.toFixed(2)),
            bottom: Number(bounds.bottom.toFixed(2)),
            left: Number(bounds.left.toFixed(2)),
            width: Number(bounds.width.toFixed(2)),
            height: Number(bounds.height.toFixed(2)),
          } : null;
        };
        const composer = rect(".chat-composer");
        const navigation = rect(".bottom-nav");
        const list = rect(".chat-list");
        return {
          composer,
          navigation,
          list,
          composerToNavigationGap: composer && navigation ? Number((navigation.top - composer.bottom).toFixed(2)) : null,
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      if (!metrics.composer || !metrics.navigation || !metrics.list) {
        throw new Error(`${viewport.name}: AI layout elements are missing`);
      }
      if (metrics.composerToNavigationGap < 0 || metrics.composerToNavigationGap > 28) {
        throw new Error(`${viewport.name}: composer is not pinned above navigation: ${JSON.stringify(metrics)}`);
      }
      if (metrics.list.bottom > metrics.composer.top + 1) {
        throw new Error(`${viewport.name}: message list overlaps composer: ${JSON.stringify(metrics)}`);
      }
      if (metrics.horizontalOverflow > 0) {
        throw new Error(`${viewport.name}: horizontal overflow detected: ${JSON.stringify(metrics)}`);
      }

      await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: false });
      report.push({ viewport, ...metrics });
      await context.close();
    }

    await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await browser.close();
    console.log(`AI layout screenshots saved to ${outputDir}`);
  } finally {
    await server?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
