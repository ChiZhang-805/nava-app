import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const recordDate = argument("date");
const photoDirectory = argument("photo-dir");
const cleanupDate = argument("cleanup-date");

if (!email || !password) throw new Error("请通过安全启动脚本提供目标 NAVA 账号。");
if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate ?? "")) throw new Error("请提供 --date=YYYY-MM-DD。");
if (!photoDirectory) throw new Error("请提供 --photo-dir=绝对路径。");

const meals = ["breakfast", "lunch", "dinner"];
const files = Object.fromEntries(meals.map((meal) => {
  const filePath = path.join(photoDirectory, `${recordDate}-${meal}.png`);
  const size = statSync(filePath).size;
  if (size <= 0 || size > 8 * 1024 * 1024) throw new Error(`${meal} 图片必须在 1 B 到 8 MB 之间。`);
  return [meal, { filePath, size }];
}));

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const existing = await supabase.from("nutrition_records").select("*").eq("user_id", userId).eq("record_date", recordDate).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data?.id) throw new Error("目标日期没有可更新的饮食记录。");

  const recognized = {};
  const uploadedPaths = [];
  for (const meal of meals) {
    const bytes = readFileSync(files[meal].filePath);
    const objectPath = `${userId}/${recordDate}/${meal}-${Date.now()}.png`;
    const upload = await supabase.storage.from("diet-photos").upload(objectPath, bytes, { contentType: "image/png", upsert: false });
    if (upload.error) throw upload.error;
    uploadedPaths.push(objectPath);

    const result = await supabase.functions.invoke("diet-extract", {
      body: { imagePath: objectPath, meal, date: recordDate, lang: "zh" },
    });
    if (result.error) throw new Error(`${meal}: ${await safeFunctionMessage(result.error)}`);
    const items = normalizeItems(result.data?.items, recordDate, meal);
    if (items.length === 0) throw new Error(`${meal}: 视觉模型没有返回可确认的食物项目。`);
    const totals = normalizeTotals(result.data?.totals, items);
    recognized[meal] = {
      objectPath,
      provider: typeof result.data?.provider === "string" ? result.data.provider : null,
      items,
      totals,
    };
  }

  const hydration = Math.max(0, Number(existing.data.hydration_ml) || 0);
  const hydrationShares = allocate(hydration, [0.24, 0.37, 0.39]);
  const payload = { updated_at: new Date().toISOString() };
  let totalCalories = 0;
  let proteinGrams = 0;
  let carbohydrateGrams = 0;
  let fatGrams = 0;
  meals.forEach((meal, mealIndex) => {
    const result = recognized[meal];
    result.items[0].meal_summary = {
      protein_grams: result.totals.protein,
      carbohydrate_grams: result.totals.carbohydrate,
      fat_grams: result.totals.fat,
      hydration_ml: hydrationShares[mealIndex],
      health_rating: Math.min(5, Math.max(1, Math.round(Number(existing.data.health_rating) || 4))),
    };
    payload[`${meal}_items`] = result.items;
    payload[`${meal}_photo_url`] = result.objectPath;
    totalCalories += result.totals.calories;
    proteinGrams += result.totals.protein;
    carbohydrateGrams += result.totals.carbohydrate;
    fatGrams += result.totals.fat;
  });
  Object.assign(payload, {
    total_calories: Math.round(totalCalories),
    protein_grams: round1(proteinGrams),
    carbohydrate_grams: round1(carbohydrateGrams),
    fat_grams: round1(fatGrams),
    hydration_ml: hydration,
  });

  const update = await supabase.from("nutrition_records").update(payload).eq("id", existing.data.id).eq("user_id", userId).select("id").single();
  if (update.error) throw update.error;

  const dietReportResult = await supabase.functions.invoke("ai-diet-report", {
    body: { date: recordDate, lang: "zh", refresh: true },
  });
  const dietReport = dietReportResult.error
    ? { succeeded: false, bulletCount: 0, error: await safeFunctionMessage(dietReportResult.error) }
    : { succeeded: true, bulletCount: Array.isArray(dietReportResult.data?.bullets) ? dietReportResult.data.bullets.length : 0, error: null };

  const rhythm = await supabase.functions.invoke("rhythm-score", { body: { date: recordDate } });
  const weekly = await supabase.functions.invoke("dnb-weekly-report", {
    body: { startDate: shiftDate(recordDate, -6), endDate: recordDate, analysisDays: 14 },
  });

  let cleanedWrongDatePhotos = 0;
  if (cleanupDate && /^\d{4}-\d{2}-\d{2}$/.test(cleanupDate) && cleanupDate !== recordDate) {
    const wrongDateObjects = await supabase.storage.from("diet-photos").list(`${userId}/${cleanupDate}`, { limit: 100 });
    if (wrongDateObjects.error) throw wrongDateObjects.error;
    const exactOwnUploads = (wrongDateObjects.data ?? []).filter((item) => meals.some((meal) => item.name.startsWith(`${meal}-`) && Number(item.metadata?.size) === files[meal].size));
    if (exactOwnUploads.length > 0) {
      const removal = await supabase.storage.from("diet-photos").remove(exactOwnUploads.map((item) => `${userId}/${cleanupDate}/${item.name}`));
      if (removal.error) throw removal.error;
      cleanedWrongDatePhotos = exactOwnUploads.length;
    }
  }

  console.log(JSON.stringify({
    recordDate,
    meals: Object.fromEntries(meals.map((meal) => [meal, { itemCount: recognized[meal].items.length, provider: recognized[meal].provider, photoSaved: true }])),
    nutritionRecordUpdated: true,
    dietReport,
    rhythmScoreRecomputed: !rhythm.error,
    rhythmScoreError: rhythm.error ? await safeFunctionMessage(rhythm.error) : null,
    fdnbWeeklyReportRecomputed: !weekly.error,
    fdnbWeeklyReportError: weekly.error ? await safeFunctionMessage(weekly.error) : null,
    cleanedWrongDatePhotos,
  }, null, 2));
} finally {
  await supabase.auth.signOut();
}

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function normalizeItems(value, date, meal) {
  return (Array.isArray(value) ? value : []).map((item, index) => ({
    name: String(item?.name ?? "").trim(),
    amount: typeof item?.amount === "string" ? item.amount : item?.weight_g ? `${Math.round(Number(item.weight_g))}g` : undefined,
    calories: Math.max(0, Math.round(Number(item?.calories) || 0)),
    weight_grams: positive(item?.weight_g),
    protein_grams: nonNegative(item?.protein_g),
    carbohydrate_grams: nonNegative(item?.carbohydrate_g),
    fat_grams: nonNegative(item?.fat_g),
    confidence: confidence(item?.confidence),
    source_id: `vision-${date}-${meal}-${index + 1}`,
  })).filter((item) => item.name);
}

function normalizeTotals(value, items) {
  const totals = value && typeof value === "object" ? value : {};
  const sum = (key) => items.reduce((output, item) => output + (Number(item[key]) || 0), 0);
  return {
    calories: nonNegative(totals.calories) ?? sum("calories"),
    protein: nonNegative(totals.protein_g) ?? sum("protein_grams"),
    carbohydrate: nonNegative(totals.carbohydrate_g) ?? sum("carbohydrate_grams"),
    fat: nonNegative(totals.fat_g) ?? sum("fat_grams"),
  };
}

function allocate(total, weights) {
  const raw = weights.map((weight) => total * weight);
  const output = raw.map(Math.floor);
  let remainder = Math.round(total) - output.reduce((sum, value) => sum + value, 0);
  raw.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder).forEach(({ index }) => {
    if (remainder > 0) { output[index] += 1; remainder -= 1; }
  });
  return output;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? round1(number) : undefined;
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? round1(number) : undefined;
}

function confidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : undefined;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
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
