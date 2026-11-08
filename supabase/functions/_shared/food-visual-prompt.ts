export const foodVisualPromptVersion = "nava-food-visual-v1";

export const foodVisualSpecification = {
  width: 1024,
  height: 1024,
  output_format: "png",
  background: "transparent",
  camera: "orthographic-looking 90 degree top-down",
  plate: "plain matte white round plate, entire rim visible",
  plate_canvas_coverage: "72-82%",
  safe_margin: "6-14% on every edge",
  forbidden: ["table", "scene background", "hands", "utensils", "text", "logo", "watermark", "cropped plate", "invented garnish"],
} as const;

export function foodVisualPrompt(plan: Record<string, unknown>, criticFeedback?: string) {
  return [
    "Create a photorealistic standardized product image of the prepared dish in the reference photo.",
    "This is a faithful visual reconstruction, not a redesign. Preserve the dish identity, visible ingredients, colors, textures, cooking state, and relative arrangement supported by the reference.",
    `Evidence-bound visual plan: ${JSON.stringify(plan)}.`,
    "Use one plain matte white circular plate, viewed exactly 90 degrees from above. The entire plate rim must be visible and centered.",
    "Return a 1024x1024 PNG with true transparent background outside the plate. Plate plus food should occupy 72-82% of the canvas and keep 6-14% clear margin on all sides.",
    "Do not add ingredients, garnish, sauces, props, table, hands, utensils, text, labels, logos, watermark, or decorative background. Do not crop the plate or cast shadows beyond the plate.",
    criticFeedback ? `Correct these rejected-candidate problems: ${criticFeedback}` : "",
  ].filter(Boolean).join("\n");
}

export const foodVisualQualityThresholds = {
  dishIdentityScore: 0.90,
  visibleIngredientRecall: 0.85,
  unexpectedIngredientScore: 0.05,
  artifactScore: 0.06,
} as const;
