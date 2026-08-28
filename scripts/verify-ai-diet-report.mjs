import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function envFile(path) {
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

const project = envFile(new URL("../.env.review", import.meta.url));
const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const date = process.argv.find((item) => item.startsWith("--date="))?.slice(7) || "2026-08-27";
if (!email || !password) throw new Error("NAVA_ACCOUNT_EMAIL and NAVA_ACCOUNT_PASSWORD are required.");

const client = createClient(project.VITE_SUPABASE_URL, project.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const login = await client.auth.signInWithPassword({ email, password });
if (login.error) throw login.error;
const result = await client.functions.invoke("ai-diet-report", { body: { date, lang: "zh", refresh: true } });
if (result.error) {
  const context = result.error.context;
  const responseBody = context instanceof Response ? await context.text().catch(() => "") : "";
  throw new Error(`${result.error.name}: ${result.error.message}${responseBody ? ` · ${responseBody}` : ""}`);
}
const stored = await client.from("nutrition_records").select("ai_feedback").eq("record_date", date).maybeSingle();
if (stored.error) throw stored.error;
let persistedBullets = [];
try {
  persistedBullets = JSON.parse(stored.data?.ai_feedback || "{}").bullets || [];
} catch {
  persistedBullets = [];
}
console.log(JSON.stringify({ date, modelVersion: result.data?.modelVersion, bullets: result.data?.bullets, persisted: persistedBullets.length === 4 }, null, 2));
await client.auth.signOut();
