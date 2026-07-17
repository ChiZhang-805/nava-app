import { errorResponse, jsonResponse, optionsResponse, readJson, requireUser } from "../_shared/http.ts";

const tableContracts = [
  { name: "profiles", column: "id" },
  { name: "mood_records", column: "user_id" },
  { name: "sleep_records", column: "user_id" },
  { name: "exercise_records", column: "user_id" },
  { name: "nutrition_records", column: "user_id" },
  { name: "focus_records", column: "user_id" },
  { name: "focus_time_distribution", column: "user_id" },
  { name: "tasks", column: "user_id" },
  { name: "ai_conversations", column: "user_id" },
  { name: "face_records", column: "user_id" },
  { name: "device_connections", column: "user_id" },
  { name: "health_sync_jobs", column: "user_id" },
  { name: "health_metric_snapshots", column: "user_id" },
  { name: "watch_snapshots", column: "user_id" },
  { name: "daily_rhythm_scores", column: "user_id" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    await readJson(req);
    const result: Record<string, unknown> = {
      schemaVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      userId: user.id,
    };

    for (const table of tableContracts) {
      const { data, error } = await userClient.from(table.name).select("*").eq(table.column, user.id);
      if (error) {
        const errors = (result.errors ?? {}) as Record<string, string>;
        errors[table.name] = error.message;
        result.errors = errors;
        result[table.name] = [];
      } else {
        result[table.name] = data ?? [];
      }
    }

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});
