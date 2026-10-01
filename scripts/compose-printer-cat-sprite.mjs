import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/compose-printer-cat-sprite.mjs <input.png> <output.png>");
}

const source = `data:image/png;base64,${(await readFile(inputPath)).toString("base64")}`;
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const result = await page.evaluate(async (sourceUrl) => {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    const sourceCellWidth = image.naturalWidth / 4;
    const sourceCellHeight = image.naturalHeight / 2;
    if (Math.abs(sourceCellWidth - sourceCellHeight) > 0.01) {
      throw new Error(`Expected a 4x2 source sheet, received ${image.naturalWidth}x${image.naturalHeight}`);
    }

    const cellSize = Math.round(sourceCellHeight);
    const output = document.createElement("canvas");
    output.width = cellSize * 6;
    output.height = cellSize * 2;
    const outputContext = output.getContext("2d");
    const sequence = [0, 1, 2, 3, 4, 4, 4, 3, 2, 1, 0, 0];

    function cleanFrame(frameIndex) {
      const sourceColumn = frameIndex % 4;
      const sourceRow = Math.floor(frameIndex / 4);
      const frame = document.createElement("canvas");
      frame.width = cellSize;
      frame.height = cellSize;
      const context = frame.getContext("2d", { willReadFrequently: true });
      const left = Math.round((cellSize - sourceCellWidth) / 2);
      context.drawImage(
        image,
        sourceColumn * sourceCellWidth,
        sourceRow * sourceCellHeight,
        sourceCellWidth,
        sourceCellHeight,
        left,
        0,
        sourceCellWidth,
        sourceCellHeight,
      );

      const pixels = context.getImageData(0, 0, cellSize, cellSize);
      const count = cellSize * cellSize;
      const visited = new Uint8Array(count);
      let largest = [];
      const threshold = 12;

      for (let start = 0; start < count; start += 1) {
        if (visited[start] || pixels.data[start * 4 + 3] <= threshold) continue;
        const queue = [start];
        const component = [];
        visited[start] = 1;
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const index = queue[cursor];
          component.push(index);
          const x = index % cellSize;
          const y = Math.floor(index / cellSize);
          const neighbors = [index - 1, index + 1, index - cellSize, index + cellSize];
          for (const neighbor of neighbors) {
            if (neighbor < 0 || neighbor >= count || visited[neighbor]) continue;
            const nx = neighbor % cellSize;
            const ny = Math.floor(neighbor / cellSize);
            if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
            if (pixels.data[neighbor * 4 + 3] <= threshold) continue;
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
        if (component.length > largest.length) largest = component;
      }

      const keep = new Uint8Array(count);
      for (const index of largest) keep[index] = 1;
      for (let index = 0; index < count; index += 1) {
        if (keep[index]) continue;
        const offset = index * 4;
        pixels.data[offset] = 0;
        pixels.data[offset + 1] = 0;
        pixels.data[offset + 2] = 0;
        pixels.data[offset + 3] = 0;
      }
      context.putImageData(pixels, 0, 0);
      let minX = cellSize;
      let minY = cellSize;
      let maxX = 0;
      let maxY = 0;
      for (const index of largest) {
        const x = index % cellSize;
        const y = Math.floor(index / cellSize);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return { frame, bounds: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 } };
    }

    const frames = new Map();
    const reference = cleanFrame(0);
    frames.set(0, reference);
    for (let index = 0; index < sequence.length; index += 1) {
      const sourceIndex = sequence[index];
      if (!frames.has(sourceIndex)) frames.set(sourceIndex, cleanFrame(sourceIndex));
      const current = frames.get(sourceIndex);
      const scale = reference.bounds.height / current.bounds.height;
      const drawWidth = current.bounds.width * scale;
      const drawHeight = current.bounds.height * scale;
      const drawX = (index % 6) * cellSize + reference.bounds.minX;
      const drawY = Math.floor(index / 6) * cellSize + reference.bounds.maxY - drawHeight + 1;
      outputContext.drawImage(
        current.frame,
        current.bounds.minX,
        current.bounds.minY,
        current.bounds.width,
        current.bounds.height,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
    }

    return {
      data: output.toDataURL("image/png").split(",")[1],
      width: output.width,
      height: output.height,
    };
  }, source);

  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  console.log(JSON.stringify({ outputPath, width: result.width, height: result.height }));
} finally {
  await browser.close();
}
