import { supabase } from "./supabaseClient";
import { demoMessages, demoProfile, demoTodaySnapshot, demoTrends, isDemoMode } from "./demo";
import { flushPendingNotificationPreferences, hydrateNavaNotifications } from "./notifications";
import { loadActiveUserSession, loadUserAppPreferences } from "./userCloudState";
import { flushPendingRecordDraftsForUser } from "./drafts";

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

  // Flush durable client outboxes before taking the server-side snapshot. If
  // any write still cannot reach Supabase, fail rather than export stale data.
  await Promise.all([
    hydrateNavaNotifications(userId),
    flushPendingNotificationPreferences(userId),
    loadUserAppPreferences(userId),
    loadActiveUserSession(userId, "focus"),
    loadActiveUserSession(userId, "sleep"),
    flushPendingRecordDraftsForUser(userId),
  ]);

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
    "focus_session_events",
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
    schemaVersion: "1.2.0",
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
        files.push({
          path,
          bucket,
          size: Number(entry.metadata?.size ?? 0),
          contentType: entry.metadata?.mimetype ?? null,
          updatedAt: entry.updated_at ?? null,
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

export async function downloadUserArchive(filenameBase: string, data: unknown) {
  const encoder = new TextEncoder();
  const entries: Array<{ name: string; bytes: Uint8Array; modifiedAt?: string }> = [{
    name: "nava-account-data.json",
    bytes: encoder.encode(JSON.stringify(data, null, 2)),
  }];
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const storage = root.storage && typeof root.storage === "object" ? root.storage as Record<string, unknown> : {};
  for (const [bucket, rawFiles] of Object.entries(storage)) {
    if (!Array.isArray(rawFiles)) continue;
    for (const rawFile of rawFiles) {
      if (!rawFile || typeof rawFile !== "object") continue;
      const file = rawFile as Record<string, unknown>;
      const path = typeof file.path === "string" ? file.path : "";
      if (!path || (typeof file.bucket === "string" && file.bucket !== bucket)) continue;
      const downloaded = await supabase.storage.from(bucket).download(path);
      if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error(`无法下载 ${bucket}/${path}`);
      entries.push({
        name: archivePath(`storage/${bucket}/${path}`),
        bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
        modifiedAt: typeof file.updatedAt === "string" ? file.updatedAt : undefined,
      });
    }
  }

  const tar = buildTar(entries);
  let blob = new Blob([tar], { type: "application/x-tar" });
  let extension = ".tar";
  if (typeof CompressionStream !== "undefined") {
    const compressed = blob.stream().pipeThrough(new CompressionStream("gzip"));
    blob = await new Response(compressed).blob();
    extension = ".tar.gz";
  }
  downloadBlob(`${filenameBase}${extension}`, blob);
}

function archivePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
  if (!normalized || new TextEncoder().encode(normalized).length > 100) throw new Error("导出文件路径过长，无法安全打包。");
  return normalized;
}

function buildTar(entries: Array<{ name: string; bytes: Uint8Array; modifiedAt?: string }>) {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    writeTarText(header, 0, 100, archivePath(entry.name));
    writeTarOctal(header, 100, 8, 0o600);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, entry.bytes.byteLength);
    const modified = entry.modifiedAt ? new Date(entry.modifiedAt).getTime() : Date.now();
    writeTarOctal(header, 136, 12, Math.floor((Number.isFinite(modified) ? modified : Date.now()) / 1000));
    header.fill(32, 148, 156);
    header[156] = "0".charCodeAt(0);
    writeTarText(header, 257, 6, "ustar\0");
    writeTarText(header, 263, 2, "00");
    const checksum = header.reduce((sum, value) => sum + value, 0);
    const checksumText = checksum.toString(8).padStart(6, "0");
    writeTarText(header, 148, 6, checksumText);
    header[154] = 0;
    header[155] = 32;
    chunks.push(header, entry.bytes);
    const padding = (512 - entry.bytes.byteLength % 512) % 512;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1024));
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function writeTarText(target: Uint8Array, offset: number, length: number, value: string) {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}

function writeTarOctal(target: Uint8Array, offset: number, length: number, value: number) {
  writeTarText(target, offset, length, Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, "0"));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
