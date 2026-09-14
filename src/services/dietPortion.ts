import type { FoodItem } from "../types";
import { scaleKnown, sumKnown } from "./recordNumbers.ts";

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function oneDecimal(value: number) {
  return Math.round(nonNegative(value) * 10) / 10;
}

/** Scale an item only when its original measured/estimated portion is known. */
export function resizeFoodItemPortion(item: FoodItem, nextWeightGrams: number): FoodItem {
  const previousWeight = Number(item.weight_grams);
  const weight = oneDecimal(nextWeightGrams);
  if (!Number.isFinite(previousWeight) || previousWeight <= 0 || weight <= 0) return item;
  const ratio = weight / previousWeight;
  return {
    ...item,
    weight_grams: weight,
    amount: `${weight}g`,
    calories: scaleKnown(item.calories, ratio, 0),
    protein_grams: scaleKnown(item.protein_grams, ratio),
    carbohydrate_grams: scaleKnown(item.carbohydrate_grams, ratio),
    fat_grams: scaleKnown(item.fat_grams, ratio),
    nutrition_source: "user_corrected",
  };
}

export function correctFoodItemCalories(item: FoodItem, nextCalories: number | null): FoodItem {
  if (nextCalories !== null && (!Number.isFinite(nextCalories) || nextCalories < 0)) return item;
  return { ...item, calories: scaleKnown(nextCalories, 1, 0), nutrition_source: "user_corrected" };
}

export function sumFoodItemNutrition(items: FoodItem[]) {
  return {
    calories: scaleKnown(sumKnown(items.map((item) => item.calories)), 1, 0),
    proteinGrams: sumKnown(items.map((item) => item.protein_grams)),
    carbohydrateGrams: sumKnown(items.map((item) => item.carbohydrate_grams)),
    fatGrams: sumKnown(items.map((item) => item.fat_grams)),
  };
}
