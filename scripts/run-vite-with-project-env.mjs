import { spawnSync } from "node:child_process";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const modeFlagIndex = args.indexOf("--mode");
const mode = modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : undefined;
applyProjectPublicEnv(root, mode);

// Capacitor's packaged origin is localhost too. A developer's ambient demo flag
// must never turn a TestFlight build into a demo-authenticated application.
if (mode === "native") {
  process.env.VITE_APP_ENV = "production";
  process.env.VITE_ENABLE_REVIEW_DEMO = "false";
  if (process.env.VITE_SUPABASE_URL !== "https://wxteapvwagvhhtrjrbim.supabase.co"
      || process.env.VITE_SUPABASE_PROJECT_ID !== "wxteapvwagvhhtrjrbim"
      || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
    throw new Error("Native release requires the canonical public Supabase configuration in .env.native.");
  }
}

const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, ...args], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
