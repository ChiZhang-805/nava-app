import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const anchorDate = argument("anchor") ?? localDate();

if (!email || !password) {
  throw new Error("请通过安全启动脚本提供目标 NAVA 账号。请勿把密码写入命令行或仓库。");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
  throw new Error("请提供 --anchor=YYYY-MM-DD。");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;

const userId = auth.data.user.id;
const templates = [
  mood(-6, 83, ["睡眠", "运动"], "休息较充分，活动后整体状态轻松。"),
  mood(-5, 75, ["工作", "日常安排"], "任务安排平稳，情绪保持在舒适区间。"),
  mood(-4, 69, ["工作", "压力"], "事务切换较多，晚间逐渐恢复平静。"),
  mood(-3, 77, ["运动", "睡眠"], "睡眠和活动节奏较好，状态较稳定。"),
  mood(-2, 72, ["工作", "日常安排"], "白天略有波动，休息后情绪趋于平稳。"),
  mood(-1, 70, ["睡眠", "工作"], "整体状态平静，适合保持当前作息节奏。"),
].map((template) => ({ ...template, record_date: shiftDate(anchorDate, template.offset) }));

try {
  const startDate = templates[0].record_date;
  const endDate = templates.at(-1).record_date;
  const existingResult = await supabase
    .from("mood_records")
    .select("record_date")
    .eq("user_id", userId)
    .gte("record_date", startDate)
    .lte("record_date", endDate);
  assertResult(existingResult);

  const existingDates = new Set((existingResult.data ?? []).map((row) => row.record_date));
  const missing = templates
    .filter((template) => !existingDates.has(template.record_date))
    .map(({ offset: _offset, ...template }) => ({
      ...template,
      user_id: userId,
      created_at: `${template.record_date}T21:15:00+08:00`,
      updated_at: `${template.record_date}T21:15:00+08:00`,
    }));

  if (missing.length > 0) {
    const insertResult = await supabase.from("mood_records").insert(missing).select("record_date,mood_score");
    assertResult(insertResult);
  }

  console.log(JSON.stringify({
    anchorDate,
    preservedDates: [...existingDates].sort(),
    inserted: missing.map(({ record_date, mood_score }) => ({ record_date, mood_score })),
  }, null, 2));
} finally {
  await supabase.auth.signOut({ scope: "local" });
}

function mood(offset, mood_score, factors, diary_content) {
  return { offset, mood_score, factors, diary_content };
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function assertResult(result) {
  if (result.error) throw result.error;
}
