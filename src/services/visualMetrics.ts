import type {
  DailyRhythmScore,
  ExerciseRecord,
  HealthMetricSnapshot,
  SleepRecord,
} from "../types";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback = 0) {
  const parsed = typeof value === "string" ? Number(value.replace("%", "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clockMinutes(value?: string | null) {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizedBedtime(value?: string | null) {
  const minutes = clockMinutes(value);
  if (minutes == null) return null;
  return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function meanAbsoluteDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const center = average(values);
  return average(values.map((value) => Math.abs(value - center)));
}

export function sleepTimelineGeometry(start?: string | null, end?: string | null, durationMinutes?: number | null) {
  const startMinutes = clockMinutes(start);
  const endMinutes = clockMinutes(end);
  let duration = finite(durationMinutes, 0);
  if (!duration && startMinutes != null && endMinutes != null) {
    duration = endMinutes - startMinutes;
    if (duration <= 0) duration += 24 * 60;
  }
  const width = clamp((duration / (10 * 60)) * 100, duration > 0 ? 24 : 0, 100);
  return {
    durationMinutes: Math.round(duration),
    leftPercent: Number(((100 - width) / 2).toFixed(2)),
    widthPercent: Number(width.toFixed(2)),
  };
}

export function sleepStageHeights(stages: number[]) {
  const safe = stages.map((value) => Math.max(0, finite(value)));
  if (safe.every((value) => value === 0)) return safe.map(() => 0);
  const maximum = Math.max(1, ...safe);
  return safe.map((value) => Math.round(38 + (value / maximum) * 58));
}

export function clockAlignmentScore(sleeps: SleepRecord[], rhythms: DailyRhythmScore[]) {
  const recentSleeps = [...sleeps].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-7);
  const bedtimes = recentSleeps.map((record) => normalizedBedtime(record.sleep_start)).filter((value): value is number => value != null);
  const durations = recentSleeps.map((record) => finite(record.sleep_duration_minutes, 0)).filter((value) => value > 0);
  const rhythmValues = [...rhythms].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-7).map((record) => finite(record.score, 0)).filter((value) => value > 0);
  if (bedtimes.length === 0 && durations.length === 0) return Math.round(average(rhythmValues));
  const timingPenalty = Math.min(34, meanAbsoluteDeviation(bedtimes) / 2.4);
  const durationPenalty = Math.min(22, meanAbsoluteDeviation(durations) / 4.5);
  const regularity = clamp(100 - timingPenalty - durationPenalty, 0, 100);
  return Math.round(rhythmValues.length ? regularity * 0.68 + average(rhythmValues) * 0.32 : regularity);
}

function snapshotHourlyActivity(snapshot?: HealthMetricSnapshot) {
  const bins = Array.isArray(snapshot?.activity_bins) ? snapshot.activity_bins : [];
  if (bins.length === 0) return [];
  const values = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  bins.forEach((bin) => {
    const hour = Math.round(finite(bin.hour, -1));
    if (hour < 0 || hour > 23) return;
    values[hour].value += Math.max(0, finite(bin.steps, 0)) + Math.max(0, finite(bin.exerciseMinutes, 0)) * 90;
  });
  return values;
}

export function activityPeriodDistribution(healthMetrics: HealthMetricSnapshot[], exercises: ExerciseRecord[]) {
  void exercises;
  const sortedHealth = [...healthMetrics].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const latestHealth = [...sortedHealth].reverse().find((item) => Array.isArray(item.activity_bins) && item.activity_bins.length > 0);
  const hourly = snapshotHourlyActivity(latestHealth);
  if (hourly.length === 0) return ["0–6", "6–12", "12–18", "18–24"].map((label) => ({ label, value: 0, heightPercent: 0, active: false }));
  const values = [0, 1, 2, 3].map((period) => hourly
    .slice(period * 6, period * 6 + 6)
    .reduce((sum, item) => sum + item.value, 0));
  const maximum = Math.max(1, ...values);
  return values.map((value, index) => ({
    label: ["0–6", "6–12", "12–18", "18–24"][index],
    value: Math.round(value),
    heightPercent: Math.round(24 + (value / maximum) * 72),
    active: value >= maximum * 0.55,
  }));
}

export type ActivityHeatCell = {
  id: string;
  date: string;
  period: number;
  value: number;
  intensity: number;
};

export function activityHeatmap(healthMetrics: HealthMetricSnapshot[], exercises: ExerciseRecord[]) {
  const healthByDate = new Map(healthMetrics.map((item) => [item.record_date, item]));
  void exercises;
  const dates = [...healthByDate.values()]
    .filter((item) => Array.isArray(item.activity_bins) && item.activity_bins.length > 0)
    .map((item) => item.record_date)
    .sort()
    .slice(-7);
  const raw = dates.flatMap((date) => {
    const hourly = snapshotHourlyActivity(healthByDate.get(date));
    return Array.from({ length: 12 }, (_, period) => ({
      id: `${date}-${period}`,
      date,
      period,
      value: hourly.slice(period * 2, period * 2 + 2).reduce((sum, item) => sum + item.value, 0),
    }));
  });
  if (raw.length === 0) return { cells: [], peakStartHour: 0, peakEndHour: 0 };
  const maximum = Math.max(1, ...raw.map((item) => item.value));
  const cells: ActivityHeatCell[] = raw.map((item) => ({
    ...item,
    intensity: Number(clamp(0.12 + (item.value / maximum) * 0.88, 0.12, 1).toFixed(3)),
  }));
  const periodAverages = Array.from({ length: 12 }, (_, period) => average(cells.filter((cell) => cell.period === period).map((cell) => cell.value)));
  const peakPeriod = periodAverages.indexOf(Math.max(...periodAverages));
  const startHour = peakPeriod * 2;
  return {
    cells,
    peakStartHour: startHour,
    peakEndHour: (startHour + 2) % 24,
  };
}

export function latestVitals(healthMetrics: HealthMetricSnapshot[], exercises: ExerciseRecord[], rhythms: DailyRhythmScore[]) {
  const sortedMetrics = [...healthMetrics].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const sortedExercises = [...exercises].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const sortedRhythms = [...rhythms].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const metric = sortedMetrics[sortedMetrics.length - 1];
  const exercise = sortedExercises[sortedExercises.length - 1];
  const rhythm = sortedRhythms[sortedRhythms.length - 1];
  const heartRate = Math.round(finite(metric?.resting_heart_rate ?? metric?.latest_heart_rate ?? exercise?.heart_rate, 0));
  let bloodOxygen = finite(metric?.blood_oxygen ?? exercise?.spo2, 0);
  if (bloodOxygen > 0 && bloodOxygen <= 1.2) bloodOxygen *= 100;
  return {
    date: metric?.record_date ?? exercise?.record_date ?? null,
    heartRate: heartRate || null,
    bloodOxygen: bloodOxygen ? Math.round(bloodOxygen * 10) / 10 : null,
    recovery: rhythm?.score == null ? null : Math.round(rhythm.score),
  };
}
