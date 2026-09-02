import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import type { AiDomain, AiRoute } from "./router.ts";
import { resolveConsentFlag } from "../_shared/consent.ts";

export type ConversationMessage = {
  role?: string;
  content?: string;
};

type QueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

export type OwnedAiBaseContext = {
  conversationHistory: ConversationMessage[];
  profile: Record<string, unknown>;
  healthDataAllowed: boolean;
  personalizationAllowed: boolean;
};

export async function loadOwnedAiBaseContext(
  client: SupabaseClient,
  userId: string,
  currentMessage: string,
): Promise<OwnedAiBaseContext> {
  const profileContext = await loadProfileContext(client, userId);
  const conversationHistory = profileContext.personalizationAllowed
    ? await loadConversationHistory(client, userId, currentMessage)
    : [];
  return { conversationHistory, ...profileContext };
}

export async function loadOwnedRelevantHealthContext(
  client: SupabaseClient,
  userId: string,
  base: OwnedAiBaseContext,
  route: AiRoute,
  deviceDate?: string,
) {
  const date = validDate(deviceDate) ?? new Date().toISOString().slice(0, 10);
  const startDate = dateOffset(date, -(route.lookbackDays - 1));
  const context: Record<string, unknown> = {
    date,
    window: { startDate, endDate: date, days: route.lookbackDays },
    profile: base.profile,
    healthDataAllowed: base.healthDataAllowed,
    route: {
      intent: route.intent,
      domains: route.domains,
      lookbackDays: route.lookbackDays,
      complexity: route.complexity,
    },
  };
  if (!base.healthDataAllowed || route.domains.length === 0) return context;

  const entries = await Promise.all(route.domains.map(async (domain) => {
    const value = await loadDomainContext(client, userId, domain, startDate, date, route.lookbackDays);
    return [domain, value] as const;
  }));
  context.recent = Object.fromEntries(entries.filter(([, value]) => value != null));
  return context;
}

async function loadConversationHistory(
  client: SupabaseClient,
  userId: string,
  currentMessage: string,
): Promise<ConversationMessage[]> {
  const result = await client
    .from("ai_conversations")
    .select("role,content,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (result.error) {
    console.warn("Could not load the authenticated user's AI history", result.error.message);
    return [];
  }

  const history = (Array.isArray(result.data) ? result.data : [])
    .slice()
    .reverse()
    .filter((item): item is { role: string; content: string; created_at: unknown } =>
      Boolean(item) &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim().length > 0
    )
    .map((item) => ({ role: item.role, content: clip(item.content, 420) }));

  const latest = history.at(-1);
  if (latest?.role === "user" && latest.content?.trim() === currentMessage.trim()) history.pop();
  return history.slice(-6);
}

async function loadProfileContext(client: SupabaseClient, userId: string) {
  const result = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (result.error) console.warn("Could not load authenticated profile context", result.error.message);

  const profile = record(result.data);
  const answers = record(profile?.onboarding_answers);
  const personalizationAllowed = resolveConsentFlag(profile?.ai_personalization_consent, answers?.aiPersonalizationConsent);
  // The personalized-AI switch governs whether stored profile, conversation,
  // and health history may be used by the model. The separate health-data
  // switch governs native device synchronization, not AI access by itself.
  const healthDataAllowed = personalizationAllowed;
  return {
    healthDataAllowed,
    personalizationAllowed,
    profile: personalizationAllowed
      ? {
        ageGroup: profile?.age_group ?? answers?.ageGroup ?? null,
        occupation: profile?.occupation ?? answers?.occupation ?? null,
        hobbies: stringArray(answers?.hobbies),
        primaryGoal: profile?.goal ?? null,
        exerciseDuration: answers?.exerciseDuration ?? profile?.exercise_frequency ?? null,
        sleepDuration: answers?.sleepDuration ?? profile?.sleep_schedule ?? null,
        dietPreferences: stringArray(answers?.dietPreferences).length > 0
          ? stringArray(answers?.dietPreferences)
          : splitList(profile?.diet_preference),
        stressFactors: profile?.stress_factors ?? null,
        personalizationAllowed: true,
      }
      : { personalizationAllowed: false },
  };
}

async function loadDomainContext(
  client: SupabaseClient,
  userId: string,
  domain: AiDomain,
  startDate: string,
  endDate: string,
  lookbackDays: number,
) {
  if (domain === "rhythm") {
    const result = await recentRows(client, "daily_rhythm_scores", userId, startDate, endDate, Math.min(lookbackDays, 14));
    return compactRows(result, compactRhythm);
  }
  if (domain === "sleep") {
    const result = await recentRows(client, "sleep_records", userId, startDate, endDate, Math.min(lookbackDays, 14));
    return compactRows(result, compactSleep);
  }
  if (domain === "exercise") {
    const result = await recentRows(client, "exercise_records", userId, startDate, endDate, Math.min(lookbackDays, 14));
    return compactRows(result, compactExercise);
  }
  if (domain === "mood") {
    const result = await recentRows(client, "mood_records", userId, startDate, endDate, Math.min(lookbackDays, 14));
    return compactRows(result, compactMood);
  }
  if (domain === "nutrition") {
    const result = await recentRows(client, "nutrition_records", userId, startDate, endDate, Math.min(lookbackDays, 14));
    return compactRows(result, compactNutrition);
  }
  if (domain === "face") {
    const result = await recentRows(client, "face_records", userId, startDate, endDate, Math.min(lookbackDays, 10));
    return compactRows(result, compactFace);
  }
  const result = await recentRows(client, "focus_records", userId, startDate, endDate, Math.min(lookbackDays * 5, 40));
  return compactFocusRows(result);
}

async function recentRows(
  client: SupabaseClient,
  table: string,
  userId: string,
  startDate: string,
  endDate: string,
  limit: number,
): Promise<QueryResult> {
  const result = await client
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .gte("record_date", startDate)
    .lte("record_date", endDate)
    .order("record_date", { ascending: false })
    .limit(limit);
  if (result.error) console.warn(`Could not load authenticated ${table} context`, result.error.message);
  return result as QueryResult;
}

function compactRows(result: QueryResult, compact: (row: Record<string, unknown>) => Record<string, unknown>) {
  if (result.error) return null;
  const rows = arrayOfRecords(result.data).map(compact).filter((row) => Object.keys(row).length > 1);
  return rows.length > 0 ? rows : null;
}

function compactRhythm(row: Record<string, unknown>) {
  return withoutEmpty({ date: row.record_date, score: row.score, confidence: row.confidence });
}

function compactSleep(row: Record<string, unknown>) {
  return withoutEmpty({ date: row.record_date, start: row.sleep_start, end: row.sleep_end, minutes: row.sleep_duration_minutes, selfRating: row.self_rating });
}

function compactExercise(row: Record<string, unknown>) {
  return withoutEmpty({ date: row.record_date, steps: row.steps, calories: row.calories, minutes: row.exercise_minutes, heartRate: row.heart_rate });
}

function compactMood(row: Record<string, unknown>) {
  return withoutEmpty({ date: row.record_date, score: row.mood_score, factors: stringArray(row.factors).slice(0, 4) });
}

function compactNutrition(row: Record<string, unknown>) {
  return withoutEmpty({
    date: row.record_date,
    totalCalories: row.total_calories,
    breakfast: foodNames(row.breakfast_items),
    lunch: foodNames(row.lunch_items),
    dinner: foodNames(row.dinner_items),
  });
}

function compactFace(row: Record<string, unknown>) {
  return withoutEmpty({ date: row.record_date, skinAge: row.skin_age, feedback: clip(String(row.feedback ?? ""), 100) || null });
}

function compactFocusRows(result: QueryResult) {
  if (result.error) return null;
  const byDate = new Map<string, { date: string; minutes: number; sessions: number }>();
  for (const row of arrayOfRecords(result.data)) {
    const date = String(row.record_date ?? "");
    if (!date) continue;
    const current = byDate.get(date) ?? { date, minutes: 0, sessions: 0 };
    current.minutes += number(row.total_minutes);
    current.sessions += number(row.completed_sessions);
    byDate.set(date, current);
  }
  const rows = [...byDate.values()];
  return rows.length > 0 ? rows : null;
}

function foodNames(value: unknown) {
  return arrayOfRecords(value)
    .map((item) => typeof item.name === "string" ? clip(item.name, 30) : "")
    .filter(Boolean)
    .slice(0, 5);
}

function withoutEmpty(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "" && (!Array.isArray(item) || item.length > 0)));
}

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.map(record).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => clip(item, 40)).slice(0, 8)
    : [];
}

function splitList(value: unknown) {
  return typeof value === "string" ? value.split(/[、,，]/).map((item) => clip(item.trim(), 40)).filter(Boolean).slice(0, 8) : [];
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clip(value: string, maxLength: number) {
  return Array.from(value)
    .map((character) => character === "<" || character === ">" || character.charCodeAt(0) < 32 ? " " : character)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
