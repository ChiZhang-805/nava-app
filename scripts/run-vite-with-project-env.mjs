import { spawnSync } from "node:child_process";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const modeFlagIndex = args.indexOf("--mode");
const mode = modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : undefined;
applyProjectPublicEnv(root, mode);

const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, ...args], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
