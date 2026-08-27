import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type RecordDraftModule = "sleep" | "exercise" | "mood" | "nutrition" | "focus" | "face";

function storageKey(userId: string, module: RecordDraftModule, date: string) {
  return `nava-record-draft:${userId}:${module}:${date}`;
}
function missingDraftTable(message: string) {
  return /record_drafts|schema cache|does not exist/i.test(message);
}

export async function loadRecordDraft(userId: string, module: RecordDraftModule, date: string) {
  let local: Record<string, unknown> | null = null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId, module, date));
    local = raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch {
    local = null;
  }
  if (isDemoMode()) return local;
  const { data, error } = await supabase
    .from("record_drafts")
    .select("payload")
    .eq("user_id", userId)
    .eq("module", module)
    .eq("record_date", date)
    .eq("status", "editing")
    .maybeSingle();
  if (error && !missingDraftTable(error.message)) throw error;
  return data?.payload && typeof data.payload === "object" ? data.payload as Record<string, unknown> : local;
}

export async function saveRecordDraft(userId: string, module: RecordDraftModule, date: string, payload: Record<string, unknown>) {
  window.localStorage.setItem(storageKey(userId, module, date), JSON.stringify(payload));
  if (isDemoMode()) return;
  const { error } = await supabase.from("record_drafts").upsert({
    user_id: userId,
    module,
    record_date: date,
    payload,
    status: "editing",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,module,record_date" });
  if (error && !missingDraftTable(error.message)) throw error;
}

export async function clearRecordDraft(userId: string, module: RecordDraftModule, date: string) {
  window.localStorage.removeItem(storageKey(userId, module, date));
  if (isDemoMode()) return;
  const { error } = await supabase
    .from("record_drafts")
    .delete()
    .eq("user_id", userId)
    .eq("module", module)
    .eq("record_date", date);
  if (error && !missingDraftTable(error.message)) throw error;
}
