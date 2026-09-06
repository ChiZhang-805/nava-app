import type { FoodItem, NutritionRecord } from "../types";

export type NutritionMeal = "breakfast" | "lunch" | "dinner" | "pantry";

export type MealNutritionSummary = {
  protein_grams: number;
  carbohydrate_grams: number;
  fat_grams: number;
  hydration_ml: number;
  health_rating?: number;
};

const meals: NutritionMeal[] = ["breakfast", "lunch", "dinner", "pantry"];
const metricColumns = {
  protein_grams: "protein_grams",
  carbohydrate_grams: "carbohydrate_grams",
  fat_grams: "fat_grams",
  hydration_ml: "hydration_ml",
} as const;

function finiteNonNegative(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function foodItemCalories(items: FoodItem[]) {
  return items.reduce((sum, item) => sum + finiteNonNegative(item.calories), 0);
}

export function readMealNutritionSummary(items: FoodItem[]): MealNutritionSummary | null {
  const raw = items.find((item) => item.meal_summary)?.meal_summary;
  if (!raw || typeof raw !== "object") return null;
  return {
    protein_grams: finiteNonNegative(raw.protein_grams),
    carbohydrate_grams: finiteNonNegative(raw.carbohydrate_grams),
    fat_grams: finiteNonNegative(raw.fat_grams),
    hydration_ml: finiteNonNegative(raw.hydration_ml),
    ...(Number.isFinite(Number(raw.health_rating))
      ? { health_rating: Math.min(5, Math.max(1, Math.round(Number(raw.health_rating)))) }
      : {}),
  };
}

export function summaryFromItems(items: FoodItem[]): MealNutritionSummary {
  return {
    protein_grams: items.reduce((sum, item) => sum + finiteNonNegative(item.protein_grams), 0),
    carbohydrate_grams: items.reduce((sum, item) => sum + finiteNonNegative(item.carbohydrate_grams), 0),
    fat_grams: items.reduce((sum, item) => sum + finiteNonNegative(item.fat_grams), 0),
    hydration_ml: 0,
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

export function estimatedExistingMealSummary(record: Partial<NutritionRecord>, targetMeal: NutritionMeal): MealNutritionSummary {
  const targetItems = mealItems(record, targetMeal);
  const stored = readMealNutritionSummary(targetItems);
  if (stored) return stored;

  const exact = meals
    .map((meal) => ({ meal, items: mealItems(record, meal) }))
    .map(({ meal, items }) => ({ meal, calories: foodItemCalories(items), summary: readMealNutritionSummary(items) }));
  const legacy = exact.filter((item) => item.calories > 0 && !item.summary);
  const legacyCalories = legacy.reduce((sum, item) => sum + item.calories, 0);
  const targetCalories = legacy.find((item) => item.meal === targetMeal)?.calories ?? 0;
  const share = legacyCalories > 0 ? targetCalories / legacyCalories : 0;

  const estimate = {} as MealNutritionSummary;
  for (const [summaryKey, column] of Object.entries(metricColumns) as Array<[keyof typeof metricColumns, keyof NutritionRecord]>) {
    const exactTotal = exact.reduce((sum, item) => sum + (item.summary?.[summaryKey] ?? 0), 0);
    const remaining = Math.max(0, finiteNonNegative(record[column]) - exactTotal);
    estimate[summaryKey] = remaining * share;
  }
  if (targetItems.length > 0 && Number.isFinite(Number(record.health_rating))) {
    estimate.health_rating = Math.min(5, Math.max(1, Math.round(Number(record.health_rating))));
  }
  return estimate;
}

export function buildNutritionMutation(input: {
  current: Partial<NutritionRecord>;
  meal: NutritionMeal;
  items: FoodItem[];
  summary: MealNutritionSummary;
  append: boolean;
}) {
  const { current, meal, append } = input;
  const previousItems = mealItems(current, meal);
  const previousSummary = estimatedExistingMealSummary(current, meal);
  const previousSourceIds = new Set(previousItems.map((item) => item.source_id).filter(Boolean));
  const incomingItems = append
    ? input.items.filter((item) => !item.source_id || !previousSourceIds.has(item.source_id))
    : input.items;
  const combinedItems = append ? [...previousItems, ...incomingItems] : incomingItems;
  const incomingRatio = append && input.items.length > 0 ? incomingItems.length / input.items.length : 1;
  const nextSummary: MealNutritionSummary = append
    ? {
        protein_grams: previousSummary.protein_grams + input.summary.protein_grams * incomingRatio,
        carbohydrate_grams: previousSummary.carbohydrate_grams + input.summary.carbohydrate_grams * incomingRatio,
        fat_grams: previousSummary.fat_grams + input.summary.fat_grams * incomingRatio,
        hydration_ml: previousSummary.hydration_ml + input.summary.hydration_ml * incomingRatio,
        health_rating: incomingItems.length > 0 ? (input.summary.health_rating ?? previousSummary.health_rating) : previousSummary.health_rating,
      }
    : input.summary;
  const nextItems = attachMealNutritionSummary(combinedItems, nextSummary);
  const allItems = Object.fromEntries(meals.map((candidate) => [
    `${candidate}_items`,
    candidate === meal ? nextItems : mealItems(current, candidate),
  ])) as Record<`${NutritionMeal}_items`, FoodItem[]>;

  const daily = {} as Record<keyof typeof metricColumns, number>;
  for (const [summaryKey, column] of Object.entries(metricColumns) as Array<[keyof typeof metricColumns, keyof NutritionRecord]>) {
    daily[summaryKey] = Math.max(
      0,
      finiteNonNegative(current[column]) - previousSummary[summaryKey] + nextSummary[summaryKey],
    );
  }

  const oldMealCount = meals.filter((candidate) => mealItems(current, candidate).length > 0).length;
  const selectedExisted = previousItems.length > 0;
  const nextMealCount = meals.filter((candidate) => (candidate === meal ? nextItems : mealItems(current, candidate)).length > 0).length;
  const currentRating = Number.isFinite(Number(current.health_rating)) ? Number(current.health_rating) : null;
  const nextMealRating = nextSummary.health_rating ?? previousSummary.health_rating;
  let healthRating = currentRating;
  if (nextMealRating != null && nextMealCount > 0) {
    const previousRating = previousSummary.health_rating ?? currentRating ?? nextMealRating;
    const existingRatingTotal = (currentRating ?? previousRating) * oldMealCount;
    const nextRatingTotal = selectedExisted
      ? existingRatingTotal - previousRating + nextMealRating
      : existingRatingTotal + nextMealRating;
    healthRating = Math.min(5, Math.max(1, Math.round(nextRatingTotal / nextMealCount)));
  }

  return {
    ...allItems,
    total_calories: Object.values(allItems).flat().reduce((sum, item) => sum + finiteNonNegative(item.calories), 0),
    protein_grams: daily.protein_grams,
    carbohydrate_grams: daily.carbohydrate_grams,
    fat_grams: daily.fat_grams,
    hydration_ml: daily.hydration_ml,
    health_rating: healthRating,
    selectedItems: nextItems,
    selectedSummary: nextSummary,
  };
}
