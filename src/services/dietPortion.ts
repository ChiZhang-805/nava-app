import type { FoodItem } from "../types";

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
    calories: Math.round(nonNegative(Number(item.calories)) * ratio),
    protein_grams: oneDecimal(Number(item.protein_grams) * ratio),
    carbohydrate_grams: oneDecimal(Number(item.carbohydrate_grams) * ratio),
    fat_grams: oneDecimal(Number(item.fat_grams) * ratio),
    nutrition_source: "user_corrected",
  };
}

export function correctFoodItemCalories(item: FoodItem, nextCalories: number): FoodItem {
  return { ...item, calories: Math.round(nonNegative(nextCalories)), nutrition_source: "user_corrected" };
}

export function sumFoodItemNutrition(items: FoodItem[]) {
  return {
    calories: Math.round(items.reduce((sum, item) => sum + nonNegative(Number(item.calories)), 0)),
    proteinGrams: oneDecimal(items.reduce((sum, item) => sum + nonNegative(Number(item.protein_grams)), 0)),
    carbohydrateGrams: oneDecimal(items.reduce((sum, item) => sum + nonNegative(Number(item.carbohydrate_grams)), 0)),
    fatGrams: oneDecimal(items.reduce((sum, item) => sum + nonNegative(Number(item.fat_grams)), 0)),
  };
}
