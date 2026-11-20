import type { FoodItem, TrendBundle } from "../types";
import { rollingDateWindow } from "./date.ts";

export interface HealthReportDish {
  id: string;
  title: string;
  date: string;
  meal: string;
  time: string | null;
  amount: string | null;
  notes: string | null;
  photoPath: string | null;
  photoKind: "dish" | "meal" | null;
  nutrients: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
  estimated: boolean;
}

const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const time = (value: unknown) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value) ? value.slice(0, 5) : null;
const meals = ["breakfast", "lunch", "dinner", "pantry"] as const;
const names = { breakfast: ["早餐", "Breakfast"], lunch: ["午餐", "Lunch"], dinner: ["晚餐", "Dinner"], pantry: ["加餐", "Snack"] } as const;
function mealLabel(value: unknown, locale: "zh" | "en") {
  const raw = text(value);
  const key = meals.find(meal => meal === raw || names[meal].some(name => name === raw));
  return key ? names[key][locale === "zh" ? 0 : 1] : raw ?? (locale === "zh" ? "饮食记录" : "Food entry");
}

/** Food cards describe saved items, never inferred dishes or generated nutritional facts. */
export function buildHealthReportDishes(bundle: TrendBundle | null, date: string, locale: "zh" | "en"): HealthReportDish[] {
  const days = new Set(rollingDateWindow(date));
  const journal = [...new Map((bundle?.journal ?? []).filter(record => record.category === "food" && days.has(record.recordDate)).map(record => [record.id, record])).values()];
  const dishes: HealthReportDish[] = journal.map(record => ({
    id: `journal-${record.id}`,
    // A free-text meal may list several foods. Keep it together with its meal totals.
    title: text(record.data.foods) ?? mealLabel(record.data.meal, locale),
    date: record.recordDate,
    meal: mealLabel(record.data.meal, locale),
    time: time(record.data.mealTime),
    amount: text(record.data.portion),
    notes: text(record.data.notes),
    // The journal does not currently persist a signed diet-photos reference.
    // Do not guess a bucket or reuse transient photo previews after reload.
    photoPath: null, photoKind: null,
    nutrients: { calories: number(record.data.calories), protein: number(record.data.protein), carbs: number(record.data.carbs), fat: number(record.data.fat) },
    estimated: record.estimated === true,
  }));
  const legacy = [...new Map((bundle?.nutritions ?? []).map(record => [record.id, record])).values()];
  for (const record of legacy) {
    // Unlike an aggregate, this is an inventory of saved entries. A journal dinner
    // must not hide a separately saved lunch. There is no shared event identifier
    // between the sources, so only repeated row IDs are deduplicated above.
    if (!days.has(record.record_date)) continue;
    for (const meal of meals) {
      const saved = record[`${meal}_items`];
      const items: FoodItem[] = Array.isArray(saved) ? saved.filter(item => item && text(item.name)) : [];
      const photoPath = meal === "pantry" ? null : text(record[`${meal}_photo_url`]);
      const entryTime = time(record[`${meal}_time`]);
      if (!items.length && !photoPath) continue;
      const label = mealLabel(meal, locale);
      for (const [index, item] of (items.length ? items : [null]).entries()) {
        dishes.push({
          id: `nutrition-${record.id}-${meal}-${index}`,
          title: text(item?.name) ?? label,
          date: record.record_date, meal: label, time: entryTime,
          amount: text(item?.amount), notes: null, photoPath,
          photoKind: photoPath ? items.length === 1 ? "dish" : "meal" : null,
          // Do not distribute daily totals or meal_summary among individual dishes.
          nutrients: { calories: number(item?.calories), protein: number(item?.protein_grams), carbs: number(item?.carbohydrate_grams), fat: number(item?.fat_grams) },
          estimated: item?.nutrition_source === "vision_estimate",
        });
      }
    }
  }
  return dishes.sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "") || a.id.localeCompare(b.id));
}
