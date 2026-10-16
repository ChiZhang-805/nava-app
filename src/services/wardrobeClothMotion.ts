import type { WardrobeMascotMotion } from "./wardrobeMascotMotion";

export const wardrobeClothTargets = ["cloth_relax", "cloth_lift"] as const;
export type WardrobeClothPose = Record<typeof wardrobeClothTargets[number], number>;

const strength: Record<WardrobeMascotMotion, readonly [number, number]> = {
  bubble: [.65, .45],
  starlight: [1, .8],
  blossom: [.4, .28],
  snowfall: [.75, .55],
};

// These are small, authored cloth bends, fitted together with every stacking
// layer. Both position and velocity settle to zero at the action boundaries.
export function sampleWardrobeClothMotion(motion: WardrobeMascotMotion | null, progress: number): WardrobeClothPose {
  const at = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (!motion || at === 0 || at === 1) return { cloth_relax: 0, cloth_lift: 0 };
  const envelope = Math.sin(Math.PI * at) ** 2;
  const [relax, lift] = strength[motion];
  return {
    cloth_relax: relax * envelope * (.45 + .55 * (.5 + .5 * Math.sin(2 * Math.PI * at - .4))),
    cloth_lift: lift * envelope * (.65 + .35 * Math.sin(Math.PI * at + .6) ** 2),
  };
}
