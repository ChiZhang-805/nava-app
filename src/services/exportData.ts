import { supabase } from "./supabaseClient";
import { demoMessages, demoProfile, demoTodaySnapshot, demoTrends, isDemoMode } from "./demo";

function isMissingBackendResource(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string };
  const detail = `${candidate.message ?? ""} ${candidate.details ?? ""}`;
  return candidate.code === "PGRST205" || candidate.code === "42P01" || /could not find the table|relation .* does not exist/i.test(detail);
}

export async function exportUserData(userId: string) {
  if (isDemoMode()) {
    return {
      exportedAt: new Date().toISOString(),
      userId,
      profile: demoProfile,
      today: demoTodaySnapshot(),
      trends: demoTrends(),
      ai_conversations: demoMessages,
    };
  }

  const exported = await supabase.functions.invoke<Record<string, unknown>>("export-user-data", { body: {} });
  if (!exported.error && exported.data) return exported.data;

  const tables = [
    "profiles",
    "mood_records",
    "sleep_records",
    "exercise_records",
    "nutrition_records",
    "focus_records",
    "focus_time_distribution",
    "tasks",
    "ai_conversations",
    "ai_health_reports",
    "face_records",
    "device_connections",
    "health_sync_jobs",
    "health_metric_snapshots",
    "watch_snapshots",
    "daily_rhythm_scores",
    "health_feature_snapshots",
    "fdnb_health_scores",
    "weekly_health_reports",
    "record_drafts",
    "notification_preferences",
    "growth_reward_ledger",
    "growth_badges",
    "growth_progress_views",
    "analytics_events",
  ];

  const result: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    userId,
  };

  for (const table of tables) {
    const column = table === "profiles" ? "id" : "user_id";
    const { data, error } = await supabase.from(table).select("*").eq(column, userId);
    if (error && !isMissingBackendResource(error)) throw error;
    result[table] = data ?? [];
  }

  return result;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
