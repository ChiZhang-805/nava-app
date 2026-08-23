import { spawnSync } from "node:child_process";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
applyProjectPublicEnv(root);

const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
