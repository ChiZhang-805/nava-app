import { enrichNutritionWithEvidence } from "../_shared/nutrition-evidence.ts";
import type { KnowledgeBundle } from "../_shared/knowledge-tools.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

const bundle: KnowledgeBundle = {
  schemaVersion: "1.0.0",
  evidence: [
    { toolId: "nava_common_food_reference", domain: "nutrition", sourceTitle: "common", query: "chicken roasted meat and skin", confidence: .78, facts: { foodName: "烤鸡", serving: "1份（约150克）", caloriesKcal: 359, proteinG: 41, carbohydrateG: 0, fatG: 20.4 } },
    { toolId: "nava_common_food_reference", domain: "nutrition", sourceTitle: "common", query: "rice white cooked", confidence: .78, facts: { foodName: "熟白米饭", serving: "1碗（约158克）", caloriesKcal: 205, proteinG: 4.3, carbohydrateG: 44.5, fatG: .4 } },
    { toolId: "usda_fooddata_central", domain: "nutrition", sourceTitle: "USDA", query: "broccoli cooked", confidence: .94, facts: { description: "Broccoli, cooked", caloriesKcal: 35, proteinG: 2.4, carbohydrateG: 7.2, fatG: .4 } },
  ],
  traces: [],
};

Deno.test("common serving evidence fills missing macros and keeps existing estimates", () => {
  const extraction = { dataType: "nutrition", extractedData: { items: [
    { name: "烤鸡", quantity: 1, amount: "1份", calories: 350, knowledgeQuery: "chicken roasted meat and skin" },
    { name: "米饭", quantity: 1, amount: "1小碗", calories: 180, knowledgeQuery: "rice white cooked" },
  ], totalCalories: 530 } };
  const enriched = enrichNutritionWithEvidence(extraction, bundle);
  const data = enriched.result.extractedData as Record<string, unknown>;
  const items = data.items as Array<Record<string, unknown>>;
  assertEquals(items[0].calories, 350);
  assertEquals(items[0].protein_grams, 40);
  assertEquals(items[0].carbohydrate_grams, 0);
  assertEquals(items[1].protein_grams, 3.8);
  assertEquals(data.proteinGrams, 43.8);
  assertEquals(data.carbohydrateGrams, 39.1);
  assertEquals(data.fatGrams, 20.3);
  assertEquals(enriched.usedToolIds, ["nava_common_food_reference"]);
});

Deno.test("USDA per-100-g evidence requires weight and never overwrites a known macro", () => {
  const extraction = { dataType: "nutrition", extractedData: { items: [
    { name: "broccoli", weight_grams: 150, calories: 52.5, protein_grams: 9, knowledgeQuery: "broccoli cooked" },
    { name: "broccoli", quantity: 1, knowledgeQuery: "broccoli cooked" },
  ] } };
  const enriched = enrichNutritionWithEvidence(extraction, bundle);
  const items = (enriched.result.extractedData as Record<string, unknown>).items as Array<Record<string, unknown>>;
  assertEquals(items[0].protein_grams, 9);
  assertEquals(items[0].carbohydrate_grams, 10.8);
  assertEquals(items[1].protein_grams, undefined);
});
