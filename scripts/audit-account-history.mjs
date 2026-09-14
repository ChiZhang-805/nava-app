import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const anchorDate = argument("anchor") ?? localDate();
if (!email || !password) throw new Error("请通过 NAVA_ACCOUNT_EMAIL 和 NAVA_ACCOUNT_PASSWORD 提供目标账号。");

const startDate = shiftDate(anchorDate, -13);
const endDate = shiftDate(anchorDate, -1);
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const specifications = [
    ["mood_records", "record_date,mood_score"],
    ["sleep_records", "record_date,sleep_duration_minutes,rhythm_score"],
    ["exercise_records", "record_date,steps,exercise_minutes"],
    ["nutrition_records", "record_date,total_calories"],
    ["face_records", "record_date,overall_score"],
    ["focus_records", "record_date,total_minutes,completed_sessions"],
    ["focus_time_distribution", "record_date,period_0_6,period_6_12,period_12_18,period_18_24"],
    ["health_metric_snapshots", "record_date,latest_heart_rate,blood_oxygen"],
    ["daily_rhythm_scores", "record_date,score"],
  ];
  const rows = await Promise.all(specifications.map(async ([table, columns]) => {
    const result = await supabase.from(table).select(columns).eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate).order("record_date");
    if (result.error) throw result.error;
    return [table, result.data ?? []];
  }));
  const todayRows = await Promise.all(specifications.slice(0, 6).map(async ([table]) => {
    const result = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("record_date", anchorDate);
    if (result.error) throw result.error;
    return [table, result.count ?? 0];
  }));
  console.log(JSON.stringify({
    anchorDate,
    historicalRange: { startDate, endDate },
    historical: Object.fromEntries(rows.map(([table, values]) => [table, { count: values.length, values }])),
    today: Object.fromEntries(todayRows),
  }, null, 2));
} finally {
  await supabase.auth.signOut({ scope: "local" });
}

function argument(name) { return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
function shiftDate(date, days) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function localDate() { const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10); }
