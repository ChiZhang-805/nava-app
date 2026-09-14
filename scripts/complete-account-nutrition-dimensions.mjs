import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const startDate = argument("start");
const endDate = argument("end");
if (!email || !password || !isDate(startDate) || !isDate(endDate) || startDate > endDate) {
  throw new Error("请通过安全启动器提供账号及有效日期区间。");
}

const meals = ["breakfast", "lunch", "dinner", "pantry"];
const metrics = ["protein_grams", "carbohydrate_grams", "fat_grams", "hydration_ml"];
const snacks = [
  { name: "香蕉", amount: "1 根", calories: 105, protein_grams: 1.3, carbohydrate_grams: 27, fat_grams: 0.4, hydration_ml: 150 },
  { name: "原味酸奶", amount: "1 杯", calories: 120, protein_grams: 6, carbohydrate_grams: 10, fat_grams: 5, hydration_ml: 120 },
  { name: "橙子", amount: "1 个", calories: 80, protein_grams: 1.5, carbohydrate_grams: 19, fat_grams: 0.2, hydration_ml: 150 },
  { name: "混合坚果", amount: "1 小把", calories: 170, protein_grams: 5, carbohydrate_grams: 6, fat_grams: 15, hydration_ml: 100 },
  { name: "苹果", amount: "1 个", calories: 95, protein_grams: 0.5, carbohydrate_grams: 25, fat_grams: 0.3, hydration_ml: 160 },
];

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const result = await supabase.from("nutrition_records")
    .select("id,record_date,breakfast_items,lunch_items,dinner_items,pantry_items,breakfast_time,lunch_time,dinner_time,pantry_time,total_calories,protein_grams,carbohydrate_grams,fat_grams,hydration_ml,health_rating")
    .eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate).order("record_date");
  if (result.error) throw result.error;
  const rows = result.data ?? [];
  if (rows.length !== dateRange(startDate, endDate).length) throw new Error("日期区间内有缺失的饮食日记录；先补齐日记录。");

  const summary = { days: rows.length, updatedDays: 0, addedSnacks: 0, estimatedMealSummaries: 0, preservedPhotoMeals: 0, mismatchesAfterSave: 0 };
  for (const [dayIndex, row] of rows.entries()) {
    const before = Object.fromEntries(meals.map((meal) => [meal, Array.isArray(row[`${meal}_items`]) ? row[`${meal}_items`] : []]));
    for (const meal of meals.slice(0, 3)) {
      if (before[meal].length === 0) throw new Error(`${row.record_date}: 三餐之一缺少项目，停止而不制造食物记录。`);
    }
    const baselineCalories = meals.reduce((sum, meal) => sum + foodCalories(before[meal]), 0);
    const next = structuredClone(before);
    let snackAdded = false;
    if (next.pantry.length === 0) {
      const snack = snacks[dayIndex % snacks.length];
      next.pantry = [{
        name: snack.name, amount: snack.amount, calories: snack.calories,
        protein_grams: snack.protein_grams, carbohydrate_grams: snack.carbohydrate_grams, fat_grams: snack.fat_grams,
        source_id: `synthetic-history-snack-${row.record_date}`,
        meal_summary: { ...Object.fromEntries(metrics.map((metric) => [metric, snack[metric]])), health_rating: Number(row.health_rating) || 4, source: "synthetic_test_estimate" },
      }];
      snackAdded = true;
    }
    const legacy = meals.filter((meal) => next[meal].length > 0 && !validSummary(next[meal]));
    const known = Object.fromEntries(metrics.map((metric) => [metric,
      meals.reduce((sum, meal) => sum + (validSummary(next[meal]) ? nonNegative(next[meal][0].meal_summary[metric]) : 0), 0),
    ]));
    const scale = Number(row.total_calories) > 0 ? baselineCalories / Number(row.total_calories) : 1;
    const legacyCalories = legacy.reduce((sum, meal) => sum + foodCalories(next[meal]), 0);
    for (const [index, meal] of legacy.entries()) {
      const share = legacyCalories > 0 ? foodCalories(next[meal]) / legacyCalories : 1 / legacy.length;
      const mealSummary = {};
      for (const metric of metrics) {
        const existingTotal = nonNegative(row[metric]);
        const target = metric === "hydration_ml" ? existingTotal : round1(existingTotal * scale);
        const remaining = Math.max(0, target - known[metric]);
        const alreadyAssigned = legacy.slice(0, index).reduce((sum, previousMeal) => sum + nonNegative(next[previousMeal][0].meal_summary[metric]), 0);
        mealSummary[metric] = index === legacy.length - 1 ? round1(Math.max(0, remaining - alreadyAssigned)) : round1(remaining * share);
      }
      mealSummary.health_rating = Number(row.health_rating) || 4;
      mealSummary.source = "synthetic_test_estimate";
      next[meal] = next[meal].map((item, itemIndex) => {
        const updated = { ...item };
        delete updated.meal_summary;
        return itemIndex === 0 ? { ...updated, meal_summary: mealSummary } : updated;
      });
    }
    const update = {
      ...Object.fromEntries(meals.map((meal) => [`${meal}_items`, next[meal]])),
      breakfast_time: row.breakfast_time || "08:05",
      lunch_time: row.lunch_time || "12:25",
      dinner_time: row.dinner_time || "18:45",
      pantry_time: row.pantry_time || `15:${String(10 + (dayIndex * 7) % 45).padStart(2, "0")}`,
      total_calories: meals.reduce((sum, meal) => sum + foodCalories(next[meal]), 0),
      ...Object.fromEntries(metrics.map((metric) => [metric,
        round1(meals.reduce((sum, meal) => sum + nonNegative(next[meal][0]?.meal_summary?.[metric]), 0)),
      ])),
    };
    const changed = snackAdded || legacy.length > 0 || Object.entries(update).some(([key, value]) => JSON.stringify(row[key]) !== JSON.stringify(value));
    if (!changed) continue;
    const saved = await supabase.from("nutrition_records").update(update).eq("id", row.id).eq("user_id", userId);
    if (saved.error) throw saved.error;
    summary.updatedDays += 1;
    summary.addedSnacks += Number(snackAdded);
    summary.estimatedMealSummaries += legacy.length;
    summary.preservedPhotoMeals += meals.slice(0, 3).filter((meal) => before[meal].some((item) => String(item?.source_id ?? "").startsWith("vision-"))).length;
  }

  const audit = await supabase.from("nutrition_records")
    .select("record_date,breakfast_items,lunch_items,dinner_items,pantry_items,breakfast_time,lunch_time,dinner_time,pantry_time,total_calories,protein_grams,carbohydrate_grams,fat_grams,hydration_ml")
    .eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate);
  if (audit.error) throw audit.error;
  for (const row of audit.data ?? []) {
    const complete = meals.every((meal) => Array.isArray(row[`${meal}_items`]) && row[`${meal}_items`].length > 0
      && row[`${meal}_time`] && validSummary(row[`${meal}_items`]));
    const totalsMatch = row.total_calories === meals.reduce((sum, meal) => sum + foodCalories(row[`${meal}_items`]), 0)
      && metrics.every((metric) => Math.abs(nonNegative(row[metric]) - meals.reduce((sum, meal) => sum + nonNegative(row[`${meal}_items`][0].meal_summary[metric]), 0)) <= 0.1);
    if (!complete || !totalsMatch) summary.mismatchesAfterSave += 1;
  }
  console.log(JSON.stringify({ range: { startDate, endDate }, ...summary }, null, 2));
  if (summary.mismatchesAfterSave > 0) process.exitCode = 2;
} finally {
  await supabase.auth.signOut({ scope: "local" });
}

function validSummary(items) {
  const value = items?.find((item) => item?.meal_summary)?.meal_summary;
  return value && metrics.every((metric) => Number.isFinite(Number(value[metric])));
}
function foodCalories(items) { return (items ?? []).reduce((sum, item) => sum + nonNegative(item?.calories), 0); }
function nonNegative(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function round1(value) { return Math.round(value * 10) / 10; }
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? ""); }
function argument(name) { return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
function dateRange(start, end) {
  const values = [];
  const date = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (date <= last) { values.push(date.toISOString().slice(0, 10)); date.setUTCDate(date.getUTCDate() + 1); }
  return values;
}
