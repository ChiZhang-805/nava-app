import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { parseMascotWebp, mascotFrameBlob } from "../src/services/mascotWebp.ts";

const root = new URL("../src/assets/mascot/animated/", import.meta.url);
const bytes = (name: string) => Uint8Array.from(readFileSync(new URL(name, root))).buffer;
test("all supplied home clips fit the bounded decoder and retain duration", () => {
  const expected: Record<string, number> = { "home-idle.webp": 5400, "home-roll.webp": 4680, "home-curious.webp": 6960, "module-exercise.webp": 1800 };
  for (const name of readdirSync(root).filter((name) => name.startsWith("home-") || name === "module-exercise.webp")) {
    const clip = parseMascotWebp(bytes(name));
    assert.ok(clip.frames.length > 1);
    if (expected[name]) assert.equal(clip.frames.reduce((sum, f) => sum + f.duration, 0), expected[name]);
    assert.ok(clip.frames.every((f) => f.x + f.width <= clip.width && f.y + f.height <= clip.height));
  }
});
test("partial frames are packaged as static alpha WebP, not animated or full-canvas images", async () => {
  const frame = parseMascotWebp(bytes("home-idle.webp")).frames[2];
  const out = new Uint8Array(await mascotFrameBlob(frame).arrayBuffer());
  assert.equal(String.fromCharCode(...out.subarray(12, 16)), "VP8X");
  assert.equal(out[20], 16);
  assert.equal(out.length, frame.payload.length + 30);
  assert.deepEqual(out.subarray(30), frame.payload);
});
test("truncated, oversized and out-of-bounds frame headers fail closed", () => {
  const raw = bytes("home-idle.webp");
  assert.throws(() => parseMascotWebp(raw.slice(0, raw.byteLength - 1)));
  const huge = new Uint8Array(raw.slice(0)); huge[24] = 255; huge[25] = 255;
  assert.throws(() => parseMascotWebp(huge.buffer), /memory budget/);
  const bad = new Uint8Array(raw.slice(0));
  const marker = Buffer.from(bad).indexOf("ANMF");
  bad[marker + 8] = 255; bad[marker + 9] = 255;
  assert.throws(() => parseMascotWebp(bad.buffer), /outside canvas/);
});
