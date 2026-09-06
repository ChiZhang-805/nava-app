export function watchActionDate(
  action: Record<string, unknown>,
  fallbackDate: string,
) {
  const localDate = typeof action.localDate === "string" ? action.localDate.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return localDate;

  for (const key of ["recordedAt", "startedAt", "endedAt"] as const) {
    const raw = action[key];
    if (typeof raw !== "string") continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return fallbackDate;
}

export function watchActionLocalHour(
  action: Record<string, unknown>,
  fallback = new Date(),
) {
  const rawTimestamp = typeof action.endedAt === "string"
    ? action.endedAt
    : typeof action.recordedAt === "string"
      ? action.recordedAt
      : typeof action.startedAt === "string"
        ? action.startedAt
        : null;
  const parsed = rawTimestamp ? new Date(rawTimestamp) : fallback;
  const timestamp = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  const rawOffset = action.timezoneOffsetMinutes;
  const offset = typeof rawOffset === "number" ? rawOffset : Number(rawOffset);
  if (Number.isFinite(offset) && Math.abs(offset) <= 14 * 60) {
    return new Date(timestamp.getTime() + offset * 60_000).getUTCHours();
  }
  return timestamp.getUTCHours();
}
