import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = readFileSync(new URL("supabase/migrations/202609260001_admin_console.sql", root), "utf8");
const edge = readFileSync(new URL("supabase/functions/admin-notification-publish/index.ts", root), "utf8");
const service = readFileSync(new URL("src/services/adminConsole.ts", root), "utf8");
const drawer = readFileSync(new URL("src/components/UtilityDrawer.tsx", root), "utf8");

test("administrator identity is server-controlled and future accounts default to member", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.nava_user_roles/);
  assert.match(migration, /SELECT id, 'admin' FROM auth\.users/);
  assert.match(migration, /VALUES \(NEW\.id, 'member'\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.nava_is_admin\(\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.nava_user_roles/);
  assert.doesNotMatch(service, /from\(["']nava_user_roles["']\)\.(?:insert|update|upsert|delete)/);
  assert.match(drawer, /isAdmin &&/);
});

test("catalog writes are validated admin RPCs and normal catalog reads remain published-only", () => {
  assert.match(migration, /nava_admin_save_reward_product/);
  assert.match(migration, /IF NOT public\.nava_is_admin\(\)/);
  assert.match(migration, /product_image_urls/);
  assert.match(migration, /image_url !~ '\^https:\/\/'/);
  assert.match(migration, /admin_audit_log/);
  assert.match(service, /rpc\("nava_admin_save_reward_product"/);
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
  assert.doesNotMatch(service, /NAVA_PUSH_DISPATCH_SECRET|APNS_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});
