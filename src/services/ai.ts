import { supabase } from "./supabaseClient";
import type { ChatMessage } from "../types";
import {
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
    return {
      userMessage: { id: `demo-user-${Date.now()}`, role: "user", content: input.message, created_at: now } as ChatMessage,
      assistantMessage: {
        id: `demo-assistant-${Date.now()}`,
        role: "assistant",
        content: demoAiReply(input.message, input.lang ?? "zh"),
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

  const reply = await supabase.functions.invoke("ai-chat-reply", {
    body: {
      message: input.message,
      dataType: extraction?.dataType ?? null,
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

function demoAiReply(message: string, lang: "zh" | "en") {
  const text = message.toLowerCase();
  if (lang === "en") {
    if (text.includes("who are you") || text.includes("what are you")) {
      return "I am NAVA, your rhythm companion. Tell me sleep, movement, mood, food, focus, or face changes, and I will help organize the day.";
    }
    if (text.includes("sleep")) return "I heard the sleep note. Keep tonight's wind-down window steady and watch how your energy feels after waking.";
    if (text.includes("exercise") || text.includes("steps")) return "That movement matters. I would compare it with recovery before pushing intensity higher.";
    if (text.includes("mood") || text.includes("stress")) return "I hear the stress signal. A short reset and a clear next task may help your rhythm settle.";
    return "I am listening. You can speak naturally; NAVA will turn daily details into rhythm clues.";
  }

  if (/你是谁|你是誰|nava是什么|nava是什麼/.test(message)) {
    return "我是 NAVA，会陪你把睡眠、运动、情绪、饮食、专注和面部状态整理成今天的节律线索。";
  }
  if (/睡|醒|困|失眠|入睡|起床/.test(message)) {
    return "我听到了睡眠变化。今晚先稳住入睡窗口，明早再看清醒感和活动量是否一起恢复。";
  }
  if (/步|跑|运动|訓練|训练|卡路里|心率/.test(message)) {
    return "这条运动记录有价值。真正判断强度时，还要和恢复、睡眠和今天的主观状态放在一起看。";
  }
  if (/情绪|壓力|压力|焦虑|烦|累/.test(message)) {
    return "我听到的是压力信号。先把下一步缩小一点，给身体一个能接住的节奏。";
  }
  if (/吃|饮食|飲食|早餐|午餐|晚餐|咖啡/.test(message)) {
    return "这条饮食线索会影响能量节律。后面可以结合运动消耗和晚间睡意一起判断。";
  }
  return "我在听。你可以像聊天一样告诉我今天发生了什么，NAVA 会把这些细节变成节律线索。";
}

async function applyExtractedData(userId: string, extraction: Record<string, unknown>) {
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
