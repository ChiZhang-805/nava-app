import assert from "node:assert/strict";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const directory = process.env.NAVA_TEST_OUTPUT || (process.platform === "win32" ? "Q:/NAVA-Workspace/Build/TestRuns/phone-system-preview" : "artifacts/ios/preview-exclusion");
const output = path.join(directory, "native-exclusion.json");
const forbidden = /ios-system-layer|nava:preview-phone-command|nava:preview-system|nava-device-preview|外部环境模拟|nava:preview-reminder/;
const files = await readdir("dist/assets");
let checked = 0;
for (const file of files) {
  assert.ok(!/AppIcon-512|preview-system/.test(file), `Preview-only image bundled: ${file}`);
  if (!/\.(css|js)$/.test(file)) continue;
  assert.ok(!forbidden.test(await readFile(`dist/assets/${file}`, "utf8")), `Preview code in native artifact: ${file}`);
  checked++;
}
assert.ok(checked > 15);
await mkdir(directory, { recursive: true });
await writeFile(output, JSON.stringify({ passed: true, checked, realDeviceTested: false, at: new Date().toISOString() }, null, 2));
console.log(`Native preview exclusion passed: ${checked} JS/CSS artifacts.`);
