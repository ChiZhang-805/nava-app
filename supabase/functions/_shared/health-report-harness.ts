export type HealthAssociation = {
  domains: [string, string];
  overlapDays: number;
  periodDates: string[];
  correlation: number;
  direction: "flat" | "same_direction" | "opposite_direction";
  strength: "weak" | "moderate" | "strong";
  confidence: "low" | "medium";
};

export function calculateHealthAssociations(
  series: Record<string, Array<Record<string, unknown>>>,
  requiredDomain?: string,
) {
  const dailySeries = Object.fromEntries(Object.entries(series).map(([domain, rows]) => [domain, domainValues(domain, rows)]));
  const domains = Object.keys(dailySeries);
  const results: HealthAssociation[] = [];
  for (let leftIndex = 0; leftIndex < domains.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < domains.length; rightIndex += 1) {
      const left = domains[leftIndex];
      const right = domains[rightIndex];
      if (requiredDomain && left !== requiredDomain && right !== requiredDomain) continue;
      const leftValues = dailySeries[left];
      const rightValues = dailySeries[right];
      const dates = [...leftValues.keys()].filter((date) => rightValues.has(date));
      if (dates.length < 3) continue;
      const correlation = pearson(
        dates.map((date) => leftValues.get(date) ?? 0),
        dates.map((date) => rightValues.get(date) ?? 0),
      );
      if (correlation == null) continue;
      const magnitude = Math.abs(correlation);
      results.push({
        domains: [left, right],
        overlapDays: dates.length,
        periodDates: dates,
        correlation: Math.round(correlation * 100) / 100,
        direction: magnitude < 0.2 ? "flat" : correlation > 0 ? "same_direction" : "opposite_direction",
        strength: magnitude >= 0.65 ? "strong" : magnitude >= 0.35 ? "moderate" : "weak",
        // A seven-day observational window is never promoted to high confidence.
        confidence: dates.length >= 5 && magnitude >= 0.35 ? "medium" : "low",
      });
    }
  }
  return {
    method: "Pearson correlation on same-date recorded observations",
    interpretation: "descriptive co-variation only; never causal",
    minimumOverlapDays: 3,
    results: results.sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation)).slice(0, 5),
  };
}

function domainValues(domain: string, rows: Array<Record<string, unknown>>) {
  const values = new Map<string, number>();
  rows.forEach((row) => {
    const date = String(row.record_date ?? "");
    const candidate = domain === "rhythm"
      ? row.score
      : domain === "mood"
        ? row.mood_score
        : domain === "sleep"
          ? row.rhythm_score ?? row.sleep_duration_minutes
          : domain === "exercise"
            ? row.steps ?? row.exercise_minutes
            : domain === "nutrition"
              ? row.health_rating ?? row.total_calories
              : domain === "focus"
                ? row.total_minutes
                : domain === "face"
                  ? row.overall_score
                  : null;
    const parsed = Number(candidate);
    if (date && Number.isFinite(parsed)) values.set(date, parsed);
  });
  return values;
}

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  left.forEach((value, index) => {
    const leftDelta = value - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  });
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : null;
}
