/** Angles are cyclic; the same neutral pose is used at either side of the seam. */
export function normalizeWardrobeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle % 360) + 360) % 360;
  return wrapped < 1e-8 || 360 - wrapped < 1e-8 ? 0 : wrapped;
}

export function wardrobeDragAngle(start: number, distance: number, width: number): number {
  const travel = Math.sign(distance) * Math.max(0, Math.abs(distance) - 6);
  return normalizeWardrobeAngle(start + travel / Math.max(1, width) * 324);
}

// Fur, edge, paws, face: the original navy face stays distinct from warm paws.
// Variants share sculpt/UVs/camera; white eye and nose strokes keep their texture.
export const wardrobeFurPalettes = {
  "skin-cream": ["#ffffff", "#a4dce9", "#092a49", "#092a49"],
  "skin-warm-orange": ["#fff4df", "#f47832", "#c93706", "#011c37"],
  "skin-night-ink": ["#14265a", "#4667d8", "#030919", "#01030a"],
  "skin-mist-gray": ["#edf2f5", "#a5b7c6", "#082641", "#021d35"],
  "skin-cherry-blossom": ["#fff6fa", "#efaec9", "#07254b", "#042242"],
  "skin-lake-blue": ["#f4fcff", "#68c9e7", "#013160", "#01284d"],
  "skin-mint-mist": ["#f3fff9", "#9bd9c9", "#032642", "#02253f"],
  "skin-honey-gold": ["#fff9e6", "#d99b39", "#031c33", "#021a31"],
  "skin-lavender-cloud": ["#faf6ff", "#bda7e7", "#09214e", "#031b3f"],
  "skin-mica-silver": ["#f7fbff", "#b6c7df", "#0d2341", "#031936"],
  "skin-forest-dew": ["#f6fbec", "#8fc9a4", "#012133", "#011d33"],
  "skin-sea-salt": ["#f4fcff", "#8cc7e6", "#0d3058", "#072a4b"],
  "skin-milk-tea": ["#fcf4e8", "#c6aa8e", "#19202f", "#021c36"],
  "skin-coral-red": ["#fff4ee", "#f06f64", "#021836", "#021b3c"],
  "skin-moonlight-purple": ["#f1eafa", "#bca1e0", "#191766", "#051342"],
  "skin-aurora-teal": ["#ebfffb", "#4ec9c6", "#013255", "#01203d"],
  "skin-star-sand": ["#1e2026", "#9aa5bc", "#000711", "#000d22"],
} as const;
