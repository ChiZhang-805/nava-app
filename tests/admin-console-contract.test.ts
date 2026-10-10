import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = readFileSync(new URL("supabase/migrations/202609260001_admin_console.sql", root), "utf8");
const roleMigration = readFileSync(new URL("supabase/migrations/202609270002_admin_role_management.sql", root), "utf8");
const roleGuardMigration = readFileSync(new URL("supabase/migrations/202609270003_admin_role_concurrency_guard.sql", root), "utf8");
const roleLintMigration = readFileSync(new URL("supabase/migrations/202609270004_admin_role_lint_cleanup.sql", root), "utf8");
const edge = readFileSync(new URL("supabase/functions/admin-notification-publish/index.ts", root), "utf8");
const service = readFileSync(new URL("src/services/adminConsole.ts", root), "utf8");
const consoleUi = readFileSync(new URL("src/features/AdminConsole.tsx", root), "utf8");
const home = readFileSync(new URL("src/features/OptionTwoHome.tsx", root), "utf8");

test("administrator identity is server-controlled and future accounts default to member", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.nava_user_roles/);
  assert.match(migration, /SELECT id, 'admin' FROM auth\.users/);
  assert.match(migration, /VALUES \(NEW\.id, 'member'\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.nava_is_admin\(\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.nava_user_roles/);
  assert.doesNotMatch(service, /from\(["']nava_user_roles["']\)\.(?:insert|update|upsert|delete)/);
  assert.match(home, /isAdmin && <button[^>]+data-home-shortcut="admin"/);
});

test("catalog writes are validated admin RPCs and normal catalog reads remain published-only", () => {
  assert.match(migration, /nava_admin_save_reward_product/);
  assert.match(migration, /IF NOT public\.nava_is_admin\(\)/);
  assert.match(migration, /product_image_urls/);
  assert.match(migration, /image_url !~ '\^https:\/\/'/);
  assert.match(migration, /admin_audit_log/);
  assert.match(service, /rpc\("nava_admin_save_reward_product_v2"/);
  assert.match(service, /rpc\("nava_admin_archive_reward_product"/);
  assert.match(service, /storage\.from\("reward-products"\)\.upload/);
});

test("broadcasts always persist in-app rows and only request push through the protected server path", () => {
  assert.match(migration, /INSERT INTO public\.user_notifications/);
  assert.match(migration, /FROM auth\.users/);
  assert.match(migration, /delivery_mode IN \('in_app', 'in_app_and_push'\)/);
  assert.match(edge, /await requireAdmin\(userClient\)/);
  assert.match(edge, /NAVA_PUSH_DISPATCH_SECRET/);
  assert.match(edge, /functions\/v1\/push-dispatch/);
  assert.match(edge, /admin_notification_batches/);
  assert.match(edge, /capability\.remotePush \? "in_app_and_push" : "in_app"/);
  assert.doesNotMatch(edge, /input\.deliveryMode/);
  assert.doesNotMatch(consoleUi, /APP 内通知|同时系统推送|通知内容会显示在这里/);
  assert.doesNotMatch(service, /NAVA_PUSH_DISPATCH_SECRET|APNS_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("administrator role changes are searchable, audited, and cannot remove the acting or final admin", () => {
  assert.match(roleMigration, /nava_admin_list_accounts/);
  assert.match(roleMigration, /users\.email::text/);
  assert.match(roleMigration, /users\.phone::text/);
  assert.match(roleMigration, /nava_admin_set_account_role/);
  assert.match(roleMigration, /administrators cannot remove their own access/);
  assert.match(roleMigration, /the final administrator cannot be removed/);
  assert.match(roleMigration, /LOCK TABLE public\.nava_user_roles/);
  assert.match(roleMigration, /admin_audit_log/);
  assert.match(roleMigration, /REVOKE ALL ON FUNCTION public\.nava_admin_set_account_role/);
  assert.match(roleGuardMigration, /pg_advisory_xact_lock/);
  assert.match(roleGuardMigration, /Re-check after taking/);
  assert.match(roleGuardMigration, /role_row_exists/);
  assert.match(roleGuardMigration, /the final administrator cannot be removed/);
  assert.match(roleLintMigration, /existing_role/);
  assert.doesNotMatch(roleLintMigration, /current_role/);
  assert.match(service, /rpc\("nava_admin_list_accounts"/);
  assert.match(service, /rpc\("nava_admin_set_account_role"/);
});

test("administrator UI starts with a function chooser and uses home/back/ellipsis page navigation", () => {
  assert.match(consoleUi, /type AdminPage = "overview" \| "products" \| "notifications" \| "roles" \| "recent"/);
  assert.doesNotMatch(consoleUi, /选择管理功能/);
  assert.doesNotMatch(consoleUi, /admin-editor-layer/);
  assert.match(consoleUi, /page === "editor" && <AdminProductEditor/);
  assert.match(consoleUi, /商品管理/);
  assert.match(consoleUi, /发布通知/);
  assert.match(consoleUi, /管理员权限/);
  assert.match(consoleUi, /page === "overview" \? <Home/);
  assert.match(consoleUi, /<MoreMenu/);
});
