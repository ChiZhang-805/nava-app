import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type UserAppPreferences = {
  locale: "zh" | "en";
  aiSpeechEnabled: boolean;
  homeWidgetIds: string[];
};

type ActiveSessionType = "focus" | "sleep";
type PendingSessionMutation = { operation: "save"; payload: Record<string, unknown> } | { operation: "clear"; clearedAt: string };

const preferenceWrites = new Map<string, Promise<void>>();
const sessionWrites = new Map<string, Promise<void>>();

function readLocalJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}

function writeLocalJson(key: string, value: unknown | null) {
  if (typeof window === "undefined") return;
  if (value == null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(value));
}

const preferencePendingKey = (userId: string) => `nava.preferences.pending.v1:${userId}`;
const sessionPendingKey = (userId: string, sessionType: ActiveSessionType) => `nava.session.pending.v1:${userId}:${sessionType}`;

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

export async function loadUserAppPreferences(userId: string): Promise<UserAppPreferences | null> {
  if (isDemoMode()) return null;
  if (readLocalJson<Partial<UserAppPreferences>>(preferencePendingKey(userId))) await flushUserAppPreferences(userId);
  const result = await supabase
    .from("user_app_preferences")
    .select("locale,ai_speech_enabled,home_widget_ids")
    .eq("user_id", userId)
    .maybeSingle();
  assertNoError(result.error);
  if (!result.data) return null;
  return {
    locale: result.data.locale === "en" ? "en" : "zh",
    aiSpeechEnabled: result.data.ai_speech_enabled !== false,
    homeWidgetIds: Array.isArray(result.data.home_widget_ids)
      ? result.data.home_widget_ids.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export async function saveUserAppPreferences(
  userId: string,
  changes: Partial<UserAppPreferences>,
) {
  if (isDemoMode()) return;
  const pending = { ...(readLocalJson<Partial<UserAppPreferences>>(preferencePendingKey(userId)) ?? {}), ...changes };
  writeLocalJson(preferencePendingKey(userId), pending);
  return flushUserAppPreferences(userId);
}

async function flushUserAppPreferences(userId: string) {
  const active = preferenceWrites.get(userId);
  if (active) return active;
  const task = (async () => {
    for (;;) {
      const pending = readLocalJson<Partial<UserAppPreferences>>(preferencePendingKey(userId));
      if (!pending || Object.keys(pending).length === 0) return;
      const submitted = JSON.stringify(pending);
      const row: Record<string, unknown> = { user_id: userId };
      if (pending.locale) row.locale = pending.locale;
      if (typeof pending.aiSpeechEnabled === "boolean") row.ai_speech_enabled = pending.aiSpeechEnabled;
      if (pending.homeWidgetIds) row.home_widget_ids = pending.homeWidgetIds;
      const result = await supabase.from("user_app_preferences").upsert(row, { onConflict: "user_id" });
      assertNoError(result.error);
      const latest = readLocalJson<Partial<UserAppPreferences>>(preferencePendingKey(userId));
      if (JSON.stringify(latest) === submitted) writeLocalJson(preferencePendingKey(userId), null);
    }
  })();
  preferenceWrites.set(userId, task);
  try { await task; } finally { if (preferenceWrites.get(userId) === task) preferenceWrites.delete(userId); }
}

export async function loadActiveUserSession<T>(userId: string, sessionType: ActiveSessionType): Promise<T | null> {
  if (isDemoMode()) return null;
  if (readLocalJson<PendingSessionMutation>(sessionPendingKey(userId, sessionType))) await flushActiveUserSession(userId, sessionType);
  const result = await supabase
    .from("active_user_sessions")
    .select("payload")
    .eq("user_id", userId)
    .eq("session_type", sessionType)
    .maybeSingle();
  assertNoError(result.error);
  return result.data?.payload && typeof result.data.payload === "object" ? result.data.payload as T : null;
}

export async function saveActiveUserSession<T extends Record<string, unknown>>(
  userId: string,
  sessionType: ActiveSessionType,
  payload: T,
) {
  if (isDemoMode()) return;
  writeLocalJson(sessionPendingKey(userId, sessionType), { operation: "save", payload } satisfies PendingSessionMutation);
  return flushActiveUserSession(userId, sessionType);
}

export async function clearActiveUserSession(userId: string, sessionType: ActiveSessionType) {
  if (isDemoMode()) return;
  writeLocalJson(sessionPendingKey(userId, sessionType), { operation: "clear", clearedAt: new Date().toISOString() } satisfies PendingSessionMutation);
  return flushActiveUserSession(userId, sessionType);
}

async function flushActiveUserSession(userId: string, sessionType: ActiveSessionType) {
  const mapKey = `${userId}:${sessionType}`;
  const active = sessionWrites.get(mapKey);
  if (active) return active;
  const task = (async () => {
    for (;;) {
      const pending = readLocalJson<PendingSessionMutation>(sessionPendingKey(userId, sessionType));
      if (!pending) return;
      const submitted = JSON.stringify(pending);
      const payload = pending.operation === "save" ? pending.payload : { clearedAt: pending.clearedAt };
      const result = await supabase.from("active_user_sessions").upsert({
        user_id: userId,
        session_type: sessionType,
        payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,session_type" });
      assertNoError(result.error);
      const latest = readLocalJson<PendingSessionMutation>(sessionPendingKey(userId, sessionType));
      if (JSON.stringify(latest) === submitted) writeLocalJson(sessionPendingKey(userId, sessionType), null);
    }
  })();
  sessionWrites.set(mapKey, task);
  try { await task; } finally { if (sessionWrites.get(mapKey) === task) sessionWrites.delete(mapKey); }
}

export type ConversationArchive<T> = {
  id: string;
  createdAt: string;
  messages: T[];
};

export async function loadConversationArchives<T>(userId: string): Promise<Array<ConversationArchive<T>>> {
  if (isDemoMode()) return [];
  const result = await supabase
    .from("ai_conversation_archives")
    .select("id,created_at,messages")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  assertNoError(result.error);
  return (result.data ?? []).flatMap((row) => (
    Array.isArray(row.messages)
      ? [{ id: String(row.id), createdAt: String(row.created_at), messages: row.messages as T[] }]
      : []
  ));
}

export async function saveConversationArchive<T>(userId: string, archive: ConversationArchive<T>) {
  if (isDemoMode()) return;
  const result = await supabase.from("ai_conversation_archives").upsert({
    id: archive.id,
    user_id: userId,
    created_at: archive.createdAt,
    messages: archive.messages,
  }, { onConflict: "id" });
  assertNoError(result.error);
}
