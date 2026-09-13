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
const expectedDays = dateRange(startDate, endDate).length;
const nextDate = shiftDate(endDate, 1);

const specifications = [
  ["mood_records", ["mood_score", "factors", "diary_content"]],
  ["sleep_records", ["sleep_start", "sleep_end", "sleep_duration_minutes", "deep_sleep_minutes", "light_sleep_minutes", "rem_minutes", "self_rating", "self_note", "rhythm_score", "device_type"]],
  ["exercise_records", ["steps", "calories", "exercise_minutes", "heart_rate", "spo2", "self_rating", "self_note", "soreness_level", "fatigue_level", "has_injury", "recovery_estimate_min_hours", "recovery_estimate_max_hours", "recovery_estimate_confidence", "recovery_estimate_basis"]],
  ["nutrition_records", ["total_calories", "breakfast_items", "lunch_items", "dinner_items", "pantry_items", "breakfast_time", "lunch_time", "dinner_time", "pantry_time", "protein_grams", "carbohydrate_grams", "fat_grams", "hydration_ml", "health_rating"]],
  ["focus_records", ["total_minutes", "completed_sessions", "interrupted_sessions", "category", "started_at", "ended_at", "note"]],
  ["face_records", ["overall_score", "annotations", "feedback", "model_version", "capture_mode", "analysis_confidence", "derived_features"]],
  ["focus_time_distribution", ["period_0_6", "period_6_12", "period_12_18", "period_18_24"]],
  ["health_metric_snapshots", ["latest_heart_rate", "resting_heart_rate", "heart_rate_variability_sdnn", "blood_oxygen", "activity_bins", "sleep_stage_minutes", "sleep_start_at", "sleep_end_at", "sleep_efficiency", "activity_coverage_hours", "source"]],
  ["rhythm_outcome_feedback", ["perceived_energy", "perceived_recovery", "perceived_focus", "recommendation_helpful", "note", "model_version"]],
  ["daily_rhythm_scores", ["score", "confidence", "signals", "actions", "model_version", "score_lower", "score_upper", "data_quality_score", "schema_version", "fusion"]],
];

try {
  const tableEntries = await Promise.all(specifications.map(async ([table, fields]) => {
    const select = ["record_date", ...fields].join(",");
    const result = await supabase.from(table).select(select).eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    const missingFields = Object.fromEntries(fields.map((field) => [field, rows.filter((row) => !hasRequiredValue(table, field, row[field])).length]));
    const incompleteRows = rows.filter((row) => fields.some((field) => !hasRequiredValue(table, field, row[field]))).length;
    return [table, {
      rows: rows.length,
      distinctDays: new Set(rows.map((row) => row.record_date)).size,
      missingDays: Math.max(0, expectedDays - new Set(rows.map((row) => row.record_date)).size),
      completeRows: rows.length - incompleteRows,
      incompleteRows,
      missingFields,
    }];
  }));

  const aiResult = await supabase
    .from("ai_health_reports")
    .select("scope,model_version,provider,bullets,period_end,generated_at")
    .eq("user_id", userId)
    .gte("period_end", startDate)
    .lte("period_end", endDate)
    .order("generated_at", { ascending: true });
  if (aiResult.error) throw aiResult.error;
  const aiByScope = {};
  for (const row of aiResult.data ?? []) {
    const scope = String(row.scope ?? "unknown");
    const bucket = aiByScope[scope] ?? { rows: 0, structuredRows: 0, structuredModelVersions: [], latestModelVersion: null, provider: null };
    bucket.rows += 1;
    if (hasStructuredReport(row.bullets)) {
      bucket.structuredRows += 1;
      if (row.model_version && !bucket.structuredModelVersions.includes(row.model_version)) bucket.structuredModelVersions.push(row.model_version);
    }
    bucket.latestModelVersion = row.model_version ?? bucket.latestModelVersion;
    bucket.provider = row.provider ?? bucket.provider;
    aiByScope[scope] = bucket;
  }

  const dietResult = await supabase
    .from("nutrition_records")
    .select("record_date,breakfast_items,lunch_items,dinner_items,pantry_items,breakfast_time,lunch_time,dinner_time,pantry_time,breakfast_photo_url,lunch_photo_url,dinner_photo_url,total_calories,protein_grams,carbohydrate_grams,fat_grams,hydration_ml,ai_feedback")
    .eq("user_id", userId)
    .gte("record_date", startDate)
    .lte("record_date", endDate);
  if (dietResult.error) throw dietResult.error;
  const nutritionDimensions = (dietResult.data ?? []).map((row) => {
    const mealTotals = { calories: 0, protein_grams: 0, carbohydrate_grams: 0, fat_grams: 0, hydration_ml: 0 };
    const meals = Object.fromEntries(["breakfast", "lunch", "dinner", "pantry"].map((meal) => {
      const items = Array.isArray(row[`${meal}_items`]) ? row[`${meal}_items`] : [];
      const summary = items.find((item) => item?.meal_summary)?.meal_summary;
      mealTotals.calories += items.reduce((sum, item) => sum + finiteNonNegative(item?.calories), 0);
      for (const key of ["protein_grams", "carbohydrate_grams", "fat_grams", "hydration_ml"]) {
        mealTotals[key] += finiteNonNegative(summary?.[key]);
      }
      return [meal, {
        itemCount: items.length,
        timePresent: hasValue(row[`${meal}_time`]),
        macroSummaryPresent: summary != null && ["protein_grams", "carbohydrate_grams", "fat_grams", "hydration_ml"].every((key) => Number.isFinite(Number(summary[key]))),
        ...(meal === "pantry" ? {} : { photoPresent: hasValue(row[`${meal}_photo_url`]) }),
      }];
    }));
    const allMealFieldsComplete = Object.values(meals).every((meal) => meal.itemCount > 0 && meal.timePresent && meal.macroSummaryPresent);
    const dailyTotalsMatchMeals = Object.entries({
      total_calories: "calories",
      protein_grams: "protein_grams",
      carbohydrate_grams: "carbohydrate_grams",
      fat_grams: "fat_grams",
      hydration_ml: "hydration_ml",
    }).every(([dailyKey, mealKey]) => Math.abs(finiteNonNegative(row[dailyKey]) - mealTotals[mealKey]) <= 0.5);
    return { date: row.record_date, meals, allMealFieldsComplete, dailyTotalsMatchMeals, aiReport: dietReportStatus(row.ai_feedback) };
  });

  const nextDateBaseRows = {};
  for (const table of ["mood_records", "sleep_records", "exercise_records", "nutrition_records", "focus_records", "face_records"]) {
    const nextResult = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("record_date", nextDate);
    if (nextResult.error) throw nextResult.error;
    nextDateBaseRows[table] = nextResult.count ?? 0;
  }

  console.log(JSON.stringify({
    range: { startDate, endDate, expectedDays },
    tables: Object.fromEntries(tableEntries),
    nutritionDimensions,
    aiReports: { byScope: aiByScope, dietRowsWithAiFeedback: (dietResult.data ?? []).filter((row) => hasValue(row.ai_feedback)).length },
    untouchedNextDate: { date: nextDate, tableRows: nextDateBaseRows, totalRows: Object.values(nextDateBaseRows).reduce((sum, value) => sum + value, 0) },
  }, null, 2));
} finally {
  await supabase.auth.signOut();
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function hasRequiredValue(table, field, value) {
  // A completed rhythm calculation may legitimately have no corrective action.
  // The persisted empty array is still a generated value, not a missing field.
  if (table === "daily_rhythm_scores" && field === "actions") return Array.isArray(value);
  return hasValue(value);
}

function hasStructuredReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.overview === "string" && value.overview.trim().length > 0 && Array.isArray(value.sections) && value.sections.length === 4;
}

function dietReportStatus(value) {
  if (typeof value !== "string") return { persisted: false, validFormat: false, modelVersion: null };
  try {
    const report = JSON.parse(value);
    const validBullets = Array.isArray(report?.bullets) && report.bullets.length === 4
      && report.bullets.every((bullet) => typeof bullet === "string" && (bullet.match(/\p{Script=Han}/gu)?.length ?? 0) >= 15 && (bullet.match(/\p{Script=Han}/gu)?.length ?? 0) <= 18);
    const validCompact = Array.isArray(report?.compactBullets) && report.compactBullets.length === 4
      && report.compactBullets.every((bullet) => typeof bullet === "string" && /^\p{Script=Han}{7}$/u.test(bullet));
    return {
      persisted: true,
      validFormat: validBullets && validCompact && typeof report.sourceFingerprint === "string" && report.sourceFingerprint.length > 0,
      modelVersion: typeof report.modelVersion === "string" ? report.modelVersion : null,
    };
  } catch {
    return { persisted: true, validFormat: false, modelVersion: null };
  }
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

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}
