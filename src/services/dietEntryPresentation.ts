import type { FoodItem } from "../types";

function cleanDishName(value: string) {
  return value.trim().replace(/^\s*(?:\d+\s*[.、．)]\s*)+/, "").trim();
}

export function formatDetectedDishList(items: Pick<FoodItem, "name">[]) {
  const names = items.map((item) => cleanDishName(item.name)).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  return names.map((name, index) => `${index + 1}. ${name}`).join("\n");
}

export function estimatedFoodLabel(name: string, locale: "zh" | "en") {
  return locale === "zh" ? `${name}（估算）` : `${name} (estimate)`;
}
