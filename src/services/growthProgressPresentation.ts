export type GrowthProgressVisit = {
  isFirstVisit: boolean;
  previousPoints: number;
  currentPoints: number;
  delta: number;
  currentTaskKeys: string[];
  newTaskKeys: string[];
};

export function growthTaskIdFromProgressKey(key: string) {
  const parts = key.split(":");
  return parts[parts.length - 1] ?? key;
}

export function growthNewTaskIds(visit: GrowthProgressVisit) {
  return [...new Set(visit.newTaskKeys.map(growthTaskIdFromProgressKey).filter(Boolean))];
}

export function shouldAnimateGrowthVisit(visit: GrowthProgressVisit) {
  return !visit.isFirstVisit && visit.delta > 0 && visit.currentPoints > visit.previousPoints;
}

export function growthCounterValue(previousPoints: number, currentPoints: number, progress: number) {
  const bounded = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - bounded, 3);
  return Math.min(currentPoints, Math.round(previousPoints + (currentPoints - previousPoints) * eased));
}

