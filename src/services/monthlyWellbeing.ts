import type { MoodRecord, SleepRecord } from "../types";

export function monthDates(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, m] = month.split("-").map(Number);
  const count = new Date(year, m, 0, 12).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function monthlyWellbeing(module: "mood" | "sleep", rows: Array<MoodRecord | SleepRecord>, month: string, today: string) {
  const dates = monthDates(month);
  const allowed = new Set(dates.filter((date) => date <= today));
  const byDate = new Map<string, MoodRecord | SleepRecord>();
  // Duplicate imports count once per local date, preferring the most recently updated row.
  [...rows].sort((a, b) => (a.updated_at ?? a.created_at ?? a.id).localeCompare(b.updated_at ?? b.created_at ?? b.id))
    .forEach((row) => { if (allowed.has(row.record_date)) byDate.set(row.record_date, row); });
  const points = dates.map((date) => {
    const row = byDate.get(date);
    const raw = module === "mood" ? (row as MoodRecord | undefined)?.mood_score : (row as SleepRecord | undefined)?.sleep_duration_minutes;
    const valid = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= (module === "mood" ? 100 : 1440);
    return { id: date, label: String(Number(date.slice(-2))), value: valid ? raw : 0, missing: !valid };
  });
  const validPoints = points.filter((point) => !point.missing);
  const factorDays = new Map<string, number>();
  if (module === "mood") validPoints.forEach((point) => {
    const row = byDate.get(point.id) as MoodRecord;
    [...new Set((row.factors ?? []).map((factor) => factor.trim()).filter(Boolean))].forEach((factor) => factorDays.set(factor, (factorDays.get(factor) ?? 0) + 1));
  });
  return {
    points,
    records: [...byDate.values()].sort((a, b) => b.record_date.localeCompare(a.record_date)),
    count: validPoints.length,
    average: validPoints.length ? validPoints.reduce((sum, point) => sum + point.value, 0) / validPoints.length : null,
    factors: [...factorDays].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
