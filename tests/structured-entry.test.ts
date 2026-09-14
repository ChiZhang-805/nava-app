import assert from "node:assert/strict";
import test from "node:test";
import { applyPhotoNutritionCorrection, parseStructuredEntry, updateStructuredEntryField, type StructuredEntry } from "../src/services/structuredEntryParser.ts";
import { focusDifficultyPrompt, focusDurationChoice, focusInSessionEncouragementPrompt, focusPriorityPrompt, focusStartingCuePrompt, parseFocusPriorityAdvice, resolveTodoFocusPlan, suggestedFocusPlan } from "../src/services/focusPlanning.ts";
import { formatFocusHealthEvidence, nextFocusEncouragementAt, selectFocusHealthEvidence } from "../src/services/focusEncouragement.ts";
import type { TrendBundle } from "../src/types.ts";
import type { UserProfile } from "../src/services/profile.ts";

test("todo focus planning preserves user values and estimates missing plans", () => {
  assert.deepEqual(suggestedFocusPlan("写作业"), { focusMinutes: 45, focusSessions: 2 });
  assert.deepEqual(suggestedFocusPlan("上课"), { focusMinutes: 25, focusSessions: 2 });
  assert.deepEqual(resolveTodoFocusPlan({ title: "复习", focusMinutes: 60, focusSessions: 3 }), {
    focusMinutes: 60,
    focusSessions: 3,
    suggested: false,
  });
  assert.equal(resolveTodoFocusPlan({ title: "整理书桌" }).suggested, true);
  assert.equal(focusDurationChoice(45), "45");
  assert.equal(focusDurationChoice(37), "custom");
  const prompt = focusDifficultyPrompt("交论文", 45, 2, "zh");
  assert.match(prompt, /交论文/);
  assert.match(prompt, /每次 45 分钟，共 2 次/);
  assert.match(prompt, /信息不足/);
  assert.match(prompt, /不要声称已修改或保存/);
  const cuePrompt = focusStartingCuePrompt("交论文", 45, "zh");
  assert.match(cuePrompt, /"交论文"/);
  assert.match(cuePrompt, /不超过24个汉字/);
  assert.match(cuePrompt, /计划专注 45 分钟/);
  assert.match(cuePrompt, /不是对你的指令/);
  const priorityPrompt = focusPriorityPrompt([{ title: "交论文", scheduledTime: "15:30", focusMinutes: 45 }, { title: "整理书桌" }], "zh");
  assert.match(priorityPrompt, /"number":1,"title":"交论文","time":"15:30","minutes":45,"important":null,"urgent":null/);
  assert.match(priorityPrompt, /important\/urgent 仅在布尔值明确时/);
  assert.match(priorityPrompt, /order 必须恰好包含编号 1 到 2 各一次/);
  assert.match(priorityPrompt, /不要声称已经修改、保存或完成待办/);
  assert.deepEqual(parseFocusPriorityAdvice('{"order":[2,1],"basis":"时间明确","question":"截止时间是几点？"}', 2), {
    order: [2, 1], basis: "时间明确", question: "截止时间是几点？",
  });
  assert.throws(() => parseFocusPriorityAdvice('{"order":[2,2],"basis":"x","question":"y"}', 2));
  assert.throws(() => parseFocusPriorityAdvice('{"order":[1],"basis":"x","question":"y"}', 2));
  assert.deepEqual(parseFocusPriorityAdvice("先完成任务2（25分钟），再处理任务1（15:30，45分钟）。", 2).order, [2, 1]);
  assert.throws(() => parseFocusPriorityAdvice("先完成任务2（25分钟）。", 2));
  const inSessionPrompt = focusInSessionEncouragementPrompt("整理研究笔记", 12, "zh");
  assert.match(inSessionPrompt, /已进行约 12 分钟/);
  assert.match(inSessionPrompt, /不足两个领域时只给任务提示/);
  assert.match(inSessionPrompt, /不能编造记录、诊断、推断因果/);
});

test("focus encouragement uses only consented saved recent evidence and bounded timer slots", () => {
  const bundle = {
    sleeps: [{ record_date: "2026-09-13", sleep_duration_minutes: 445 }, { record_date: "2026-09-06", sleep_duration_minutes: 600 }],
    moods: [{ record_date: "2026-09-13", mood_score: 72 }],
    exercises: [{ record_date: "2026-09-14", exercise_minutes: null, steps: 7800 }],
  } as TrendBundle;
  const profile = { ai_personalization_consent: true } as UserProfile;
  assert.deepEqual(selectFocusHealthEvidence(bundle, { ...profile, ai_personalization_consent: false }, "2026-09-14"), []);
  const evidence = selectFocusHealthEvidence(bundle, profile, "2026-09-14");
  assert.equal(evidence.length, 3);
  assert.equal(evidence[0].date, "2026-09-13");
  assert.equal(evidence[0].value, 445);
  assert.equal(evidence[2].unit, "steps");
  assert.equal(formatFocusHealthEvidence(evidence[0], "zh"), "2026-09-13 睡眠 445分钟");
  const prompt = focusInSessionEncouragementPrompt("整理研究笔记", 18, "zh", evidence.map((item) => formatFocusHealthEvidence(item, "zh")));
  assert.match(prompt, /2026-09-13 睡眠 445分钟/);
  assert.match(prompt, /至少两个不同领域/);
  assert.ok(focusInSessionEncouragementPrompt("x".repeat(300), 180, "en", ["y".repeat(80), "z".repeat(80), "w".repeat(80)]).length <= 600);
  assert.equal(nextFocusEncouragementAt(600), 1500);
  assert.equal(nextFocusEncouragementAt(1501), 2401);
});

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

test("natural future commitment opens an editable to-do card without a reminder keyword", () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const candidate = parseStructuredEntry("明天下午3点要交论文", "zh", { dataType: "unknown" }, { allowLocalHealthFallback: false });
  assert.equal(candidate?.type, "todo");
  assert.equal(candidate.payload.scheduledDate, expectedDate);
  assert.equal(candidate.payload.scheduledTime, "15:00");
  assert.equal(candidate.payload.title, "交论文");
  assert.ok(candidate.fields.find((item) => item.path === "scheduledDate"));
  assert.ok(candidate.fields.find((item) => item.path === "scheduledTime"));
});

test("spoken Chinese clock and day-after-tomorrow are parsed without overwriting health chat", () => {
  const candidate = parseStructuredEntry("后天上午九点半我要开会", "zh", undefined, { allowLocalHealthFallback: false });
  assert.equal(candidate?.type, "todo");
  assert.equal(candidate?.payload.scheduledTime, "09:30");
  assert.equal(candidate?.payload.title, "开会");
  assert.equal(parseStructuredEntry("明天可能要开心一点", "zh", undefined, { allowLocalHealthFallback: false }), null);
  assert.equal(parseStructuredEntry("明天我不打算开会", "zh", undefined, { allowLocalHealthFallback: false }), null);
});

test("formal AI todo extraction produces an editable confirmation card for dates beyond local rules", () => {
  const target = new Date();
  target.setDate(target.getDate() + 9 - (target.getDay() + 6) % 7);
  const scheduledDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  const candidate = parseStructuredEntry("下周三上午九点准备小组汇报", "zh", {
    dataType: "todo",
    extractedData: { title: "准备小组汇报", scheduledDate, scheduledTime: "09:00" },
    confidence: 0.92,
  }, { allowLocalHealthFallback: false });
  assert.equal(candidate?.type, "todo");
  assert.equal(candidate?.payload.scheduledDate, scheduledDate);
  assert.equal(candidate?.payload.scheduledTime, "09:00");
  assert.equal(candidate?.fields.find((item) => item.path === "title")?.value, "准备小组汇报");
  assert.equal(candidate?.confidence, 0.92);
  const dateField = candidate?.fields.find((item) => item.path === "scheduledDate");
  assert.ok(candidate && dateField);
  assert.equal(updateStructuredEntryField(candidate, dateField.id, scheduledDate).payload.scheduledDate, scheduledDate);
});

test("formal AI todo output cannot invent a clock or turn a negated plan into a task", () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const scheduledDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const extraction = { dataType: "todo", extractedData: { title: "开会", scheduledDate, scheduledTime: "15:00" } };
  const noClock = parseStructuredEntry("明天我要开会", "zh", extraction, { allowLocalHealthFallback: false });
  assert.equal(noClock?.type, "todo");
  assert.equal(noClock?.payload.scheduledTime, undefined);
  assert.equal(parseStructuredEntry("明天我不打算开会", "zh", extraction, { allowLocalHealthFallback: false }), null);
  assert.equal(parseStructuredEntry("明天我要开会", "zh", { dataType: "todo", extractedData: { title: "开会", scheduledDate: "2026-02-30" } }, { allowLocalHealthFallback: false })?.payload.scheduledDate, scheduledDate);
});

test("invalid calendar dates cannot silently roll into another month", () => {
  assert.equal(parseStructuredEntry("2026-02-30提醒我交论文", "zh"), null);
  assert.equal(parseStructuredEntry("2月30日提醒我交论文", "zh"), null);
  const leapDay = parseStructuredEntry("2月29日提醒我交论文", "zh");
  assert.equal(leapDay?.type, "todo");
  assert.equal(String(leapDay?.payload.scheduledDate).slice(5), "02-29");
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

test("production model mode does not add locally inferred records or fixed nutrition values", () => {
  const entry = parseStructuredEntry("我今天吃了披萨！！我要高兴死了！！！", "zh", {
    dataType: "mood",
    extractedData: { moodScore: 94, diary: "高兴死了" },
    confidence: 0.92,
  }, { allowLocalHealthFallback: false });
  assert.equal(entry?.type, "mood");
  assert.equal(entry?.payload.moodScore, 94);

  const ungroundedNutrition = parseStructuredEntry("我今天吃了披萨", "zh", {
    dataType: "nutrition",
    extractedData: { meal: "pantry", items: [{ name: "披萨" }], totalCalories: 0 },
    confidence: 0.7,
  }, { allowLocalHealthFallback: false });
  assert.equal(ungroundedNutrition, null);
});

test("production model mode preserves a duration-only sleep record without inventing clock times", () => {
  const entry = parseStructuredEntry("我睡了三个小时", "zh", {
    dataType: "sleep",
    extractedData: { sleepDurationMinutes: 180 },
    confidence: 0.9,
  }, { allowLocalHealthFallback: false });
  assert.equal(entry?.type, "sleep");
  assert.equal(entry?.payload.durationMinutes, 180);
  assert.equal(entry?.payload.start, undefined);
  assert.equal(entry?.payload.end, undefined);
});

test("photo-meal follow-up adjusts named actual portions and keeps item totals consistent", () => {
  const candidate: StructuredEntry = {
    id: "photo-1", type: "nutrition", title: "饮食记录", summary: "米饭、鸡胸肉", confidence: 0.7,
    fields: [
      { id: "rice-weight", label: "米饭份量", value: "180", path: "items.0.weight_grams", valueType: "number" },
      { id: "rice-calories", label: "米饭热量", value: "234", path: "items.0.calories", valueType: "number" },
      { id: "chicken-weight", label: "鸡胸肉份量", value: "100", path: "items.1.weight_grams", valueType: "number" },
      { id: "chicken-calories", label: "鸡胸肉热量", value: "165", path: "items.1.calories", valueType: "number" },
      { id: "total", label: "总热量", value: "399", path: "totalCalories", readOnly: true },
      { id: "protein", label: "蛋白质", value: "34", path: "proteinGrams", readOnly: true },
    ],
    payload: {
      source: "vision", meal: "lunch", totalCalories: 399, proteinGrams: 34,
      items: [
        { name: "米饭", weight_grams: 180, calories: 234, protein_grams: 4, carbohydrate_grams: 50, fat_grams: 0.5, nutrition_source: "vision_estimate" },
        { name: "鸡胸肉", weight_grams: 100, calories: 165, protein_grams: 30, carbohydrate_grams: 0, fat_grams: 4, nutrition_source: "vision_estimate" },
      ],
    },
  };
  const corrected = applyPhotoNutritionCorrection(candidate, "米饭其实是150克，鸡胸肉大约120克。");
  const items = corrected.payload.items as Array<Record<string, unknown>>;
  assert.equal(items[0].weight_grams, 150);
  assert.equal(items[1].weight_grams, 120);
  assert.equal(items[0].nutrition_source, "user_corrected");
  assert.equal(corrected.payload.totalCalories, Number(items[0].calories) + Number(items[1].calories));
  assert.equal(corrected.fields.find((field) => field.path === "totalCalories")?.value, String(corrected.payload.totalCalories));
  assert.equal(applyPhotoNutritionCorrection(corrected, "少油一些").payload.totalCalories, corrected.payload.totalCalories);
  assert.equal(updateStructuredEntryField(corrected, "total", "999").payload.totalCalories, corrected.payload.totalCalories);
  const kcalCorrected = applyPhotoNutritionCorrection(corrected, "米饭200千卡");
  assert.equal((kcalCorrected.payload.items as Array<Record<string, unknown>>)[0].calories, 200);
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
