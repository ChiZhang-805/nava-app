import { mkdir } from "node:fs/promises";
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

    const tabs = [
      ["record", "03-record-top.png"],
      ["ai", "04-ai.png"],
      ["trends", "05-trends.png"],
      ["profile", "06-profile-top.png"],
    ];

    for (const [tab, filename] of tabs) {
      await page.locator(`[data-tab="${tab}"]`).tap();
      await page.waitForTimeout(500);
      await scrollContent(0);
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
      if (tab === "profile") {
        await scrollContent(650);
        await shot("06-profile-mid.png");
        await scrollContent(9999);
        await shot("06-profile-bottom.png");
      }
    }

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
