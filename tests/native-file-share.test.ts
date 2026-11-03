import assert from "node:assert/strict";
import test from "node:test";
import { createNativeFileShare } from "../src/services/nativeFileShare.ts";

test("native export shares the written file and cleans it only after the sheet completes", async () => {
  const events: string[] = [];
  let written = "";
  const share = createNativeFileShare({
    async write(path, data) { written = path; assert.equal(data, "AQID"); events.push("write"); return "file:///cache/export.tar"; },
    async share(uri, title) { assert.equal(uri, "file:///cache/export.tar"); assert.equal(title, "NAVA"); events.push("share"); },
    async remove(path) { assert.equal(path, written); events.push("remove"); },
  }, async () => "AQID");
  await share("account.tar", new Blob([new Uint8Array([1, 2, 3])]));
  assert.match(written, /^nava-share\/[a-f0-9-]+\/account.tar$/);
  assert.deepEqual(events, ["write", "share", "remove"]);
});

test("native cancellation cleans the file and never reports success", async () => {
  let removed = 0;
  const share = createNativeFileShare({
    async write() { return "file:///cache/file.png"; },
    async share() { throw new Error("Share canceled"); },
    async remove() { removed++; },
  }, async () => "AQID");
  await assert.rejects(share("report.png", new Blob()), { name: "AbortError" });
  assert.equal(removed, 1);
});

test("partial write failure cleans up and allows retry; filenames cannot escape cache", async () => {
  let attempts = 0;
  let removed = 0;
  const share = createNativeFileShare({
    async write() { if (++attempts === 1) throw new Error("disk full"); return "file:///cache/report.png"; },
    async share() {},
    async remove() { removed++; },
  }, async () => "AQID");
  await assert.rejects(share("../account.tar", new Blob()), /filename/);
  assert.equal(attempts, 0);
  await assert.rejects(share("report.png", new Blob()), /disk full/);
  await share("report.png", new Blob());
  assert.equal(removed, 2);
});

test("a second share cannot race the active sheet or delete its file", async () => {
  let complete!: () => void;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  let removed = 0;
  const share = createNativeFileShare({
    async write() { return "file:///cache/a.png"; },
    async share() { await pending; },
    async remove() { removed++; },
  }, async () => "AQID");
  const first = share("a.png", new Blob());
  await assert.rejects(share("b.png", new Blob()), /already open/);
  assert.equal(removed, 0);
  complete();
  await first;
  assert.equal(removed, 1);
});
