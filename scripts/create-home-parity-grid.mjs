import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const referencePath = process.argv[2];
const currentPath = process.argv[3];
const outputDir = process.argv[4];
const referenceX = Number.parseInt(process.argv[5] ?? "1032", 10);

if (!referencePath || !currentPath || !outputDir) {
  throw new Error("Usage: node scripts/create-home-parity-grid.mjs <reference.png> <current.png> <output-dir>");
}

const [reference, current] = await Promise.all([
  fs.readFile(referencePath),
  fs.readFile(currentPath),
]);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const results = await page.evaluate(async ({ referenceSource, currentSource, referenceX }) => {
    const load = async (source) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      return image;
    };
    const [referenceImage, currentImage] = await Promise.all([load(referenceSource), load(currentSource)]);

    const width = 430;
    const height = 932;
    const drawGrid = (context) => {
      context.save();
      for (let x = 0; x <= width; x += 4) {
        const major = x % 20 === 0;
        context.strokeStyle = major ? "rgba(255,42,77,.42)" : "rgba(10,76,110,.16)";
        context.lineWidth = major ? 1 : .5;
        context.beginPath();
        context.moveTo(x + .5, 0);
        context.lineTo(x + .5, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 4) {
        const major = y % 20 === 0;
        context.strokeStyle = major ? "rgba(255,42,77,.42)" : "rgba(10,76,110,.16)";
        context.lineWidth = major ? 1 : .5;
        context.beginPath();
        context.moveTo(0, y + .5);
        context.lineTo(width, y + .5);
        context.stroke();
      }
      context.fillStyle = "rgba(8,35,54,.72)";
      context.font = "8px monospace";
      for (let x = 40; x < width; x += 40) context.fillText(`${x}`, x + 2, 10);
      for (let y = 40; y < height; y += 40) context.fillText(`${y}`, 2, y - 2);
      context.restore();
    };
    const makeCanvas = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
    const exportCanvas = (canvas) => canvas.toDataURL("image/png").split(",")[1];

    const referencePlainCanvas = makeCanvas();
    const referencePlainContext = referencePlainCanvas.getContext("2d");
    // Authoritative phone display crop. The default is the third/default frame;
    // pass 1537 for the fourth/six-module-expanded frame.
    referencePlainContext.drawImage(referenceImage, referenceX, 53, 432, 932, 0, 0, width, height);
    const referenceCanvas = makeCanvas();
    const referenceContext = referenceCanvas.getContext("2d");
    referenceContext.drawImage(referencePlainCanvas, 0, 0);
    drawGrid(referenceContext);

    const currentPlainCanvas = makeCanvas();
    const currentPlainContext = currentPlainCanvas.getContext("2d");
    currentPlainContext.drawImage(currentImage, 0, 0, currentImage.naturalWidth, currentImage.naturalHeight, 0, 0, width, height);
    const currentCanvas = makeCanvas();
    const currentContext = currentCanvas.getContext("2d");
    currentContext.drawImage(currentPlainCanvas, 0, 0);
    drawGrid(currentContext);

    const overlayCanvas = makeCanvas();
    const overlayContext = overlayCanvas.getContext("2d");
    overlayContext.globalAlpha = .52;
    overlayContext.drawImage(referenceImage, referenceX, 53, 432, 932, 0, 0, width, height);
    overlayContext.globalAlpha = .48;
    overlayContext.drawImage(currentImage, 0, 0, currentImage.naturalWidth, currentImage.naturalHeight, 0, 0, width, height);
    overlayContext.globalAlpha = 1;
    drawGrid(overlayContext);

    return {
      referencePlain: exportCanvas(referencePlainCanvas),
      currentPlain: exportCanvas(currentPlainCanvas),
      reference: exportCanvas(referenceCanvas),
      current: exportCanvas(currentCanvas),
      overlay: exportCanvas(overlayCanvas),
    };
  }, {
    referenceSource: reference.toString("base64"),
    currentSource: current.toString("base64"),
    referenceX,
  });

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, "figma-reference-430x932.png"), Buffer.from(results.referencePlain, "base64")),
    fs.writeFile(path.join(outputDir, "current-home-430x932.png"), Buffer.from(results.currentPlain, "base64")),
    fs.writeFile(path.join(outputDir, "figma-reference-grid-4px.png"), Buffer.from(results.reference, "base64")),
    fs.writeFile(path.join(outputDir, "current-home-grid-4px.png"), Buffer.from(results.current, "base64")),
    fs.writeFile(path.join(outputDir, "reference-current-overlay-grid-4px.png"), Buffer.from(results.overlay, "base64")),
  ]);
} finally {
  await browser.close();
}

console.log(`4px parity grids written to ${outputDir}`);
