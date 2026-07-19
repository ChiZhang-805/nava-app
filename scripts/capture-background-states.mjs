import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", process.env.BG_REVIEW_DIR || "background-state-review");
const baseUrl = process.env.BG_BASE_URL || "http://127.0.0.1:5173";
const seeds = (process.env.BG_SEEDS || "8.1").split(",").map(Number).filter(Number.isFinite);
const times = (process.env.BG_TIMES || "0,6,12,18,24,30").split(",").map(Number).filter(Number.isFinite);

function slug(value) {
  return String(value).replace(".", "-");
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  const metrics = [];

  try {
    for (const seed of seeds) {
      for (const time of times) {
        const context = await browser.newContext({
          viewport: { width: 430, height: 932 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
          reducedMotion: "reduce",
        });
        await context.addInitScript(() => window.sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
        const page = await context.newPage();
        await page.goto(`${baseUrl}/?bgSeed=${seed}&bgTime=${time}`, { waitUntil: "networkidle" });
        const canvas = page.locator(".living-background__canvas[data-ready='true']");
        await canvas.waitFor();

        const filename = `seed-${slug(seed)}-time-${String(time).padStart(2, "0")}.png`;
        await page.screenshot({ path: path.join(outputDir, filename) });
        await canvas.screenshot({ path: path.join(outputDir, `background-${filename}`) });
        metrics.push(
          await canvas.evaluate(
            (element, state) => {
              const gl = element.getContext("webgl");
              const pixels = new Uint8Array(element.width * element.height * 4);
              gl?.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
              const luminance = [];
              const saturation = [];
              let blueMinusRed = 0;
              let darkPixels = 0;
              let lightPixels = 0;
              let saturationSum = 0;
              let veryLightPixels = 0;
              let sum = 0;
              for (let index = 0; index < pixels.length; index += 4) {
                const red = pixels[index];
                const green = pixels[index + 1];
                const blue = pixels[index + 2];
                const value = red * 0.2126 + green * 0.7152 + blue * 0.0722;
                const maximum = Math.max(red, green, blue);
                const minimum = Math.min(red, green, blue);
                const pixelSaturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
                luminance.push(value);
                saturation.push(pixelSaturation);
                blueMinusRed += blue - red;
                saturationSum += pixelSaturation;
                sum += value;
                if (value < 90) darkPixels += 1;
                if (value > 180) lightPixels += 1;
                if (value > 210) veryLightPixels += 1;
              }
              luminance.sort((left, right) => left - right);
              saturation.sort((left, right) => left - right);
              const percentile = (values, ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
              const pixelCount = luminance.length;
              return {
                ...state,
                ready: element.dataset.ready === "true",
                cssSize: [element.clientWidth, element.clientHeight],
                bufferSize: [element.width, element.height],
                contextLost: gl?.isContextLost() ?? null,
                luminance: {
                  darkFraction: darkPixels / pixelCount,
                  lightFraction: lightPixels / pixelCount,
                  mean: sum / pixelCount,
                  minimum: luminance[0],
                  p01: percentile(luminance, 0.01),
                  p05: percentile(luminance, 0.05),
                  p10: percentile(luminance, 0.1),
                  p50: percentile(luminance, 0.5),
                  p90: percentile(luminance, 0.9),
                  veryLightFraction: veryLightPixels / pixelCount,
                },
                color: {
                  blueMinusRed: blueMinusRed / pixelCount,
                  meanSaturation: saturationSum / pixelCount,
                  saturationP50: percentile(saturation, 0.5),
                  saturationP90: percentile(saturation, 0.9),
                },
                webgl: Boolean(gl),
              };
            },
            { seed, time },
          ),
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  await writeFile(path.join(outputDir, "metrics.json"), JSON.stringify({ seeds, times, metrics }, null, 2));
  console.log(`Background state review saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
