import { supabase } from "./supabaseClient";
import type { ChatMessage } from "../types";
import { saveExerciseRecord, saveSleepRecord } from "./records";
import { todayISO } from "./date";

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

export async function loadConversation(userId: string): Promise<ChatMessage[]> {
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

  const reply = await supabase.functions.invoke("ai-chat-reply", {
    body: {
      message: input.message,
      extractedData,
      conversationHistory: input.history.slice(-10),
      todos: [],
      lang: input.lang ?? "zh",
    },
  });
  assertNoError(reply.error);

  const content = reply.data?.reply ?? reply.data?.message ?? reply.data?.content ?? "我已经收到，会结合你的记录继续分析。";
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

async function applyExtractedData(userId: string, extraction: Record<string, unknown>) {
  if (!extraction.hasData || !extraction.extractedData || typeof extraction.extractedData !== "object") return null;
  const data = extraction.extractedData as Record<string, unknown>;
  const dataType = extraction.dataType;

  if (dataType === "sleep") {
    const start = stringValue(data.sleepStart);
    const end = stringValue(data.sleepEnd);
    if (!start || !end) return { type: "sleep", saved: false, reason: "缺少睡眠起止时间" };
    await saveSleepRecord({
      userId,
      date: todayISO(),
      start,
      end,
      durationMinutes: numberValue(data.sleepDurationMinutes) ?? estimateSleepMinutes(start, end),
      deepMinutes: numberValue(data.deepSleepMinutes),
      lightMinutes: numberValue(data.lightSleepMinutes),
      remMinutes: numberValue(data.remMinutes),
      rating: numberValue(data.selfRating),
      source: "manual",
    });
    return { type: "sleep", saved: true };
  }

  if (dataType === "exercise") {
    await saveExerciseRecord({
      userId,
      date: todayISO(),
      steps: numberValue(data.steps) ?? 0,
      calories: numberValue(data.calories) ?? 0,
      minutes: numberValue(data.exerciseMinutes) ?? 0,
      heartRate: stringValue(data.heartRate),
      spo2: stringValue(data.spo2),
      source: "manual",
    });
    return { type: "exercise", saved: true };
  }

  if (dataType === "profile") {
    const profile = buildProfileUpdate(userId, data);
    const { error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
    assertNoError(error);
    return { type: "profile", saved: true };
  }

  return { type: String(dataType ?? "unknown"), saved: false, reason: "当前 App 还没有对应落表逻辑" };
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
    occupation: "occupation",
    goal: "goal",
    mbti: "mbti",
    exerciseFrequency: "exercise_frequency",
    sleepSchedule: "sleep_schedule",
    dietPreference: "diet_preference",
    stressFactors: "stress_factors",
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
