import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredEntry } from "../src/services/structuredEntryParser.ts";

test("todo parser keeps tomorrow and afternoon time", () => {
  const entry = parseStructuredEntry("明天下午3点提醒我给团队开会", "zh");
  assert.equal(entry?.type, "todo");
  assert.equal(entry?.payload.scheduledTime, "15:00");
  assert.equal(entry?.fields.some((field) => field.label === "日期"), true);
  assert.match(String(entry?.payload.title), /团队开会/);
});

test("sleep parser understands Chinese evening and morning periods", () => {
  const entry = parseStructuredEntry("晚上11点睡，早上7点醒", "zh");
  assert.equal(entry?.type, "sleep");
  assert.equal(entry?.payload.start, "23:00");
  assert.equal(entry?.payload.end, "07:00");
  assert.equal(entry?.payload.durationMinutes, 480);
});
