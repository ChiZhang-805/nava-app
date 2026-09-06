import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/calibrate-home-scene.mjs <input.png> <output.png>");
}

const source = await fs.readFile(inputPath);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const output = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");

    const xSegments = [
      [0, 313, 0, 275],
      [313, 622, 275, 622],
      [622, 852, 622, 852],
    ];
    const ySegments = [
      [0, 287, 0, 317],
      [287, 491, 317, 565],
      [491, 1129, 565, 1238],
      [1129, 1846, 1238, 1846],
    ];

    for (const [sourceY1, sourceY2, targetY1, targetY2] of ySegments) {
      for (const [sourceX1, sourceX2, targetX1, targetX2] of xSegments) {
        context.drawImage(
          image,
          sourceX1,
          sourceY1,
          sourceX2 - sourceX1,
          sourceY2 - sourceY1,
          targetX1,
          targetY1,
          targetX2 - targetX1,
          targetY2 - targetY1,
        );
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, source.toString("base64"));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.from(output, "base64"));
} finally {
  await browser.close();
}
