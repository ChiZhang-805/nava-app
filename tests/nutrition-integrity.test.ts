import assert from "node:assert/strict";
import test from "node:test";
import {
  attachMealNutritionSummary,
  buildNutritionMutation,
  estimatedExistingMealSummary,
  readMealNutritionSummary,
} from "../src/services/nutritionIntegrity.ts";
import type { NutritionRecord } from "../src/types.ts";

const meal = (name: string, calories: number, protein: number, carbs: number, fat: number, hydration = 0) =>
  attachMealNutritionSummary([{ name, calories }], {
    protein_grams: protein,
    carbohydrate_grams: carbs,
    fat_grams: fat,
    hydration_ml: hydration,
  });

test("replacing one meal preserves the other meals and recalculates daily nutrition totals", () => {
  const current: Partial<NutritionRecord> = {
    breakfast_items: meal("燕麦", 300, 12, 45, 8, 250),
    lunch_items: meal("鸡胸肉", 500, 42, 38, 16, 300),
    dinner_items: [],
    pantry_items: [],
    total_calories: 800,
    protein_grams: 54,
    carbohydrate_grams: 83,
    fat_grams: 24,
    hydration_ml: 550,
  };

  const result = buildNutritionMutation({
    current,
    meal: "breakfast",
    items: [{ name: "鸡蛋", calories: 210 }],
    summary: { protein_grams: 18, carbohydrate_grams: 2, fat_grams: 15, hydration_ml: 200 },
    append: false,
  });

  assert.equal(result.total_calories, 710);
  assert.equal(result.protein_grams, 60);
  assert.equal(result.carbohydrate_grams, 40);
  assert.equal(result.fat_grams, 31);
  assert.equal(result.hydration_ml, 500);
  assert.deepEqual(result.lunch_items, current.lunch_items);
  assert.deepEqual(readMealNutritionSummary(result.breakfast_items), {
    protein_grams: 18,
    carbohydrate_grams: 2,
    fat_grams: 15,
    hydration_ml: 200,
  });
});

test("replayed AI meal items are idempotent by source id", () => {
  const existing = attachMealNutritionSummary([{ name: "香蕉", calories: 105, source_id: "entry-123:0" }], {
    protein_grams: 1,
    carbohydrate_grams: 27,
    fat_grams: 0,
    hydration_ml: 0,
  });
  const result = buildNutritionMutation({
    current: {
      breakfast_items: existing,
      lunch_items: [],
      dinner_items: [],
      pantry_items: [],
      total_calories: 105,
      protein_grams: 1,
      carbohydrate_grams: 27,
      fat_grams: 0,
      hydration_ml: 0,
    },
    meal: "breakfast",
    items: [{ name: "香蕉", calories: 105, source_id: "entry-123:0" }],
    summary: { protein_grams: 1, carbohydrate_grams: 27, fat_grams: 0, hydration_ml: 0 },
    append: true,
  });

  assert.equal(result.breakfast_items.length, 1);
  assert.equal(result.total_calories, 105);
  assert.equal(result.carbohydrate_grams, 27);
});

test("legacy daily macros are apportioned instead of copied into every meal", () => {
  const current: Partial<NutritionRecord> = {
    breakfast_items: [{ name: "早餐", calories: 400 }],
    lunch_items: [{ name: "午餐", calories: 600 }],
    dinner_items: [],
    pantry_items: [],
    total_calories: 1_000,
    protein_grams: 50,
    carbohydrate_grams: 100,
    fat_grams: 30,
    hydration_ml: 1_000,
  };

  assert.deepEqual(estimatedExistingMealSummary(current, "breakfast"), {
    protein_grams: 20,
    carbohydrate_grams: 40,
    fat_grams: 12,
    hydration_ml: 400,
  });
  assert.deepEqual(estimatedExistingMealSummary(current, "lunch"), {
    protein_grams: 30,
    carbohydrate_grams: 60,
    fat_grams: 18,
    hydration_ml: 600,
  });
});
