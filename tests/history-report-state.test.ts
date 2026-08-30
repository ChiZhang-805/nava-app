import assert from "node:assert/strict";
import test from "node:test";
import {
  currentDayRequiredShareCopy,
  hasCurrentDayRecord,
  missingCurrentDayCopy,
} from "../src/services/historyReportState.ts";

test("a partial seven-day window still counts as ready when today has a record", () => {
  const entries = [
    { date: "2026-08-24", value: 79 },
    { date: "2026-08-27", value: 76 },
    { date: "2026-08-30", value: 80 },
  ];
  assert.equal(hasCurrentDayRecord(entries, "2026-08-30"), true);
});

test("older records never stand in for a missing current-day record", () => {
  const entries = [
    { date: "2026-08-28", value: 80 },
    { date: "2026-08-29", value: 76 },
    { date: "2026-08-30", value: null },
  ];
  assert.equal(hasCurrentDayRecord(entries, "2026-08-30"), false);
});

test("zero is a valid current-day measurement", () => {
  assert.equal(hasCurrentDayRecord([{ date: "2026-08-30", value: 0 }], "2026-08-30"), true);
});

test("missing-today and disabled-share copy follows each module", () => {
  assert.equal(missingCurrentDayCopy("face", "zh"), "今天的面部数据还没填写呀～");
  assert.equal(missingCurrentDayCopy("sleep", "zh"), "今天的睡眠数据还没填写呀～");
  assert.equal(currentDayRequiredShareCopy("mood", "zh"), "完成今日情绪数据后可分享");
  assert.equal(currentDayRequiredShareCopy("diet", "en"), "Add today's diet data to share");
});
