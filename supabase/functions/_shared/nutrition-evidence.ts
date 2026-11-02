import type { KnowledgeBundle, KnowledgeEvidence } from "./knowledge-tools.ts";

type RecordValue = Record<string, unknown>;

export function enrichNutritionWithEvidence(extraction: RecordValue, knowledge: KnowledgeBundle) {
  const usedToolIds = new Set<string>();
  const result = enrichExtraction(extraction, knowledge.evidence, usedToolIds);
  return { result, usedToolIds: [...usedToolIds] };
}

function enrichExtraction(extraction: RecordValue, evidence: KnowledgeEvidence[], used: Set<string>): RecordValue {
  const dataType = text(extraction.dataType ?? extraction.data_type);
  const extractedData = record(extraction.extractedData ?? extraction.extracted_data);
  if (!extractedData) return extraction;
  if (dataType === "nutrition") return { ...extraction, extractedData: enrichNutrition(extractedData, evidence, used) };
  if (dataType !== "multi" || !Array.isArray(extractedData.records)) return extraction;
  return {
    ...extraction,
    extractedData: {
      ...extractedData,
      records: extractedData.records.map((value) => {
        const row = record(value);
        if (!row || text(row.dataType ?? row.data_type) !== "nutrition") return value;
        const data = record(row.extractedData ?? row.extracted_data);
        return data ? { ...row, extractedData: enrichNutrition(data, evidence, used) } : value;
      }),
    },
  };
}

function enrichNutrition(data: RecordValue, evidence: KnowledgeEvidence[], used: Set<string>) {
  if (!Array.isArray(data.items)) return data;
  const items = data.items.map((value) => {
    const item = record(value);
    if (!item) return value;
    const match = bestEvidence(item, evidence);
    if (!match) return item;
    const facts = match.facts;
    const isUsda = match.toolId === "usda_fooddata_central";
    const weight = positive(item.weight_grams ?? item.weightGrams);
    const quantity = positive(item.quantity) ?? positive(text(item.amount)?.match(/[\d.]+/)?.[0]) ?? 1;
    const referenceCalories = nonNegative(facts.caloriesKcal);
    const itemCalories = nonNegative(item.calories);
    const factor = isUsda
      ? (weight == null ? null : weight / 100)
      : itemCalories != null && referenceCalories && itemCalories / referenceCalories >= .25 && itemCalories / referenceCalories <= 4
        ? itemCalories / referenceCalories
        : quantity;
    if (factor == null || !Number.isFinite(factor) || factor <= 0) return item;
    const next = { ...item };
    let changed = false;
    changed = fill(next, "calories", referenceCalories, factor) || changed;
    changed = fill(next, "protein_grams", nonNegative(facts.proteinG), factor, "proteinGrams") || changed;
    changed = fill(next, "carbohydrate_grams", nonNegative(facts.carbohydrateG), factor, "carbohydrateGrams") || changed;
    changed = fill(next, "fat_grams", nonNegative(facts.fatG), factor, "fatGrams") || changed;
    if (!changed) return item;
    used.add(match.toolId);
    next.estimated = true;
    next.estimationBasis = isUsda
      ? `USDA FoodData Central composition scaled to ${round(weight!)} g`
      : `NAVA common-serving reference (${text(facts.serving) ?? "matched serving"}) scaled to the estimated portion`;
    next.nutritionSource = match.toolId;
    return next;
  });
  const next: RecordValue = { ...data, items };
  const totals = [
    ["totalCalories", "calories"],
    ["proteinGrams", "protein_grams"],
    ["carbohydrateGrams", "carbohydrate_grams"],
    ["fatGrams", "fat_grams"],
  ] as const;
  for (const [target, source] of totals) {
    if (nonNegative(next[target]) != null) continue;
    const values = items.map((value) => nonNegative(record(value)?.[source]));
    if (values.length && values.every((value): value is number => value != null)) next[target] = round(values.reduce((sum, value) => sum + value, 0));
  }
  if (nonNegative(next.calories) == null && nonNegative(next.totalCalories) != null) next.calories = next.totalCalories;
  return next;
}

function bestEvidence(item: RecordValue, evidence: KnowledgeEvidence[]) {
  const name = normalized(text(item.name) ?? "");
  const query = normalized(text(item.knowledgeQuery ?? item.knowledge_query ?? item.searchQuery) ?? "");
  const weight = positive(item.weight_grams ?? item.weightGrams);
  return evidence
    .filter((value) => value.domain === "nutrition")
    .map((value) => {
      const evidenceQuery = normalized(value.query ?? "");
      const foodName = normalized(text(value.facts.foodName ?? value.facts.description) ?? "");
      let score = query && evidenceQuery && (query === evidenceQuery || query.includes(evidenceQuery) || evidenceQuery.includes(query)) ? 5 : 0;
      if (name && foodName && (name.includes(foodName) || foodName.includes(name))) score = Math.max(score, 4);
      if (name && evidenceQuery && tokens(evidenceQuery).some((token) => token.length > 2 && name.includes(token))) score = Math.max(score, 2);
      if (value.toolId === "nava_common_food_reference" && weight == null) score += 1;
      if (value.toolId === "usda_fooddata_central" && weight != null) score += 1;
      return { value, score };
    })
    .filter(({ score }) => score >= 4)
    .sort((left, right) => right.score - left.score)[0]?.value;
}

function fill(target: RecordValue, key: string, reference: number | null, factor: number, alias?: string) {
  if (nonNegative(target[key]) != null || (alias && nonNegative(target[alias]) != null) || reference == null) return false;
  target[key] = round(reference * factor);
  return true;
}

function record(value: unknown): RecordValue | null { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nonNegative(value: unknown) { const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(number) && number >= 0 ? number : null; }
function positive(value: unknown) { const number = nonNegative(value); return number != null && number > 0 ? number : null; }
function round(value: number) { return Math.round(value * 10) / 10; }
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); }
function tokens(value: string) { return value.toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).filter(Boolean); }
