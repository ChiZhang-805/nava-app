import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { todayISO } from "./date";
import { persistConversationArchive, type ArchiveMessage, type ArchiveStore } from "./aiConversationPersistence";

export type UserAppPreferences = {
  locale: "zh" | "en";
  aiSpeechEnabled: boolean;
  homeWidgetIds: Array<string | null>;
};

type ActiveSessionType = "focus" | "sleep" | "exercise";
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
      ? result.data.home_widget_ids.map((value) => typeof value === "string" ? value : null)
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
  dayKey?: string;
  title?: string;
  messages: T[];
};

type ConversationArchiveMetadata = {
  __navaArchive: {
    version: 1;
    dayKey: string;
    title: string;
  };
};

function archiveMetadata(value: unknown): ConversationArchiveMetadata["__navaArchive"] | null {
  if (!value || typeof value !== "object" || !("__navaArchive" in value)) return null;
  const metadata = (value as ConversationArchiveMetadata).__navaArchive;
  return metadata?.version === 1 && typeof metadata.dayKey === "string" && typeof metadata.title === "string"
    ? metadata
    : null;
}

function decodeArchive<T>(row: Record<string, unknown>): ConversationArchive<T> | null {
  if (!Array.isArray(row.messages)) return null;
  const metadata = archiveMetadata(row.messages[0]);
  const createdAt = String(row.created_at);
  return {
    id: String(row.id), createdAt,
    dayKey: metadata?.dayKey ?? todayISO(new Date(createdAt)), title: metadata?.title ?? "",
    messages: (metadata ? row.messages.slice(1) : row.messages) as T[],
  };
}

function conversationArchiveStore<T extends ArchiveMessage>(userId: string, archiveId: string): ArchiveStore<T> {
  const demoKey = `nava-ai-history:${userId}`;
  return {
    read: async () => {
      if (isDemoMode()) {
        const archive = (readLocalJson<ConversationArchive<T>[]>(demoKey) ?? []).find(item => item.id === archiveId);
        return archive ? { archive, version: JSON.stringify(archive) } : null;
      }
      const result = await supabase.from("ai_conversation_archives").select("id,created_at,updated_at,messages")
        .eq("user_id", userId).eq("id", archiveId).maybeSingle();
      assertNoError(result.error);
      if (!result.data) return null;
      const archive = decodeArchive<T>(result.data);
      if (!archive) throw new Error("Invalid saved conversation.");
      return { archive, version: String(result.data.updated_at) };
    },
    compareAndSwap: async (archive, expectedVersion) => {
      if (isDemoMode()) {
        const all = readLocalJson<ConversationArchive<T>[]>(demoKey) ?? [];
        const current = all.find(item => item.id === archiveId);
        if ((current ? JSON.stringify(current) : null) !== expectedVersion) return false;
        writeLocalJson(demoKey, [archive, ...all.filter(item => item.id !== archiveId)]);
        return true;
      }
      const messages = [{ __navaArchive: { version: 1, dayKey: archive.dayKey ?? todayISO(new Date(archive.createdAt)), title: archive.title?.trim() ?? "" } }, ...archive.messages];
      const result = expectedVersion === null
        ? await supabase.from("ai_conversation_archives").insert({ id: archiveId, user_id: userId, created_at: archive.createdAt, messages }).select("id").maybeSingle()
        : await supabase.from("ai_conversation_archives").update({ messages })
          .eq("user_id", userId).eq("id", archiveId).eq("updated_at", expectedVersion).select("id").maybeSingle();
      assertNoError(result.error);
      return Boolean(result.data);
    },
  };
}

export async function loadConversationArchives<T>(userId: string): Promise<Array<ConversationArchive<T>>> {
  if (isDemoMode()) return readLocalJson<ConversationArchive<T>[]>(`nava-ai-history:${userId}`) ?? [];
  const result = await supabase.from("ai_conversation_archives").select("id,created_at,messages")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(20);
  assertNoError(result.error);
  return (result.data ?? []).flatMap(row => {
    const archive = decodeArchive<T>(row);
    return archive ? [archive] : [];
  });
}

export async function loadConversationArchive<T extends ArchiveMessage>(userId: string, archiveId: string) {
  return (await conversationArchiveStore<T>(userId, archiveId).read())?.archive ?? null;
}

export async function saveConversationArchive<T extends ArchiveMessage>(userId: string, archive: ConversationArchive<T>, requireExisting = false) {
  const store = conversationArchiveStore<T>(userId, archive.id);
  if (requireExisting || isDemoMode()) return persistConversationArchive(archive, store, requireExisting);
  // A local cache is never authority to recreate an archive deleted in the cloud.
  // Existing archives can only be updated, even if deletion races with this read.
  if (await store.read()) return persistConversationArchive(archive, store, true);
  // New archives can contain only messages still present in the current cloud
  // conversation. Read their authoritative contents, not stale UI/cache copies.
  const ids = [...new Set(archive.messages.map(message => message.id))];
  const confirmed: T[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const result = await supabase.from("ai_conversations").select("id,role,content,created_at")
      .eq("user_id", userId).in("id", ids.slice(index, index + 100));
    assertNoError(result.error);
    confirmed.push(...(result.data ?? []) as T[]);
  }
  if (!confirmed.length) throw new Error("Conversation no longer exists or is not accessible.");
  confirmed.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  return persistConversationArchive({ ...archive, messages: confirmed }, store, false);
}

export async function appendConversationArchiveMessage<T extends ArchiveMessage>(userId: string, archiveId: string, message: T) {
  const store = conversationArchiveStore<T>(userId, archiveId);
  const current = await store.read();
  if (!current) throw new Error("Conversation no longer exists or is not accessible.");
  return persistConversationArchive({ ...current.archive, messages: [message] }, store, true);
}

export async function deleteConversationArchive(userId: string, archiveId: string) {
  if (isDemoMode()) {
    const key = `nava-ai-history:${userId}`;
    writeLocalJson(key, (readLocalJson<ConversationArchive<ArchiveMessage>[]>(key) ?? []).filter(item => item.id !== archiveId));
    return;
  }
  const result = await supabase.from("ai_conversation_archives").delete().eq("user_id", userId).eq("id", archiveId);
  assertNoError(result.error);
}
