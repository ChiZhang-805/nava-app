import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const startDate = argument("start");
const endDate = argument("end");
if (!email || !password) throw new Error("请通过安全启动脚本提供目标 NAVA 账号。");
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")) {
  throw new Error("请提供 --start=YYYY-MM-DD 与 --end=YYYY-MM-DD。");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const [moods, sleeps, exercises, nutritions, focusRows, feedbackRows] = await Promise.all([
    range("mood_records", "id,record_date,mood_score,factors,diary_content"),
    range("sleep_records", "id,record_date,sleep_start,sleep_end,sleep_duration_minutes,deep_sleep_minutes,light_sleep_minutes,rem_minutes,self_rating,self_note,rhythm_score,device_type"),
    range("exercise_records", "id,record_date,steps,calories,exercise_minutes,heart_rate,spo2,self_rating,self_note,soreness_level,fatigue_level,has_injury,recovery_estimate_min_hours,recovery_estimate_max_hours,recovery_estimate_confidence,recovery_estimate_basis"),
    range("nutrition_records", "id,record_date,total_calories,breakfast_items,lunch_items,dinner_items,breakfast_time,lunch_time,dinner_time,protein_grams,carbohydrate_grams,fat_grams,hydration_ml,health_rating"),
    range("focus_records", "id,record_date,total_minutes,completed_sessions,interrupted_sessions,category,started_at,ended_at,note"),
    range("rhythm_outcome_feedback", "id,record_date,note"),
  ]);
  const sleepByDate = new Map(sleeps.map((row) => [row.record_date, row]));
  const moodByDate = new Map(moods.map((row) => [row.record_date, row]));
  const counters = {};

  for (const row of moods) {
    const score = Number(row.mood_score ?? 70);
    await patchMissing("mood_records", row, {
      factors: score >= 78 ? ["睡眠", "运动"] : score < 70 ? ["工作", "压力"] : ["日常安排", "睡眠"],
      diary_content: score >= 78 ? "休息和活动安排较合适，今天整体状态轻快。" : score < 70 ? "任务切换较多，晚间休息后状态逐渐平稳。" : "今天节奏较平稳，继续保持规律作息。",
    }, counters);
  }

  for (const row of sleeps) {
    const duration = Math.max(1, Number(row.sleep_duration_minutes ?? 420));
    const deep = Math.round(duration * 0.2);
    const light = Math.round(duration * 0.58);
    const rem = Math.max(0, Math.round(duration * 0.18));
    const rating = clamp(Math.round((duration - 300) / 42), 1, 5);
    await patchMissing("sleep_records", row, {
      deep_sleep_minutes: deep,
      light_sleep_minutes: light,
      rem_minutes: rem,
      self_rating: rating,
      self_note: duration < 390 ? "睡眠时间偏少，白天有轻微疲劳感。" : duration > 460 ? "睡眠较充分，醒来后的恢复感不错。" : "入睡和醒来节奏较稳定。",
      rhythm_score: clamp(Math.round(50 + (duration - 330) / 4), 45, 90),
      device_type: "manual",
    }, counters);
  }

  for (const row of exercises) {
    const minutes = Math.max(0, Number(row.exercise_minutes ?? 0));
    const sleepMinutes = Number(sleepByDate.get(row.record_date)?.sleep_duration_minutes ?? 420);
    const soreness = minutes >= 50 ? 3 : minutes >= 30 ? 2 : 1;
    const fatigue = sleepMinutes < 390 ? 4 : minutes >= 50 ? 3 : 2;
    const estimate = estimateRecovery({ minutes, heartRate: row.heart_rate, soreness, fatigue, sleepMinutes });
    await patchMissing("exercise_records", row, {
      self_rating: minutes >= 35 ? 5 : minutes >= 20 ? 4 : 3,
      soreness_level: soreness,
      fatigue_level: fatigue,
      has_injury: false,
      recovery_estimate_min_hours: estimate.minHours,
      recovery_estimate_max_hours: estimate.maxHours,
      recovery_estimate_confidence: estimate.confidence,
      recovery_estimate_basis: { version: "nava-rule-v1", inputs: estimate.basis },
    }, counters);
  }

  const breakfasts = [
    [{ name: "鸡蛋燕麦粥", amount: "1 碗", calories: 320 }, { name: "牛奶", amount: "1 杯", calories: 120 }],
    [{ name: "全麦三明治", amount: "1 份", calories: 360 }, { name: "香蕉", amount: "1 根", calories: 105 }],
    [{ name: "酸奶麦片", amount: "1 碗", calories: 330 }, { name: "蓝莓", amount: "1 份", calories: 60 }],
  ];
  const dinners = [
    [{ name: "清蒸鱼", amount: "1 份", calories: 330 }, { name: "杂粮饭", amount: "1 碗", calories: 210 }, { name: "西兰花", amount: "1 份", calories: 100 }],
    [{ name: "番茄鸡肉意面", amount: "1 份", calories: 560 }, { name: "蔬菜沙拉", amount: "1 份", calories: 150 }],
    [{ name: "豆腐蔬菜煲", amount: "1 份", calories: 360 }, { name: "米饭", amount: "1 碗", calories: 230 }, { name: "橙子", amount: "1 个", calories: 80 }],
  ];
  for (let index = 0; index < nutritions.length; index += 1) {
    const row = nutritions[index];
    await patchMissing("nutrition_records", row, {
      breakfast_items: breakfasts[index % breakfasts.length],
      lunch_items: [{ name: "鸡肉蔬菜饭", amount: "1 份", calories: 610 }, { name: "紫菜汤", amount: "1 碗", calories: 60 }],
      dinner_items: dinners[index % dinners.length],
      breakfast_time: clock(7, 25 + (index * 7) % 35),
      lunch_time: clock(12, 5 + (index * 5) % 30),
      dinner_time: clock(18, 20 + (index * 11) % 50),
    }, counters);
  }

  for (const row of focusRows) {
    const minutes = Number(row.total_minutes ?? 0);
    const interruptions = Number(row.interrupted_sessions ?? 0);
    await patchMissing("focus_records", row, {
      category: "学习与工作",
      note: interruptions >= 4 ? "任务切换较多，分段完成后逐渐找回节奏。" : minutes >= 150 ? "完成了主要任务，专注状态整体稳定。" : "按计划完成一段学习与整理。",
    }, counters);
  }

  for (const row of feedbackRows) {
    const mood = moodByDate.get(row.record_date);
    await patchMissing("rhythm_outcome_feedback", row, {
      note: mood?.diary_content || "当天状态与记录基本一致。",
    }, counters);
  }

  console.log(JSON.stringify({ startDate, endDate, patched: counters }, null, 2));
} finally {
  await supabase.auth.signOut({ scope: "local" });
}

async function range(table, select) {
  const result = await supabase.from(table).select(select).eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate).order("record_date");
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function patchMissing(table, row, defaults, counters) {
  const patch = {};
  for (const [field, value] of Object.entries(defaults)) {
    if (!hasValue(row[field]) && hasValue(value)) patch[field] = value;
  }
  if (Object.keys(patch).length === 0) return;
  const result = await supabase.from(table).update(patch).eq("id", row.id);
  if (result.error) throw result.error;
  const bucket = counters[table] ?? { rows: 0, fields: {} };
  bucket.rows += 1;
  for (const field of Object.keys(patch)) bucket.fields[field] = (bucket.fields[field] ?? 0) + 1;
  counters[table] = bucket;
}

function estimateRecovery({ minutes, heartRate, soreness, fatigue, sleepMinutes }) {
  const parsedHeartRate = Number(String(heartRate ?? "").replace(/[^0-9.]/g, ""));
  let center = minutes < 20 ? 4 : minutes < 45 ? 10 : minutes < 75 ? 18 : minutes < 120 ? 28 : 40;
  const basis = [`${minutes} 分钟运动`];
  if (Number.isFinite(parsedHeartRate)) {
    if (parsedHeartRate >= 170) center += 18;
    else if (parsedHeartRate >= 150) center += 10;
    else if (parsedHeartRate >= 130) center += 5;
    basis.push(`心率 ${Math.round(parsedHeartRate)} bpm`);
  }
  center += soreness * 2.2 + fatigue * 1.8;
  basis.push(`酸痛 ${soreness}/10`, `疲劳 ${fatigue}/10`);
  if (sleepMinutes < 360) { center += 8; basis.push(`睡眠 ${sleepMinutes} 分钟`); }
  const confidence = 0.74;
  const uncertainty = 0.28 + (1 - confidence) * 0.45;
  return {
    minHours: Math.max(2, Math.round(center * (1 - uncertainty))),
    maxHours: Math.min(168, Math.max(4, Math.round(center * (1 + uncertainty)))),
    confidence,
    basis,
  };
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function clock(hour, minute) {
  const normalizedHour = hour + Math.floor(minute / 60);
  const normalizedMinute = minute % 60;
  return `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function argument(name) { return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
