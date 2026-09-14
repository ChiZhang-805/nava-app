import type { FoodItem, NutritionRecord } from "../types";
import { optionalNonNegative, scaleKnown, sumKnown } from "./recordNumbers.ts";

export type NutritionMeal = "breakfast" | "lunch" | "dinner" | "pantry";
export type MealNutritionSummary = {
  protein_grams: number | null;
  carbohydrate_grams: number | null;
  fat_grams: number | null;
  hydration_ml: number | null;
  health_rating?: number;
};
const meals: NutritionMeal[] = ["breakfast", "lunch", "dinner", "pantry"];
const metrics = ["protein_grams", "carbohydrate_grams", "fat_grams", "hydration_ml"] as const;
const emptySummary = (): MealNutritionSummary => ({ protein_grams: 0, carbohydrate_grams: 0, fat_grams: 0, hydration_ml: 0 });

export function foodItemCalories(items: FoodItem[]) {
  return scaleKnown(sumKnown(items.map((item) => item.calories)), 1, 0);
}

export function readMealNutritionSummary(items: FoodItem[]): MealNutritionSummary | null {
  const raw = items.find((item) => item.meal_summary)?.meal_summary;
  if (!raw || typeof raw !== "object") return null;
  const rating = optionalNonNegative(raw.health_rating);
  return {
    protein_grams: optionalNonNegative(raw.protein_grams),
    carbohydrate_grams: optionalNonNegative(raw.carbohydrate_grams),
    fat_grams: optionalNonNegative(raw.fat_grams),
    hydration_ml: optionalNonNegative(raw.hydration_ml),
    ...(rating != null && rating >= 1 && rating <= 5 ? { health_rating: Math.round(rating) } : {}),
  };
}

export function summaryFromItems(items: FoodItem[]): MealNutritionSummary {
  if (!items.length) return emptySummary();
  return {
    protein_grams: sumKnown(items.map((item) => item.protein_grams)),
    carbohydrate_grams: sumKnown(items.map((item) => item.carbohydrate_grams)),
    fat_grams: sumKnown(items.map((item) => item.fat_grams)),
    hydration_ml: null,
  };
}

export function attachMealNutritionSummary(items: FoodItem[], summary: MealNutritionSummary) {
  return items.map((item, index) => {
    const rest = { ...item };
    delete rest.meal_summary;
    return index === 0 ? { ...rest, meal_summary: summary } : rest;
  });
}

export function mealItems(record: Partial<NutritionRecord>, meal: NutritionMeal) {
  const value = record[`${meal}_items` as keyof NutritionRecord];
  return Array.isArray(value) ? value as FoodItem[] : [];
}

/** Legacy name retained for callers: no calorie-proportional guesses are made.
 * A missing meal metric can only be recovered when it is the single unknown
 * contribution to a known daily total. Otherwise it stays unknown.
 */
export function estimatedExistingMealSummary(record: Partial<NutritionRecord>, targetMeal: NutritionMeal): MealNutritionSummary {
  const entries = meals.map((meal) => {
    const items = mealItems(record, meal);
    return { meal, summary: readMealNutritionSummary(items) ?? summaryFromItems(items) };
  });
  const result = { ...entries.find((entry) => entry.meal === targetMeal)!.summary };
  for (const key of metrics) {
    if (result[key] != null) continue;
    const unknown = entries.filter((entry) => entry.summary[key] == null);
    const daily = optionalNonNegative(record[key]);
    if (unknown.length === 1 && unknown[0].meal === targetMeal && daily != null) {
      const known = entries.reduce((sum, entry) => sum + (entry.summary[key] ?? 0), 0);
      if (daily >= known) result[key] = Math.round((daily - known) * 10) / 10;
    }
  }
  return result;
}

export function buildNutritionMutation(input: {
  current: Partial<NutritionRecord>; meal: NutritionMeal; items: FoodItem[];
  summary: MealNutritionSummary; append: boolean;
}) {
  const { current, meal, append } = input;
  const previousItems = mealItems(current, meal);
  const previousSummary = estimatedExistingMealSummary(current, meal);
  const seen = new Set(append ? previousItems.map((item) => item.source_id).filter(Boolean) : []);
  const incomingItems = input.items.filter((item) => {
    if (!item.source_id) return true;
    if (seen.has(item.source_id)) return false;
    seen.add(item.source_id);
    return true;
  });
  if (append && !incomingItems.length) return {
    breakfast_items: mealItems(current, "breakfast"), lunch_items: mealItems(current, "lunch"),
    dinner_items: mealItems(current, "dinner"), pantry_items: mealItems(current, "pantry"),
    total_calories: current.total_calories ?? null,
    protein_grams: current.protein_grams ?? null, carbohydrate_grams: current.carbohydrate_grams ?? null,
    fat_grams: current.fat_grams ?? null, hydration_ml: current.hydration_ml ?? null,
    health_rating: current.health_rating ?? null,
    selectedItems: previousItems, selectedSummary: readMealNutritionSummary(previousItems) ?? previousSummary,
    unchanged: true,
  };
  const incomingSummary = !incomingItems.length ? emptySummary()
    : incomingItems.length === input.items.length ? input.summary : summaryFromItems(incomingItems);
  const combinedItems = append ? [...previousItems, ...incomingItems] : incomingItems;
  const nextSummary = { ...incomingSummary };
  if (append) {
    for (const key of metrics) nextSummary[key] = sumKnown([previousSummary[key], incomingSummary[key]]);
    nextSummary.health_rating = incomingItems.length > 0 ? input.summary.health_rating ?? previousSummary.health_rating : previousSummary.health_rating;
  }
  const nextItems = attachMealNutritionSummary(combinedItems, nextSummary);
  const allItems = Object.fromEntries(meals.map((candidate) => [
    `${candidate}_items`, candidate === meal ? nextItems : mealItems(current, candidate),
  ])) as Record<`${NutritionMeal}_items`, FoodItem[]>;
  const daily = {} as Record<typeof metrics[number], number | null>;
  for (const key of metrics) {
    daily[key] = sumKnown(meals.map((candidate) => candidate === meal ? nextSummary[key] : estimatedExistingMealSummary(current, candidate)[key]));
    // Preserve a known legacy daily total when the exact edit delta is known.
    // Never distribute that total among multiple unknown meals by calories.
    const oldDaily = optionalNonNegative(current[key]);
    if (daily[key] == null && oldDaily != null) {
      if (append && incomingSummary[key] != null) daily[key] = sumKnown([oldDaily, incomingSummary[key]]);
      else if (!append && previousSummary[key] != null && nextSummary[key] != null && oldDaily >= previousSummary[key]) {
        daily[key] = sumKnown([oldDaily - previousSummary[key], nextSummary[key]]);
      }
    }
  }
  const oldMealCount = meals.filter((candidate) => mealItems(current, candidate).length > 0).length;
  const nextMealCount = meals.filter((candidate) => allItems[`${candidate}_items`].length > 0).length;
  const currentRating = optionalNonNegative(current.health_rating);
  const nextMealRating = nextSummary.health_rating ?? previousSummary.health_rating;
  let healthRating = currentRating;
  if (nextMealRating != null && nextMealCount > 0) {
    const previousRating = previousSummary.health_rating ?? currentRating ?? nextMealRating;
    const existingTotal = (currentRating ?? previousRating) * oldMealCount;
    healthRating = Math.min(5, Math.max(1, Math.round((existingTotal - (previousItems.length ? previousRating : 0) + nextMealRating) / nextMealCount)));
  }
  let totalCalories = foodItemCalories(Object.values(allItems).flat());
  const oldCalories = optionalNonNegative(current.total_calories);
  const addedCalories = foodItemCalories(incomingItems);
  const previousCalories = foodItemCalories(previousItems);
  if (totalCalories == null && oldCalories != null && addedCalories != null) {
    if (append) totalCalories = sumKnown([oldCalories, addedCalories]);
    else if (previousCalories != null && oldCalories >= previousCalories) totalCalories = sumKnown([oldCalories - previousCalories, addedCalories]);
  }
  return {
    ...allItems, total_calories: totalCalories,
    ...daily, health_rating: healthRating, selectedItems: nextItems, selectedSummary: nextSummary, unchanged: false,
  };
}
