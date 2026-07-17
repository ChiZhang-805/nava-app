import { supabase } from "./supabaseClient";
import { demoMessages, demoProfile, demoTodaySnapshot, demoTrends, isDemoMode } from "./demo";

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
  ];

  const result: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    userId,
  };

  for (const table of tables) {
    const column = table === "profiles" ? "id" : "user_id";
    const { data, error } = await supabase.from(table).select("*").eq(column, userId);
    if (error) throw error;
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

