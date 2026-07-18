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
              return {
                ...state,
                ready: element.dataset.ready === "true",
                cssSize: [element.clientWidth, element.clientHeight],
                bufferSize: [element.width, element.height],
                contextLost: gl?.isContextLost() ?? null,
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
