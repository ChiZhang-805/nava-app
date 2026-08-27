import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const publicProjectKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function applyProjectPublicEnv(root = process.cwd(), mode) {
  const values = {
    ...parseEnvFile(path.join(root, ".env")),
    ...(mode ? parseEnvFile(path.join(root, `.env.${mode}`)) : {}),
  };
  for (const key of publicProjectKeys) {
    if (values[key]) process.env[key] = values[key];
  }
}
