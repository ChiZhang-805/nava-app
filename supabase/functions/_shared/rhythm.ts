import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { asArray, assertNoError, clamp } from "./http.ts";

type DailyInputs = {
  date: string;
  mood: Record<string, unknown> | null;
  sleep: Record<string, unknown> | null;
  exercise: Record<string, unknown> | null;
  nutrition: Record<string, unknown> | null;
  focus: Record<string, unknown>[];
};

type Signal = {
  key: "sleep" | "activity" | "mood" | "nutrition" | "focus";
  label: string;
  score: number;
  weight: number;
  reason: string;
};

export const rhythmSchemaVersion = "1.0.0";
export const rhythmModelVersion = "nava-rhythm-baseline-2026-07";

export async function loadDailyInputs(client: SupabaseClient, userId: string, date: string): Promise<DailyInputs> {
  const [moodRes, sleepRes, exerciseRes, nutritionRes, focusRes] = await Promise.all([
    client.from("mood_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    client.from("sleep_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    client
      .from("exercise_records")
      .select("*")
      .eq("user_id", userId)
      .eq("record_date", date)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("nutrition_records").select("*").eq("user_id", userId).eq("record_date", date).maybeSingle(),
    client.from("focus_records").select("*").eq("user_id", userId).eq("record_date", date),
  ]);

  assertNoError(moodRes.error);
  assertNoError(sleepRes.error);
  assertNoError(exerciseRes.error);
  assertNoError(nutritionRes.error);
  assertNoError(focusRes.error);

  return {
    date,
    mood: moodRes.data as Record<string, unknown> | null,
    sleep: sleepRes.data as Record<string, unknown> | null,
    exercise: exerciseRes.data as Record<string, unknown> | null,
    nutrition: nutritionRes.data as Record<string, unknown> | null,
    focus: asArray<Record<string, unknown>>(focusRes.data),
  };
}

export function calculateRhythm(inputs: DailyInputs) {
  const signals: Signal[] = [];
  const sleep = inputs.sleep;
  const exercise = inputs.exercise;
  const nutrition = inputs.nutrition;
  const mood = inputs.mood;
  const focusMinutes = inputs.focus.reduce((sum, item) => sum + numeric(item.total_minutes), 0);

  if (sleep) {
    const duration = numeric(sleep.sleep_duration_minutes);
    const start = typeof sleep.sleep_start === "string" ? sleep.sleep_start : undefined;
    const deep = numeric(sleep.deep_sleep_minutes);
    const rem = numeric(sleep.rem_minutes);
    let score = 62;
    if (duration > 0) score += clamp(24 - Math.abs(450 - duration) / 9, -22, 24);
    if (start) {
      const hour = Number(start.split(":")[0]);
      if (hour >= 22 && hour <= 23) score += 8;
      if (hour >= 0 && hour <= 2) score -= 8;
      if (hour >= 3 && hour <= 5) score -= 16;
    }
    if (duration > 0 && deep > 0) score += clamp((deep / duration - 0.18) * 52, -8, 8);
    if (duration > 0 && rem > 0) score += clamp((rem / duration - 0.22) * 38, -6, 6);
    signals.push({
      key: "sleep",
      label: "睡眠",
      score: rounded(score),
      weight: 0.32,
      reason: duration > 0 ? `睡眠 ${Math.round(duration / 60)} 小时 ${Math.round(duration % 60)} 分钟。` : "已有睡眠记录但缺少时长。",
    });
  }

  if (exercise) {
    const steps = numeric(exercise.steps);
    const minutes = numeric(exercise.exercise_minutes);
    const calories = numeric(exercise.calories);
    const score = clamp((steps / 8000) * 58 + (minutes / 45) * 30 + (calories / 450) * 12, 0, 100);
    signals.push({
      key: "activity",
      label: "活动",
      score: rounded(score),
      weight: 0.2,
      reason: `步数 ${Math.round(steps)}，运动 ${Math.round(minutes)} 分钟。`,
    });
  }

  if (mood) {
    signals.push({
      key: "mood",
      label: "情绪",
      score: rounded(numeric(mood.mood_score)),
      weight: 0.18,
      reason: "已记录主观情绪，可用于校准压力曲线。",
    });
  }

  if (nutrition) {
    const calories = numeric(nutrition.total_calories);
    const score = calories > 0 ? clamp(100 - Math.abs(calories - 1800) / 18, 20, 100) : 45;
    signals.push({
      key: "nutrition",
      label: "饮食",
      score: rounded(score),
      weight: 0.14,
      reason: calories > 0 ? `当前摄入约 ${Math.round(calories)} kcal。` : "已有饮食记录但缺少热量。",
    });
  }

  if (focusMinutes > 0) {
    signals.push({
      key: "focus",
      label: "专注",
      score: rounded(clamp((focusMinutes / 120) * 100, 0, 100)),
      weight: 0.16,
      reason: `已完成 ${Math.round(focusMinutes)} 分钟专注。`,
    });
  }

  const totalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  const score = totalWeight > 0
    ? signals.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
    : 50;
  const confidence = clamp(0.18 + totalWeight * 0.72, 0.18, 0.9);
  const actions = buildActions(signals);

  return {
    schemaVersion: rhythmSchemaVersion,
    modelVersion: rhythmModelVersion,
    date: inputs.date,
    score: Math.round(score),
    confidence: Number(confidence.toFixed(2)),
    signals,
    reasons: signals.map((item) => item.reason),
    actions,
  };
}

export async function saveRhythmScore(client: SupabaseClient, userId: string, result: ReturnType<typeof calculateRhythm>) {
  const { error } = await client.from("daily_rhythm_scores").upsert(
    {
      user_id: userId,
      record_date: result.date,
      score: result.score,
      confidence: result.confidence,
      signals: result.signals,
      reasons: result.reasons,
      actions: result.actions,
      model_version: result.modelVersion,
    },
    { onConflict: "user_id,record_date" },
  );
  assertNoError(error);
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rounded(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function buildActions(signals: Signal[]) {
  const byKey = new Map(signals.map((item) => [item.key, item]));
  const actions: string[] = [];
  if (!byKey.has("sleep")) actions.push("今晚先补齐睡眠记录，节律评分会更可靠。");
  if (!byKey.has("activity") || (byKey.get("activity")?.score ?? 0) < 55) actions.push("安排 10 到 15 分钟轻步行，提升活动信号。");
  if (!byKey.has("nutrition")) actions.push("拍照记录一餐饮食，用摄入数据校准能量状态。");
  if (!byKey.has("mood")) actions.push("用 10 秒记录情绪，帮助判断压力波动。");
  if (!byKey.has("focus") || (byKey.get("focus")?.score ?? 0) < 45) actions.push("完成一个 25 分钟专注块，稳定今日节奏。");
  return actions.slice(0, 3);
}
