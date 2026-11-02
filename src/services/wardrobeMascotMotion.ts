export const wardrobeMascotMotions = [
  { id: "wave", clip: "paw_wave", label: { zh: "挥挥爪", en: "wave a paw" }, durationMs: 3200 },
  { id: "yarn", clip: "yarn_ball_play", label: { zh: "拨一拨毛线球", en: "play with a yarn ball" }, durationMs: 5000 },
  { id: "stretch", clip: "seated_stretch", label: { zh: "伸伸前爪", en: "stretch its forepaws" }, durationMs: 3500 },
] as const;
export type WardrobeMascotMotion = typeof wardrobeMascotMotions[number]["id"];
// Archived prop helpers use these ids; the wardrobe uses the GLB clips above.
export type LegacyWardrobeMascotMotion = "bubble" | "starlight" | "blossom" | "snowfall";
