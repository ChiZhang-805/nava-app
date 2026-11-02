import assert from "node:assert/strict";
import test from "node:test";
import { archivePath, buildTar } from "../src/services/exportArchive.ts";

test("normal UUID-based diet photo paths survive ustar's 100-byte filename limit", () => {
  const name = `storage/diet-photos/${'a'.repeat(36)}/2026-10-30/breakfast-${'b'.repeat(36)}.jpg`;
  assert.ok(name.length > 100);
  const bytes = new Uint8Array([255, 216, 255, 10]);
  const tar = buildTar([{ name, bytes, modifiedAt: "2026-10-30T00:00:00Z" }]);
  const text = (start: number, size: number) => new TextDecoder().decode(tar.slice(start, start + size)).replace(/\0.*$/s, '');
  assert.equal(`${text(345, 155)}/${text(0, 100)}`, name);
  assert.deepEqual(tar.slice(512, 516), bytes);
  const checksum = parseInt(text(148, 6), 8);
  const header = tar.slice(0, 512); header.fill(32, 148, 156);
  assert.equal(header.reduce((sum, byte) => sum + byte, 0), checksum);
  assert.equal(tar.length % 512, 0);
  assert.ok(tar.slice(-1024).every(byte => byte === 0));
});

test("tar paths preserve unicode without truncating bytes or normalizing traversal", () => {
  const name = `storage/${'照片'.repeat(20)}/record.png`;
  const tar = buildTar([{ name, bytes: new Uint8Array() }]);
  const text = (start: number, size: number) => new TextDecoder('utf-8', { fatal: true }).decode(tar.slice(start, start + size)).replace(/\0.*$/s, '');
  assert.equal(`${text(345, 155)}/${text(0, 100)}`, name);
  for (const invalid of ['../file', '/absolute', 'a/../b', 'a/./b', 'a\0b', 'C:/file']) assert.throws(() => archivePath(invalid));
  assert.throws(() => buildTar([{ name: 'x'.repeat(101), bytes: new Uint8Array() }]), /路径过长/);
});
