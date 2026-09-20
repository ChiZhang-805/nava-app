import assert from "node:assert/strict";
import test from "node:test";
import { createNativePhotoPicker } from "../src/services/nativePhotos.ts";

const photo = { webPath: "capacitor://localhost/_capacitor_file_/photo.jpg", format: "jpeg", saved: false };
const jpeg = () => Promise.resolve(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1])));
test("native picker uses bounded orientation-corrected JPEG URI; no automatic gallery write", async () => {
  let options;
  const pick = createNativePhotoPicker({ getPhoto: async (value) => { options = value; return photo; } }, jpeg);
  const file = await pick("camera", "user");
  assert.equal(file?.type, "image/jpeg"); assert.equal(file?.size, 6);
  assert.deepEqual(options, { source: "CAMERA", direction: "FRONT", resultType: "uri", quality: 90, width: 1600, height: 1600, correctOrientation: true, allowEditing: false, saveToGallery: false, presentationStyle: "fullscreen" });
  await pick("library"); assert.equal(options.source, "PHOTOS");
});
test("cancellation is quiet, denied permission is a real failure and can be retried", async () => {
  let fail = "User cancelled photos app";
  const pick = createNativePhotoPicker({ getPhoto: async () => { throw new Error(fail); } }, jpeg);
  assert.equal(await pick("library"), null);
  fail = "Camera access denied";
  await assert.rejects(pick("camera"), /denied/);
  await assert.rejects(pick("camera"), /denied/);
});
test("only one system picker; unmounted/aborted requests cannot return a late photo", async () => {
  let release!: (value: typeof photo) => void;
  let reads = 0;
  const pick = createNativePhotoPicker({ getPhoto: () => new Promise((resolve) => { release = resolve; }) }, () => { reads++; return jpeg(); });
  const controller = new AbortController();
  const pending = pick("library", "user", controller.signal);
  await Promise.resolve();
  await assert.rejects(pick("camera"), /busy/);
  controller.abort(); release(photo);
  assert.equal(await pending, null); assert.equal(reads, 0);
});
test("bad native bytes, missing URI, empty and oversized files are rejected", async () => {
  for (const blob of [new Blob(), new Blob(["not jpeg"]), new Blob([new Uint8Array(10 * 1024 * 1024 + 1)])]) {
    await assert.rejects(createNativePhotoPicker({ getPhoto: async () => photo }, async () => new Response(blob))("library"));
  }
  await assert.rejects(createNativePhotoPicker({ getPhoto: async () => ({ ...photo, webPath: undefined }) }, jpeg)("library"));
});
