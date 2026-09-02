import { spawnSync } from "node:child_process";

const projectRef = "wxteapvwagvhhtrjrbim";
const windows = process.platform === "win32";
const executable = windows ? process.env.ComSpec ?? "cmd.exe" : "npx";
const args = windows
  ? ["/d", "/s", "/c", `npx supabase functions list --project-ref ${projectRef}`]
  : ["supabase", "functions", "list", "--project-ref", projectRef];
const result = spawnSync(executable, args, { encoding: "utf8", shell: false });
if (result.status !== 0) throw new Error(result.error?.message || result.stderr?.trim() || "Unable to list Supabase functions.");
const payload = JSON.parse(result.stdout);
const functions = Array.isArray(payload) ? payload : payload.functions;
if (!Array.isArray(functions)) throw new Error("Supabase CLI returned an unexpected function-list shape.");

const secure = functions.find((item) => item.slug === "health-sync-ingest");
if (!secure || secure.status !== "ACTIVE" || secure.verify_jwt !== true) {
  throw new Error("health-sync-ingest must be ACTIVE with JWT verification enabled.");
}
const legacy = functions.find((item) => item.slug === "health-auto-export");

console.log("Production health-function audit completed.");
console.log(`- health-sync-ingest: ACTIVE v${secure.version}, JWT verification enabled`);
if (legacy?.status === "ACTIVE") {
  console.log(`- health-auto-export: LEGACY ACTIVE v${legacy.version}; retirement remains a human-authorized production action`);
  console.log("- Rotate/delete HEALTH_EXPORT_API_KEY only after legacy clients and historical imports are reviewed");
} else {
  console.log("- health-auto-export: not active");
}
