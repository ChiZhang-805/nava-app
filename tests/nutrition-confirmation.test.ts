import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("nutrition recognition uses meal and per-food hierarchy instead of the generic flat field list", () => {
  const screen = readFileSync("src/features/AIScreen.tsx", "utf8");
  const component = readFileSync("src/components/NutritionStructuredConfirmation.tsx", "utf8");

  assert.match(screen, /record\.type === "nutrition"[\s\S]*<NutritionStructuredConfirmation/);
  assert.match(component, /className="nutrition-meal-heading"/);
  assert.match(component, /className="nutrition-result-close"/);
  assert.match(component, /items\.map\(\(item, index\)/);
  assert.match(component, /className="nutrition-result-item"/);
  assert.match(component, /className="nutrition-meal-total"/);
  assert.match(screen, /path: `items\.\$\{index\}\.amount`/);
  for (const label of ["早餐", "份量", "碳水", "蛋白质", "脂肪", "总计"]) assert.match(component, new RegExp(label));
  assert.doesNotMatch(component, /structured-field-list/);
  assert.doesNotMatch(component, /AI 识别|AI recognized/);
  assert.doesNotMatch(component, /<time>/);
  assert.doesNotMatch(screen, /照片只提供估算|Photo values are estimates/);
  assert.match(screen, /pendingEntry\.type !== "nutrition"[\s\S]*<Check size=\{18\}/);
});

test("unknown item nutrients stay unknown rather than becoming invented zeroes", () => {
  const component = readFileSync("src/components/NutritionStructuredConfirmation.tsx", "utf8");
  assert.match(component, /if \(value == null \|\| \(typeof value === "string" && !value\.trim\(\)\)\) return null/);
  assert.match(component, /if \(parsed == null\) return "—"/);
  assert.doesNotMatch(component, /carbohydrate_grams[^\n]+\?\?\s*0/);
  assert.doesNotMatch(component, /protein_grams[^\n]+\?\?\s*0/);
  assert.doesNotMatch(component, /fat_grams[^\n]+\?\?\s*0/);
});
