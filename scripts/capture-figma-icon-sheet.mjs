import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const iconDir = path.resolve("src/assets/figma/option-two-icons");
const files = (await readdir(iconDir)).sort();
const cards = await Promise.all(files.map(async (file) => {
  const mime = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const data = (await readFile(path.join(iconDir, file))).toString("base64");
  return `<figure><img src="data:${mime};base64,${data}" alt=""><figcaption>${file}</figcaption></figure>`;
}));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "zh-CN", viewport: { width: 900, height: 600 } });
await page.setContent(`
  <style>
    body { margin: 0; padding: 24px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 18px; background: #d5eef8; font-family: sans-serif; }
    figure { height: 210px; margin: 0; display: grid; place-items: center; border-radius: 16px; background: white; }
    img { width: 110px; height: 110px; object-fit: contain; }
    figcaption { font-size: 14px; }
  </style>
  ${cards.join("")}
`);
await page.screenshot({ path: "artifacts/figma-option-two-icon-sheet.png" });
await browser.close();
