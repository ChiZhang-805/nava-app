import { supabase } from "./supabaseClient";
import { daysAgoISO, todayISO } from "./date";
import type {
  ExerciseRecord,
  FocusRecord,
  FoodItem,
  MoodRecord,
  NutritionRecord,
  SleepRecord,
  TodaySnapshot,
  TrendBundle,
} from "../types";

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
  const { data, error } = await supabase
    .from("mood_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: input.date ?? todayISO(),
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
  const rhythmScore = calculateSleepRhythmScore({
    start: input.start,
    durationMinutes: input.durationMinutes,
    deepMinutes: input.deepMinutes,
    remMinutes: input.remMinutes,
    rating: input.rating,
  });

  const { data, error } = await supabase
    .from("sleep_records")
    .upsert(
      {
        user_id: input.userId,
        record_date: input.date ?? todayISO(),
        sleep_start: input.start,
        sleep_end: input.end,
        sleep_duration_minutes: input.durationMinutes,
        deep_sleep_minutes: input.deepMinutes ?? null,
        light_sleep_minutes: input.lightMinutes ?? null,
        rem_minutes: input.remMinutes ?? null,
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
  const recordDate = input.date ?? todayISO();
  const payload = {
    user_id: input.userId,
    record_date: recordDate,
    steps: input.steps,
    calories: input.calories,
    exercise_minutes: input.minutes,
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
  return response.data as ExerciseRecord;
}

export async function saveNutritionRecord(input: {
  userId: string;
  date?: string;
  meal: "breakfast" | "lunch" | "dinner" | "pantry";
  item: FoodItem;
  totalCalories: number;
}) {
  const recordDate = input.date ?? todayISO();
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
  const payload = {
    user_id: input.userId,
    record_date: recordDate,
    breakfast_items: current.breakfast_items ?? [],
    lunch_items: current.lunch_items ?? [],
    dinner_items: current.dinner_items ?? [],
    pantry_items: current.pantry_items ?? [],
    total_calories: input.totalCalories,
    [key]: [...items, input.item],
  };

  const { data, error } = await supabase
    .from("nutrition_records")
    .upsert(payload, { onConflict: "user_id,record_date" })
    .select("*")
    .single();

  assertNoError(error);
  return data as NutritionRecord;
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
  const recordDate = input.date ?? todayISO();
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
    total_minutes: (existing.data?.total_minutes ?? 0) + input.minutes,
  };

  const response = existing.data
    ? await supabase.from("focus_records").update(payload).eq("id", existing.data.id).select("*").single()
    : await supabase.from("focus_records").insert(payload).select("*").single();
  assertNoError(response.error);

  await upsertFocusDistribution(input.userId, recordDate, input.minutes);
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

