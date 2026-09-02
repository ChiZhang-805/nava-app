import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

const root = process.cwd();
const env = parseEnv(await readFile(path.join(root, ".env.review"), "utf8"));
const demoSource = await readFile(path.join(root, "src", "services", "demo.ts"), "utf8");
const supabaseClientSource = await readFile(path.join(root, "src", "services", "supabaseClient.ts"), "utf8");
const authStorageSource = await readFile(path.join(root, "src", "services", "authStorage.ts"), "utf8");
const expectedProjectRef = "wxteapvwagvhhtrjrbim";
const expectedUrl = `https://${expectedProjectRef}.supabase.co`;

if (env.VITE_ENABLE_REVIEW_DEMO !== "false") throw new Error("Public builds must disable review demo authentication.");
if (!demoSource.includes('if (!isLocalPreviewHost) return false;')) throw new Error("Public hosts must never enable demo authentication.");
if (!supabaseClientSource.includes("storage: authSessionStorage")) throw new Error("Supabase authentication must use the platform-aware storage adapter.");
if (!authStorageSource.includes("window.sessionStorage") || !authStorageSource.includes("Capacitor.isNativePlatform()")) {
  throw new Error("Public authentication must remain tab-scoped while native authentication uses the secure adapter.");
}
if (!authStorageSource.includes('registerPlugin<NavaSecureStoragePlugin>("NavaSecureStorage")')) {
  throw new Error("Native authentication must use the Keychain-backed NavaSecureStorage plugin.");
}
if (env.VITE_SUPABASE_URL !== expectedUrl) throw new Error("Public builds must target the canonical NAVA Supabase project.");
if (env.VITE_SUPABASE_PROJECT_ID !== expectedProjectRef) throw new Error("Public build project ID is not canonical.");
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) throw new Error("Public build must use a Supabase publishable key.");

process.env.VITE_SUPABASE_URL = "https://wrong-project.supabase.co";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wrong";
process.env.VITE_SUPABASE_PROJECT_ID = "wrong-project";
applyProjectPublicEnv(root, "review");
if (process.env.VITE_SUPABASE_URL !== env.VITE_SUPABASE_URL
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_PROJECT_ID !== env.VITE_SUPABASE_PROJECT_ID) {
  throw new Error("Review mode must override ambient Supabase variables with .env.review.");
}

const publicHeaders = {
  apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};
const settingsResponse = await fetch(`${expectedUrl}/auth/v1/settings`, { headers: publicHeaders });
if (!settingsResponse.ok) throw new Error(`Supabase Auth settings returned HTTP ${settingsResponse.status}.`);
const settings = await settingsResponse.json();
if (!settings.external?.email) throw new Error("Email authentication is disabled in Supabase.");
if (settings.disable_signup) throw new Error("Public registration is disabled in Supabase.");
if (settings.mailer_autoconfirm) throw new Error("Email confirmation must remain enabled.");

const functions = ["auth-account-status", "aliyun-sms-send", "aliyun-sms-verify"];
for (const name of functions) {
  const response = await fetch(`${expectedUrl}/functions/v1/${name}`, { method: "OPTIONS", headers: publicHeaders });
  if (!response.ok) throw new Error(`${name} preflight returned HTTP ${response.status}.`);
}

let smtpStatus = "not inspected (set SUPABASE_ACCESS_TOKEN for strict SMTP verification)";
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${expectedProjectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Supabase Management Auth config returned HTTP ${response.status}.`);
  const config = await response.json();
  if (!config.smtp_host || !config.smtp_admin_email) throw new Error("Custom SMTP is not configured.");
  smtpStatus = `configured for ${config.smtp_admin_email}`;
}

console.log("Production authentication contract passed.");
console.log(`- Project: ${expectedProjectRef}`);
console.log("- Public demo bypass: disabled");
console.log("- Sign-in persistence: current browser tab; native iOS uses its Keychain adapter");
console.log("- Email registration: enabled with confirmation");
console.log("- Phone OTP Edge Functions: reachable");
console.log(`- Custom SMTP: ${smtpStatus}`);
