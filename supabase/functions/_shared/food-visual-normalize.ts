import { FoodPngError, foodPngCrc32, validateFoodVisualPngV2, type FoodPngDiagnostics, type FoodPngReason } from './food-visual-png.ts';

const maximumBytes = 8 * 1024 * 1024;
const maximumPixels = 4 * 1024 * 1024;
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const canvasSize = 1024;
const subjectSize = canvasSize * 0.88;

/** Provider adapter only: bounded, static PNG, RGBA/gray+alpha 8/16 bit or indexed+tRNS 1/2/4/8 bit.
 * Does not infer alpha from white/black pixels, decode JPEG, remove components, or repair a cut-off rim.
 * The independent final validator retains the product's original geometry/opacity thresholds.
 */
async function decodeTransparentProviderPng(bytes: Uint8Array) {
  let diagnostics: FoodPngDiagnostics = {};
  const reject = (code: FoodPngReason, message: string): never => { throw new FoodPngError(code, message, diagnostics); };
  if (bytes.length < 57 || bytes.length > maximumBytes) reject('png_file_size', 'file is incomplete or exceeds 8 MiB.');
  if (!pngSignature.every((value, index) => bytes[index] === value)) reject('png_signature', 'incorrect PNG signature.');
  const read32 = (offset: number) => new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
  let width = 0, height = 0, depth = 0, color = 0, channels = 0;
  let offset = 8, chunks = 0, seenHeader = false, seenEnd = false, idatEnded = false;
  let compressedLength = 0;
  let palette: Uint8Array | undefined, transparency: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (++chunks > 2048 || offset + 12 > bytes.length) reject('png_malformed', 'too many chunks or truncated chunk.');
    const length = read32(offset);
    if (length > maximumBytes || offset + length + 12 > bytes.length) reject('png_malformed', 'invalid chunk length.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || (bytes[offset + 6] & 32) !== 0) reject('png_malformed', 'invalid chunk type.');
    if (foodPngCrc32(bytes.subarray(offset + 4, offset + 8 + length)) !== read32(offset + 8 + length)) reject('png_crc', 'CRC mismatch.');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (!seenHeader && type !== 'IHDR') reject('png_malformed', 'IHDR must be first.');
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) reject('png_malformed', 'invalid or repeated IHDR.');
      width = read32(offset + 8); height = read32(offset + 12); depth = chunk[8]; color = chunk[9];
      diagnostics = { width, height, bitDepth: depth, colorType: color, interlace: chunk[12] };
      if (!width || !height || width > 4096 || height > 4096 || width * height > maximumPixels) reject('png_canvas_size', 'provider canvas exceeds 4096 per edge or 4 Mi pixels.');
      if (chunk[10] !== 0 || chunk[11] !== 0) reject('png_compression', 'unsupported compression or filter method.');
      if (chunk[12] !== 0) reject('png_interlace', 'interlaced PNG is not supported.');
      if (!((color === 4 || color === 6) && (depth === 8 || depth === 16)) && !(color === 3 && [1, 2, 4, 8].includes(depth))) reject('png_pixel_format', 'an explicit supported alpha channel or indexed transparency is required.');
      channels = color === 6 ? 4 : color === 4 ? 2 : 1;
      seenHeader = true;
    } else if (type === 'PLTE') {
      if (palette || idat.length || transparency || color === 4 || !length || length % 3 !== 0 || length > 768 || (color === 3 && length / 3 > 2 ** depth)) reject('png_malformed', 'invalid palette.');
      palette = chunk;
    } else if (type === 'tRNS') {
      if (transparency || idat.length || color !== 3 || !palette || !length || length > palette.length / 3) reject('png_malformed', 'invalid indexed transparency.');
      transparency = chunk;
    } else if (type === 'IDAT') {
      if (idatEnded) reject('png_malformed', 'IDAT chunks must be consecutive.');
      if (color === 3 && (!palette || !transparency)) reject('png_pixel_format', 'indexed transparency must precede pixels.');
      compressedLength += length; idat.push(chunk);
    } else if (type === 'IEND') {
      if (length || !compressedLength || offset + 12 !== bytes.length) reject('png_malformed', 'invalid IEND or trailing content.');
      seenEnd = true; break;
    } else {
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) reject('png_pixel_format', 'animated PNG is not supported.');
      if ((bytes[offset + 4] & 32) === 0) reject('png_malformed', 'unsupported critical chunk.');
    }
    if (idat.length && type !== 'IDAT') idatEnded = true;
    offset += length + 12;
  }
  if (!seenEnd) reject('png_malformed', 'missing IEND.');
  const compressed = new Uint8Array(compressedLength);
  let position = 0;
  for (const part of idat) { compressed.set(part, position); position += part.length; }
  const rowBytes = Math.ceil(width * channels * depth / 8), filterStride = Math.max(1, Math.ceil(channels * depth / 8));
  // The header bounds cap this allocation below 34 MiB, before any decompression.
  const raw = new Uint8Array((rowBytes + 1) * height);
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  position = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      if (position + value.length > raw.length) reject('png_compression', 'decompressed data exceeds the exact canvas size.');
      raw.set(value, position); position += value.length;
    }
    if (position !== raw.length) reject('png_compression', 'incomplete decompressed pixel data.');
  } catch (cause) {
    try { await reader.cancel(); } catch { /* Stream may already be errored. */ }
    if (cause instanceof FoodPngError) throw cause;
    reject('png_compression', 'invalid compressed pixel data.');
  } finally { reader.releaseLock(); }
  const rgba = new Uint8Array(width * height * 4);
  let row = new Uint8Array(rowBytes), previous = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y++) {
    const start = y * (rowBytes + 1), filter = raw[start];
    if (filter > 4) reject('png_malformed', 'invalid row filter.');
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= filterStride ? row[x - filterStride] : 0, b = previous[x], c = x >= filterStride ? previous[x - filterStride] : 0;
      const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : da <= db && da <= dc ? a : db <= dc ? b : c;
      row[x] = (raw[start + 1 + x] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      if (color === 3) {
        const index = (row[Math.floor(x * depth / 8)] >>> (8 - depth - (x * depth % 8))) & ((1 << depth) - 1);
        if (!palette || index * 3 >= palette.length) reject('png_malformed', 'pixel index exceeds palette.');
        rgba[out] = palette![index * 3]; rgba[out + 1] = palette![index * 3 + 1]; rgba[out + 2] = palette![index * 3 + 2];
        rgba[out + 3] = transparency![index] ?? 255;
      } else {
        const stride = depth / 8, base = x * channels * stride;
        for (let channel = 0; channel < 4; channel++) {
          const source = channel === 3 ? channels - 1 : color === 4 ? 0 : channel;
          const index = base + source * stride;
          const value = depth === 8 ? row[index] : (row[index] * 256 + row[index + 1]) / 257;
          // Keep even sub-byte alpha nonzero; never silently erase a rim or border pixel.
          rgba[out + channel] = channel === 3 ? Math.ceil(value) : Math.round(value);
        }
      }
    }
    [previous, row] = [row, previous];
  }
  return { width, height, rgba, diagnostics };
}

function chunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(data, 8);
  view.setUint32(bytes.length - 4, foodPngCrc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
async function encodeRgba(rgba: Uint8Array) {
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, canvasSize); view.setUint32(4, canvasSize); header[8] = 8; header[9] = 6;
  const rowBytes = canvasSize * 4, raw = new Uint8Array((rowBytes + 1) * canvasSize);
  for (let y = 0; y < canvasSize; y++) raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const parts = [pngSignature, chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export async function normalizeFoodVisualPngV2(bytes: Uint8Array): Promise<{ bytes: Uint8Array; diagnostics: FoodPngDiagnostics }> {
  const source = await decodeTransparentProviderPng(bytes);
  const { width, height, rgba, diagnostics } = source;
  let minX = width, minY = height, maxX = -1, maxY = -1, transparent = 0, foreground = 0, opaque = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = rgba[(y * width + x) * 4 + 3];
    if (alpha === 0) transparent++;
    else { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    if (alpha > 8) { foreground++; if (alpha >= 240) opaque++; }
  }
  if (!foreground) throw new FoodPngError('png_no_foreground', 'canvas has no visible foreground.', diagnostics);
  if (!transparent) throw new FoodPngError('png_no_transparency', 'real transparent background is required.', diagnostics);
  const cropWidth = maxX - minX + 1, cropHeight = maxY - minY + 1;
  Object.assign(diagnostics, { transparentPixelRatio: transparent / (width * height), opaqueForegroundRatio: opaque / foreground,
    minX: minX / width, minY: minY / height, maxX: (maxX + 1) / width, maxY: (maxY + 1) / height,
    foregroundWidthRatio: cropWidth / width, foregroundHeightRatio: cropHeight / height });
  if (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) throw new FoodPngError('png_subject_clipped', 'foreground touches the source edge; an intact rim cannot be established.', diagnostics);
  if (opaque / foreground < 0.90) throw new FoodPngError('png_subject_opacity', 'foreground is translucent rather than opaque.', diagnostics);
  const scale = subjectSize / Math.max(cropWidth, cropHeight);
  const left = (canvasSize - cropWidth * scale) / 2, top = (canvasSize - cropHeight * scale) / 2;
  const output = new Uint8Array(canvasSize * canvasSize * 4);
  // One affine scale for both axes. Premultiplied-alpha interpolation avoids dark halos.
  // Every nonzero-alpha component participates in the crop; none are removed before resampling.
  for (let y = 0; y < canvasSize; y++) for (let x = 0; x < canvasSize; x++) {
    const sx = (x + 0.5 - left) / scale - 0.5 + minX, sy = (y + 0.5 - top) / scale - 0.5 + minY;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const px = ix + dx, py = iy + dy;
      if (px < minX || px > maxX || py < minY || py > maxY) continue;
      const i = (py * width + px) * 4;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * rgba[i + 3];
      alpha += weight; red += weight * rgba[i]; green += weight * rgba[i + 1]; blue += weight * rgba[i + 2];
    }
    const i = (y * canvasSize + x) * 4;
    if (alpha > 0) { output[i] = Math.round(red / alpha); output[i + 1] = Math.round(green / alpha); output[i + 2] = Math.round(blue / alpha); output[i + 3] = Math.round(alpha); }
  }
  const normalized = await encodeRgba(output);
  // Keep this independent pixel/CRC/geometry validation; normalizing never establishes acceptance.
  await validateFoodVisualPngV2(normalized);
  return { bytes: normalized, diagnostics };
}
