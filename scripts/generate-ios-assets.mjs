import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = process.env.NAVA_ASSET_BASE_URL ?? "http://127.0.0.1:5173";
const iconPath = path.join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");
const splashDirectory = path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
const splashPath = path.join(splashDirectory, "splash-2732x2732.png");

function pngDimensions(buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) throw new Error("Generated asset is not a PNG file.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function readWordmarkPixels(page) {
  const png = await page.locator(".auth-brand .nava-wordmark__text").screenshot({ animations: "disabled" });
  return page.evaluate(async ({ base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not inspect generated wordmark pixels.");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let right = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        if (alpha > 160 && red < 45 && green < 65 && blue < 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }

    if (right < left) throw new Error("The NAVA glyphs were not found in the generated asset.");
    const leftSafety = left;
    const rightSafety = canvas.width - 1 - right;
    return {
      centerDelta: Number((((left + right) / 2) - ((canvas.width - 1) / 2)).toFixed(2)),
      leftSafety,
      rightSafety,
      safetyDelta: leftSafety - rightSafety,
      width: canvas.width,
    };
  }, { base64: png.toString("base64") });
}

async function renderAsset(browser, { cssSize, fontSize, outputPath, expectedSize, verticalOffset = "0" }) {
  const context = await browser.newContext({
    viewport: { width: cssSize, height: cssSize },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?bgTime=11.5&bgSeed=8.1`, { waitUntil: "networkidle" });
  await page.locator(".auth-screen").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(".auth-brand .nava-wordmark__text").waitFor({ state: "visible" });
  await page.addStyleTag({ content: `
    html, body, #root, .nava-app-stage {
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      overflow: hidden !important;
    }
    .auth-screen {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      max-width: none !important;
      padding: 0 !important;
      display: grid !important;
      grid-template: 1fr / 1fr !important;
      place-items: center !important;
      overflow: hidden !important;
    }
    .auth-locale, .auth-form-region { display: none !important; }
    .auth-brand {
      grid-area: 1 / 1 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
      transform: translateY(${verticalOffset}) !important;
      animation: none !important;
    }
    .auth-brand .nava-wordmark {
      --wordmark-size: ${fontSize}px !important;
      width: 100% !important;
      min-width: 0 !important;
      min-height: calc(var(--wordmark-size) * 1.22) !important;
      animation: none !important;
    }
    .nava-wordmark__halo { animation: none !important; opacity: 0.7 !important; }
    .nava-wordmark__text { animation: none !important; }
  ` });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const wordmark = await readWordmarkPixels(page);
  if (Math.abs(wordmark.centerDelta) > 2 || Math.abs(wordmark.safetyDelta) > 5) {
    throw new Error(`NAVA wordmark is not visually centered: ${JSON.stringify(wordmark)}`);
  }
  if (Math.min(wordmark.leftSafety, wordmark.rightSafety) < 12) {
    throw new Error(`NAVA wordmark is too close to a clipping edge: ${JSON.stringify(wordmark)}`);
  }

  await page.screenshot({ path: outputPath, animations: "disabled" });
  await context.close();

  const dimensions = pngDimensions(await readFile(outputPath));
  if (dimensions.width !== expectedSize || dimensions.height !== expectedSize) {
    throw new Error(`Expected ${expectedSize}x${expectedSize}, received ${dimensions.width}x${dimensions.height}.`);
  }
  return { dimensions, wordmark };
}

await mkdir(path.dirname(iconPath), { recursive: true });
await mkdir(splashDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const icon = await renderAsset(browser, {
    cssSize: 512,
    expectedSize: 1024,
    fontSize: 144,
    outputPath: iconPath,
  });
  const splash = await renderAsset(browser, {
    cssSize: 1366,
    expectedSize: 2732,
    fontSize: 230,
    outputPath: splashPath,
    verticalOffset: "-3%",
  });
  await copyFile(splashPath, path.join(splashDirectory, "splash-2732x2732-1.png"));
  await copyFile(splashPath, path.join(splashDirectory, "splash-2732x2732-2.png"));
  console.log(JSON.stringify({ icon, splash }, null, 2));
} finally {
  await browser.close();
}
