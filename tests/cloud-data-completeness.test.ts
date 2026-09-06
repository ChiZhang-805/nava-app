import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609060001_cloud_data_completeness.sql", import.meta.url), "utf8");
const edgeExport = readFileSync(new URL("../supabase/functions/export-user-data/index.ts", import.meta.url), "utf8");
const frontendExport = readFileSync(new URL("../src/services/exportData.ts", import.meta.url), "utf8");
const cloudState = readFileSync(new URL("../src/services/userCloudState.ts", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/services/notifications.ts", import.meta.url), "utf8");
const records = readFileSync(new URL("../src/services/records.ts", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/services/account.ts", import.meta.url), "utf8");
const deleteAccount = readFileSync(new URL("../supabase/functions/delete-account/index.ts", import.meta.url), "utf8");
const secureFaceDraft = readFileSync(new URL("../src/services/secureFaceDraft.ts", import.meta.url), "utf8");
const watch = readFileSync(new URL("../src/services/watch.ts", import.meta.url), "utf8");

const accountOwnedTables = [
  "profiles", "mood_records", "sleep_records", "exercise_records", "nutrition_records",
  "focus_records", "focus_time_distribution", "tasks", "ai_conversations", "ai_health_reports",
  "ai_conversation_archives", "ai_rate_limit_windows", "face_records", "device_connections",
  "health_sync_jobs", "health_metric_snapshots", "health_imports", "watch_snapshots",
  "daily_rhythm_scores", "health_feature_snapshots", "fdnb_health_scores", "weekly_health_reports",
  "fdnb_recompute_jobs", "rhythm_outcome_feedback", "record_drafts", "notification_preferences",
  "user_notifications", "user_app_preferences", "active_user_sessions", "growth_reward_ledger",
  "growth_badges", "growth_progress_views", "xp_awards", "analytics_events", "watch_action_receipts",
  "community_posts", "community_comments", "community_likes", "community_bookmarks",
] as const;

test("authenticated export contains every account-owned public table and private storage inventory", () => {
  for (const table of accountOwnedTables) {
    assert.match(edgeExport, new RegExp(`name: ["']${table}["']`), `Edge export is missing ${table}`);
    assert.match(frontendExport, new RegExp(`["']${table}["']`), `frontend fallback export is missing ${table}`);
  }
  for (const bucket of ["diet-photos", "face-photos", "profile-avatars"]) {
    assert.match(edgeExport, new RegExp(`["']${bucket}["']`));
    assert.match(frontendExport, new RegExp(`["']${bucket}["']`));
  }
  assert.match(edgeExport, /throw new Error\(`账号数据导出不完整/);
  assert.match(edgeExport, /account:[\s\S]*userMetadata:[\s\S]*identities:/);
  assert.match(frontendExport, /supabase\.auth\.getUser\(\)/);
});

test("legacy account tables and analytics are converted to auth cascade deletion", () => {
  for (const table of [
    "ai_conversations", "community_bookmarks", "community_comments", "community_likes",
    "community_posts", "exercise_records", "focus_records", "focus_time_distribution",
    "mood_records", "sleep_records", "tasks",
  ]) assert.match(migration, new RegExp(`\\('${table}', '${table}_user_id_fkey'\\)`));
  assert.match(migration, /analytics_events_user_id_fkey[\s\S]*ON DELETE CASCADE/);
  assert.match(migration, /information_schema\.columns[\s\S]*constraints\.confdeltype = 'c'/);
  assert.match(migration, /INSERT INTO public\.profiles[\s\S]*FROM auth\.users/);
  assert.match(account, /purgeAccountBrowserState\(userId\)/);
  assert.match(account, /clearSecureFaceDraftsForUser\(userId\)/);
  assert.match(account, /clearWatchAccountState\(userId\)/);
  assert.match(account, /clearScheduledNavaNotifications\(\)/);
  assert.match(secureFaceDraft, /openKeyCursor\(\)/);
  assert.match(watch, /NavaWatchBridge\.clearAccountState\(\)/);
  assert.match(notifications, /LocalNotifications\.cancel/);
  assert.match(deleteAccount, /from\("nava_auth_account_checks"\)\.delete\(\)\.in\("account_hash"/);
  assert.match(deleteAccount, /from\("nava_phone_otp_challenges"\)\.delete\(\)\.in\("phone_hash"/);
});

test("device-local caches have authenticated cloud counterparts", () => {
  for (const table of ["user_app_preferences", "user_notifications", "ai_conversation_archives", "active_user_sessions"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(migration, new RegExp(`${table}[\\s\\S]*REFERENCES auth\\.users\\(id\\) ON DELETE CASCADE`));
  }
  assert.match(cloudState, /from\("user_app_preferences"\)/);
  assert.match(cloudState, /from\("active_user_sessions"\)/);
  assert.match(cloudState, /from\("ai_conversation_archives"\)/);
  assert.match(notifications, /from\("user_notifications"\)/);
  assert.match(notifications, /postgres_changes/);
});

test("previously dropped record fields are persisted and restored", () => {
  assert.match(migration, /focus_records[\s\S]*ADD COLUMN IF NOT EXISTS note text/);
  assert.match(migration, /tasks[\s\S]*ADD COLUMN IF NOT EXISTS source text/);
  assert.match(migration, /nutrition_records[\s\S]*ADD COLUMN IF NOT EXISTS pantry_time time/);
  assert.match(records, /\[timeKey\]: input\.mealTime/);
  assert.match(records, /note: input\.note/);
});
