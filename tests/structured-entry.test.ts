import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredEntry, updateStructuredEntryField } from "../src/services/structuredEntryParser.ts";

test("todo parser keeps tomorrow and afternoon time", () => {
  const entry = parseStructuredEntry("明天下午3点提醒我给团队开会", "zh");
  assert.equal(entry?.type, "todo");
  assert.equal(entry?.payload.scheduledTime, "15:00");
  assert.equal(entry?.payload.focusMinutes, 25);
  assert.equal(entry?.payload.focusSessions, 1);
  assert.equal(entry?.fields.some((field) => field.label === "日期"), true);
  assert.match(String(entry?.payload.title), /团队开会/);
});

test("todo parser adds editable focus suggestions for deep work", () => {
  const entry = parseStructuredEntry("明天提醒我写项目报告", "zh");
  assert.equal(entry?.type, "todo");
  assert.equal(entry?.payload.focusMinutes, 45);
  assert.equal(entry?.payload.focusSessions, 2);
  const minutes = entry?.fields.find((field) => field.path === "focusMinutes");
  assert.ok(minutes);
  const updated = updateStructuredEntryField(entry!, minutes!.id, "60");
  assert.equal(updated.payload.focusMinutes, 60);
});

test("sleep parser understands Chinese evening and morning periods", () => {
  const entry = parseStructuredEntry("晚上11点睡，早上7点醒", "zh");
  assert.equal(entry?.type, "sleep");
  assert.equal(entry?.payload.start, "23:00");
  assert.equal(entry?.payload.end, "07:00");
  assert.equal(entry?.payload.durationMinutes, 480);
});

test("one sentence produces sleep and nutrition records with all food items", () => {
  const entry = parseStructuredEntry("我今天睡了三个小时，然后吃了两个鸡蛋和五片面包。", "zh");
  assert.equal(entry?.type, "multi");
  assert.deepEqual(entry?.entries?.map((item) => item.type), ["sleep", "nutrition"]);
  assert.equal(entry?.entries?.[0].payload.durationMinutes, 180);

  const nutrition = entry?.entries?.[1];
  assert.deepEqual(
    (nutrition?.payload.items as Array<Record<string, unknown>>).map((item) => [item.name, item.amount, item.calories]),
    [["鸡蛋", "2个", 140], ["面包", "5片", 375]],
  );
  assert.equal(nutrition?.payload.totalCalories, 515);
  assert.equal(nutrition?.fields.some((field) => field.label === "预估热量" && field.value === "515"), true);
});

test("editing a recognized food quantity recalculates item and total calories", () => {
  const entry = parseStructuredEntry("吃了两个鸡蛋和五片面包", "zh");
  assert.equal(entry?.type, "nutrition");
  const eggField = entry?.fields.find((field) => field.label === "鸡蛋");
  assert.ok(entry && eggField);
  const updated = updateStructuredEntryField(entry, eggField.id, "3");
  const items = updated.payload.items as Array<Record<string, unknown>>;
  assert.equal(items[0].amount, "3个");
  assert.equal(items[0].calories, 210);
  assert.equal(updated.payload.totalCalories, 585);
  assert.equal(updated.fields.find((field) => field.label === "预估热量")?.value, "585");
});

test("editing a vision total redistributes calories without losing photo metadata", () => {
  const entry = {
    id: "vision-entry",
    type: "nutrition" as const,
    title: "饮食记录",
    summary: "米饭、鸡胸肉",
    confidence: 0.9,
    fields: [
      { id: "rice", label: "米饭", value: "200", unit: "千卡", path: "items.0.calories", valueType: "number" as const },
      { id: "chicken", label: "鸡胸肉", value: "300", unit: "千卡", path: "items.1.calories", valueType: "number" as const },
      { id: "total", label: "总热量", value: "500", unit: "千卡", path: "totalCalories", valueType: "number" as const },
    ],
    payload: {
      source: "vision",
      photoUrl: "user/day/lunch.jpg",
      items: [{ name: "米饭", calories: 200 }, { name: "鸡胸肉", calories: 300 }],
      totalCalories: 500,
      calories: 500,
    },
  };
  const updated = updateStructuredEntryField(entry, "total", "600");
  const items = updated.payload.items as Array<Record<string, unknown>>;
  assert.deepEqual(items.map((item) => item.calories), [240, 360]);
  assert.equal(updated.fields.find((field) => field.id === "rice")?.value, "240");
  assert.equal(updated.fields.find((field) => field.id === "chicken")?.value, "360");
  assert.equal(updated.payload.photoUrl, "user/day/lunch.jpg");
});

test("sleep and exercise durations remain separated in one sentence", () => {
  const entry = parseStructuredEntry("我睡了3小时，然后跑步30分钟", "zh");
  assert.equal(entry?.type, "multi");
  assert.equal(entry?.entries?.find((item) => item.type === "sleep")?.payload.durationMinutes, 180);
  assert.equal(entry?.entries?.find((item) => item.type === "exercise")?.payload.minutes, 30);
});

test("high emotion wording creates a mood confirmation card", () => {
  const entry = parseStructuredEntry("我今天非常高兴！！", "zh");
  assert.equal(entry?.type, "mood");
  assert.equal(entry?.payload.moodScore, 90);
});

test("unquantified pizza and high emotion create two editable records with a common-serving estimate", () => {
  const entry = parseStructuredEntry("我今天吃了披萨！！我要高兴死了！！！", "zh");
  assert.equal(entry?.type, "multi");
  assert.deepEqual(entry?.entries?.map((item) => item.type), ["nutrition", "mood"]);
  const nutrition = entry?.entries?.find((item) => item.type === "nutrition");
  assert.equal((nutrition?.payload.items as Array<Record<string, unknown>>)[0].name, "披萨");
  assert.equal(nutrition?.payload.totalCalories, 270);
  assert.equal(nutrition?.fields.some((item) => item.path === "totalCalories" && item.value === "270"), true);
  assert.equal(entry?.entries?.find((item) => item.type === "mood")?.payload.moodScore, 94);
});

test("AI extraction is preserved and merged with locally recognized record types", () => {
  const entry = parseStructuredEntry("我今天吃了披萨！！我要高兴死了！！！", "zh", {
    dataType: "nutrition",
    extractedData: {
      meal: "pantry",
      items: [{ name: "披萨" }],
      totalCalories: 0,
    },
    confidence: 0.91,
  });
  assert.equal(entry?.type, "multi");
  assert.deepEqual(entry?.entries?.map((item) => item.type), ["nutrition", "mood"]);
  assert.equal(entry?.entries?.find((item) => item.type === "nutrition")?.confidence, 0.91);
  assert.equal(entry?.entries?.find((item) => item.type === "nutrition")?.payload.totalCalories, 270);
});

test("AI multi extraction becomes one multi-record confirmation card", () => {
  const entry = parseStructuredEntry("今天心情很好，还吃了披萨", "zh", {
    dataType: "multi",
    extractedData: {
      records: [
        { dataType: "mood", extractedData: { moodScore: 88, diary: "今天心情很好" }, confidence: 0.9 },
        { dataType: "nutrition", extractedData: { items: [{ name: "披萨", calories: 0 }], totalCalories: 0 }, confidence: 0.83 },
      ],
    },
    confidence: 0.86,
  });
  assert.equal(entry?.type, "multi");
  assert.deepEqual(entry?.entries?.map((item) => item.type), ["mood", "nutrition"]);
  assert.equal(entry?.entries?.find((item) => item.type === "mood")?.payload.moodScore, 88);
});
