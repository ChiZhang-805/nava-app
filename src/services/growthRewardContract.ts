/** Device-zone name is resolved again at the operation boundary (travel/DST).
 * The database derives the day from its own clock, not an arbitrary client date. */
export function growthRewardTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isMissingGrowthRpc(error: { code?: string } | null) {
  return error?.code === "PGRST202";
}

export function journalGrowthTargets(records: Array<{ category: string; data: Record<string, unknown> }>, legacyFocusMinutes = 0) {
  const targets = new Set<string>();
  let focus = Math.max(0, legacyFocusMinutes);
  for (const record of records) {
    const { category, data } = record;
    if (["mood", "sleep", "face"].includes(category)) targets.add(category);
    if (category === "food") targets.add("nutrition");
    if (category === "sport" && Number(data.durationMinutes) >= 20) targets.add("exercise");
    if (category === "focus") {
      const minutes = Number(data.durationMinutes);
      if (Number.isFinite(minutes) && minutes > 0) focus += minutes;
    }
  }
  if (focus >= 25) targets.add("focus");
  return targets;
}
