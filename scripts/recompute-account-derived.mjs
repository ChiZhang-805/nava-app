import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const startDate = argument("start");
const endDate = argument("end");

if (!email || !password) throw new Error("请通过安全启动脚本提供目标 NAVA 账号。");
if (!isDate(startDate) || !isDate(endDate)) throw new Error("请提供 --start=YYYY-MM-DD 与 --end=YYYY-MM-DD。");

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;

try {
  const rhythmFailures = [];
  let rhythmSucceeded = 0;
  for (const date of dateRange(startDate, endDate)) {
    const result = await supabase.functions.invoke("rhythm-score", { body: { date } });
    if (result.error) rhythmFailures.push({ date, error: await safeFunctionMessage(result.error) });
    else rhythmSucceeded += 1;
  }

  const weeklyStart = shiftDate(endDate, -6);
  const weekly = await supabase.functions.invoke("dnb-weekly-report", {
    body: { startDate: weeklyStart, endDate, analysisDays: 14 },
  });
  const weeklyError = weekly.error ? await safeFunctionMessage(weekly.error) : null;

  const growth = await supabase.rpc("nava_reconcile_growth_rewards");

  console.log(JSON.stringify({
    range: { startDate, endDate },
    rhythmScores: { succeeded: rhythmSucceeded, failed: rhythmFailures.length, failures: rhythmFailures },
    fdnbWeeklyReport: { succeeded: !weekly.error, reportStart: weeklyStart, reportEnd: endDate, analysisDays: 14, error: weeklyError },
    growthRewardsReconciled: !growth.error,
    growthRewardsError: growth.error?.message ?? null,
  }, null, 2));

  if (rhythmFailures.length > 0) process.exitCode = 2;
} finally {
  await supabase.auth.signOut();
}

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function dateRange(start, end) {
  const output = [];
  const current = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (current <= last) {
    output.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return output;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function safeFunctionMessage(error) {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context instanceof Response) {
    const body = await context.clone().text().catch(() => "");
    if (body.trim()) {
      try {
        const parsed = JSON.parse(body);
        const message = typeof parsed.error === "string" ? parsed.error : typeof parsed.message === "string" ? parsed.message : "";
        if (message.trim()) return message.trim();
      } catch {
        return `HTTP ${context.status}`;
      }
    }
    return `HTTP ${context.status}`;
  }
  return error instanceof Error ? error.message : "request failed";
}
