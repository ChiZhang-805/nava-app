type SleepRecord = { record_date?: unknown; sleep_start?: unknown; sleep_end?: unknown };

const minutesPerDay = 24 * 60;
const millisecondsPerDay = 86_400_000;

function clockMinutes(value: unknown) {
  const clock = typeof value === "string" ? /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value) : null;
  if (!clock) return null;
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function clockDistance(a: number, b: number) {
  const distance = Math.abs(a - b);
  return Math.min(distance, minutesPerDay - distance);
}

function medianMinutes(values: number[]) {
  const sorted = values.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round((sorted[middle] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2);
}

export function summarizeWeeklySleepTiming(rows: SleepRecord[]) {
  const nights = new Map<number, { wake: number; midpoint: number }>();
  for (const row of rows) {
    if (typeof row.record_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.record_date)) continue;
    const date = Date.parse(`${row.record_date}T00:00:00Z`);
    const start = clockMinutes(row.sleep_start);
    const wake = clockMinutes(row.sleep_end);
    if (!Number.isFinite(date) || start === null || wake === null || start === wake) continue;
    const span = (wake - start + minutesPerDay) % minutesPerDay;
    nights.set(date, { wake, midpoint: (start + span / 2) % minutesPerDay });
  }
  const midpointShifts: number[] = [];
  const wakeShifts: number[] = [];
  for (const [date, night] of nights) {
    const previous = nights.get(date - millisecondsPerDay);
    if (!previous) continue;
    midpointShifts.push(clockDistance(night.midpoint, previous.midpoint));
    wakeShifts.push(clockDistance(night.wake, previous.wake));
  }
  const adjacentNightPairs = midpointShifts.length;
  return {
    nightsWithTiming: nights.size,
    adjacentNightPairs,
    medianSleepMidpointShiftMinutes: adjacentNightPairs >= 2 ? medianMinutes(midpointShifts) : null,
    medianWakeTimeShiftMinutes: adjacentNightPairs >= 2 ? medianMinutes(wakeShifts) : null,
  };
}
