import { errorResponse, jsonResponse, optionsResponse, readJson, requireUser } from "../_shared/http.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

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
  { name: "ai_health_reports", column: "user_id" },
  { name: "ai_conversation_archives", column: "user_id" },
  { name: "ai_rate_limit_windows", column: "user_id" },
  { name: "face_records", column: "user_id" },
  { name: "device_connections", column: "user_id" },
  { name: "health_sync_jobs", column: "user_id" },
  { name: "health_metric_snapshots", column: "user_id" },
  { name: "health_imports", column: "user_id" },
  { name: "watch_snapshots", column: "user_id" },
  { name: "daily_rhythm_scores", column: "user_id" },
  { name: "health_feature_snapshots", column: "user_id" },
  { name: "fdnb_health_scores", column: "user_id" },
  { name: "weekly_health_reports", column: "user_id" },
  { name: "fdnb_recompute_jobs", column: "user_id" },
  { name: "rhythm_outcome_feedback", column: "user_id" },
  { name: "record_drafts", column: "user_id" },
  { name: "notification_preferences", column: "user_id" },
  { name: "user_notifications", column: "user_id" },
  { name: "user_app_preferences", column: "user_id" },
  { name: "active_user_sessions", column: "user_id" },
  { name: "growth_reward_ledger", column: "user_id" },
  { name: "growth_badges", column: "user_id" },
  { name: "growth_progress_views", column: "user_id" },
  { name: "xp_awards", column: "user_id" },
  { name: "analytics_events", column: "user_id" },
  { name: "watch_action_receipts", column: "user_id" },
  { name: "community_posts", column: "user_id" },
  { name: "community_comments", column: "user_id" },
  { name: "community_likes", column: "user_id" },
  { name: "community_bookmarks", column: "user_id" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    await readJson(req);
    const result: Record<string, unknown> = {
      schemaVersion: "1.1.0",
      exportedAt: new Date().toISOString(),
      userId: user.id,
      account: {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        createdAt: user.created_at,
        updatedAt: user.updated_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        userMetadata: user.user_metadata ?? {},
        identities: user.identities ?? [],
      },
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

    result.storage = {
      "diet-photos": await listOwnedFiles(userClient, "diet-photos", user.id),
      "face-photos": await listOwnedFiles(userClient, "face-photos", user.id),
      "profile-avatars": await listOwnedFiles(userClient, "profile-avatars", user.id),
    };

    const failedTables = Object.keys((result.errors ?? {}) as Record<string, string>);
    if (failedTables.length > 0) {
      throw new Error(`账号数据导出不完整，以下数据表读取失败：${failedTables.join("、")}`);
    }

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});

async function listOwnedFiles(client: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<Array<Record<string, unknown>>> {
  if (depth > 8) throw new Error(`存储目录层级异常：${bucket}`);
  const files: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += 1_000) {
    const listed = await client.storage.from(bucket).list(prefix, { limit: 1_000, offset, sortBy: { column: "name", order: "asc" } });
    if (listed.error) throw listed.error;
    const entries = listed.data ?? [];
    for (const entry of entries) {
      if (!entry.name || entry.name === ".emptyFolderPlaceholder") continue;
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        const signed = await client.storage.from(bucket).createSignedUrl(path, 60 * 60);
        if (signed.error) throw signed.error;
        files.push({
          path,
          bucket,
          size: Number(entry.metadata?.size ?? 0),
          contentType: entry.metadata?.mimetype ?? null,
          updatedAt: entry.updated_at ?? null,
          downloadUrl: signed.data.signedUrl,
          downloadUrlExpiresInSeconds: 3600,
        });
      } else {
        files.push(...await listOwnedFiles(client, bucket, path, depth + 1));
      }
    }
    if (entries.length < 1_000) break;
  }
  return files;
}
