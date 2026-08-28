export type MoodBand = {
  key: "bright" | "calm" | "neutral" | "tired" | "low";
  min: number;
  max: number;
  score: number;
  zh: string;
  en: string;
};

export const moodBands: MoodBand[] = [
  { key: "bright", min: 81, max: 100, score: 90, zh: "愉悦", en: "Bright" },
  { key: "calm", min: 61, max: 80, score: 70, zh: "平静", en: "Calm" },
  { key: "neutral", min: 41, max: 60, score: 50, zh: "一般", en: "Neutral" },
  { key: "tired", min: 21, max: 40, score: 30, zh: "疲惫", en: "Tired" },
  { key: "low", min: 0, max: 20, score: 10, zh: "低落", en: "Low" },
];

export function clampMoodScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function moodBandForScore(score: number) {
  const normalized = clampMoodScore(score);
  return moodBands.find((band) => normalized >= band.min && normalized <= band.max) ?? moodBands[moodBands.length - 1];
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function moodDateWindow(endDate: string, days = 7) {
  const end = parseDateKey(endDate);
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return formatDateKey(date);
  });
}

export function isCompleteMoodRecord(record: { factors?: string[] | null; diary_content?: string | null } | null | undefined) {
  return Boolean(record && Array.isArray(record.factors) && record.factors.length > 0 && record.diary_content?.trim());
}
