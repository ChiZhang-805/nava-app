import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/chroma-key-image.mjs <input.png> <output.png>");
}

const input = await fs.readFile(inputPath);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const output = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    const background = [255, 0, 255];
    const keyFloor = 22;
    const keyCeiling = 92;

    for (let index = 0; index < data.length; index += 4) {
      const magentaDominance = Math.min(data[index], data[index + 2]) - data[index + 1];
      const keyAmount = Math.max(0, Math.min(1, (magentaDominance - keyFloor) / (keyCeiling - keyFloor)));
      const alpha = 1 - keyAmount;

      if (alpha <= 0) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
        continue;
      }

      if (alpha < 1) {
        data[index] = Math.max(0, Math.min(255, (data[index] - background[0] * (1 - alpha)) / alpha));
        data[index + 1] = Math.max(0, Math.min(255, (data[index + 1] - background[1] * (1 - alpha)) / alpha));
        data[index + 2] = Math.max(0, Math.min(255, (data[index + 2] - background[2] * (1 - alpha)) / alpha));
      }
      data[index + 3] = Math.round(alpha * 255);
    }

    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, input.toString("base64"));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.from(output, "base64"));
} finally {
  await browser.close();
}
