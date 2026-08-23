import { supabase } from "./supabaseClient";
import type { ChatMessage } from "../types";
import {
  getTodaySnapshot,
  refreshRhythmScore,
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveNutritionRecord,
  saveSleepRecord,
} from "./records";
import { todayISO } from "./date";
import { demoMessagesFor, isDemoMode } from "./demo";

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

export async function loadConversation(userId: string, locale: "zh" | "en" = "zh"): Promise<ChatMessage[]> {
  if (isDemoMode()) return demoMessagesFor(locale);

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(80);
  assertNoError(error);
  return (data ?? []) as ChatMessage[];
}

export async function sendAiMessage(input: {
  userId: string;
  message: string;
  history: ChatMessage[];
  lang?: "zh" | "en";
}) {
  if (isDemoMode()) {
    const now = new Date().toISOString();
    const content = await requestAiReply({
      message: input.message,
      history: input.history,
      lang: input.lang ?? "zh",
      healthContext: await buildHealthContext(input.userId),
    });
    return {
      userMessage: { id: `demo-user-${Date.now()}`, role: "user", content: input.message, created_at: now } as ChatMessage,
      assistantMessage: {
        id: `demo-assistant-${Date.now()}`,
        role: "assistant",
        content,
        created_at: now,
      } as ChatMessage,
      extractedData: null,
      applied: null,
    };
  }

  const userInsert = await supabase
    .from("ai_conversations")
    .insert({
      user_id: input.userId,
      role: "user",
      content: input.message,
    })
    .select("*")
    .single();
  assertNoError(userInsert.error);

  const extract = await supabase.functions.invoke("ai-extract-data", {
    body: {
      message: input.message,
      todos: [],
      lang: input.lang ?? "zh",
      language: input.lang ?? "zh",
    },
  });

  const extraction = extract.error ? null : extract.data ?? null;
  const extractedData = extraction?.extractedData ?? null;
  const applied = extraction ? await applyExtractedData(input.userId, extraction) : null;

  const content = await requestAiReply({
    message: input.message,
    history: input.history,
    lang: input.lang ?? "zh",
    dataType: extraction?.dataType ?? null,
    extractedData,
    healthContext: await buildHealthContext(input.userId),
  });
  const assistantInsert = await supabase
    .from("ai_conversations")
    .insert({
      user_id: input.userId,
      role: "assistant",
      content,
    })
    .select("*")
    .single();
  assertNoError(assistantInsert.error);

  return {
    userMessage: userInsert.data as ChatMessage,
    assistantMessage: assistantInsert.data as ChatMessage,
    extractedData,
    applied,
  };
}

async function requestAiReply(input: {
  message: string;
  history: ChatMessage[];
  lang: "zh" | "en";
  dataType?: unknown;
  extractedData?: unknown;
  healthContext?: unknown;
}) {
  const reply = await supabase.functions.invoke("ai-chat-reply", {
    body: {
      message: input.message,
      dataType: input.dataType ?? null,
      extractedData: input.extractedData ?? null,
      healthContext: input.healthContext ?? null,
      conversationHistory: input.history.slice(-10),
      lang: input.lang,
      reviewMode: isDemoMode(),
    },
  });
  assertNoError(reply.error);
  const content = reply.data?.reply ?? reply.data?.message ?? reply.data?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("真实 AI 服务没有返回有效内容，请稍后重试。");
  return content.trim();
}

async function buildHealthContext(userId: string) {
  try {
    const snapshot = await getTodaySnapshot(userId, todayISO());
    return {
      date: snapshot.date,
      rhythm: {
        score: snapshot.rhythmScore,
        confidence: snapshot.rhythmConfidence ?? null,
      },
      sleep: snapshot.sleep ? {
        start: snapshot.sleep.sleep_start,
        end: snapshot.sleep.sleep_end,
        minutes: snapshot.sleep.sleep_duration_minutes,
        selfRating: snapshot.sleep.self_rating,
      } : null,
      exercise: snapshot.exercise ? {
        steps: snapshot.exercise.steps,
        calories: snapshot.exercise.calories,
        minutes: snapshot.exercise.exercise_minutes,
        heartRate: snapshot.exercise.heart_rate,
      } : null,
      mood: snapshot.mood ? {
        score: snapshot.mood.mood_score,
        factors: snapshot.mood.factors,
      } : null,
      nutrition: snapshot.nutrition ? {
        totalCalories: snapshot.nutrition.total_calories,
        breakfast: snapshot.nutrition.breakfast_items?.map((item) => item.name) ?? [],
        lunch: snapshot.nutrition.lunch_items?.map((item) => item.name) ?? [],
        dinner: snapshot.nutrition.dinner_items?.map((item) => item.name) ?? [],
      } : null,
      focus: {
        minutes: snapshot.focusMinutes,
        sessions: snapshot.focusSessions,
      },
      face: snapshot.face ? {
        skinAge: snapshot.face.skin_age,
        feedback: snapshot.face.feedback,
      } : null,
    };
  } catch {
    return null;
  }
}

export async function applyExtractedData(userId: string, extraction: Record<string, unknown>) {
  if (!extraction.hasData || !extraction.extractedData || typeof extraction.extractedData !== "object") return null;
  const data = extraction.extractedData as Record<string, unknown>;
  const dataType = extraction.dataType;

  if (dataType === "multi") {
    const records = Array.isArray(data.records) ? data.records : [];
    const applied = [];
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const item = record as Record<string, unknown>;
      const itemType = stringValue(item.dataType) ?? stringValue(item.data_type) ?? stringValue(item.type);
      const payload = objectValue(item.extractedData) ?? objectValue(item.extracted_data) ?? objectValue(item.data);
      if (!itemType || !payload) continue;
      applied.push(await applyTypedData(userId, itemType, payload, false));
    }
    if (applied.some((item) => item?.saved)) await refreshRhythmAfterApply(todayISO());
    return { type: "multi", saved: applied.some((item) => item?.saved), items: applied };
  }

  return applyTypedData(userId, String(dataType ?? "unknown"), data, true);
}

async function applyTypedData(userId: string, dataType: string, data: Record<string, unknown>, refreshAfterSave: boolean) {
  if (dataType === "sleep") {
    const start = stringValue(data.sleepStart) ?? stringValue(data.sleep_start);
    const end = stringValue(data.sleepEnd) ?? stringValue(data.sleep_end);
    if (!start || !end) return { type: "sleep", saved: false, reason: "缺少睡眠起止时间" };
    await saveSleepRecord({
      userId,
      date: todayISO(),
      start,
      end,
      durationMinutes: numberValue(data.sleepDurationMinutes) ?? numberValue(data.sleep_duration_minutes) ?? estimateSleepMinutes(start, end),
      deepMinutes: numberValue(data.deepSleepMinutes) ?? numberValue(data.deep_sleep_minutes),
      lightMinutes: numberValue(data.lightSleepMinutes) ?? numberValue(data.light_sleep_minutes),
      remMinutes: numberValue(data.remMinutes) ?? numberValue(data.rem_minutes),
      rating: numberValue(data.selfRating) ?? numberValue(data.self_rating),
      source: "manual",
    });
    if (refreshAfterSave) await refreshRhythmAfterApply(todayISO());
    return { type: "sleep", saved: true };
  }

  if (dataType === "exercise") {
    const steps = numberValue(data.steps);
    const calories = numberValue(data.calories);
    const minutes = numberValue(data.exerciseMinutes) ?? numberValue(data.exercise_minutes);
    if (steps == null && calories == null && minutes == null && !data.heartRate && !data.heart_rate && !data.spo2) {
      return { type: "exercise", saved: false, reason: "缺少可保存的运动指标" };
    }
    await saveExerciseRecord({
      userId,
      date: todayISO(),
      steps: steps ?? 0,
      calories: calories ?? 0,
      minutes: minutes ?? 0,
      heartRate: stringValue(data.heartRate) ?? stringValue(data.heart_rate),
      spo2: stringValue(data.spo2),
      source: "manual",
    });
    if (refreshAfterSave) await refreshRhythmAfterApply(todayISO());
    return { type: "exercise", saved: true };
  }

  if (dataType === "mood") {
    const moodScore = numberValue(data.moodScore) ?? numberValue(data.mood_score) ?? numberValue(data.score);
    if (moodScore == null) return { type: "mood", saved: false, reason: "缺少情绪分数" };
    await saveMoodRecord({
      userId,
      date: todayISO(),
      moodScore: Math.max(0, Math.min(100, Math.round(moodScore))),
      factors: stringArrayValue(data.factors),
      diary: stringValue(data.diary) ?? stringValue(data.note),
    });
    if (refreshAfterSave) await refreshRhythmAfterApply(todayISO());
    return { type: "mood", saved: true };
  }

  if (dataType === "focus") {
    const minutes = numberValue(data.minutes) ?? numberValue(data.totalMinutes) ?? numberValue(data.total_minutes);
    if (minutes == null || minutes <= 0) return { type: "focus", saved: false, reason: "缺少专注分钟数" };
    await saveFocusSession({
      userId,
      date: todayISO(),
      taskTitle: stringValue(data.taskTitle) ?? stringValue(data.task_title) ?? "专注",
      minutes: Math.round(minutes),
    });
    if (refreshAfterSave) await refreshRhythmAfterApply(todayISO());
    return { type: "focus", saved: true };
  }

  if (dataType === "nutrition") {
    const meal = normalizeMeal(stringValue(data.meal));
    const name = stringValue(data.name) ?? stringValue(data.food) ?? stringValue(data.title) ?? "手动记录餐食";
    const calories = numberValue(data.calories) ?? numberValue(data.kcal) ?? 0;
    await saveNutritionRecord({
      userId,
      date: todayISO(),
      meal,
      item: {
        name,
        amount: stringValue(data.amount),
        calories: Math.max(0, Math.round(calories)),
      },
      totalCalories: Math.max(0, Math.round(calories)),
    });
    if (refreshAfterSave) await refreshRhythmAfterApply(todayISO());
    return { type: "nutrition", saved: true };
  }

  if (dataType === "profile") {
    const profile = buildProfileUpdate(userId, data);
    const { error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
    assertNoError(error);
    return { type: "profile", saved: true };
  }

  return { type: String(dataType ?? "unknown"), saved: false, reason: "当前 App 还没有对应落表逻辑" };
}

async function refreshRhythmAfterApply(date: string) {
  try {
    await refreshRhythmScore(date);
  } catch (error) {
    console.warn("Failed to refresh rhythm score after AI extraction", error);
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeMeal(value: string | undefined): "breakfast" | "lunch" | "dinner" | "pantry" {
  if (value === "breakfast" || value === "早餐") return "breakfast";
  if (value === "lunch" || value === "午餐" || value === "中餐") return "lunch";
  if (value === "dinner" || value === "晚餐") return "dinner";
  return "pantry";
}

function estimateSleepMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
}

function buildProfileUpdate(userId: string, data: Record<string, unknown>) {
  const update: Record<string, unknown> = { id: userId };
  const map: Record<string, string> = {
    username: "username",
    height: "height",
    weight: "weight",
    birth_date: "birth_date",
    occupation: "occupation",
    goal: "goal",
    mbti: "mbti",
    exerciseFrequency: "exercise_frequency",
    exercise_frequency: "exercise_frequency",
    sleepSchedule: "sleep_schedule",
    sleep_schedule: "sleep_schedule",
    dietPreference: "diet_preference",
    diet_preference: "diet_preference",
    stressFactors: "stress_factors",
    stress_factors: "stress_factors",
  };

  for (const [from, to] of Object.entries(map)) {
    const value = data[from];
    if (typeof value === "string" && value.trim()) update[to] = value.trim();
    if (typeof value === "number" && Number.isFinite(value)) update[to] = value;
  }

  const year = numberValue(data.birthYear);
  const month = numberValue(data.birthMonth);
  const day = numberValue(data.birthDay);
  if (year && month && day) {
    update.birth_date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return update;
}
