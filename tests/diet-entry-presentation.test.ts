import assert from "node:assert/strict";
import test from "node:test";
import { formatDetectedDishList } from "../src/services/dietEntryPresentation.ts";
import { dietRecognitionPrompt } from "../supabase/functions/_shared/diet-prompt.ts";
import { correctFoodItemCalories, resizeFoodItemPortion, sumFoodItemNutrition } from "../src/services/dietPortion.ts";

test("formats one detected dish without an unnecessary numeric prefix", () => {
  assert.equal(formatDetectedDishList([{ name: "鸡胸肉沙拉" }]), "鸡胸肉沙拉");
});

test("formats multiple dishes as one editable line per dish", () => {
  assert.equal(
    formatDetectedDishList([
      { name: "1. 沙拉（可见配料：西红柿、青菜）" },
      { name: "蓝莓酸奶" },
      { name: "烤面包" },
    ]),
    "1. 沙拉（可见配料：西红柿、青菜）\n2. 蓝莓酸奶\n3. 烤面包",
  );
});

test("vision prompt requires dish-level grouping for composite food", () => {
  const chinese = dietRecognitionPrompt("zh", "lunch");
  const english = dietRecognitionPrompt("en", "lunch");
  assert.match(chinese, /最终菜品或饮品/);
  assert.match(chinese, /不能另列“西红柿”和“青菜”/);
  assert.match(chinese, /汉堡.*不必机械罗列原料/);
  assert.match(english, /dish level/);
  assert.match(english, /Do not split that salad/);
  assert.match(chinese, /实际可见的份量/);
  assert.match(english, /ACTUAL VISIBLE portion/);
});

test("portion correction scales calories and macros from the original estimated grams", () => {
  const original = { name: "米饭", weight_grams: 180, calories: 234, protein_grams: 4.5, carbohydrate_grams: 50, fat_grams: 0.5, nutrition_source: "vision_estimate" as const };
  const corrected = resizeFoodItemPortion(original, 120);
  assert.equal(corrected.weight_grams, 120);
  assert.equal(corrected.calories, 156);
  assert.equal(corrected.carbohydrate_grams, 33.3);
  assert.equal(corrected.nutrition_source, "user_corrected");
  assert.deepEqual(sumFoodItemNutrition([corrected, { name: "鸡蛋", calories: 78, protein_grams: 6 }]), {
    calories: 234, proteinGrams: 9, carbohydrateGrams: 33.3, fatGrams: 0.3,
  });
  assert.equal(correctFoodItemCalories(corrected, 150).calories, 150);
  assert.equal(resizeFoodItemPortion({ name: "未知", calories: 100 }, 100).calories, 100);
});
