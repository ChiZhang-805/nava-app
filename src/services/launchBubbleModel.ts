export type BubblePhase = "idle" | "splitting" | "separated" | "merging" | "settling";

export const BUBBLE_ENERGY_THRESHOLD = 2.25;

export const BUBBLE_PHASE_DURATION_MS: Record<Exclude<BubblePhase, "idle">, number> = {
  splitting: 1050,
  separated: 1100,
  merging: 1800,
  settling: 760,
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smootherStep(value: number) {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function gestureEnergy(distancePx: number, peakVelocityPxPerSecond: number) {
  const distanceContribution = Math.max(0, distancePx) / 270;
  const velocityContribution = Math.max(0, peakVelocityPxPerSecond) / 5200;
  return clamp(distanceContribution + velocityContribution, 0.08, 1.05);
}

export function bubbleSplitAmount(phase: BubblePhase, elapsedMs: number) {
  if (phase === "idle" || phase === "settling") return 0;
  if (phase === "separated") return 1;

  const duration = BUBBLE_PHASE_DURATION_MS[phase];
  const progress = smootherStep(elapsedMs / duration);
  return phase === "splitting" ? progress : 1 - progress;
}

export function nextBubblePhase(phase: BubblePhase): BubblePhase {
  if (phase === "splitting") return "separated";
  if (phase === "separated") return "merging";
  if (phase === "merging") return "settling";
  return "idle";
}
