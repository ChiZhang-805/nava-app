import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const startDate = argument("start");
const endDate = argument("end");
if (!email || !password) throw new Error("请通过 NAVA_ACCOUNT_EMAIL 和 NAVA_ACCOUNT_PASSWORD 提供目标账号。\n");
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")) {
  throw new Error("请提供 --start=YYYY-MM-DD 与 --end=YYYY-MM-DD。\n");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const [exercise, sleep, mood, focus, distributions, health, feedback] = await Promise.all([
    range("exercise_records", "record_date,steps,calories,exercise_minutes,heart_rate,spo2"),
    range("sleep_records", "record_date,sleep_start,sleep_end,sleep_duration_minutes,deep_sleep_minutes,light_sleep_minutes,rem_minutes,rhythm_score,self_rating"),
    range("mood_records", "record_date,mood_score,diary_content"),
    range("focus_records", "record_date,total_minutes,completed_sessions,interrupted_sessions"),
    range("focus_time_distribution", "record_date"),
    range("health_metric_snapshots", "record_date"),
    range("rhythm_outcome_feedback", "record_date"),
  ]);
  const exerciseByDate = byDate(exercise);
  const sleepByDate = byDate(sleep);
  const moodByDate = byDate(mood);
  const focusByDate = byDate(focus);
  const existingDistributions = new Set(distributions.map((item) => item.record_date));
  const existingHealth = new Set(health.map((item) => item.record_date));
  const existingFeedback = new Set(feedback.map((item) => item.record_date));
  const dates = dateRange(startDate, endDate);

  const focusRows = dates.filter((date) => !existingDistributions.has(date) && focusByDate.has(date)).map((date, index) => {
    const item = focusByDate.get(date);
    const minutes = Math.max(0, Number(item.total_minutes ?? 0));
    const split = allocate(minutes, index % 3 === 0 ? [0.01, 0.42, 0.39, 0.18] : [0.01, 0.51, 0.33, 0.15]);
    return { user_id: userId, record_date: date, period_0_6: split[0], period_6_12: split[1], period_12_18: split[2], period_18_24: split[3] };
  });

  const healthRows = dates.filter((date) => !existingHealth.has(date) && exerciseByDate.has(date) && sleepByDate.has(date)).map((date, index) => {
    const activity = exerciseByDate.get(date);
    const rest = sleepByDate.get(date);
    const emotion = moodByDate.get(date);
    const sleepMinutes = Number(rest.sleep_duration_minutes ?? 0);
    const moodScore = Number(emotion?.mood_score ?? 70);
    const exerciseMinutes = Number(activity.exercise_minutes ?? 0);
    const steps = Number(activity.steps ?? 0);
    const restingHeartRate = clamp(Math.round(62 + Math.max(0, 420 - sleepMinutes) / 24 + Math.max(0, 68 - moodScore) / 9 - Math.min(2, exerciseMinutes / 30)), 57, 72);
    const latestHeartRate = clamp(restingHeartRate + 12 + (index % 4) * 2, 68, 94);
    const hrv = clamp(Math.round(48 + (sleepMinutes - 420) / 18 + (moodScore - 70) / 5 - Number(focusByDate.get(date)?.interrupted_sessions ?? 0) * 1.2), 31, 64);
    const oxygen = clamp(Number(String(activity.spo2 ?? "98").replace("%", "")), 96, 99);
    const weights = hourlyWeights(index);
    const hourlySteps = allocate(steps, weights);
    const hourlyMinutes = allocate(exerciseMinutes, weights.map((value, hour) => value * (hour >= 17 && hour <= 20 ? 2.2 : 0.35)));
    const activityBins = hourlySteps.map((value, hour) => ({ hour, steps: value, exerciseMinutes: hourlyMinutes[hour] }));
    const sleepStartAt = zonedDateTime(date, rest.sleep_start);
    const sleepEndAt = zonedDateTime(endDateForSleep(date, rest.sleep_start, rest.sleep_end), rest.sleep_end);
    const stageTotal = Number(rest.deep_sleep_minutes ?? 0) + Number(rest.light_sleep_minutes ?? 0) + Number(rest.rem_minutes ?? 0);
    return {
      user_id: userId,
      record_date: date,
      latest_heart_rate: latestHeartRate,
      resting_heart_rate: restingHeartRate,
      heart_rate_variability_sdnn: hrv,
      blood_oxygen: oxygen,
      activity_bins: activityBins,
      sleep_stage_minutes: {
        deep: Number(rest.deep_sleep_minutes ?? 0),
        light: Number(rest.light_sleep_minutes ?? 0),
        rem: Number(rest.rem_minutes ?? 0),
      },
      sleep_start_at: sleepStartAt,
      sleep_end_at: sleepEndAt,
      sleep_efficiency: clamp(stageTotal / Math.max(1, sleepMinutes), 0.72, 0.96),
      timezone_offset_minutes: 480,
      activity_coverage_hours: 16 + (index % 3) * 0.5,
      source_metadata: { entryMode: "developer-approved-history", timezone: "Asia/Shanghai" },
      raw_payload: { date, steps, exerciseMinutes, sleepMinutes },
      source: "manual_health_history",
      created_at: `${date}T21:10:00+08:00`,
      updated_at: `${date}T21:10:00+08:00`,
    };
  });

  const feedbackRows = dates.filter((date) => !existingFeedback.has(date) && moodByDate.has(date) && sleepByDate.has(date)).map((date) => {
    const emotion = moodByDate.get(date);
    const rest = sleepByDate.get(date);
    const focusItem = focusByDate.get(date);
    const moodScore = Number(emotion.mood_score ?? 70);
    const sleepMinutes = Number(rest.sleep_duration_minutes ?? 420);
    return {
      user_id: userId,
      record_date: date,
      perceived_energy: clamp(Math.round((moodScore - 35) / 12), 1, 5),
      perceived_recovery: clamp(Math.round((sleepMinutes - 300) / 42), 1, 5),
      perceived_focus: clamp(5 - Math.round(Number(focusItem?.interrupted_sessions ?? 0) / 2), 1, 5),
      recommendation_helpful: moodScore >= 62,
      note: emotion.diary_content || null,
      model_version: "nava-user-history-v1",
      created_at: `${date}T22:05:00+08:00`,
      updated_at: `${date}T22:05:00+08:00`,
    };
  });

  await insertMissing("focus_time_distribution", focusRows);
  await insertMissing("health_metric_snapshots", healthRows);
  await insertMissing("rhythm_outcome_feedback", feedbackRows);
  const fdnb = await supabase.functions.invoke("dnb-weekly-report", {
    body: { startDate: shiftDate(endDate, -6), endDate, analysisDays: 14 },
  });
  if (fdnb.error) throw await functionError("dnb-weekly-report", fdnb.error);

  console.log(JSON.stringify({
    startDate,
    endDate,
    focusDistributions: focusRows.length,
    healthSnapshots: healthRows.length,
    outcomeFeedback: feedbackRows.length,
    fdnbSucceeded: !fdnb.error,
  }, null, 2));
} finally {
  await supabase.auth.signOut();
}

async function range(table, select) {
  const result = await supabase.from(table).select(select).eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate).order("record_date");
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function insertMissing(table, rows) {
  if (rows.length === 0) return;
  const result = await supabase.from(table).insert(rows);
  if (result.error) throw result.error;
}

function byDate(rows) {
  const output = new Map();
  rows.forEach((row) => {
    const previous = output.get(row.record_date);
    if (!previous) output.set(row.record_date, { ...row });
    else {
      output.set(row.record_date, {
        ...previous,
        total_minutes: Number(previous.total_minutes ?? 0) + Number(row.total_minutes ?? 0),
        completed_sessions: Number(previous.completed_sessions ?? 0) + Number(row.completed_sessions ?? 0),
        interrupted_sessions: Number(previous.interrupted_sessions ?? 0) + Number(row.interrupted_sessions ?? 0),
      });
    }
  });
  return output;
}

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function allocate(total, weights) {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  const sum = weights.reduce((output, value) => output + Math.max(0, value), 0) || 1;
  const raw = weights.map((weight) => safeTotal * Math.max(0, weight) / sum);
  const values = raw.map(Math.floor);
  let remaining = safeTotal - values.reduce((output, value) => output + value, 0);
  raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction).forEach(({ index }) => {
    if (remaining > 0) { values[index] += 1; remaining -= 1; }
  });
  return values;
}

function hourlyWeights(dayIndex) {
  const base = [0.002, 0.001, 0.001, 0.001, 0.002, 0.006, 0.025, 0.055, 0.07, 0.05, 0.055, 0.065, 0.05, 0.045, 0.05, 0.06, 0.055, 0.08, 0.115, 0.085, 0.05, 0.025, 0.012, 0.005];
  return base.map((value, hour) => value * (1 + (((dayIndex + 1) * (hour + 3)) % 7 - 3) * 0.035));
}

function dateRange(start, end) {
  const values = [];
  const current = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (current <= last) {
    values.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return values;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function endDateForSleep(date, start, end) {
  const startMinutes = timeMinutes(start);
  const endMinutes = timeMinutes(end);
  return startMinutes != null && endMinutes != null && endMinutes <= startMinutes ? shiftDate(date, 1) : date;
}

function zonedDateTime(date, time) {
  return time ? `${date}T${String(time).slice(0, 5)}:00+08:00` : null;
}

function timeMinutes(value) {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) return null;
  const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

async function functionError(name, error) {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context instanceof Response) {
    const body = await context.clone().text().catch(() => "");
    if (body.trim()) {
      try {
        const parsed = JSON.parse(body);
        const message = typeof parsed.error === "string" ? parsed.error : typeof parsed.message === "string" ? parsed.message : "";
        if (message.trim()) return new Error(`${name}: ${message.trim()}`);
      } catch {
        return new Error(`${name}: HTTP ${context.status}`);
      }
    }
    return new Error(`${name}: HTTP ${context.status}`);
  }
  return new Error(`${name}: ${error instanceof Error ? error.message : "request failed"}`);
}
