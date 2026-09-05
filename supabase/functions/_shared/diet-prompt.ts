export function dietRecognitionPrompt(lang: string, meal?: string) {
  if (lang === "en") {
    return `You are NAVA's food-photo analyst. Inspect only visible food in this ${meal ?? "meal"} image. Identify prepared dishes and drinks at dish level: each items[] entry must represent one distinct dish or drink, not each ingredient visible inside that dish. For a visibly mixed dish such as a salad, keep it as one item and, only when useful and clearly visible, name it like "salad (visible ingredients: tomato, greens)". Do not split that salad into separate tomato and greens items. Do not enumerate ingredients for an ordinary recognizable item such as a hamburger unless a visible component is necessary to identify uncertainty. Use ordinary specific food names, estimate visible portion/weight and calories conservatively, and estimate protein, carbohydrate and fat. Never invent hidden ingredients. For enclosed foods such as dumplings, buns, pies, or rolls, never infer a filling that is not visibly exposed; use a neutral visible name and ask the user to confirm the filling in note. Likewise, do not guess whether an indistinguishable dark dipping liquid is soy sauce, vinegar, or another sauce; call it dark dipping sauce and request confirmation. If an item cannot be identified reliably, omit it and explain why in note. Return one JSON object only: {"items":[{"name":"","amount":"","weight_g":0,"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0,"confidence":0}],"totals":{"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0},"confidence":0,"note":""}. Confidence is 0..1; all other numbers are non-negative.`;
  }
  return `你是 NAVA 的饮食照片分析器。认真观察这张${mealLabel(meal)}照片，只识别画面中确实可见的食物和饮品。必须以“最终菜品或饮品”为识别粒度：items 数组中的每一项代表一道独立菜品或一种饮品，不能把同一道复合菜里看到的每种原料拆成不同项目。例如沙拉只能作为一项；确有帮助且配料清楚可见时，可写成“沙拉（可见配料：西红柿、青菜）”，不能另列“西红柿”和“青菜”。汉堡等普通用户一眼可理解的完整食物不必机械罗列原料，只有在说明可见的不确定性时才补充。使用普通用户看得懂的具体中文名称；结合餐盘、餐具和食物体积保守估算份量、克重、热量、蛋白质、碳水和脂肪。不要把多个明显不同的菜合并为“待确认餐食”，不要虚构看不见的配料。对于饺子、包子、馅饼、卷物等封闭食物，馅料没有清楚露出时不得猜测具体肉类或蔬菜，只能使用“水饺”等中性可见名称，并在 note 提醒用户确认馅料。对于仅凭照片无法区分的深色蘸料，不得猜成酱油或醋，应写“深色蘸料”并提醒用户确认。无法可靠判断时宁可省略并在 note 说明。只返回一个 JSON 对象，不要 Markdown：{"items":[{"name":"","amount":"","weight_g":0,"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0,"confidence":0}],"totals":{"calories":0,"protein_g":0,"carbohydrate_g":0,"fat_g":0},"confidence":0,"note":""}。confidence 范围 0 到 1，其余数字不得为负数。`;
}

export function dietRecognitionRequest(lang: string, meal?: string, date?: string) {
  if (lang === "en") return `Analyze this ${meal ?? "meal"} photo${date ? ` for ${date}` : ""}. Return JSON only.`;
  return `分析这张${mealLabel(meal)}照片${date ? `，记录日期为 ${date}` : ""}。只返回 JSON。`;
}

function mealLabel(meal?: string) {
  if (meal === "breakfast") return "早餐";
  if (meal === "dinner") return "晚餐";
  if (meal === "pantry") return "加餐";
  return "午餐";
}
