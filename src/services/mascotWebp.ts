// Bounded demux of our bundled WebP artwork. Image decoding stays in the browser.
// https://developers.google.com/speed/webp/docs/riff_container
export type MascotFrame = {
  x: number; y: number; width: number; height: number; duration: number;
  dispose: boolean; replace: boolean; payload: Uint8Array;
};
export type MascotClip = { width: number; height: number; frames: MascotFrame[] };
const text = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));
const u24 = (b: Uint8Array, at: number) => b[at] + b[at + 1] * 256 + b[at + 2] * 65536;
function put24(b: Uint8Array, at: number, value: number) {
  b[at] = value; b[at + 1] = value >>> 8; b[at + 2] = value >>> 16;
}
export function parseMascotWebp(buffer: ArrayBuffer): MascotClip {
  const b = new Uint8Array(buffer), view = new DataView(buffer);
  if (b.length < 30 || b.length > 8 * 1024 * 1024 || text(b, 0) !== "RIFF" || text(b, 8) !== "WEBP") throw new Error("Invalid mascot WebP");
  const end = view.getUint32(4, true) + 8;
  if (end !== b.length) throw new Error("Truncated mascot WebP");
  let width = 0, height = 0;
  const frames: MascotFrame[] = [];
  for (let at = 12; at < end;) {
    if (at + 8 > end) throw new Error("Truncated WebP chunk");
    const kind = text(b, at), size = view.getUint32(at + 4, true), start = at + 8;
    const next = start + size + (size & 1);
    if (next > end) throw new Error("Invalid WebP chunk size");
    if (kind === "VP8X") {
      if (size !== 10) throw new Error("Invalid WebP canvas");
      width = u24(b, start + 4) + 1; height = u24(b, start + 7) + 1;
      if (width > 1024 || height > 1024) throw new Error("Mascot canvas exceeds memory budget");
    }
    if (kind === "ANMF") {
      if (size < 24 || !width || !height || frames.length >= 600) throw new Error("Invalid mascot frame");
      const frame: MascotFrame = {
        x: u24(b, start) * 2, y: u24(b, start + 3) * 2,
        width: u24(b, start + 6) + 1, height: u24(b, start + 9) + 1,
        duration: Math.max(20, u24(b, start + 12)),
        dispose: !!(b[start + 15] & 1), replace: !!(b[start + 15] & 2),
        payload: b.subarray(start + 16, start + size),
      };
      if (frame.x + frame.width > width || frame.y + frame.height > height) throw new Error("Mascot frame outside canvas");
      let imageCount = 0;
      for (let sub = start + 16; sub < start + size;) {
        if (sub + 8 > start + size) throw new Error("Invalid frame payload");
        const subKind = text(b, sub), subSize = view.getUint32(sub + 4, true);
        if (subKind === "VP8 " || subKind === "VP8L") imageCount++;
        sub += 8 + subSize + (subSize & 1);
        if (sub > start + size) throw new Error("Truncated frame payload");
      }
      if (imageCount !== 1) throw new Error("Missing frame image");
      frames.push(frame);
    }
    at = next;
  }
  if (!frames.length) throw new Error("Missing mascot animation");
  return { width, height, frames };
}

export function mascotFrameBlob(frame: MascotFrame): Blob {
  // ALPH + VP8 needs an extended header, with animation disabled. Keep subchunk padding.
  const b = new Uint8Array(30 + frame.payload.length);
  b.set([82, 73, 70, 70], 0); new DataView(b.buffer).setUint32(4, b.length - 8, true);
  const first = text(frame.payload, 0);
  const alpha = first === "ALPH" || (first === "VP8L" && !!(frame.payload[12] & 16));
  b.set([87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0, alpha ? 16 : 0], 8);
  put24(b, 24, frame.width - 1); put24(b, 27, frame.height - 1);
  b.set(frame.payload, 30);
  return new Blob([b], { type: "image/webp" });
}
