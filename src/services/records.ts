import { supabase } from "./supabaseClient";
import { daysAgoISO, todayISO } from "./date";
import type {
  ExerciseRecord,
  FaceAnalysisResult,
  FaceRecord,
  FocusRecord,
  FoodItem,
  MoodRecord,
  NutritionRecord,
  SleepRecord,
  TodaySnapshot,
  TrendBundle,
} from "../types";
import { demoExercise, demoMood, demoNutrition, demoSleep, demoTodaySnapshot, demoTrends, isDemoMode } from "./demo";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nonNegativeInt(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${fieldName}不能为负数。`);
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
  if (!snapshot.mood) return "用 10 秒记录情绪，帮助 AI 判断今天的压力曲线。";
  if (snapshot.focusMinutes < 25) return "开启一个 25 分钟专注块，让今日节律更稳定。";
  return "今天基础数据完整，可以让 AI 总结一条个性化建议。";
}

export async function getTodaySnapshot(userId: string, date = todayISO()): Promise<TodaySnapshot> {
  if (isDemoMode()) return demoTodaySnapshot();

  const [moodRes, sleepRes, exerciseRes, nutritionRes, focusRes] = await Promise.all([
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
  ]);

  assertNoError(moodRes.error);
  assertNoError(sleepRes.error);
  assertNoError(exerciseRes.error);
  assertNoError(nutritionRes.error);
  assertNoError(focusRes.error);

  const focus = asArray<FocusRecord>(focusRes.data);
  const base = {
    date,
    mood: moodRes.data as MoodRecord | null,
    sleep: sleepRes.data as SleepRecord | null,
    exercise: exerciseRes.data as ExerciseRecord | null,
    nutrition: nutritionRes.data as NutritionRecord | null,
    focusMinutes: focus.reduce((sum, item) => sum + (item.total_minutes ?? 0), 0),
    focusSessions: focus.reduce((sum, item) => sum + (item.completed_sessions ?? 0), 0),
  };

  const rhythmScore = calculateTodayRhythm(base);
  return {
    ...base,
    rhythmScore,
    nextAction: nextAction(base),
  };
}

export async function saveMoodRecord(input: {
  userId: string;
  date?: string;
  moodScore: number;
  factors: string[];
  diary?: string;
}) {
  if (isDemoMode()) return { ...demoMood, mood_score: input.moodScore, factors: input.factors, diary_content: input.diary ?? null };

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
  if (isDemoMode()) return { ...demoSleep, sleep_start: input.start, sleep_end: input.end, sleep_duration_minutes: input.durationMinutes };

  validateHHMM(input.start, "入睡时间");
  validateHHMM(input.end, "醒来时间");
  const durationMinutes = nonNegativeInt(input.durationMinutes, "睡眠时长");
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
  if (isDemoMode()) return { ...demoSleep, sleep_duration_minutes: input.durationMinutes, device_type: input.source ?? "apple_watch" };

  const durationMinutes = nonNegativeInt(input.durationMinutes, "睡眠时长");
  const { data, error } = await supabase
    .from("sleep_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: normalizeRecordDate(input.date),
        sleep_duration_minutes: durationMinutes,
        device_type: input.source ?? "apple_watch",
        rhythm_score: calculateSleepRhythmScore({ durationMinutes }),
      },
      { onConflict: "user_id,record_date" },
    )
    .select("*")
    .single();

  assertNoError(error);
  return data as SleepRecord;
}

async function findExerciseRecordId(userId: string, date: string) {
  const { data, error } = await supabase
    .from("exercise_records")
    .select("id")
    .eq("user_id", userId)
    .eq("record_date", date)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError(error);
  return data?.id as string | undefined;
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
  steps: number;
  calories: number;
  minutes: number;
  heartRate?: string;
  spo2?: string;
  rating?: number;
  note?: string;
  source?: "manual" | "apple_health";
}) {
  if (isDemoMode()) return { ...demoExercise, steps: input.steps, calories: input.calories, exercise_minutes: input.minutes };

  const recordDate = normalizeRecordDate(input.date);
  const steps = nonNegativeInt(input.steps, "步数");
  const calories = nonNegativeInt(input.calories, "消耗热量");
  const minutes = nonNegativeInt(input.minutes, "运动分钟");
  const payload = {
    user_id: input.userId,
    record_date: recordDate,
    steps,
    calories,
    exercise_minutes: minutes,
    heart_rate: input.heartRate?.trim() || null,
    spo2: input.spo2?.trim() || null,
    self_rating: input.rating ?? null,
    self_note: input.note?.trim() || null,
    device_type: input.source ?? "manual",
  };

  const existingId = await findExerciseRecordId(input.userId, recordDate);
  const response = existingId
    ? await supabase.from("exercise_records").update(payload).eq("id", existingId).select("*").single()
    : await supabase.from("exercise_records").insert(payload).select("*").single();

  assertNoError(response.error);
  if (response.data?.id) await dedupeExerciseRecords(input.userId, recordDate, response.data.id);
  return response.data as ExerciseRecord;
}

export async function saveNutritionRecord(input: {
  userId: string;
  date?: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  item: FoodItem;
  totalCalories: number;
}) {
  if (isDemoMode()) return { ...demoNutrition, total_calories: input.totalCalories, [`${input.meal}_items`]: [input.item] } as NutritionRecord;

  const recordDate = normalizeRecordDate(input.date);
  const itemCalories = nonNegativeInt(input.item.calories ?? input.totalCalories, "食物热量");
  const existing = await supabase
    .from("nutrition_records")
    .select("*")
    .eq("user_id", input.userId)
    .eq("record_date", recordDate)
    .maybeSingle();

  assertNoError(existing.error);

  const current = (existing.data ?? {}) as Partial<NutritionRecord>;
  const key = `${input.meal}_items` as keyof NutritionRecord;
  const items = asArray<FoodItem>(current[key]);
  const existingTotal = current.total_calories ?? 0;
  const previousItemCalories = items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const newMealItems = [...items, { ...input.item, calories: itemCalories }];
  const newMealCalories = newMealItems.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const totalCalories = Math.max(0, existingTotal - previousItemCalories + newMealCalories);
  const payload = {
    user_id: input.userId,
    record_date: recordDate,
    breakfast_items: current.breakfast_items ?? [],
    lunch_items: current.lunch_items ?? [],
    dinner_items: current.dinner_items ?? [],
    pantry_items: current.pantry_items ?? [],
    total_calories: totalCalories,
    [key]: newMealItems,
  };

  const { data, error } = await supabase
    .from("nutrition_records")
    .upsert(payload, { onConflict: "user_id,record_date" })
    .select("*")
    .single();

  assertNoError(error);
  return data as NutritionRecord;
}

export async function saveNutritionItems(input: {
  userId: string;
  date?: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  items: FoodItem[];
  photoUrl?: string;
}) {
  if (input.items.length === 0) throw new Error("没有可保存的食物条目。");
  if (isDemoMode()) return { ...demoNutrition, [`${input.meal}_items`]: input.items } as NutritionRecord;

  const recordDate = normalizeRecordDate(input.date);
  const existing = await supabase
    .from("nutrition_records")
    .select("*")
    .eq("user_id", input.userId)
    .eq("record_date", recordDate)
    .maybeSingle();
  assertNoError(existing.error);

  const current = (existing.data ?? {}) as Partial<NutritionRecord>;
  const key = `${input.meal}_items` as keyof NutritionRecord;
  const photoKey = `${input.meal}_photo_url`;
  const payload = {
    user_id: input.userId,
    record_date: recordDate,
    breakfast_items: current.breakfast_items ?? [],
    lunch_items: current.lunch_items ?? [],
    dinner_items: current.dinner_items ?? [],
    pantry_items: current.pantry_items ?? [],
    breakfast_photo_url: "breakfast_photo_url" in current ? current.breakfast_photo_url : undefined,
    lunch_photo_url: "lunch_photo_url" in current ? current.lunch_photo_url : undefined,
    dinner_photo_url: "dinner_photo_url" in current ? current.dinner_photo_url : undefined,
    [key]: input.items,
    ...(photoKey !== "pantry_photo_url" && input.photoUrl ? { [photoKey]: input.photoUrl } : {}),
  };
  const totalCalories = [
    ...(payload.breakfast_items as FoodItem[]),
    ...(payload.lunch_items as FoodItem[]),
    ...(payload.dinner_items as FoodItem[]),
    ...(payload.pantry_items as FoodItem[]),
  ].reduce((sum, item) => sum + (Number(item.calories) || 0), 0);

  const { data, error } = await supabase
    .from("nutrition_records")
    .upsert({ ...payload, total_calories: totalCalories }, { onConflict: "user_id,record_date" })
    .select("*")
    .single();

  assertNoError(error);
  return data as NutritionRecord;
}

export async function saveFaceAnalysisRecord(input: {
  userId: string;
  date?: string;
  result: FaceAnalysisResult;
  imagePath?: string;
  modelVersion?: string;
}) {
  if (isDemoMode()) {
    return {
      id: "demo-face",
      record_date: input.date ?? todayISO(),
      image_path: input.imagePath ?? null,
      overall_score: input.result.overall_score,
      skin_age: input.result.skin_age ?? null,
      annotations: input.result.annotations,
      feedback: input.result.feedback,
      model_version: input.modelVersion ?? "demo",
    } as FaceRecord;
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
      },
      { onConflict: "user_id,record_date" },
    )
    .select("*")
    .single();

  assertNoError(error);
  return data as FaceRecord;
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
  date?: string;
  taskTitle: string;
  minutes: number;
}) {
  if (isDemoMode()) {
    return {
      id: "demo-focus",
      task_id: "demo-task",
      record_date: input.date ?? todayISO(),
      completed_sessions: 1,
      total_minutes: input.minutes,
    };
  }

  const recordDate = normalizeRecordDate(input.date);
  const minutes = nonNegativeInt(input.minutes, "专注分钟");
  if (minutes === 0) throw new Error("专注分钟必须大于 0。");
  const task = await ensureTask(input.userId, input.taskTitle.trim() || "NAVA 专注", recordDate);
  const existing = await supabase
    .from("focus_records")
    .select("*")
    .eq("user_id", input.userId)
    .eq("record_date", recordDate)
    .eq("task_id", task.id)
    .maybeSingle();
  assertNoError(existing.error);

  const payload = {
    user_id: input.userId,
    task_id: task.id,
    record_date: recordDate,
    completed_sessions: (existing.data?.completed_sessions ?? 0) + 1,
    total_minutes: (existing.data?.total_minutes ?? 0) + minutes,
  };

  const response = existing.data
    ? await supabase.from("focus_records").update(payload).eq("id", existing.data.id).select("*").single()
    : await supabase.from("focus_records").insert(payload).select("*").single();
  assertNoError(response.error);

  await upsertFocusDistribution(input.userId, recordDate, minutes);
  return response.data as FocusRecord;
}

async function upsertFocusDistribution(userId: string, recordDate: string, minutes: number) {
  const hour = new Date().getHours();
  const period =
    hour < 6 ? "period_0_6" : hour < 12 ? "period_6_12" : hour < 18 ? "period_12_18" : "period_18_24";

  const existing = await supabase
    .from("focus_time_distribution")
    .select("*")
    .eq("user_id", userId)
    .eq("record_date", recordDate)
    .maybeSingle();
  assertNoError(existing.error);

  const base = existing.data ?? {
    user_id: userId,
    record_date: recordDate,
    period_0_6: 0,
    period_6_12: 0,
    period_12_18: 0,
    period_18_24: 0,
  };

  const payload = {
    ...base,
    [period]: (base[period] ?? 0) + minutes,
  };

  const response = existing.data
    ? await supabase.from("focus_time_distribution").update(payload).eq("id", existing.data.id)
    : await supabase.from("focus_time_distribution").insert(payload);
  assertNoError(response.error);
}

export async function getTrends(userId: string): Promise<TrendBundle> {
  if (isDemoMode()) return demoTrends();

  const start = daysAgoISO(14);
  const [moods, sleeps, exercises, nutritions, focus] = await Promise.all([
    supabase.from("mood_records").select("*").eq("user_id", userId).gte("record_date", start).order("record_date"),
    supabase.from("sleep_records").select("*").eq("user_id", userId).gte("record_date", start).order("record_date"),
    supabase.from("exercise_records").select("*").eq("user_id", userId).gte("record_date", start).order("record_date"),
    supabase.from("nutrition_records").select("*").eq("user_id", userId).gte("record_date", start).order("record_date"),
    supabase.from("focus_records").select("*").eq("user_id", userId).gte("record_date", start).order("record_date"),
  ]);

  assertNoError(moods.error);
  assertNoError(sleeps.error);
  assertNoError(exercises.error);
  assertNoError(nutritions.error);
  assertNoError(focus.error);

  return {
    moods: asArray<MoodRecord>(moods.data),
    sleeps: asArray<SleepRecord>(sleeps.data),
    exercises: asArray<ExerciseRecord>(exercises.data),
    nutritions: asArray<NutritionRecord>(nutritions.data),
    focus: asArray<FocusRecord>(focus.data),
  };
}
