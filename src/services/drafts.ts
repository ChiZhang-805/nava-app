import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { mergeMealDraft, removeMealDraft } from "./mealDrafts";

export type RecordDraftModule = "sleep" | "exercise" | "mood" | "nutrition" | "focus" | "face";

function storageKey(userId: string, module: RecordDraftModule, date: string) {
  return `nava-record-draft:${userId}:${module}:${date}`;
}
const draftWrites = new Map<string, Promise<void>>();
const draftRevisions = new Map<string, number>();
function readLocalDraft(userId: string, module: RecordDraftModule, date: string) {
  try { return JSON.parse(window.localStorage.getItem(storageKey(userId, module, date)) ?? "null") as Record<string, unknown> | null; } catch { return null; }
}
function pendingKey(userId: string, module: RecordDraftModule, date: string) {
  return `nava-record-draft-pending:${userId}:${module}:${date}`;
}

type PendingDraft = { operation: "save"; payload: Record<string, unknown> } | { operation: "clear" };

function readPendingDraft(userId: string, module: RecordDraftModule, date: string): PendingDraft | null {
  try { return JSON.parse(window.localStorage.getItem(pendingKey(userId, module, date)) ?? "null") as PendingDraft | null; } catch { return null; }
}

export async function loadRecordDraft(userId: string, module: RecordDraftModule, date: string) {
  const key = storageKey(userId, module, date);
  const revision = draftRevisions.get(key) ?? 0;
  let local: Record<string, unknown> | null = null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId, module, date));
    local = raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch {
    local = null;
  }
  if (isDemoMode()) return local;
  if (readPendingDraft(userId, module, date)) await flushRecordDraft(userId, module, date);
  const { data, error } = await supabase
    .from("record_drafts")
    .select("payload")
    .eq("user_id", userId)
    .eq("module", module)
    .eq("record_date", date)
    .eq("status", "editing")
    .maybeSingle();
  if (error) throw error;
  // A late cloud read must never roll back a local edit or saved-meal cleanup.
  if (revision !== (draftRevisions.get(key) ?? 0)) return readLocalDraft(userId, module, date);
  const resolved = data?.payload && typeof data.payload === "object" ? data.payload as Record<string, unknown> : local;
  if (resolved) window.localStorage.setItem(key, JSON.stringify(resolved));
  return resolved;
}

export async function saveRecordDraft(userId: string, module: RecordDraftModule, date: string, payload: Record<string, unknown>) {
  const key = storageKey(userId, module, date);
  draftRevisions.set(key, (draftRevisions.get(key) ?? 0) + 1);
  window.localStorage.setItem(storageKey(userId, module, date), JSON.stringify(payload));
  if (isDemoMode()) return;
  window.localStorage.setItem(pendingKey(userId, module, date), JSON.stringify({ operation: "save", payload } satisfies PendingDraft));
  return flushRecordDraft(userId, module, date);
}

export async function clearRecordDraft(userId: string, module: RecordDraftModule, date: string) {
  const key = storageKey(userId, module, date);
  draftRevisions.set(key, (draftRevisions.get(key) ?? 0) + 1);
  window.localStorage.removeItem(storageKey(userId, module, date));
  if (isDemoMode()) return;
  window.localStorage.setItem(pendingKey(userId, module, date), JSON.stringify({ operation: "clear" } satisfies PendingDraft));
  return flushRecordDraft(userId, module, date);
}

// The merge/clear and local outbox update happen synchronously, before any
// network await. Existing per-account/date flushRecordDraft serializes uploads.
export function saveMealRecordDraft(userId: string, date: string, payload: Record<string, unknown>) {
  return saveRecordDraft(userId, "nutrition", date, mergeMealDraft(readLocalDraft(userId, "nutrition", date), payload));
}
export function clearMealRecordDraft(userId: string, date: string, meal: string) {
  const remaining = removeMealDraft(readLocalDraft(userId, "nutrition", date), meal);
  return remaining ? saveRecordDraft(userId, "nutrition", date, remaining) : clearRecordDraft(userId, "nutrition", date);
}

async function flushRecordDraft(userId: string, module: RecordDraftModule, date: string) {
  const key = pendingKey(userId, module, date);
  const active = draftWrites.get(key);
  if (active) return active;
  const task = (async () => {
    for (;;) {
      const pending = readPendingDraft(userId, module, date);
      if (!pending) return;
      const submitted = JSON.stringify(pending);
      const result = pending.operation === "save"
        ? await supabase.from("record_drafts").upsert({
            user_id: userId,
            module,
            record_date: date,
            payload: pending.payload,
            status: "editing",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,module,record_date" })
        : await supabase.from("record_drafts")
            .delete()
            .eq("user_id", userId)
            .eq("module", module)
            .eq("record_date", date);
      if (result.error) throw result.error;
      const latest = readPendingDraft(userId, module, date);
      if (JSON.stringify(latest) === submitted) window.localStorage.removeItem(key);
    }
  })();
  draftWrites.set(key, task);
  try { await task; } finally { if (draftWrites.get(key) === task) draftWrites.delete(key); }
}

export async function flushPendingRecordDraftsForUser(userId: string) {
  const prefix = `nava-record-draft-pending:${userId}:`;
  const modules = new Set<RecordDraftModule>(["sleep", "exercise", "mood", "nutrition", "focus", "face"]);
  const pending: Array<Promise<void>> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const [module, date] = key.slice(prefix.length).split(":");
    if (!modules.has(module as RecordDraftModule) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) continue;
    pending.push(flushRecordDraft(userId, module as RecordDraftModule, date));
  }
  await Promise.all(pending);
}
