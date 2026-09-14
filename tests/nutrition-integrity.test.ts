import assert from "node:assert/strict";
import test from "node:test";
import {
  attachMealNutritionSummary,
  buildNutritionMutation,
  estimatedExistingMealSummary,
  readMealNutritionSummary,
  summaryFromItems,
} from "../src/services/nutritionIntegrity.ts";
import { optionalNonNegative, scaleKnown, sumKnown } from "../src/services/recordNumbers.ts";
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

test("multiple unknown legacy meals cannot be invented from daily totals or calories", () => {
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
    protein_grams: null,
    carbohydrate_grams: null,
    fat_grams: null,
    hydration_ml: null,
  });
  assert.deepEqual(estimatedExistingMealSummary(current, "lunch"), {
    protein_grams: null,
    carbohydrate_grams: null,
    fat_grams: null,
    hydration_ml: null,
  });
});

test("unknown values survive parsing and scaling while known zero remains zero", () => {
  for (const value of [null, undefined, "", " ", NaN, Infinity, -1, true]) assert.equal(optionalNonNegative(value), null);
  assert.equal(optionalNonNegative("0"), 0);
  assert.equal(sumKnown([0, 0]), 0);
  assert.equal(sumKnown([10, null]), null);
  assert.equal(sumKnown([Number.MAX_VALUE, Number.MAX_VALUE]), null);
  assert.equal(scaleKnown(10, -1), null);
  assert.equal(scaleKnown(Number.MAX_VALUE, 100), null);
});

test("one unknown meal metric can use an exact known daily remainder", () => {
  const current = { breakfast_items: meal("早餐", 300, 10, 30, 5, 200), lunch_items: [{ name: "午餐" }], protein_grams: 35 };
  assert.equal(estimatedExistingMealSummary(current, "lunch").protein_grams, 25);
  assert.equal(estimatedExistingMealSummary(current, "lunch").fat_grams, null);
});

test("unknown item makes meal/day totals unknown; other fields and explicit zero are preserved", () => {
  const items = [{ name: "白开水", calories: 0, protein_grams: 0 }, { name: "餐食", calories: null, protein_grams: 12 }];
  const result = buildNutritionMutation({ current: {}, meal: "lunch", items, summary: summaryFromItems(items), append: false });
  assert.equal(result.total_calories, null);
  assert.equal(result.protein_grams, 12);
  assert.equal(result.fat_grams, null);
  assert.equal(result.hydration_ml, null);
  assert.equal(readMealNutritionSummary(result.lunch_items)?.fat_grams, null);
});

test("full replay preserves legacy known totals and explicit unknown meal summaries", () => {
  const items = attachMealNutritionSummary([{ name: "旧餐食", source_id: "old" }], { protein_grams: null, fat_grams: null, carbohydrate_grams: null, hydration_ml: null });
  const result = buildNutritionMutation({ current: { lunch_items: items, total_calories: 300, protein_grams: 20 }, meal: "lunch", items, summary: summaryFromItems(items), append: true });
  assert.equal(result.unchanged, true);
  assert.equal(result.total_calories, 300);
  assert.equal(result.protein_grams, 20);
  assert.deepEqual(result.lunch_items, items);
  assert.equal(result.selectedSummary.protein_grams, null);
});

test("a known legacy daily calorie total survives an exact known addition", () => {
  const current = { total_calories: 300, breakfast_items: [{ name: "旧餐", calories: null }] };
  const items = [{ name: "新餐", calories: 100 }];
  const result = buildNutritionMutation({ current, meal: "lunch", items, summary: summaryFromItems(items), append: true });
  assert.equal(result.total_calories, 400);
  assert.equal(result.breakfast_items[0].calories, null);
});

test("same-batch source ids and partial replays use only new per-item nutrition", () => {
  const items = [{ name: "甲", source_id: "a", calories: 100, protein_grams: 5 }, { name: "乙", source_id: "b", calories: 400, protein_grams: 40 }];
  const result = buildNutritionMutation({ current: { lunch_items: [items[0]] }, meal: "lunch", items: [...items, items[1]], summary: { protein_grams: 85, fat_grams: 0, carbohydrate_grams: 0, hydration_ml: 0 }, append: true });
  assert.equal(result.lunch_items.length, 2);
  assert.equal(result.total_calories, 500);
  assert.equal(result.protein_grams, 45);
  assert.equal(result.fat_grams, null);
});
