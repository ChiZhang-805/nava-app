import { suggestedFocusPlan } from "./focusPlanning.ts";

export type StructuredEntryType = "mood" | "sleep" | "exercise" | "nutrition" | "focus" | "todo" | "multi";

export type StructuredField = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  path?: string;
  valueType?: "text" | "number";
};

export type StructuredEntry = {
  id: string;
  type: StructuredEntryType;
  title: string;
  summary: string;
  fields: StructuredField[];
  payload: Record<string, unknown>;
  confidence: number;
  entries?: StructuredEntry[];
};

export type StructuredExtraction = {
  dataType?: unknown;
  extractedData?: unknown;
  confidence?: unknown;
};

type FoodItemDraft = {
  name: string;
  quantity: number;
  unit: string;
  amount: string;
  calories: number;
  caloriesPerUnit: number;
  estimated?: boolean;
  estimationBasis?: string;
};

const moodWords: Array<[RegExp, number]> = [
  [/高兴死了|开心死了|快乐死了|兴奋(?:得)?(?:要命|爆棚)|overjoyed|ecstatic/i, 94],
  [/非常(?:的)?(?:开心|高兴|快乐|愉快|兴奋)|特别(?:开心|高兴|快乐)|extremely happy|very excited/i, 90],
  [/开心|高兴|愉快|兴奋|很好|快乐|happy|glad|great|excited/i, 85],
  [/平静|稳定|一般|calm|steady|okay/i, 68],
  [/焦虑|压力|烦|难过|低落|anxious|stress|sad/i, 38],
];

const chineseDigits: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const foodCalories: Array<{ pattern: RegExp; calories: number; defaultUnit: string; nameZh: string; nameEn: string }> = [
  { pattern: /鸡蛋|蛋\b|egg/i, calories: 70, defaultUnit: "个", nameZh: "鸡蛋", nameEn: "Egg" },
  { pattern: /面包|吐司|bread|toast/i, calories: 75, defaultUnit: "片", nameZh: "面包", nameEn: "Bread" },
  { pattern: /香蕉|banana/i, calories: 105, defaultUnit: "根", nameZh: "香蕉", nameEn: "Banana" },
  { pattern: /苹果|apple/i, calories: 95, defaultUnit: "个", nameZh: "苹果", nameEn: "Apple" },
  { pattern: /米饭|rice/i, calories: 230, defaultUnit: "碗", nameZh: "米饭", nameEn: "Rice" },
  { pattern: /牛奶|milk/i, calories: 120, defaultUnit: "杯", nameZh: "牛奶", nameEn: "Milk" },
  { pattern: /咖啡|coffee/i, calories: 5, defaultUnit: "杯", nameZh: "咖啡", nameEn: "Coffee" },
  { pattern: /酸奶|yogurt/i, calories: 120, defaultUnit: "杯", nameZh: "酸奶", nameEn: "Yogurt" },
  { pattern: /披萨|比萨|pizza/i, calories: 270, defaultUnit: "片", nameZh: "披萨", nameEn: "Pizza" },
];

const numericToken = "[\\d一二两三四五六七八九十百零〇]+(?:\\.\\d+)?";

function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalizedNumber(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const normalized = token.replace(/[,，]/g, "");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;
  if (normalized === "十") return 10;
  if (normalized.includes("百")) {
    const [hundreds, rest = ""] = normalized.split("百");
    return (chineseDigits[hundreds] ?? 1) * 100 + (parseLocalizedNumber(rest) ?? 0);
  }
  if (normalized.includes("十")) {
    const [tens, ones = ""] = normalized.split("十");
    return (chineseDigits[tens] ?? 1) * 10 + (chineseDigits[ones] ?? 0);
  }
  if (normalized.length === 1) return chineseDigits[normalized];
  const digits = [...normalized].map((digit) => chineseDigits[digit]);
  return digits.every((digit) => digit != null) ? Number(digits.join("")) : undefined;
}

function numberMatch(text: string, pattern: RegExp) {
  return parseLocalizedNumber(text.match(pattern)?.[1]);
}

function normalizeClock(period: string | undefined, hourValue: string, minuteValue?: string) {
  let hour = Math.min(23, Number(hourValue));
  const minute = Math.min(59, Number(minuteValue ?? 0));
  if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;
  if (period === "凌晨" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeMatches(text: string) {
  return [...text.matchAll(/(?:(凌晨|早上|上午|中午|下午|晚上)\s*(\d{1,2})(?:[:：点时]\s*(\d{1,2}))?|(?<!\d)(\d{1,2})[:：](\d{1,2}))/g)]
    .map((match) => match[4] ? normalizeClock(undefined, match[4], match[5]) : normalizeClock(match[1], match[2], match[3]))
    .slice(0, 2);
}

function clockFromMinutes(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function currentClockMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function sleepMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function todoSchedule(text: string) {
  const now = new Date();
  let scheduledDate = localDateISO(now);
  let matchedDateText = "";
  if (/明天|tomorrow/i.test(text)) {
    scheduledDate = localDateISO(addDays(now, 1));
    matchedDateText = /明天/i.test(text) ? "明天" : "tomorrow";
  } else {
    const iso = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    const zh = text.match(/(?<!\d)(\d{1,2})月(\d{1,2})日?/);
    if (iso) {
      scheduledDate = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
      matchedDateText = iso[0];
    } else if (zh) {
      let date = new Date(now.getFullYear(), Number(zh[1]) - 1, Number(zh[2]));
      if (localDateISO(date) < localDateISO(now)) date = new Date(now.getFullYear() + 1, Number(zh[1]) - 1, Number(zh[2]));
      scheduledDate = localDateISO(date);
      matchedDateText = zh[0];
    }
  }
  return { scheduledDate, scheduledTime: timeMatches(text)[0], matchedDateText };
}

function cleanTodoTitle(text: string, matchedDateText: string) {
  return text
    .replace(/^(请)?(帮我)?(添加|记录|新建)?(一个)?/i, "")
    .replace(/待办事项|待办|提醒我|remind me|todo/gi, " ")
    .replace(/今天|今日|明天|today|tomorrow/gi, " ")
    .replace(matchedDateText, " ")
    .replace(/(?:凌晨|早上|上午|中午|下午|晚上)\s*\d{1,2}(?:[:：点时]\s*\d{1,2})?|(?<!\d)\d{1,2}[:：]\d{1,2}/g, " ")
    .replace(/^\s*(?:at|to)\s+/i, "")
    .replace(/[：:,，]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function title(type: Exclude<StructuredEntryType, "multi">, locale: "zh" | "en") {
  const labels = locale === "zh"
    ? { mood: "情绪记录", sleep: "睡眠记录", exercise: "运动记录", nutrition: "饮食记录", focus: "专注记录", todo: "待办事项" }
    : { mood: "Mood record", sleep: "Sleep record", exercise: "Activity record", nutrition: "Meal record", focus: "Focus record", todo: "To-do" };
  return labels[type];
}

function field(input: Omit<StructuredField, "id">): StructuredField {
  return { id: crypto.randomUUID(), ...input };
}

function entry(type: Exclude<StructuredEntryType, "multi">, locale: "zh" | "en", summary: string, fields: Array<Omit<StructuredField, "id">>, payload: Record<string, unknown>, confidence = 0.86): StructuredEntry {
  return { id: crypto.randomUUID(), type, title: title(type, locale), summary, fields: fields.map(field), payload, confidence };
}

function multiEntry(entries: StructuredEntry[], locale: "zh" | "en", summary: string): StructuredEntry {
  return {
    id: crypto.randomUUID(),
    type: "multi",
    title: locale === "zh" ? "多项记录" : "Multiple records",
    summary,
    fields: entries.flatMap((item) => item.fields),
    payload: {},
    confidence: entries.reduce((sum, item) => sum + item.confidence, 0) / entries.length,
    entries,
  };
}

function extractSleepEntry(value: string, locale: "zh" | "en") {
  if (!/睡|醒|起床|入睡|sleep|bed|woke/i.test(value)) return null;
  const times = timeMatches(value);
  let start = times[0];
  let end = times[1];
  let durationMinutes = start && end ? sleepMinutes(start, end) : undefined;
  if (durationMinutes == null) {
    const hours = numberMatch(value, new RegExp(`(?:睡了?|睡眠|休息|slept|sleep)[^\\d一二两三四五六七八九十百零〇]{0,8}(${numericToken})\\s*(?:个)?(?:小时|钟头|hours?|hrs?|h)`, "i"))
      ?? numberMatch(value, new RegExp(`(${numericToken})\\s*(?:个)?(?:小时|钟头|hours?|hrs?|h)[^，。,.]{0,6}(?:睡眠|睡觉|休息|sleep)`, "i"));
    const minutes = hours != null
      ? numberMatch(value, new RegExp(`${numericToken}\\s*(?:个)?(?:小时|钟头|hours?|hrs?|h)\\s*(${numericToken})\\s*(?:分钟|mins?|minutes?)`, "i"))
      : numberMatch(value, new RegExp(`(?:睡了?|睡眠|休息|slept|sleep)[^\\d一二两三四五六七八九十百零〇]{0,8}(${numericToken})\\s*(?:分钟|mins?|minutes?)`, "i"));
    durationMinutes = hours != null ? Math.round(hours * 60 + (minutes ?? 0)) : minutes;
    if (durationMinutes && durationMinutes > 0) {
      const endMinutes = currentClockMinutes();
      end = clockFromMinutes(endMinutes);
      start = clockFromMinutes(endMinutes - durationMinutes);
    }
  }
  if (!start || !end || !durationMinutes) return null;
  const explicitTimes = times.length >= 2;
  return entry("sleep", locale, value, [
    ...(explicitTimes ? [
      { label: locale === "zh" ? "入睡时间" : "Bedtime", value: start, path: "start" },
      { label: locale === "zh" ? "醒来时间" : "Wake time", value: end, path: "end" },
    ] : []),
    { label: locale === "zh" ? "睡眠时长" : "Sleep duration", value: String(durationMinutes), unit: locale === "zh" ? "分钟" : "min", path: "durationMinutes", valueType: "number" },
  ], { start, end, durationMinutes, inferredTimes: !explicitTimes }, explicitTimes ? 0.9 : 0.82);
}

function extractExerciseEntry(value: string, locale: "zh" | "en") {
  if (!/步|跑|运动|训练|骑行|健身|exercise|steps|run|walk|workout/i.test(value)) return null;
  const steps = numberMatch(value, new RegExp(`(${numericToken})\\s*(?:步|steps?)`, "i"));
  const minutes = numberMatch(value, new RegExp(`(?:跑|运动|训练|骑行|健身|run|walk|exercise|workout)[^\\d一二两三四五六七八九十百零〇]{0,8}(${numericToken})\\s*(?:分钟|分|mins?|minutes?)`, "i"))
    ?? numberMatch(value, new RegExp(`(${numericToken})\\s*(?:分钟|分|mins?|minutes?)[^，。,.]{0,8}(?:跑|运动|训练|骑行|健身|run|walk|exercise|workout)`, "i"));
  const calories = numberMatch(value, new RegExp(`(${numericToken})\\s*(?:千卡|卡路里|kcal)`, "i"));
  if (steps == null && minutes == null && calories == null) return null;
  const fields: Array<Omit<StructuredField, "id">> = [];
  if (steps != null) fields.push({ label: locale === "zh" ? "运动步数" : "Steps", value: String(steps), unit: locale === "zh" ? "步" : "steps", path: "steps", valueType: "number" });
  if (minutes != null) fields.push({ label: locale === "zh" ? "运动时长" : "Activity duration", value: String(minutes), unit: locale === "zh" ? "分钟" : "min", path: "minutes", valueType: "number" });
  if (calories != null) fields.push({ label: locale === "zh" ? "运动消耗" : "Calories burned", value: String(calories), unit: locale === "zh" ? "千卡" : "kcal", path: "calories", valueType: "number" });
  return entry("exercise", locale, value, fields, {
    ...(steps != null ? { steps } : {}),
    ...(minutes != null ? { minutes } : {}),
    ...(calories != null ? { calories } : {}),
  });
}

function extractFocusEntry(value: string, locale: "zh" | "en") {
  if (!/专注|学习|工作了|focus|studied|worked/i.test(value)) return null;
  const minutes = numberMatch(value, new RegExp(`(${numericToken})\\s*(?:分钟|分|mins?|minutes?)`, "i"));
  if (minutes == null) return null;
  const taskTitle = value.replace(new RegExp(`${numericToken}\\s*(?:分钟|分|mins?|minutes?)`, "i"), "").replace(/专注|focus/gi, "").trim() || (locale === "zh" ? "专注任务" : "Focus task");
  return entry("focus", locale, value, [
    { label: locale === "zh" ? "专注事项" : "Task", value: taskTitle, path: "taskTitle" },
    { label: locale === "zh" ? "专注时长" : "Duration", value: String(minutes), unit: locale === "zh" ? "分钟" : "min", path: "minutes", valueType: "number" },
  ], { taskTitle, minutes });
}

function normalizeFoodName(raw: string, locale: "zh" | "en") {
  const clean = raw.replace(/^(?:了|些|一份)/, "").trim();
  const known = foodCalories.find((food) => food.pattern.test(clean));
  return known ? (locale === "zh" ? known.nameZh : known.nameEn) : clean;
}

function calorieRule(name: string, unit: string) {
  const known = foodCalories.find((food) => food.pattern.test(name));
  if (!known) return 0;
  if (/克|g/i.test(unit)) return known.calories / 100;
  if (/毫升|ml/i.test(unit)) return known.calories / 250;
  return known.calories;
}

function extractFoodItems(value: string, locale: "zh" | "en"): FoodItemDraft[] {
  const items: FoodItemDraft[] = [];
  const pattern = new RegExp(`(${numericToken})\\s*(个|只|枚|颗|片|碗|杯|克|g|毫升|ml|份|根|块|勺)\\s*([\\u4e00-\\u9fa5A-Za-z]{1,12}?)(?=和|与|及|、|，|。|,|\\.|然后|$)`, "giu");
  for (const match of value.matchAll(pattern)) {
    const quantity = parseLocalizedNumber(match[1]);
    if (quantity == null || quantity <= 0) continue;
    const unit = match[2];
    const name = normalizeFoodName(match[3], locale);
    if (!name || /小时|分钟|运动|睡眠|跑步/.test(name)) continue;
    const caloriesPerUnit = calorieRule(name, unit);
    items.push({ name, quantity, unit, amount: `${quantity}${unit}`, calories: Math.max(0, Math.round(quantity * caloriesPerUnit)), caloriesPerUnit });
  }
  if (items.length > 0) return items;
  const known = foodCalories.find((food) => food.pattern.test(value));
  if (known) return [{
    name: locale === "zh" ? known.nameZh : known.nameEn,
    quantity: 1,
    unit: known.defaultUnit,
    amount: `1${known.defaultUnit}`,
    calories: known.calories,
    caloriesPerUnit: known.calories,
    estimated: true,
    estimationBasis: locale === "zh" ? "按常见单份估算" : "Estimated from a common serving",
  }];
  return [];
}

function extractNutritionEntry(value: string, locale: "zh" | "en") {
  if (!/吃|喝|早餐|午餐|晚餐|加餐|咖啡|饮食|ate|breakfast|lunch|dinner|coffee|food/i.test(value)) return null;
  const explicitCalories = numberMatch(value, new RegExp(`(${numericToken})\\s*(?:千卡|卡路里|kcal)`, "i"));
  const items = extractFoodItems(value, locale);
  if (items.length === 0 && explicitCalories == null) return null;
  const meal = /早餐|breakfast/i.test(value) ? "breakfast" : /午餐|lunch/i.test(value) ? "lunch" : /晚餐|dinner/i.test(value) ? "dinner" : "pantry";
  const totalCalories = Math.max(0, Math.round(explicitCalories ?? items.reduce((sum, item) => sum + item.calories, 0)));
  if (explicitCalories != null && items.length > 0) {
    const estimatedTotal = items.reduce((sum, item) => sum + item.calories, 0) || 1;
    let assigned = 0;
    items.forEach((item, index) => {
      item.calories = index === items.length - 1
        ? Math.max(0, totalCalories - assigned)
        : Math.max(0, Math.round(totalCalories * item.calories / estimatedTotal));
      assigned += item.calories;
      item.caloriesPerUnit = item.quantity > 0 ? item.calories / item.quantity : 0;
    });
  }
  const fields: Array<Omit<StructuredField, "id">> = items.map((item, index) => ({
    label: item.name,
    value: String(item.quantity),
    unit: item.unit,
    path: `items.${index}.quantity`,
    valueType: "number",
  }));
  fields.push({ label: locale === "zh" ? "预估热量" : "Estimated calories", value: String(totalCalories), unit: locale === "zh" ? "千卡" : "kcal", path: "totalCalories", valueType: "number" });
  return entry("nutrition", locale, value, fields, {
    meal,
    items,
    totalCalories,
    calories: totalCalories,
    name: items.map((item) => `${item.amount}${item.name}`).join("、") || value,
  }, explicitCalories == null ? (totalCalories > 0 ? 0.74 : 0.62) : 0.88);
}

function extractMoodEntry(value: string, locale: "zh" | "en") {
  if (!/情绪|心情|压力|焦虑|开心|高兴|快乐|愉快|兴奋|平静|难过|低落|mood|stress|anxious|happy|glad|excited|calm|sad/i.test(value)) return null;
  const explicit = numberMatch(value, /(?:情绪|心情|mood)?\s*(\d{1,3})\s*(?:分|\/100)?/i);
  const inferred = moodWords.find(([pattern]) => pattern.test(value))?.[1] ?? 60;
  const score = Math.max(0, Math.min(100, explicit ?? inferred));
  return entry("mood", locale, value, [
    { label: locale === "zh" ? "情绪强度" : "Mood score", value: String(score), unit: "/100", path: "moodScore", valueType: "number" },
    { label: locale === "zh" ? "情绪描述" : "Note", value, path: "diary" },
  ], { moodScore: score, factors: [], diary: value, estimated: explicit == null });
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractionConfidence(value: unknown, fallback = 0.76) {
  const parsed = numberValue(value);
  return parsed == null ? fallback : Math.max(0, Math.min(1, parsed));
}

function modelEntry(dataType: string, data: Record<string, unknown>, text: string, locale: "zh" | "en", confidence: number, allowLocalEstimates = true): StructuredEntry | null {
  if (dataType === "mood") {
    const score = numberValue(data.moodScore) ?? numberValue(data.mood_score) ?? numberValue(data.score);
    if (score == null) return null;
    const diary = stringValue(data.diary) ?? stringValue(data.note) ?? text;
    const factors = Array.isArray(data.factors) ? data.factors.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    return entry("mood", locale, diary, [
      { label: locale === "zh" ? "情绪强度" : "Mood score", value: String(normalizedScore), unit: "/100", path: "moodScore", valueType: "number" },
      { label: locale === "zh" ? "情绪描述" : "Note", value: diary, path: "diary" },
    ], {
      moodScore: normalizedScore,
      factors,
      diary,
      estimated: data.estimated === true,
    }, confidence);
  }

  if (dataType === "sleep") {
    let start = stringValue(data.sleepStart) ?? stringValue(data.sleep_start) ?? stringValue(data.start);
    let end = stringValue(data.sleepEnd) ?? stringValue(data.sleep_end) ?? stringValue(data.end);
    let durationMinutes = numberValue(data.sleepDurationMinutes) ?? numberValue(data.sleep_duration_minutes) ?? numberValue(data.durationMinutes);
    if (durationMinutes == null && start && end) durationMinutes = sleepMinutes(start, end);
    if (durationMinutes != null && (!start || !end) && allowLocalEstimates) {
      const endMinutes = currentClockMinutes();
      end = end ?? clockFromMinutes(endMinutes);
      start = start ?? clockFromMinutes(endMinutes - durationMinutes);
    }
    if (durationMinutes == null || durationMinutes <= 0 || Boolean(start) !== Boolean(end)) return null;
    return entry("sleep", locale, text, [
      ...(start && end ? [
        { label: locale === "zh" ? "入睡时间" : "Bedtime", value: start, path: "start" },
        { label: locale === "zh" ? "醒来时间" : "Wake time", value: end, path: "end" },
      ] : []),
      { label: locale === "zh" ? "睡眠时长" : "Sleep duration", value: String(Math.round(durationMinutes)), unit: locale === "zh" ? "分钟" : "min", path: "durationMinutes", valueType: "number" },
    ], { ...(start && end ? { start, end } : {}), durationMinutes: Math.round(durationMinutes) }, confidence);
  }

  if (dataType === "exercise") {
    const steps = numberValue(data.steps);
    const calories = numberValue(data.calories);
    const minutes = numberValue(data.exerciseMinutes) ?? numberValue(data.exercise_minutes) ?? numberValue(data.minutes);
    if (steps == null && calories == null && minutes == null) return null;
    const fields: Array<Omit<StructuredField, "id">> = [];
    if (steps != null) fields.push({ label: locale === "zh" ? "运动步数" : "Steps", value: String(Math.round(steps)), unit: locale === "zh" ? "步" : "steps", path: "steps", valueType: "number" });
    if (minutes != null) fields.push({ label: locale === "zh" ? "运动时长" : "Activity duration", value: String(Math.round(minutes)), unit: locale === "zh" ? "分钟" : "min", path: "minutes", valueType: "number" });
    if (calories != null) fields.push({ label: locale === "zh" ? "运动消耗" : "Calories burned", value: String(Math.round(calories)), unit: locale === "zh" ? "千卡" : "kcal", path: "calories", valueType: "number" });
    return entry("exercise", locale, text, fields, {
      ...(steps != null ? { steps: Math.round(steps) } : {}),
      ...(calories != null ? { calories: Math.round(calories) } : {}),
      ...(minutes != null ? { minutes: Math.round(minutes) } : {}),
    }, confidence);
  }

  if (dataType === "focus") {
    const minutes = numberValue(data.minutes) ?? numberValue(data.totalMinutes) ?? numberValue(data.total_minutes);
    if (minutes == null || minutes <= 0) return null;
    const taskTitle = stringValue(data.taskTitle) ?? stringValue(data.task_title) ?? (locale === "zh" ? "专注任务" : "Focus task");
    return entry("focus", locale, text, [
      { label: locale === "zh" ? "专注事项" : "Task", value: taskTitle, path: "taskTitle" },
      { label: locale === "zh" ? "专注时长" : "Duration", value: String(Math.round(minutes)), unit: locale === "zh" ? "分钟" : "min", path: "minutes", valueType: "number" },
    ], { taskTitle, minutes: Math.round(minutes) }, confidence);
  }

  if (dataType === "nutrition") {
    const totalCalories = Math.max(0, Math.round(numberValue(data.totalCalories) ?? numberValue(data.total_calories) ?? numberValue(data.calories) ?? numberValue(data.kcal) ?? 0));
    const rawItems = Array.isArray(data.items) ? data.items.map(recordValue).filter((item): item is Record<string, unknown> => item != null) : [];
    if (rawItems.length === 0) {
      const name = stringValue(data.name) ?? stringValue(data.food) ?? stringValue(data.title);
      if (name) rawItems.push({ name, amount: stringValue(data.amount), calories: totalCalories });
    }
    if (rawItems.length === 0) return null;
    const items: FoodItemDraft[] = rawItems.map((item) => {
      const amount = stringValue(item.amount) ?? "";
      const quantity = numberValue(item.quantity) ?? numberValue(amount.match(/[\d.]+/)?.[0]) ?? 1;
      const unit = stringValue(item.unit) ?? (amount.replace(/[\d.\s]/g, "") || (locale === "zh" ? "份" : "serving"));
      const itemName = stringValue(item.name) ?? (locale === "zh" ? "饮食记录" : "Meal item");
      const statedCalories = numberValue(item.calories);
      const ruleCalories = allowLocalEstimates ? calorieRule(itemName, unit) : 0;
      const calories = Math.max(0, Math.round(statedCalories != null && statedCalories > 0 ? statedCalories : ruleCalories));
      return {
        name: itemName,
        quantity,
        unit,
        amount: amount || `${quantity}${unit}`,
        calories,
        caloriesPerUnit: quantity > 0 ? calories / quantity : 0,
        estimated: typeof item.estimated === "boolean" ? item.estimated : numberValue(item.calories) == null,
        estimationBasis: stringValue(item.estimationBasis) ?? stringValue(item.estimation_basis),
      };
    });
    const resolvedTotal = totalCalories || items.reduce((sum, item) => sum + item.calories, 0);
    if (resolvedTotal <= 0 && !items.every((item) => /水|白开水|无糖茶|water|unsweetened tea/i.test(item.name))) return null;
    const fields: Array<Omit<StructuredField, "id">> = items.map((item, index) => ({
      label: item.name,
      value: String(item.quantity),
      unit: item.unit,
      path: `items.${index}.quantity`,
      valueType: "number",
    }));
    fields.push({ label: locale === "zh" ? "预估热量" : "Estimated calories", value: String(resolvedTotal), unit: locale === "zh" ? "千卡" : "kcal", path: "totalCalories", valueType: "number" });
    const meal = stringValue(data.meal) ?? "pantry";
    return entry("nutrition", locale, text, fields, {
      meal,
      items,
      totalCalories: resolvedTotal,
      calories: resolvedTotal,
      name: items.map((item) => `${item.amount}${item.name}`).join("、"),
      estimated: data.estimated === true || items.some((item) => item.estimated === true),
      estimationBasis: stringValue(data.estimationBasis) ?? stringValue(data.estimation_basis),
    }, confidence);
  }

  return null;
}

function entryFromExtraction(extraction: StructuredExtraction | undefined, text: string, locale: "zh" | "en", allowLocalEstimates = true) {
  if (!extraction) return null;
  const dataType = stringValue(extraction.dataType);
  const data = recordValue(extraction.extractedData);
  if (!dataType || !data || dataType === "unknown" || dataType === "profile") return null;
  if (dataType !== "multi") return modelEntry(dataType, data, text, locale, extractionConfidence(extraction.confidence), allowLocalEstimates);
  const records = Array.isArray(data.records) ? data.records.map(recordValue).filter((item): item is Record<string, unknown> => item != null) : [];
  const entries = records.map((record) => {
    const recordType = stringValue(record.dataType) ?? stringValue(record.data_type) ?? stringValue(record.type);
    const recordData = recordValue(record.extractedData) ?? recordValue(record.extracted_data) ?? recordValue(record.data);
    return recordType && recordData ? modelEntry(recordType, recordData, text, locale, extractionConfidence(record.confidence, extractionConfidence(extraction.confidence)), allowLocalEstimates) : null;
  }).filter((candidate): candidate is StructuredEntry => candidate != null);
  return entries.length === 0 ? null : entries.length === 1 ? entries[0] : multiEntry(entries, locale, text);
}

function localStructuredEntry(value: string, locale: "zh" | "en") {
  const entries = [
    extractSleepEntry(value, locale),
    extractExerciseEntry(value, locale),
    extractFocusEntry(value, locale),
    extractNutritionEntry(value, locale),
    extractMoodEntry(value, locale),
  ].filter((candidate): candidate is StructuredEntry => candidate != null);
  if (entries.length === 0) return null;
  return entries.length === 1 ? entries[0] : multiEntry(entries, locale, value);
}

function flattenedEntries(candidate: StructuredEntry | null) {
  if (!candidate) return [];
  return candidate.entries ?? [candidate];
}

export function parseStructuredEntry(
  text: string,
  locale: "zh" | "en",
  extraction?: StructuredExtraction,
  options: { allowLocalHealthFallback?: boolean } = {},
): StructuredEntry | null {
  const value = text.trim();
  if (!value) return null;

  if (/待办|提醒我|记得要|todo|remind me/i.test(value)) {
    const schedule = todoSchedule(value);
    const todoTitle = cleanTodoTitle(value, schedule.matchedDateText) || value;
    const focusPlan = suggestedFocusPlan(todoTitle);
    return entry("todo", locale, todoTitle, [
      { label: locale === "zh" ? "事项" : "Task", value: todoTitle, path: "title" },
      { label: locale === "zh" ? "日期" : "Date", value: schedule.scheduledDate, path: "scheduledDate" },
      ...(schedule.scheduledTime ? [{ label: locale === "zh" ? "时间" : "Time", value: schedule.scheduledTime, path: "scheduledTime" }] : []),
      { label: locale === "zh" ? "建议专注时长" : "Suggested focus", value: String(focusPlan.focusMinutes), unit: locale === "zh" ? "分钟" : "min", valueType: "number", path: "focusMinutes" },
      { label: locale === "zh" ? "建议次数" : "Suggested sessions", value: String(focusPlan.focusSessions), unit: locale === "zh" ? "次" : "sessions", valueType: "number", path: "focusSessions" },
    ], { title: todoTitle, scheduledDate: schedule.scheduledDate, scheduledTime: schedule.scheduledTime, ...focusPlan });
  }

  const allowLocalHealthFallback = options.allowLocalHealthFallback !== false;
  const model = entryFromExtraction(extraction, value, locale, allowLocalHealthFallback);
  const local = allowLocalHealthFallback ? localStructuredEntry(value, locale) : null;
  const entries = [...flattenedEntries(model)];
  for (const candidate of flattenedEntries(local)) {
    if (!entries.some((item) => item.type === candidate.type)) entries.push(candidate);
  }
  if (entries.length === 0) return null;
  return entries.length === 1 ? entries[0] : multiEntry(entries, locale, value);
}

function setByPath(payload: Record<string, unknown>, path: string, nextValue: string, valueType: StructuredField["valueType"]) {
  const parts = path.split(".");
  let target: unknown = payload;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    target = Array.isArray(target) ? target[Number(part)] : (target as Record<string, unknown>)[part];
    if (!target || typeof target !== "object") return;
  }
  const key = parts[parts.length - 1];
  const parsed = valueType === "number" ? Number(nextValue) : nextValue;
  if (valueType === "number" && !Number.isFinite(parsed)) return;
  if (Array.isArray(target)) target[Number(key)] = parsed;
  else (target as Record<string, unknown>)[key] = parsed;
}

function updateSingleEntry(candidate: StructuredEntry, fieldId: string, value: string): StructuredEntry {
  const fieldToUpdate = candidate.fields.find((item) => item.id === fieldId);
  if (!fieldToUpdate) return candidate;
  const payload = structuredClone(candidate.payload);
  if (fieldToUpdate.path) setByPath(payload, fieldToUpdate.path, value, fieldToUpdate.valueType);
  let fields = candidate.fields.map((item) => item.id === fieldId ? { ...item, value } : item);

  if (candidate.type === "nutrition") {
    if (payload.source === "vision") {
      const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
      if (fieldToUpdate.path?.startsWith("items.") && fieldToUpdate.path.endsWith(".calories")) {
        const totalCalories = items.reduce((sum, item) => sum + Math.max(0, Number(item.calories) || 0), 0);
        payload.totalCalories = Math.round(totalCalories);
        payload.calories = Math.round(totalCalories);
        fields = fields.map((item) => item.path === "totalCalories" ? { ...item, value: String(Math.round(totalCalories)) } : item);
      }
      if (fieldToUpdate.path === "totalCalories") {
        const nextTotal = Math.max(0, Math.round(Number(value) || 0));
        const previousTotal = items.reduce((sum, item) => sum + Math.max(0, Number(item.calories) || 0), 0) || 1;
        let assigned = 0;
        items.forEach((item, index) => {
          const calories = index === items.length - 1
            ? Math.max(0, nextTotal - assigned)
            : Math.max(0, Math.round(nextTotal * (Math.max(0, Number(item.calories) || 0) / previousTotal)));
          item.calories = calories;
          assigned += calories;
        });
        payload.totalCalories = nextTotal;
        payload.calories = nextTotal;
        fields = fields.map((item) => {
          const match = item.path?.match(/^items\.(\d+)\.calories$/);
          return match ? { ...item, value: String(items[Number(match[1])]?.calories ?? 0) } : item;
        });
      }
      return { ...candidate, fields, payload };
    }
    const items = Array.isArray(payload.items) ? payload.items as FoodItemDraft[] : [];
    for (const item of items) {
      item.quantity = Math.max(0, Number(item.quantity) || 0);
      item.amount = `${item.quantity}${item.unit}`;
      item.calories = Math.max(0, Math.round(item.quantity * (Number(item.caloriesPerUnit) || 0)));
    }
    if (fieldToUpdate.path?.endsWith(".quantity")) {
      payload.totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
      payload.calories = payload.totalCalories;
      payload.name = items.map((item) => `${item.amount}${item.name}`).join("、");
      fields = fields.map((item) => item.path === "totalCalories" ? { ...item, value: String(payload.totalCalories) } : item);
    }
    if (fieldToUpdate.path === "totalCalories") {
      const nextTotal = Math.max(0, Math.round(Number(value) || 0));
      const previousTotal = items.reduce((sum, item) => sum + item.calories, 0) || 1;
      let assigned = 0;
      items.forEach((item, index) => {
        item.calories = index === items.length - 1
          ? Math.max(0, nextTotal - assigned)
          : Math.max(0, Math.round(nextTotal * item.calories / previousTotal));
        assigned += item.calories;
        item.caloriesPerUnit = item.quantity > 0 ? item.calories / item.quantity : 0;
      });
      payload.totalCalories = nextTotal;
      payload.calories = nextTotal;
    }
  }

  return { ...candidate, fields, payload };
}

export function updateStructuredEntryField(candidate: StructuredEntry, fieldId: string, value: string): StructuredEntry {
  if (!candidate.entries) return updateSingleEntry(candidate, fieldId, value);
  const entries = candidate.entries.map((item) => updateSingleEntry(item, fieldId, value));
  return { ...candidate, entries, fields: entries.flatMap((item) => item.fields) };
}
