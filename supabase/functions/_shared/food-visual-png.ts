/** Small dependency-free decoder for the normalized PNG contract, not a general image codec.
 * Uses the runtime's zlib DecompressionStream. Accepts non-interlaced 8/16-bit RGBA
 * or gray+alpha PNGs. Other valid PNG formats must first pass through the matting
 * normalizer. A color-type alpha header alone never establishes transparency.
 */
export type FoodVisualPngInspectionV2 = {
  width: number;
  height: number;
  hasAlpha: true;
  transparentPixelRatio: number;
  opaqueForegroundRatio: number;
  foregroundBounds: { minX: number; minY: number; maxX: number; maxY: number };
  foregroundWidthRatio: number;
  foregroundHeightRatio: number;
};

const maximumBytes = 8 * 1024 * 1024;
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = Uint32Array.from({ length: 256 }, (_, initial) => {
  let crc = initial;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function foodPngCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** Codes and numeric diagnostics are safe to persist; never attach provider text or URLs. */
export type FoodPngReason = 'png_file_size' | 'png_signature' | 'png_malformed' | 'png_crc' |
  'png_canvas_size' | 'png_pixel_format' | 'png_interlace' | 'png_compression' |
  'png_no_foreground' | 'png_no_transparency' | 'png_transparency_ratio' | 'png_subject_opacity' |
  'png_subject_geometry' | 'png_subject_clipped';
export type FoodPngDiagnostics = Partial<Record<'width' | 'height' | 'bitDepth' | 'colorType' | 'interlace' |
  'transparentPixelRatio' | 'opaqueForegroundRatio' | 'minX' | 'minY' | 'maxX' | 'maxY' |
  'foregroundWidthRatio' | 'foregroundHeightRatio', number>>;
export class FoodPngError extends Error {
  constructor(public readonly code: FoodPngReason, message: string, public readonly diagnostics: FoodPngDiagnostics = {}) {
    super(`Food PNG rejected: ${message}`);
  }
}
function invalid(message: string, code: FoodPngReason = 'png_malformed', diagnostics: FoodPngDiagnostics = {}): never {
  throw new FoodPngError(code, message, diagnostics);
}
function uint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}
function paeth(a: number, b: number, c: number) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function inflateBounded(bytes: Uint8Array, expectedBytes: number) {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const output = new Uint8Array(expectedBytes);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expectedBytes) {
        await reader.cancel();
        invalid("decompressed data exceeds the exact canvas size.", 'png_compression');
      }
      output.set(value, offset); offset += value.length;
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* Already errored/closed. */ }
    if (error instanceof FoodPngError) throw error;
    invalid("invalid compressed pixel data.", 'png_compression');
  } finally { reader.releaseLock(); }
  if (offset !== expectedBytes) invalid("incomplete decompressed pixel data.", 'png_compression');
  return output;
}

export async function validateFoodVisualPngV2(bytes: Uint8Array): Promise<FoodVisualPngInspectionV2> {
  if (bytes.length < 57 || bytes.length > maximumBytes) invalid("file is incomplete or exceeds 8 MiB.", 'png_file_size');
  if (!signature.every((value, index) => bytes[index] === value)) invalid("incorrect PNG signature.", 'png_signature');
  let width = 0, height = 0, bytesPerPixel = 0, bytesPerSample = 0;
  let offset = 8, header = false, ended = false, idatEnded = false;
  let totalIdatBytes = 0;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) invalid("truncated chunk.");
    const length = uint32(bytes, offset);
    if (length > maximumBytes || offset + 12 + length > bytes.length) invalid("invalid chunk length.");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || (bytes[offset + 6] & 32) !== 0) invalid("invalid chunk type.");
    if (foodPngCrc32(bytes.subarray(offset + 4, offset + 8 + length)) !== uint32(bytes, offset + 8 + length)) invalid("CRC mismatch.", 'png_crc');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (!header && type !== "IHDR") invalid("IHDR must be first.");
    if (type === "IHDR") {
      if (header || length !== 13) invalid("invalid or repeated IHDR.");
      width = uint32(chunk, 0); height = uint32(chunk, 4);
      const depth = chunk[8], color = chunk[9];
      const dimensions = { width, height, bitDepth: depth, colorType: color, interlace: chunk[12] };
      if (width !== 1024 || height !== 1024) invalid("canvas must be exactly 1024x1024.", 'png_canvas_size', dimensions);
      if ((depth !== 8 && depth !== 16) || (color !== 4 && color !== 6)) invalid("normalize to 8/16-bit RGBA or gray+alpha PNG.", 'png_pixel_format', dimensions);
      if (chunk[10] !== 0 || chunk[11] !== 0) invalid("unsupported compression or filter method.", 'png_compression', dimensions);
      if (chunk[12] !== 0) invalid("unsupported interlace method.", 'png_interlace', dimensions);
      bytesPerSample = depth / 8;
      bytesPerPixel = (color === 6 ? 4 : 2) * bytesPerSample;
      header = true;
    } else if (type === "IDAT") {
      if (idatEnded) invalid("IDAT chunks must be consecutive.");
      totalIdatBytes += length; idat.push(chunk);
    } else if (type === "IEND") {
      if (length !== 0 || !idat.length || offset + 12 !== bytes.length) invalid("invalid IEND, missing pixels, or trailing bytes.");
      ended = true; break;
    } else {
      if (idat.length) idatEnded = true;
      if (["acTL", "fcTL", "fdAT", "tRNS"].includes(type)) invalid("animated/ambiguous transparency PNG is not supported.");
      if (type === "PLTE") {
        if (idat.length || !length || length > 768 || length % 3 !== 0 || bytesPerPixel / bytesPerSample === 2) invalid("invalid optional palette.");
      } else if ((bytes[offset + 4] & 32) === 0) invalid(`unsupported critical chunk ${type}.`);
    }
    offset += 12 + length;
  }
  if (!ended || !totalIdatBytes) invalid("missing IEND or compressed pixels.");
  const compressed = new Uint8Array(totalIdatBytes);
  let compressedOffset = 0;
  for (const part of idat) { compressed.set(part, compressedOffset); compressedOffset += part.length; }
  const rowBytes = width * bytesPerPixel;
  const pixels = await inflateBounded(compressed, (rowBytes + 1) * height);
  let previous = new Uint8Array(rowBytes), row = new Uint8Array(rowBytes);
  let transparent = 0, foreground = 0, opaqueForeground = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1), filter = pixels[rowOffset];
    if (filter > 4) invalid("invalid row filter.");
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x], upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      row[x] = (pixels[rowOffset + 1 + x] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const alphaOffset = x * bytesPerPixel + bytesPerPixel - bytesPerSample;
      const alpha = bytesPerSample === 1 ? row[alphaOffset] : (row[alphaOffset] * 256 + row[alphaOffset + 1]) / 257;
      if (alpha <= 8) transparent++;
      else {
        foreground++; if (alpha >= 240) opaqueForeground++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    [previous, row] = [row, previous];
  }
  if (!foreground) invalid("canvas has no visible foreground.", 'png_no_foreground', { width, height });
  const bounds = { minX: minX / width, minY: minY / height, maxX: (maxX + 1) / width, maxY: (maxY + 1) / height };
  const widthRatio = bounds.maxX - bounds.minX, heightRatio = bounds.maxY - bounds.minY;
  const transparentRatio = transparent / (width * height), opaqueRatio = opaqueForeground / foreground;
  const diagnostics = { width, height, transparentPixelRatio: transparentRatio, opaqueForegroundRatio: opaqueRatio,
    ...bounds, foregroundWidthRatio: widthRatio, foregroundHeightRatio: heightRatio };
  if (transparentRatio < 0.25 || transparentRatio > 0.55) invalid("real transparent area must surround a complete plate/bowl.", 'png_transparency_ratio', diagnostics);
  if (opaqueRatio < 0.90) invalid("foreground is translucent rather than an opaque food/container cutout.", 'png_subject_opacity', diagnostics);
  // Prompt target is 86-90%; +/-2 percentage points tolerate antialiasing and
  // normalizer variation. No visible foreground may intrude into the outer 3.5%.
  if (widthRatio < 0.84 || widthRatio > 0.92 || heightRatio < 0.84 || heightRatio > 0.92 ||
    bounds.minX < 0.035 || bounds.minY < 0.035 || bounds.maxX > 0.965 || bounds.maxY > 0.965 ||
    Math.abs((bounds.minX + bounds.maxX) / 2 - 0.5) > 0.02 ||
    Math.abs((bounds.minY + bounds.maxY) / 2 - 0.5) > 0.02 || Math.abs(widthRatio - heightRatio) > 0.03) {
    invalid("foreground must be centered, uncropped, and approximately 86-90% of the canvas.", 'png_subject_geometry', diagnostics);
  }
  return { width, height, hasAlpha: true, transparentPixelRatio: transparentRatio, opaqueForegroundRatio: opaqueRatio,
    foregroundBounds: bounds, foregroundWidthRatio: widthRatio, foregroundHeightRatio: heightRatio };
}
