import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609060001_cloud_data_completeness.sql", import.meta.url), "utf8");
const focusMigration = readFileSync(new URL("../supabase/migrations/202609070001_focus_session_integrity.sql", import.meta.url), "utf8");
const avatarMigration = readFileSync(new URL("../supabase/migrations/202609070002_profile_avatar_privacy.sql", import.meta.url), "utf8");
const legacyPhoneCleanupMigration = readFileSync(new URL("../supabase/migrations/202609070003_legacy_phone_cleanup.sql", import.meta.url), "utf8");
const exerciseRecoveryMigration = readFileSync(new URL("../supabase/migrations/202609070004_exercise_recovery_loop.sql", import.meta.url), "utf8");
const pushMigration = readFileSync(new URL("../supabase/migrations/202609070005_remote_push_devices.sql", import.meta.url), "utf8");
const edgeExport = readFileSync(new URL("../supabase/functions/export-user-data/index.ts", import.meta.url), "utf8");
const frontendExport = readFileSync(new URL("../src/services/exportData.ts", import.meta.url), "utf8");
const cloudState = readFileSync(new URL("../src/services/userCloudState.ts", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/services/notifications.ts", import.meta.url), "utf8");
const records = readFileSync(new URL("../src/services/records.ts", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/services/account.ts", import.meta.url), "utf8");
const deleteAccount = readFileSync(new URL("../supabase/functions/delete-account/index.ts", import.meta.url), "utf8");
const secureFaceDraft = readFileSync(new URL("../src/services/secureFaceDraft.ts", import.meta.url), "utf8");
const watch = readFileSync(new URL("../src/services/watch.ts", import.meta.url), "utf8");
const recordsScreen = readFileSync(new URL("../src/features/RecordsScreen.tsx", import.meta.url), "utf8");
const drafts = readFileSync(new URL("../src/services/drafts.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/services/profile.ts", import.meta.url), "utf8");

test("secure account scripts close only their own session", () => {
  for (const name of [
    "backfill-account-mood-week", "backfill-account-auxiliary", "audit-account-history",
    "complete-account-manual-fields", "complete-account-nutrition-dimensions", "audit-account-completeness",
    "generate-account-ai-secure", "import-account-meal-photos", "import-account-face-test-photos",
    "recompute-account-derived", "seed-account-history", "verify-account-health-report-cache",
    "verify-ai-diet-report",
  ]) {
    const source = readFileSync(new URL(`../scripts/${name}.mjs`, import.meta.url), "utf8");
    assert.match(source, /auth\.signOut\(\{ scope: "local" \}\)/, `${name} must not revoke the user's APP session`);
    assert.doesNotMatch(source, /auth\.signOut\(\)/);
  }
});

const accountOwnedTables = [
  "profiles", "mood_records", "sleep_records", "exercise_records", "nutrition_records",
  "focus_records", "focus_session_events", "focus_time_distribution", "tasks", "ai_conversations", "ai_health_reports",
  "ai_conversation_archives", "ai_rate_limit_windows", "face_records", "device_connections",
  "health_sync_jobs", "health_metric_snapshots", "health_imports", "watch_snapshots",
  "daily_rhythm_scores", "health_feature_snapshots", "fdnb_health_scores", "weekly_health_reports",
  "fdnb_recompute_jobs", "rhythm_outcome_feedback", "record_drafts", "notification_preferences",
  "user_notifications", "push_device_tokens", "push_delivery_receipts", "user_app_preferences", "active_user_sessions", "growth_reward_ledger",
  "growth_badges", "growth_progress_views", "xp_awards", "analytics_events", "watch_action_receipts",
  "reward_cart_items", "reward_orders", "reward_order_items",
  "user_reward_card_unlocks", "user_reward_card_preferences",
  "user_mascot_wardrobe_unlocks", "user_mascot_wardrobe_preferences",
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
  assert.doesNotMatch(edgeExport, /downloadUrl/);
  assert.doesNotMatch(frontendExport, /createSignedUrl\(path, 60 \* 60\)/);
  assert.match(frontendExport, /supabase\.storage\.from\(bucket\)\.download\(path\)/);
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
  assert.match(deleteAccount, /rpc\("nava_delete_legacy_phone_codes"/);
  assert.match(legacyPhoneCleanupMigration, /DELETE FROM public\.phone_verification_codes/);
  assert.match(legacyPhoneCleanupMigration, /TO service_role/);
  assert.ok(deleteAccount.indexOf("for (const bucket") < deleteAccount.indexOf("deleteAccountSecurityDigests"), "owned files must be removed before irreversible security cleanup");
  assert.match(focusMigration, /focus_session_events[\s\S]*REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
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
  assert.match(notifications, /notification-pending:v1/);
  assert.match(notifications, /flushPendingNotificationItems/);
  assert.match(notifications, /notification-preference-pending:v1/);
  assert.match(notifications, /flushPendingNotificationPreferences/);
  assert.match(notifications, /\.upsert\(rows,[\s\S]*\.select\("id,category,source,title,body,target,created_at,read_at,deleted_at,updated_at"\)/);
  assert.match(avatarMigration, /SET public = false/);
  assert.match(avatarMigration, /auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/);
  assert.match(cloudState, /preferences\.pending\.v1/);
  assert.match(cloudState, /session\.pending\.v1/);
  assert.match(drafts, /nava-record-draft-pending/);
  assert.match(drafts, /flushRecordDraft/);
  assert.match(frontendExport, /flushPendingRecordDraftsForUser\(userId\)/);
  assert.match(frontendExport, /flushPendingNotificationPreferences\(userId\)/);
  assert.match(profile, /avatar-current/);
  assert.doesNotMatch(profile, /catch \(error\)[\s\S]{0,200}remove\(\[path\]\)/);
});

test("previously dropped record fields are persisted and restored", () => {
  assert.match(migration, /focus_records[\s\S]*ADD COLUMN IF NOT EXISTS note text/);
  assert.match(migration, /tasks[\s\S]*ADD COLUMN IF NOT EXISTS source text/);
  assert.match(migration, /nutrition_records[\s\S]*ADD COLUMN IF NOT EXISTS pantry_time time/);
  assert.match(records, /\[timeKey\]: input\.mealTime/);
  assert.match(records, /note: input\.note/);
  for (const field of ["duration", "deep", "light", "rem"]) {
    assert.match(recordsScreen, new RegExp(`typeof draft\\.${field} === "number"`));
  }
  assert.match(recordsScreen, /typeof draft\.heartRate === "string"/);
  assert.match(recordsScreen, /typeof draft\.spo2 === "string"/);
  for (const column of ["soreness_level", "fatigue_level", "has_injury", "injury_note", "recovery_estimate_min_hours", "recovery_estimate_max_hours", "recovery_status"]) {
    assert.match(exerciseRecoveryMigration, new RegExp(column));
    assert.match(records, new RegExp(column));
  }
  assert.match(exerciseRecoveryMigration, /session_type IN \('focus', 'sleep', 'exercise'\)/);
  assert.match(pushMigration, /CREATE TABLE IF NOT EXISTS public\.push_device_tokens/);
  assert.match(pushMigration, /CREATE TABLE IF NOT EXISTS public\.push_delivery_receipts/);
});
