import { supabase } from "./supabaseClient";
import type { ChatMessage } from "../types";
import {
  refreshRhythmScore,
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveNutritionItems,
  saveNutritionRecord,
  saveSleepRecord,
} from "./records";
import { todayISO } from "./date";
import { demoMessagesFor, isDemoMode } from "./demo";
import { AI_PROCESSING_STEP_MIN_MS, buildAiProcessingSteps, type AiProcessingStep } from "./aiProcessing";
import type { UserProfile } from "./profile";

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
  displayMessage?: string;
  history: ChatMessage[];
  lang?: "zh" | "en";
  profile?: UserProfile | null;
  responseMode?: "text" | "voice";
  preExtracted?: {
    dataType: string;
    extractedData: unknown;
  };
  signal?: AbortSignal;
  onUserMessage?: (message: ChatMessage) => void;
  onStatus?: (step: AiProcessingStep | null) => void;
  onDelta?: (content: string, delta: string) => void;
}) {
  const lang = input.lang ?? "zh";
  const processing = playProcessingSteps(input.profile, lang, input.onStatus, input.signal);

  if (isDemoMode()) {
    const now = new Date().toISOString();
    const content = demoAiReply(input.message, lang);
    const userMessage = { id: `demo-user-${Date.now()}`, role: "user", content: input.displayMessage ?? input.message, created_at: now } as ChatMessage;
    input.onUserMessage?.(userMessage);
    await processing;
    let streamed = "";
    for (const delta of splitDemoStream(content)) {
      throwIfAborted(input.signal);
      streamed += delta;
      input.onDelta?.(streamed, delta);
      await abortableDelay(34, input.signal);
    }
    return {
      userMessage,
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
      content: input.displayMessage ?? input.message,
    })
    .select("*")
    .single();
  assertNoError(userInsert.error);
  input.onUserMessage?.(userInsert.data as ChatMessage);

  const extraction = input.preExtracted ?? await (async () => {
    const extract = await supabase.functions.invoke("ai-extract-data", {
      body: {
        message: input.message,
        todos: [],
        lang,
        language: lang,
      },
    });
    return extract.error ? null : extract.data ?? null;
  })();
  const extractedData = extraction?.extractedData ?? null;
  const content = await requestAiReply({
    message: input.message,
    lang,
    dataType: extraction?.dataType ?? null,
    extractedData,
    responseMode: input.responseMode,
    signal: input.signal,
    processing,
    onStatus: input.onStatus,
    onDelta: input.onDelta,
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
    applied: null,
  };
}

function demoAiReply(message: string, lang: "zh" | "en") {
  const zh = lang === "zh";
  if (/睡|sleep|晚睡|失眠/i.test(message)) return zh ? "我听见你在关注睡眠。公开演示不会把内容发送给外部模型；你可以继续输入起止时间，确认卡片后再保存。" : "I hear that sleep is on your mind. The public demo keeps this local; add your times and confirm the card before saving.";
  if (/焦虑|压力|难过|mood|stress|sad/i.test(message)) return zh ? "先慢一点也没关系。公开演示只在本机生成这段回应；如果低落或焦虑持续影响生活，请联系可信赖的人或专业支持。" : "It is okay to slow down. This public-demo reply is generated locally. If distress keeps affecting daily life, reach out to someone you trust or professional support.";
  if (/吃|饮食|food|meal/i.test(message)) return zh ? "我可以帮你整理这次饮食记录。公开演示不会调用付费 AI；请核对自动识别的餐次和热量后再确认保存。" : "I can help organize this meal log. The public demo does not call paid AI; review the meal and calories before confirming.";
  if (/专注|focus|番茄/i.test(message)) return zh ? "先选一个最小可完成的专注块吧：25、45 或 60 分钟。切到后台时计时器会自动暂停。" : "Pick the smallest workable block: 25, 45, or 60 minutes. The timer pauses when the app goes to the background.";
  return zh ? "这是安全的公开演示回应：内容不会发送给外部模型。登录正式账号后，NAVA 才会在你的授权范围内结合健康记录提供个性化回复。" : "This is a safe public-demo reply and is not sent to an external model. Sign in to use personalized replies within your consent settings.";
}

async function requestAiReply(input: {
  message: string;
  lang: "zh" | "en";
  dataType?: unknown;
  extractedData?: unknown;
  responseMode?: "text" | "voice";
  signal?: AbortSignal;
  processing: Promise<void>;
  onStatus?: (step: AiProcessingStep | null) => void;
  onDelta?: (content: string, delta: string) => void;
}) {
  const reply = await supabase.functions.invoke<Response>("ai-chat-reply", {
    body: {
      message: input.message,
      dataType: input.dataType ?? null,
      extractedData: input.extractedData ?? null,
      responseMode: input.responseMode ?? "text",
      lang: input.lang,
      deviceDate: todayISO(),
      reviewMode: isDemoMode(),
      stream: true,
    },
    signal: input.signal,
  });
  assertNoError(reply.error);
  if (!(reply.data instanceof Response)) throw new Error("AI 回复服务没有返回可读取的流，请稍后重试。");
  return consumeAiStream(reply.data, input);
}

async function consumeAiStream(response: Response, input: {
  processing: Promise<void>;
  onStatus?: (step: AiProcessingStep | null) => void;
  onDelta?: (content: string, delta: string) => void;
}) {
  if (!response.body) throw new Error("AI 回复服务没有返回可读取的流，请稍后重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamed = "";
  let finalReply = "";
  let preludeFinished = false;

  const finishPrelude = async () => {
    if (preludeFinished) return;
    await input.processing;
    input.onStatus?.(null);
    preludeFinished = true;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (!parsed) continue;
      if (parsed.event === "error") throw new Error(typeof parsed.data.message === "string" ? parsed.data.message : "AI 回复失败，请稍后重试。");
      if (parsed.event === "delta") {
        const delta = typeof parsed.data.text === "string" ? parsed.data.text : "";
        if (!delta) continue;
        await finishPrelude();
        streamed += delta;
        input.onDelta?.(streamed, delta);
      }
      if (parsed.event === "done") {
        finalReply = typeof parsed.data.reply === "string" ? parsed.data.reply : streamed;
      }
    }

    if (done) break;
  }

  await finishPrelude();
  const content = (finalReply || streamed).trim();
  if (!content) throw new Error("真实 AI 服务没有返回有效内容，请稍后重试。");
  if (!streamed) input.onDelta?.(content, content);
  return content;
}

function parseSseBlock(block: string) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
  } catch {
    return null;
  }
}

async function playProcessingSteps(
  profile: UserProfile | null | undefined,
  lang: "zh" | "en",
  onStatus?: (step: AiProcessingStep | null) => void,
  signal?: AbortSignal,
) {
  try {
    for (const step of buildAiProcessingSteps(profile, lang)) {
      throwIfAborted(signal);
      onStatus?.(step);
      await abortableDelay(AI_PROCESSING_STEP_MIN_MS, signal);
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  }
}

function splitDemoStream(content: string) {
  const characters = Array.from(content);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += 3) chunks.push(characters.slice(index, index + 3).join(""));
  return chunks;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
    const items = Array.isArray(data.items)
      ? data.items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          name: stringValue(item.name) ?? "饮食记录",
          amount: stringValue(item.amount),
          calories: Math.max(0, Math.round(numberValue(item.calories) ?? 0)),
        }))
      : [];
    if (items.length > 0) {
      await saveNutritionItems({ userId, date: todayISO(), meal, items });
      if (refreshAfterSave) await refreshRhythmAfterApply(todayISO());
      return { type: "nutrition", saved: true };
    }
    const name = stringValue(data.name) ?? stringValue(data.food) ?? stringValue(data.title) ?? "手动记录餐食";
    const calories = numberValue(data.totalCalories) ?? numberValue(data.total_calories) ?? numberValue(data.calories) ?? numberValue(data.kcal) ?? 0;
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
