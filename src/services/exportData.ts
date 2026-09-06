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
  if (!exported.error && exported.data) {
    const exportErrors = exported.data.errors;
    if (exportErrors && typeof exportErrors === "object" && Object.keys(exportErrors).length > 0) {
      throw new Error(`账号数据导出不完整：${Object.keys(exportErrors).join("、")}`);
    }
    return exported.data;
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
    "ai_health_reports",
    "ai_conversation_archives",
    "ai_rate_limit_windows",
    "face_records",
    "device_connections",
    "health_sync_jobs",
    "health_metric_snapshots",
    "health_imports",
    "watch_snapshots",
    "daily_rhythm_scores",
    "health_feature_snapshots",
    "fdnb_health_scores",
    "weekly_health_reports",
    "fdnb_recompute_jobs",
    "rhythm_outcome_feedback",
    "record_drafts",
    "notification_preferences",
    "user_notifications",
    "user_app_preferences",
    "active_user_sessions",
    "growth_reward_ledger",
    "growth_badges",
    "growth_progress_views",
    "xp_awards",
    "analytics_events",
    "watch_action_receipts",
    "community_posts",
    "community_comments",
    "community_likes",
    "community_bookmarks",
  ];

  const result: Record<string, unknown> = {
    schemaVersion: "1.1.0",
    exportedAt: new Date().toISOString(),
    userId,
  };

  const currentUser = await supabase.auth.getUser();
  if (currentUser.error) throw currentUser.error;
  if (!currentUser.data.user || currentUser.data.user.id !== userId) throw new Error("当前登录账号与导出目标不一致。");
  result.account = {
    id: currentUser.data.user.id,
    email: currentUser.data.user.email ?? null,
    phone: currentUser.data.user.phone ?? null,
    createdAt: currentUser.data.user.created_at,
    updatedAt: currentUser.data.user.updated_at ?? null,
    lastSignInAt: currentUser.data.user.last_sign_in_at ?? null,
    userMetadata: currentUser.data.user.user_metadata ?? {},
    identities: currentUser.data.user.identities ?? [],
  };

  for (const table of tables) {
    const column = table === "profiles" ? "id" : "user_id";
    const { data, error } = await supabase.from(table).select("*").eq(column, userId);
    if (error) {
      if (isMissingBackendResource(error)) throw new Error(`共享后端尚未部署 ${table}，无法生成完整账号数据导出。`);
      throw error;
    }
    result[table] = data ?? [];
  }

  result.storage = {
    "diet-photos": await listOwnedFiles("diet-photos", userId),
    "face-photos": await listOwnedFiles("face-photos", userId),
    "profile-avatars": await listOwnedFiles("profile-avatars", userId),
  };

  return result;
}

async function listOwnedFiles(bucket: string, prefix: string, depth = 0): Promise<Array<Record<string, unknown>>> {
  if (depth > 8) throw new Error(`存储目录层级异常：${bucket}`);
  const files: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += 1_000) {
    const listed = await supabase.storage.from(bucket).list(prefix, { limit: 1_000, offset, sortBy: { column: "name", order: "asc" } });
    if (listed.error) throw listed.error;
    const entries = listed.data ?? [];
    for (const entry of entries) {
      if (!entry.name || entry.name === ".emptyFolderPlaceholder") continue;
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        const signed = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
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
        files.push(...await listOwnedFiles(bucket, path, depth + 1));
      }
    }
    if (entries.length < 1_000) break;
  }
  return files;
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
