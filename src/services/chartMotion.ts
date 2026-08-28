export function clampChartPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function chartBarMotion(index: number, value: number, maxValue: number) {
  const ratio = maxValue > 0 ? clampChartPercent((value / maxValue) * 100) / 100 : 0;
  const valueVariation = Math.round(ratio * 190);
  const indexVariation = (index * 73) % 170;
  return {
    delayMs: 90 + index * 58,
    durationMs: 560 + valueVariation + indexVariation,
  };
}

export function chartSequenceEnd(points: Array<{ value: number }>) {
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  return points.reduce((latest, point, index) => {
    const motion = chartBarMotion(index, point.value, maxValue);
    return Math.max(latest, motion.delayMs + motion.durationMs);
  }, 0);
}
