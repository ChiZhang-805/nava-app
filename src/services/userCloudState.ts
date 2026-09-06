import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type UserAppPreferences = {
  locale: "zh" | "en";
  aiSpeechEnabled: boolean;
  homeWidgetIds: string[];
};

type ActiveSessionType = "focus" | "sleep";

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

export async function loadUserAppPreferences(userId: string): Promise<UserAppPreferences | null> {
  if (isDemoMode()) return null;
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
  const row: Record<string, unknown> = { user_id: userId };
  if (changes.locale) row.locale = changes.locale;
  if (typeof changes.aiSpeechEnabled === "boolean") row.ai_speech_enabled = changes.aiSpeechEnabled;
  if (changes.homeWidgetIds) row.home_widget_ids = changes.homeWidgetIds;
  const result = await supabase.from("user_app_preferences").upsert(row, { onConflict: "user_id" });
  assertNoError(result.error);
}

export async function loadActiveUserSession<T>(userId: string, sessionType: ActiveSessionType): Promise<T | null> {
  if (isDemoMode()) return null;
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
  const result = await supabase.from("active_user_sessions").upsert({
    user_id: userId,
    session_type: sessionType,
    payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,session_type" });
  assertNoError(result.error);
}

export async function clearActiveUserSession(userId: string, sessionType: ActiveSessionType) {
  if (isDemoMode()) return;
  const result = await supabase
    .from("active_user_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("session_type", sessionType);
  assertNoError(result.error);
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
