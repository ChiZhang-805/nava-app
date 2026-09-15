type StagePlan = { steps: string[]; plannedMinutes: number; stepSeconds?: number[] };

/** Explicit durations own new plans. Legacy labels are accepted only if their sum agrees. */
export function exerciseStageDurations(plan: StagePlan): number[] | null {
  const candidates = plan.stepSeconds ?? plan.steps.map((label) => {
    const match = label.match(/(?:·\s*)?(\d+(?:\.\d+)?)\s*(?:分钟|min)\s*$/i);
    return match ? Number(match[1]) * 60 : NaN;
  });
  if (!candidates.length || candidates.length !== plan.steps.length || candidates.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return Math.abs(candidates.reduce((sum, value) => sum + value, 0) - plan.plannedMinutes * 60) < 1 ? candidates : null;
}

export function exerciseStageAt(plan: StagePlan, elapsedSeconds: number) {
  const durations = exerciseStageDurations(plan);
  if (!durations) return null;
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  let start = 0;
  for (let index = 0; index < durations.length; index++) {
    const end = start + durations[index];
    if (elapsed < end) return { index, remaining: Math.ceil(end - elapsed), complete: false };
    start = end;
  }
  return { index: durations.length - 1, remaining: 0, complete: true };
}
