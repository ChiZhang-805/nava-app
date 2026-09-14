import type { TrendBundle } from "../types";
import type { UserProfile } from "./profile";
import { onboardingAnswers, resolveConsentFlag } from "./consent.ts";

export type FocusHealthEvidence = {
  domain: "sleep" | "mood" | "exercise";
  date: string;
  value: number;
  unit: "minutes" | "score" | "steps";
};

export function selectFocusHealthEvidence(
  bundle: TrendBundle | null,
  profile: UserProfile | null,
  deviceDate: string,
): FocusHealthEvidence[] {
  const answers = onboardingAnswers(profile?.onboarding_answers);
  if (!bundle || !resolveConsentFlag(profile?.ai_personalization_consent, answers?.aiPersonalizationConsent)) return [];
  const end = /^\d{4}-\d{2}-\d{2}$/.test(deviceDate) ? deviceDate : "";
  if (!end) return [];
  const startDay = new Date(`${end}T00:00:00Z`);
  startDay.setUTCDate(startDay.getUTCDate() - 6);
  const start = startDay.toISOString().slice(0, 10);
  const recent = <T extends { record_date: string }>(rows: T[]) => rows
    .filter((row) => row.record_date >= start && row.record_date <= end)
    .slice().sort((a, b) => b.record_date.localeCompare(a.record_date));
  const evidence: FocusHealthEvidence[] = [];
  const sleep = recent(bundle.sleeps).find((row) => finite(row.sleep_duration_minutes, 1, 1440) != null);
  if (sleep) evidence.push({ domain: "sleep", date: sleep.record_date, value: Math.round(sleep.sleep_duration_minutes!), unit: "minutes" });
  const mood = recent(bundle.moods).find((row) => finite(row.mood_score, 0, 100) != null);
  if (mood) evidence.push({ domain: "mood", date: mood.record_date, value: Math.round(mood.mood_score), unit: "score" });
  const exercise = recent(bundle.exercises).find((row) => finite(row.exercise_minutes, 1, 1440) != null || finite(row.steps, 1, 200000) != null);
  if (exercise) {
    const minutes = finite(exercise.exercise_minutes, 1, 1440);
    evidence.push({ domain: "exercise", date: exercise.record_date, value: Math.round(minutes ?? exercise.steps!), unit: minutes == null ? "steps" : "minutes" });
  }
  return evidence;
}

export function formatFocusHealthEvidence(item: FocusHealthEvidence, lang: "zh" | "en") {
  if (lang === "zh") {
    const label = item.domain === "sleep" ? "睡眠" : item.domain === "mood" ? "情绪" : "运动";
    const value = item.unit === "score" ? `${item.value}分` : item.unit === "steps" ? `${item.value}步` : `${item.value}分钟`;
    return `${item.date} ${label} ${value}`;
  }
  const label = item.domain === "sleep" ? "Sleep" : item.domain === "mood" ? "Mood" : "Exercise";
  const value = item.unit === "score" ? `${item.value}/100` : item.unit === "steps" ? `${item.value} steps` : `${item.value} min`;
  return `${item.date} ${label} ${value}`;
}

export function nextFocusEncouragementAt(focusedSeconds: number, intervalSeconds = 15 * 60) {
  return Math.max(0, Math.floor(focusedSeconds)) + intervalSeconds;
}

function finite(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}
