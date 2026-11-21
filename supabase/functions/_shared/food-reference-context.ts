/** Bounded reference retrieval shared by the two food-photo endpoints. */
type Reference = {
  fdc_id: number; description: string; calories_kcal: number | null;
  protein_g: number | null; carbohydrate_g: number | null; fat_g: number | null;
  portions: unknown;
};
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

const aliases: Array<[RegExp, string[]]> = [
  [/排骨汤|排骨/, ['pork ribs', 'soup broth', 'radish', 'corn cooked']],
  [/麻辣烫|火锅/, ['beef', 'tofu', 'noodles cooked', 'soup broth', 'vegetable oil']],
  [/牛排/, ['beef steak']], [/烤鸡/, ['chicken roasted']],
  [/炸鸡|鸡腿/, ['chicken drumstick fried coated']],
  [/披萨|比萨/, ['pizza pepperoni']], [/意面|意大利面/, ['pasta tomato sauce']],
  [/鸡蛋|炒蛋/, ['egg scrambled']], [/虾/, ['shrimp cooked']],
  [/包菜|卷心菜/, ['cabbage green cooked']], [/青菜/, ['cabbage chinese cooked']],
  [/番茄|西红柿/, ['tomatoes']], [/胡萝卜/, ['carrots cooked']],
  [/黄瓜/, ['cucumber']], [/豆腐/, ['tofu']], [/米饭/, ['rice white cooked']],
];

export function foodReferenceQueries(text: string): string[] {
  // Only current user text, never client system prompts or example outputs.
  const result = aliases.filter(([pattern]) => pattern.test(text)).flatMap(([, terms]) => terms);
  const english = text.match(/[a-zA-Z][a-zA-Z ,'-]{2,119}/g) ?? [];
  return [...new Set([...result, ...english.map(s => s.trim())])].slice(0, 12);
}

export function foodReferencePrompt(rows: Reference[]): string {
  if (!rows.length) return '';
  const compact = rows.slice(0, 40).map(r => ({
    id: r.fdc_id, food: r.description,
    kcal: r.calories_kcal, protein: r.protein_g, carbs: r.carbohydrate_g, fat: r.fat_g,
    portions: Array.isArray(r.portions) ? r.portions.slice(0, 2) : [],
  }));
  return '\nUSDA FNDDS 2021–2023 REFERENCE DATA (public-domain, released 2024-10-31):\n'
    + 'All kcal and macros below are PER 100 GRAMS EDIBLE FOOD; macros are grams. Portion weights are grams, not nutrition totals. '
    + 'Use only relevant food and cooking-method matches; these rows do NOT identify what is in the photo. '
    + 'Scale by the estimated/stated edible portion / 100. Null means unavailable, never zero. '
    + 'Generic US recipes are not exact Chinese dishes or brand formulas. For mixed Chinese dishes, soup or hotpot, use suitable components, actual eaten solids/broth, and oil/sauce estimates; avoid double counting oil already included in a cooked reference. '
    + 'Do not name ingredients as separate dishes. Do not claim the database measured this meal.\n'
    + JSON.stringify(compact);
}

export async function loadFoodReferenceContext(client: Client, text = '', timeoutMs = 2000): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      Promise.resolve(client.rpc('nava_food_reference_search', { p_queries: foodReferenceQueries(text), p_limit: 32 })),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!response || response.error || !Array.isArray(response.data)) return '';
    return foodReferencePrompt(response.data as Reference[]);
  } catch {
    // Reference availability must not prevent the existing vision estimate.
    return '';
  } finally { if (timer) clearTimeout(timer); }
}
