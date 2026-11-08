import {
  foodVisualPrompt,
  foodVisualQualityThresholds,
  foodVisualSpecification,
} from "../_shared/food-visual-prompt.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("dish render prompt fixes the production asset contract", () => {
  const prompt = foodVisualPrompt({
    canonical_dish_name: "西红柿炒鸡蛋",
    visible_ingredients: ["西红柿", "鸡蛋"],
    appearance: "红黄相间的软嫩炒制状态",
    plating: "食材自然交叠",
    confidence: 0.96,
  });

  assert(foodVisualSpecification.width === 1024 && foodVisualSpecification.height === 1024, "canvas size changed");
  assert(foodVisualSpecification.background === "transparent", "background must remain transparent");
  assert(prompt.includes("西红柿炒鸡蛋") && prompt.includes("鸡蛋"), "evidence plan was omitted");
  assert(prompt.includes("white circular plate") && prompt.includes("90 degrees from above"), "plate view contract was omitted");
  assert(prompt.includes("Do not add ingredients") && prompt.includes("watermark"), "anti-invention rules were omitted");
});

Deno.test("dish render quality thresholds remain strict", () => {
  assert(foodVisualQualityThresholds.dishIdentityScore === 0.90, "dish identity threshold changed");
  assert(foodVisualQualityThresholds.visibleIngredientRecall === 0.85, "ingredient recall threshold changed");
  assert(foodVisualQualityThresholds.unexpectedIngredientScore === 0.05, "unexpected ingredient threshold changed");
  assert(foodVisualQualityThresholds.artifactScore === 0.06, "artifact threshold changed");
});

Deno.test("critic feedback is bounded to a retry instruction", () => {
  const prompt = foodVisualPrompt({ canonical_dish_name: "烤鸡" }, "plate rim was cropped");
  assert(prompt.includes("Correct these rejected-candidate problems: plate rim was cropped"), "retry feedback missing");
  assert(prompt.includes("faithful visual reconstruction"), "feedback displaced the evidence-preservation contract");
});
