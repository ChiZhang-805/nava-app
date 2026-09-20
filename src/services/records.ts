import { supabase } from "./supabaseClient";
import { shiftDateISO, todayISO } from "./date";
import { isCompleteMoodRecord } from "./mood";
import { emitReminderRecordSaved } from "./independentReminders";
import type {
  ExerciseRecord,
  DailyRhythmScore,
  FaceAnalysisResult,
  FaceRecord,
  FocusTimeDistribution,
  FocusRecord,
  FoodItem,
  MoodRecord,
  NutritionRecord,
  SleepRecord,
  HealthMetricSnapshot,
  TodaySnapshot,
  TrendBundle,
} from "../types";
import {
  demoTodaySnapshot,
  demoTrends,
  isDemoMode,
  saveDemoExercise,
  saveDemoFace,
  saveDemoFocus,
  saveDemoMood,
  saveDemoNutrition,
  saveDemoSleep,
} from "./demo";
import {
  buildNutritionMutation,
  type MealNutritionSummary,
  type NutritionMeal,
  summaryFromItems,
} from "./nutritionIntegrity";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

function trendRows<T>(result: { data: unknown; error: unknown }, table: string) {
  if (!result.error) return asArray<T>(result.data);
  const detail = result.error instanceof Error ? result.error.message : JSON.stringify(result.error);
  throw new Error(`无法读取 ${table} 的真实趋势数据：${detail}`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nonNegativeInt(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${fieldName}不能为负数。`);
  return Math.round(value);
}

function nonNegativeNumber(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${fieldName}必须是有效的非负数。`);
  return value;
}

function ratingValue(value: number | undefined, fieldName: string) {
  if (value == null) return undefined;
  if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error(`${fieldName}必须在 1 到 5 之间。`);
  return Math.round(value);
}

function validateHHMM(value: string, fieldName: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error(`${fieldName}格式应为 HH:MM。`);
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) throw new Error(`${fieldName}不是有效时间。`);
}

function normalizeRecordDate(input?: string) {
  const date = input ?? todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("记录日期格式应为 YYYY-MM-DD。");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("记录日期不是有效的日历日期。");
  if (date > todayISO()) throw new Error("记录日期不能晚于今天。");
  return date;
}

export function calculateSleepRhythmScore(input: {
  start?: string;
  durationMinutes?: number;
  deepMinutes?: number;
  remMinutes?: number;
  rating?: number;
}) {
  let score = 68;

  if (input.durationMinutes) {
    const hours = input.durationMinutes / 60;
    score += clamp(18 - Math.abs(7.5 - hours) * 6, -18, 18);
  }

  if (input.start) {
    const hour = Number(input.start.split(":")[0]);
    if (!Number.isNaN(hour)) {
      if (hour >= 22 && hour <= 23) score += 8;
      if (hour >= 0 && hour <= 2) score -= 10;
      if (hour >= 3 && hour <= 5) score -= 18;
    }
  }

  if (input.durationMinutes && input.deepMinutes) {
    const deepRatio = input.deepMinutes / input.durationMinutes;
    score += clamp((deepRatio - 0.18) * 50, -8, 8);
  }

  if (input.rating) score += (input.rating - 3) * 2;

  return Number(clamp(score, 0, 100).toFixed(1));
}

function calculateTodayRhythm(snapshot: Omit<TodaySnapshot, "rhythmScore" | "nextAction">) {
  let score = 55;
  const signals: number[] = [];

  if (snapshot.sleep?.rhythm_score != null) signals.push(Number(snapshot.sleep.rhythm_score));
  if (snapshot.mood?.mood_score != null) signals.push(snapshot.mood.mood_score);
  if (snapshot.exercise?.steps != null) signals.push(clamp((snapshot.exercise.steps / 8000) * 100, 0, 100));
  if (snapshot.nutrition?.total_calories != null) {
    const diff = Math.abs(snapshot.nutrition.total_calories - 1800);
    signals.push(clamp(100 - diff / 18, 20, 100));
  }
  if (snapshot.focusMinutes) signals.push(clamp((snapshot.focusMinutes / 120) * 100, 0, 100));

  if (signals.length) {
    score = signals.reduce((sum, item) => sum + item, 0) / signals.length;
  }

  return Math.round(clamp(score, 0, 100));
}

function nextAction(snapshot: Omit<TodaySnapshot, "rhythmScore" | "nextAction">) {
  if (!snapshot.sleep) return "先补齐昨晚睡眠，NAVA 会用它校准今日节律。";
  if (!snapshot.exercise || (snapshot.exercise.steps ?? 0) < 3000) return "今天活动量偏低，先安排 10 分钟轻步行。";
  if (!snapshot.nutrition) return "记录一餐饮食，方便和运动消耗一起判断。";
  if (!isCompleteMoodRecord(snapshot.mood)) return "选择主要原因并写下今天的情绪，完成今日情绪记录。";
  if (snapshot.focusMinutes < 25) return "开启一个 25 分钟专注块，让今日节律更稳定。";
  return "今天基础数据完整，可以让 AI 总结一条个性化建议。";
}

export async function getTodaySnapshot(userId: string, date = todayISO()): Promise<TodaySnapshot> {
  if (isDemoMode()) return demoTodaySnapshot(date);

  const [moodRes, sleepRes, exerciseRes, nutritionRes, focusRes, faceRes, rhythmRes] = await Promise.all([
    supabase.from("mood_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("sleep_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase
      .from("exercise_records")
      .select("*")
      .eq("user_id", userId)
      .eq("record_date", date)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("nutrition_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("focus_records").select("*").eq("user_id", userId).eq("record_date", date),
    supabase.from("face_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    supabase.from("daily_rhythm_scores").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
  ]);

  assertNoError(moodRes.error);
  assertNoError(sleepRes.error);
  assertNoError(exerciseRes.error);
  assertNoError(nutritionRes.error);
  assertNoError(focusRes.error);
  assertNoError(faceRes.error);
  assertNoError(rhythmRes.error);

  const focus = asArray<FocusRecord>(focusRes.data);
  const base = {
    date,
    mood: moodRes.data as MoodRecord | null,
    sleep: sleepRes.data as SleepRecord | null,
    exercise: exerciseRes.data as ExerciseRecord | null,
    nutrition: nutritionRes.data as NutritionRecord | null,
    face: faceRes.data as FaceRecord | null,
    focusMinutes: focus.reduce((sum, item) => sum + (item.total_minutes ?? 0), 0),
    focusSessions: focus.reduce((sum, item) => sum + (item.completed_sessions ?? 0), 0),
  };

  const rhythm = rhythmRes.data as DailyRhythmScore | null;
  const hasDailySignal = Boolean(base.mood || base.sleep || base.exercise || base.nutrition || base.face || focus.length > 0);
  const rhythmScore = rhythm?.score == null
    ? (hasDailySignal ? calculateTodayRhythm(base) : null)
    : Math.round(Number(rhythm.score));
  return {
    ...base,
    rhythmScore,
    rhythmConfidence: rhythm?.confidence == null ? undefined : Number(rhythm.confidence),
    rhythmScoreLower: rhythm?.score_lower == null ? undefined : Math.round(Number(rhythm.score_lower)),
    rhythmScoreUpper: rhythm?.score_upper == null ? undefined : Math.round(Number(rhythm.score_upper)),
    rhythmModelVersion: rhythm
      ? (rhythm.model_version ?? "nava-server-score")
      : (rhythmScore == null ? undefined : "nava-client-estimate-v1"),
    rhythmDataQuality: rhythm?.data_quality_score == null ? undefined : Math.round(Number(rhythm.data_quality_score)),
    rhythmTrendSlope: rhythm?.trend_slope == null ? undefined : Number(rhythm.trend_slope),
    rhythmAnomalyCount: Array.isArray(rhythm?.anomaly_flags) ? rhythm.anomaly_flags.length : 0,
    nextAction: rhythm?.actions?.[0] ?? nextAction(base),
  };
}

export async function refreshRhythmScore(date = todayISO()) {
  if (isDemoMode()) return null;
  const response = await supabase.functions.invoke<DailyRhythmScore>("rhythm-score", { body: { date } });
  assertNoError(response.error);
  return response.data;
}

export async function saveMoodRecord(input: {
  userId: string;
  date?: string;
  moodScore: number;
  factors: string[];
  diary?: string;
}) {
  if (isDemoMode()) {
    const saved = saveDemoMood(input);
    emitReminderRecordSaved(input.userId, normalizeRecordDate(input.date), "mood");
    return saved;
  }

  if (!Number.isFinite(input.moodScore) || input.moodScore < 0 || input.moodScore > 100) {
    throw new Error("情绪分数必须在 0 到 100 之间。");
  }
  const { data, error } = await supabase
    .from("mood_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: normalizeRecordDate(input.date),
        mood_score: input.moodScore,
        factors: input.factors,
        diary_content: input.diary?.trim() || null,
      },
      { onConflict: "user_id,record_date" },
    )
    .select("*")
    .single();

  assertNoError(error);
  emitReminderRecordSaved(input.userId, data.record_date, "mood");
  return data as MoodRecord;
}

export async function saveSleepRecord(input: {
  userId: string;
  date?: string;
  start: string;
  end: string;
  durationMinutes: number;
  deepMinutes?: number;
  lightMinutes?: number;
  remMinutes?: number;
  rating?: number;
  note?: string;
  source?: "manual" | "apple_watch";
}) {
  if (isDemoMode()) return saveDemoSleep(input);

  validateHHMM(input.start, "入睡时间");
  validateHHMM(input.end, "醒来时间");
  const durationMinutes = nonNegativeInt(input.durationMinutes, "睡眠时长");
  if (durationMinutes === 0) throw new Error("睡眠时长必须大于 0。");
  if (input.rating != null && (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5)) {
    throw new Error("睡眠自评分必须在 1 到 5 之间。");
  }
  const deepMinutes = input.deepMinutes == null ? undefined : nonNegativeInt(input.deepMinutes, "深睡时长");
  const lightMinutes = input.lightMinutes == null ? undefined : nonNegativeInt(input.lightMinutes, "浅睡时长");
  const remMinutes = input.remMinutes == null ? undefined : nonNegativeInt(input.remMinutes, "REM 时长");
  const stagedTotal = (deepMinutes ?? 0) + (lightMinutes ?? 0) + (remMinutes ?? 0);
  if (stagedTotal > durationMinutes) throw new Error("睡眠阶段总时长不能超过总睡眠时长。");

  const rhythmScore = calculateSleepRhythmScore({
    start: input.start,
    durationMinutes,
    deepMinutes,
    remMinutes,
    rating: input.rating,
  });

  const { data, error } = await supabase
    .from("sleep_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: normalizeRecordDate(input.date),
        sleep_start: input.start,
        sleep_end: input.end,
        sleep_duration_minutes: durationMinutes,
        deep_sleep_minutes: deepMinutes ?? null,
        light_sleep_minutes: lightMinutes ?? null,
        rem_minutes: remMinutes ?? null,
        self_rating: input.rating ?? null,
        self_note: input.note?.trim() || null,
        device_type: input.source ?? "manual",
        is_night_owl: Number(input.start.split(":")[0]) >= 0 && Number(input.start.split(":")[0]) <= 2,
        rhythm_score: rhythmScore,
      },
      { onConflict: "user_id,record_date" },
    )
    .select("*")
    .single();

  assertNoError(error);
  return data as SleepRecord;
}

export async function saveSleepSummaryRecord(input: {
  userId: string;
  date?: string;
  durationMinutes: number;
  source?: "manual" | "apple_watch";
}) {
  if (isDemoMode()) return saveDemoSleep(input);

  const durationMinutes = nonNegativeInt(input.durationMinutes, "睡眠时长");
  if (durationMinutes === 0) throw new Error("睡眠时长必须大于 0。");
  const { data, error } = await supabase
    .from("sleep_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: normalizeRecordDate(input.date),
        sleep_duration_minutes: durationMinutes,
        device_type: input.source ?? "manual",
        rhythm_score: calculateSleepRhythmScore({ durationMinutes }),
      },
      { onConflict: "user_id,record_date" },
    )
    .select("*")
    .single();

  assertNoError(error);
  return data as SleepRecord;
}

async function findExerciseRecord(userId: string, date: string) {
  const { data, error } = await supabase
    .from("exercise_records")
    .select("*")
    .eq("user_id", userId)
    .eq("record_date", date)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError(error);
  return data as ExerciseRecord | null;
}

async function dedupeExerciseRecords(userId: string, date: string, keepId: string) {
  const { data, error } = await supabase
    .from("exercise_records")
    .select("id")
    .eq("user_id", userId)
    .eq("record_date", date)
    .neq("id", keepId);
  assertNoError(error);
  const duplicateIds = asArray<{ id: string }>(data).map((item) => item.id);
  if (duplicateIds.length > 0) {
    const deletion = await supabase.from("exercise_records").delete().in("id", duplicateIds);
    assertNoError(deletion.error);
  }
}

export async function saveExerciseRecord(input: {
  userId: string;
  date?: string;
  steps?: number | null;
  calories?: number | null;
  minutes?: number | null;
  heartRate?: string;
  spo2?: string;
  rating?: number;
  note?: string;
  sorenessLevel?: number;
  fatigueLevel?: number;
  hasInjury?: boolean;
  injuryNote?: string;
  recoveryEstimateMinHours?: number | null;
  recoveryEstimateMaxHours?: number | null;
  recoveryEstimateConfidence?: number | null;
  recoveryEstimateBasis?: Record<string, unknown> | null;
  recoveryStatus?: "recovered" | "improving" | "not_recovered";
  source?: "manual" | "apple_health";
}) {
  if (input.steps === undefined && input.calories === undefined && input.minutes === undefined
    && input.heartRate == null && input.spo2 == null && input.rating == null && input.note == null
    && input.sorenessLevel == null && input.fatigueLevel == null && input.hasInjury == null) {
    throw new Error("没有可保存的运动数据。");
  }
  if (isDemoMode()) {
    const saved = saveDemoExercise(input);
    emitReminderRecordSaved(input.userId, normalizeRecordDate(input.date), "exercise");
    return saved;
  }

  const recordDate = normalizeRecordDate(input.date);
  const rating = ratingValue(input.rating, "运动自评分");
  const sorenessLevel = input.sorenessLevel == null ? null : Math.min(10, Math.max(0, Math.round(input.sorenessLevel)));
  const fatigueLevel = input.fatigueLevel == null ? null : Math.min(10, Math.max(0, Math.round(input.fatigueLevel)));
  if (input.heartRate != null && input.heartRate.trim()) {
    const heartRate = Number(input.heartRate.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(heartRate) || heartRate < 20 || heartRate > 250) throw new Error("心率必须在 20 到 250 bpm 之间。");
  }
  if (input.spo2 != null && input.spo2.trim()) {
    const spo2 = Number(input.spo2.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(spo2) || spo2 < 50 || spo2 > 100) throw new Error("血氧必须在 50% 到 100% 之间。");
  }
  const existing = await findExerciseRecord(input.userId, recordDate);
  const hasAllActivityMetrics = input.steps != null && input.calories != null && input.minutes != null;
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    record_date: recordDate,
    ...(input.steps !== undefined ? { steps: input.steps === null ? null : nonNegativeInt(input.steps, "步数") } : {}),
    ...(input.calories !== undefined ? { calories: input.calories === null ? null : nonNegativeInt(input.calories, "消耗热量") } : {}),
    ...(input.minutes !== undefined ? { exercise_minutes: input.minutes === null ? null : nonNegativeInt(input.minutes, "运动分钟") } : {}),
    ...(input.heartRate != null ? { heart_rate: input.heartRate.trim() || null } : {}),
    ...(input.spo2 != null ? { spo2: input.spo2.trim() || null } : {}),
    ...(rating != null ? { self_rating: rating } : {}),
    ...(input.note != null ? { self_note: input.note.trim() || null } : {}),
    ...(sorenessLevel != null ? { soreness_level: sorenessLevel } : {}),
    ...(fatigueLevel != null ? { fatigue_level: fatigueLevel } : {}),
    ...(input.hasInjury != null ? { has_injury: input.hasInjury } : {}),
    ...(input.injuryNote != null ? { injury_note: input.injuryNote.trim() || null } : {}),
    ...(input.recoveryEstimateMinHours !== undefined ? { recovery_estimate_min_hours: input.recoveryEstimateMinHours === null ? null : nonNegativeInt(input.recoveryEstimateMinHours, "恢复估算下限") } : {}),
    ...(input.recoveryEstimateMaxHours !== undefined ? { recovery_estimate_max_hours: input.recoveryEstimateMaxHours === null ? null : nonNegativeInt(input.recoveryEstimateMaxHours, "恢复估算上限") } : {}),
    ...(input.recoveryEstimateConfidence !== undefined ? { recovery_estimate_confidence: input.recoveryEstimateConfidence === null ? null : Math.min(1, Math.max(0, input.recoveryEstimateConfidence)) } : {}),
    ...(input.recoveryEstimateBasis !== undefined ? { recovery_estimate_basis: input.recoveryEstimateBasis } : {}),
    ...(input.recoveryStatus != null ? { recovery_status: input.recoveryStatus, recovery_checked_at: new Date().toISOString() } : {}),
    ...(!existing || hasAllActivityMetrics ? { device_type: input.source ?? "manual" } : {}),
  };

  if (!existing) {
    payload.steps ??= null;
    payload.calories ??= null;
    payload.exercise_minutes ??= null;
  }

  const response = existing
    ? await supabase.from("exercise_records").update(payload).eq("id", existing.id).select("*").single()
    : await supabase.from("exercise_records").insert(payload).select("*").single();

  assertNoError(response.error);
  if (response.data?.id) await dedupeExerciseRecords(input.userId, recordDate, response.data.id);
  emitReminderRecordSaved(input.userId, recordDate, "exercise");
  return response.data as ExerciseRecord;
}

export async function saveNutritionRecord(input: {
  userId: string;
  date?: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  item: FoodItem;
  totalCalories: number | null;
  proteinGrams?: number | null;
  carbohydrateGrams?: number | null;
  fatGrams?: number | null;
  hydrationMl?: number | null;
  healthRating?: number;
  photoUrl?: string;
  mealTime?: string;
}) {
  const [validatedItem] = validatedFoodItems([input.item]);
  const rawCalories = validatedItem.calories === undefined ? input.totalCalories : validatedItem.calories;
  const itemCalories = rawCalories == null ? null : nonNegativeInt(rawCalories, "食物热量");
  const item: FoodItem = {
    ...validatedItem,
    calories: itemCalories,
    ...(input.proteinGrams !== undefined ? { protein_grams: input.proteinGrams } : {}),
    ...(input.carbohydrateGrams !== undefined ? { carbohydrate_grams: input.carbohydrateGrams } : {}),
    ...(input.fatGrams !== undefined ? { fat_grams: input.fatGrams } : {}),
  };
  const summary = nutritionInputSummary({ ...input, items: [item] });
  const saved = isDemoMode() ? saveDemoNutrition({ ...input, items: [item], summary, append: true }) : await mutateNutritionMeal({
    ...input,
    items: [item],
    append: true,
    summary,
  });
  if (input.meal !== "pantry") emitReminderRecordSaved(input.userId, saved.record_date, input.meal);
  return saved;
}

export async function saveNutritionItems(input: {
  userId: string;
  date?: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  items: FoodItem[];
  photoUrl?: string;
  proteinGrams?: number | null;
  carbohydrateGrams?: number | null;
  fatGrams?: number | null;
  hydrationMl?: number | null;
  healthRating?: number;
  mealTime?: string;
  append?: boolean;
}) {
  if (input.items.length === 0) throw new Error("没有可保存的食物条目。");
  const items = validatedFoodItems(input.items);
  const saved = isDemoMode() ? saveDemoNutrition({ ...input, items, summary: nutritionInputSummary({ ...input, items }) }) : await mutateNutritionMeal({
    ...input,
    items,
    append: input.append === true,
    summary: nutritionInputSummary(input),
  });
  if (input.meal !== "pantry") emitReminderRecordSaved(input.userId, saved.record_date, input.meal);
  return saved;
}

function nutritionInputSummary(input: {
  items?: FoodItem[];
  proteinGrams?: number | null;
  carbohydrateGrams?: number | null;
  fatGrams?: number | null;
  hydrationMl?: number | null;
  healthRating?: number;
}): MealNutritionSummary {
  const fallback = summaryFromItems(input.items ?? []);
  const normalize = (value: number | null | undefined, derived: number | null, fieldName: string) =>
    value === undefined ? derived : value === null ? null : nonNegativeNumber(value, fieldName);
  const healthRating = ratingValue(input.healthRating, "饮食自评分");
  return {
    protein_grams: normalize(input.proteinGrams, fallback.protein_grams, "蛋白质"),
    carbohydrate_grams: normalize(input.carbohydrateGrams, fallback.carbohydrate_grams, "碳水化合物"),
    fat_grams: normalize(input.fatGrams, fallback.fat_grams, "脂肪"),
    hydration_ml: normalize(input.hydrationMl, null, "饮水量"),
    ...(healthRating == null ? {} : { health_rating: healthRating }),
  };
}

function validatedFoodItems(items: FoodItem[]) {
  return items.map((item) => {
    const name = item.name?.trim();
    if (!name) throw new Error("食物名称不能为空。");
    if (Array.from(name).length > 160) throw new Error("食物名称不能超过 160 个字符。");
    return {
      ...item,
      name,
      ...(item.amount == null ? {} : { amount: item.amount.trim().slice(0, 80) || undefined }),
      ...(item.calories == null ? {} : { calories: nonNegativeNumber(Number(item.calories), "食物热量") }),
      ...(item.protein_grams == null ? {} : { protein_grams: nonNegativeNumber(Number(item.protein_grams), "食物蛋白质") }),
      ...(item.carbohydrate_grams == null ? {} : { carbohydrate_grams: nonNegativeNumber(Number(item.carbohydrate_grams), "食物碳水化合物") }),
      ...(item.fat_grams == null ? {} : { fat_grams: nonNegativeNumber(Number(item.fat_grams), "食物脂肪") }),
    } satisfies FoodItem;
  });
}

async function mutateNutritionMeal(input: {
  userId: string;
  date?: string;
  meal: NutritionMeal;
  items: FoodItem[];
  summary: MealNutritionSummary;
  append: boolean;
  photoUrl?: string;
  mealTime?: string;
}) {
  const recordDate = normalizeRecordDate(input.date);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await supabase
      .from("nutrition_records")
      .select("*")
      .eq("user_id", input.userId)
      .eq("record_date", recordDate)
      .maybeSingle();
    assertNoError(existing.error);
    const current = (existing.data ?? {}) as Partial<NutritionRecord>;
    const mutation = buildNutritionMutation({
      current,
      meal: input.meal,
      items: input.items,
      summary: input.summary,
      append: input.append,
    });
    const photoKey = `${input.meal}_photo_url`;
    if (mutation.unchanged) return current as NutritionRecord;
    const timeKey = `${input.meal}_time`;
    const dailyPayload = Object.fromEntries(Object.entries(mutation)
      .filter(([key]) => key !== "selectedItems" && key !== "selectedSummary" && key !== "unchanged"));
    const payload: Record<string, unknown> = {
      user_id: input.userId,
      record_date: recordDate,
      ...dailyPayload,
      [timeKey]: input.mealTime || current[timeKey as keyof NutritionRecord] || null,
      ...(photoKey !== "pantry_photo_url" && input.photoUrl ? { [photoKey]: input.photoUrl } : {}),
      updated_at: new Date().toISOString(),
    };

    if (existing.data?.id) {
      let request = supabase.from("nutrition_records").update(payload).eq("id", existing.data.id);
      if (existing.data.updated_at) request = request.eq("updated_at", existing.data.updated_at);
      const updated = await request.select("*").maybeSingle();
      assertNoError(updated.error);
      if (updated.data) return updated.data as NutritionRecord;
      continue;
    }

    const inserted = await supabase.from("nutrition_records").insert(payload).select("*").maybeSingle();
    if (!inserted.error && inserted.data) return inserted.data as NutritionRecord;
    if (inserted.error?.code === "23505") continue;
    assertNoError(inserted.error);
  }
  throw new Error("饮食记录在其他设备上发生变化，请重试保存。");
}

export async function saveFaceAnalysisRecord(input: {
  userId: string;
  date?: string;
  result: FaceAnalysisResult;
  imagePath?: string;
  modelVersion?: string;
  captureMode?: "bare_face" | "makeup";
}) {
  if (!Number.isFinite(input.result.overall_score) || input.result.overall_score < 0 || input.result.overall_score > 100) {
    throw new Error("面部状态分数必须在 0 到 100 之间。");
  }
  if (!input.result.feedback?.trim()) throw new Error("面部分析缺少可核对的反馈内容。");
  if (input.result.confidence != null && (!Number.isFinite(input.result.confidence) || input.result.confidence < 0 || input.result.confidence > 1)) {
    throw new Error("面部分析置信度必须在 0 到 1 之间。");
  }
  if (isDemoMode()) {
    return saveDemoFace(input.date ?? todayISO(), {
      id: "demo-face",
      record_date: input.date ?? todayISO(),
      image_path: input.imagePath ?? null,
      overall_score: input.result.overall_score,
      skin_age: input.result.skin_age ?? null,
      annotations: input.result.annotations,
      feedback: input.result.feedback,
      model_version: input.modelVersion ?? "demo",
      capture_mode: input.captureMode ?? "bare_face",
      analysis_confidence: input.result.confidence ?? null,
      derived_features: faceDerivedFeatures(input.result),
      persisted: true,
    } as FaceRecord);
  }

  const { data, error } = await supabase
    .from("face_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: normalizeRecordDate(input.date),
        image_path: input.imagePath ?? null,
        overall_score: input.result.overall_score,
        skin_age: input.result.skin_age ?? null,
        annotations: input.result.annotations,
        feedback: input.result.feedback,
        model_version: input.modelVersion ?? null,
        capture_mode: input.captureMode ?? "bare_face",
        analysis_confidence: input.result.confidence ?? null,
        derived_features: faceDerivedFeatures(input.result),
      },
      { onConflict: "user_id,record_date" },
    )
    .select("*")
    .single();

  assertNoError(error);
  emitReminderRecordSaved(input.userId, normalizeRecordDate(input.date), "face");
  return { ...(data as FaceRecord), persisted: true } as FaceRecord & { persisted: true };
}

function faceDerivedFeatures(result: FaceAnalysisResult) {
  const labels = result.annotations.map((item) => `${item.label} ${item.desc}`).join(" ");
  return {
    annotation_count: result.annotations.length,
    fatigue_signal: /疲|黑眼圈|eye|tired|fatigue/i.test(labels),
    skin_signal: /肤|痘|skin|acne/i.test(labels),
    overall_score: result.overall_score,
    makeup_level: result.makeup_level ?? "uncertain",
    makeup_confidence: result.makeup_confidence ?? null,
  };
}

async function ensureTask(userId: string, title: string, date: string) {
  const existing = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("scheduled_date", date)
    .eq("title", title)
    .limit(1)
    .maybeSingle();
  assertNoError(existing.error);
  if (existing.data) return existing.data as { id: string; title: string };

  const created = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      scheduled_date: date,
      completed: false,
    })
    .select("*")
    .single();
  assertNoError(created.error);
  return created.data as { id: string; title: string };
}

export async function saveFocusSession(input: {
  userId: string;
  taskId?: string;
  date?: string;
  taskTitle: string;
  minutes: number;
  interruptions?: number;
  category?: string;
  startedAt?: string;
  endedAt?: string;
  note?: string;
  source?: "manual" | "ai" | "watch";
  sourceActionId?: string;
}) {
  if (isDemoMode()) {
    const saved = saveDemoFocus(input);
    emitReminderRecordSaved(input.userId, normalizeRecordDate(input.date), "focus");
    return saved;
  }

  const recordDate = normalizeRecordDate(input.date);
  const minutes = nonNegativeInt(input.minutes, "专注分钟");
  if (minutes === 0) throw new Error("专注分钟必须大于 0。");
  // A selected task is an identity, not a title search: same-name todos can coexist.
  let task: { id: string; title: string };
  if (input.taskId) {
    const selected = await supabase.from("tasks").select("id,title").eq("user_id", input.userId).eq("id", input.taskId).maybeSingle();
    assertNoError(selected.error);
    if (!selected.data) throw new Error("所选待办已不可用，本次计时尚未保存。请保留计时并重新确认任务。");
    task = selected.data;
  } else {
    task = await ensureTask(input.userId, input.taskTitle.trim() || "NAVA 专注", recordDate);
  }
  const endedAt = input.endedAt ?? new Date().toISOString();
  const localHour = new Date(input.startedAt ?? endedAt).getHours();
  const response = await supabase.rpc("record_focus_session", {
    p_source_action_id: input.sourceActionId ?? crypto.randomUUID(),
    p_task_id: task.id,
    p_record_date: recordDate,
    p_minutes: minutes,
    p_interruptions: Math.max(0, Math.round(input.interruptions ?? 0)),
    p_category: input.category?.trim() || null,
    p_started_at: input.startedAt ?? null,
    p_ended_at: endedAt,
    p_local_hour: localHour,
    p_note: input.note?.trim() || null,
    p_source: input.source ?? "manual",
  });
  assertNoError(response.error);
  const result = response.data as { applied?: boolean; record?: FocusRecord } | null;
  if (!result?.record) throw new Error("专注会话没有返回可用的保存结果，请刷新后重试。");
  emitReminderRecordSaved(input.userId, recordDate, "focus");
  return result.record;
}

export async function getTrends(userId: string, endDate = todayISO()): Promise<TrendBundle> {
  if (isDemoMode()) return demoTrends(endDate);

  const start = shiftDateISO(endDate, -55);
  const [moods, sleeps, exercises, nutritions, faces, focus, focusDistributions, healthMetrics, rhythms] = await Promise.all([
    supabase.from("mood_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("sleep_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("exercise_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("nutrition_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("face_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("focus_records").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("focus_time_distribution").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("health_metric_snapshots").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
    supabase.from("daily_rhythm_scores").select("*").eq("user_id", userId).gte("record_date", start).lte("record_date", endDate).order("record_date"),
  ]);

  return {
    moods: trendRows<MoodRecord>(moods, "mood_records"),
    sleeps: trendRows<SleepRecord>(sleeps, "sleep_records"),
    exercises: trendRows<ExerciseRecord>(exercises, "exercise_records"),
    nutritions: trendRows<NutritionRecord>(nutritions, "nutrition_records"),
    faces: trendRows<FaceRecord>(faces, "face_records"),
    focus: trendRows<FocusRecord>(focus, "focus_records"),
    focusDistributions: trendRows<FocusTimeDistribution>(focusDistributions, "focus_time_distribution"),
    healthMetrics: trendRows<HealthMetricSnapshot>(healthMetrics, "health_metric_snapshots"),
    rhythms: trendRows<DailyRhythmScore>(rhythms, "daily_rhythm_scores"),
  };
}

export type RecordCoverageDomain = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";
export type RecordCoverage = Record<string, RecordCoverageDomain[]>;

async function recordDates(table: string, userId: string, startDate: string, endDate: string) {
  const rows: Array<{ record_date: string }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const response = await supabase
      .from(table)
      .select("record_date")
      .eq("user_id", userId)
      .gte("record_date", startDate)
      .lte("record_date", endDate)
      .order("record_date")
      .range(from, from + pageSize - 1);
    assertNoError(response.error);
    const page = (response.data ?? []) as Array<{ record_date: string }>;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** Fetch only persisted record dates for the compact annual calendar. */
export async function getRecordCoverageRange(userId: string, startDate: string, endDate: string): Promise<RecordCoverage> {
  const coverage = new Map<string, Set<RecordCoverageDomain>>();
  const add = (date: string, domain: RecordCoverageDomain) => {
    if (date < startDate || date > endDate) return;
    const domains = coverage.get(date) ?? new Set<RecordCoverageDomain>();
    domains.add(domain);
    coverage.set(date, domains);
  };

  if (isDemoMode()) {
    const demo = demoTrends(todayISO());
    demo.moods.forEach((row) => add(row.record_date, "mood"));
    demo.sleeps.forEach((row) => add(row.record_date, "sleep"));
    demo.exercises.forEach((row) => add(row.record_date, "exercise"));
    demo.nutritions.forEach((row) => add(row.record_date, "diet"));
    demo.focus.forEach((row) => add(row.record_date, "focus"));
    demo.faces.forEach((row) => add(row.record_date, "face"));
  } else {
    const sources = [
      ["mood_records", "mood"],
      ["sleep_records", "sleep"],
      ["exercise_records", "exercise"],
      ["nutrition_records", "diet"],
      ["focus_records", "focus"],
      ["face_records", "face"],
    ] as const;
    const results = await Promise.all(sources.map(async ([table, domain]) => ({ domain, rows: await recordDates(table, userId, startDate, endDate) })));
    results.forEach(({ domain, rows }) => rows.forEach((row) => add(row.record_date, domain)));
  }

  return Object.fromEntries([...coverage].map(([date, domains]) => [date, [...domains]]));
}
