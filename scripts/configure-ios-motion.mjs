import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const plistPath = path.resolve(process.env.NAVA_IOS_PLIST || "ios/App/App/Info.plist");
const usageDescription =
  "NAVA 使用设备动作数据，让动态背景轻微响应您的手机移动。数据仅在设备本地用于视觉效果。";

try {
  await access(plistPath);
} catch {
  console.log(`iOS project is not generated yet; skipped motion permission configuration (${plistPath}).`);
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.log(`Info.plist exists, but plist editing requires macOS; skipped ${plistPath}.`);
  process.exit(0);
}

const plutil = "/usr/bin/plutil";
const replaceResult = spawnSync(
  plutil,
  ["-replace", "NSMotionUsageDescription", "-string", usageDescription, plistPath],
  { encoding: "utf8" },
);

if (replaceResult.status !== 0) {
  const insertResult = spawnSync(
    plutil,
    ["-insert", "NSMotionUsageDescription", "-string", usageDescription, plistPath],
    { encoding: "utf8" },
  );
  if (insertResult.status !== 0) {
    const details = insertResult.stderr?.trim() || replaceResult.stderr?.trim() || "unknown plutil error";
    throw new Error(`Unable to configure NSMotionUsageDescription: ${details}`);
  }
}

console.log(`Configured NSMotionUsageDescription in ${plistPath}.`);
