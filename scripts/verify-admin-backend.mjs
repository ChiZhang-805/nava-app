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
if (!Array.isArray(roles) || roles.length !== users.length || roles.some((row) => row.role !== "admin")) {
  throw new Error("Registered account count and administrator-role count do not match.");
}
const bucket = await json(`${baseUrl}/storage/v1/bucket/reward-products`);
if (bucket?.id !== "reward-products" || bucket?.public !== true) throw new Error("Reward product image bucket is unavailable.");
const products = await json(`${baseUrl}/rest/v1/reward_products?select=id&limit=1`);
const batches = await json(`${baseUrl}/rest/v1/admin_notification_batches?select=id&limit=1`);
if (!Array.isArray(products) || !Array.isArray(batches)) throw new Error("Admin catalog or notification tables are unavailable.");

const unauthenticated = await fetch(`${baseUrl}/functions/v1/admin-notification-publish`, {
  method: "POST",
  headers: { apikey: serviceKey, "content-type": "application/json" },
  body: JSON.stringify({ action: "capability" }),
});
if (unauthenticated.ok) throw new Error("Admin notification function accepted a request without a user JWT.");

console.log(JSON.stringify({
  projectRef,
  registeredAccounts: users.length,
  administratorRoles: roles.length,
  rewardProductBucket: "ready",
  adminTables: "ready",
  unauthenticatedFunctionBoundary: "rejected",
}));
