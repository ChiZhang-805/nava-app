import { spawnSync } from "node:child_process";
import path from "node:path";

const projectRef = "wxteapvwagvhhtrjrbim";
const cli = path.join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
const keysResult = spawnSync(process.execPath, [cli, "projects", "api-keys", "--project-ref", projectRef, "--output", "json"], {
  cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 30_000,
});
if (keysResult.status !== 0) throw new Error("Supabase API credentials are unavailable for the admin audit.");
const keys = JSON.parse(keysResult.stdout);
const serviceKey = keys.find((item) => item.name === "service_role" || item.type === "service_role")?.api_key;
if (!serviceKey) throw new Error("Supabase service-role key was not returned to the secure audit process.");
const baseUrl = `https://${projectRef}.supabase.co`;
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Admin backend audit request failed with HTTP ${response.status}.`);
  return payload;
}

const usersPayload = await json(`${baseUrl}/auth/v1/admin/users?page=1&per_page=1000`);
const users = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
if (users.length < 1) throw new Error("No registered development account exists to verify as administrator.");
const roles = await json(`${baseUrl}/rest/v1/nava_user_roles?select=user_id,role`);
if (!Array.isArray(roles) || roles.length !== users.length || roles.some((row) => !["member", "admin"].includes(row.role))) {
  throw new Error("Registered account count and server-owned role count do not match.");
}
const administratorRoles = roles.filter((row) => row.role === "admin").length;
if (administratorRoles < 1) throw new Error("No administrator remains in the canonical project.");
const bucket = await json(`${baseUrl}/storage/v1/bucket/reward-products`);
if (bucket?.id !== "reward-products" || bucket?.public !== true) throw new Error("Reward product image bucket is unavailable.");
const products = await json(`${baseUrl}/rest/v1/reward_products?select=id,name_en,brand,brand_en,description_en,listing_status&limit=1`);
const batches = await json(`${baseUrl}/rest/v1/admin_notification_batches?select=id&limit=1`);
if (!Array.isArray(products) || !Array.isArray(batches)) throw new Error("Admin catalog or notification tables are unavailable.");

const unauthenticated = await fetch(`${baseUrl}/functions/v1/admin-notification-publish`, {
  method: "POST",
  headers: { apikey: serviceKey, "content-type": "application/json" },
  body: JSON.stringify({ action: "capability" }),
});
if (unauthenticated.ok) throw new Error("Admin notification function accepted a request without a user JWT.");

for (const [rpc, body] of [
  ["nava_admin_list_reward_products_v2", {}],
  ["nava_admin_save_reward_product_v2", { product_data: {} }],
  ["nava_admin_archive_reward_product", { product_id: "00000000-0000-0000-0000-000000000000" }],
  ["nava_admin_list_accounts", { account_query: null, account_limit: 1 }],
  ["nava_admin_set_account_role", { target_user_id: "00000000-0000-0000-0000-000000000000", target_role: "member" }],
]) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok || payload?.code === "PGRST202" || response.status === 404) {
    throw new Error(`${rpc} is missing or accepted a service request without an authenticated administrator.`);
  }
}

console.log(JSON.stringify({
  projectRef,
  registeredAccounts: users.length,
  administratorRoles,
  memberRoles: roles.length - administratorRoles,
  rewardProductBucket: "ready",
  adminTables: "ready",
  roleManagementBoundary: "rejected_without_authenticated_admin",
  unauthenticatedFunctionBoundary: "rejected",
}));
