import {
  refreshRhythmScore,
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveNutritionRecord,
  saveSleepRecord,
} from "./records";
import { addTodo } from "./productivity";
import { todayISO } from "./date";
import { refreshFdnbHealth } from "./dnb";
import { trackAnalyticsEvent } from "./analytics";
import { type StructuredEntry } from "./structuredEntryParser";

export { parseStructuredEntry } from "./structuredEntryParser";
export type { StructuredEntry, StructuredEntryType } from "./structuredEntryParser";

export async function confirmStructuredEntry(userId: string, candidate: StructuredEntry) {
  const data = candidate.payload;
  if (candidate.type === "todo") {
    return addTodo(
      userId,
      String(data.title ?? candidate.summary),
      "ai",
      String(data.scheduledDate ?? todayISO()),
      data.scheduledTime ? String(data.scheduledTime) : undefined,
    );
  }
  if (candidate.type === "mood") await saveMoodRecord({
    userId,
    moodScore: Number(data.moodScore),
    factors: Array.isArray(data.factors) ? data.factors as string[] : [],
    diary: String(data.diary ?? ""),
  });
  if (candidate.type === "sleep") await saveSleepRecord({ userId, start: String(data.start), end: String(data.end), durationMinutes: Number(data.durationMinutes), source: "manual" });
  if (candidate.type === "exercise") await saveExerciseRecord({ userId, steps: Number(data.steps ?? 0), calories: Number(data.calories ?? 0), minutes: Number(data.minutes ?? 0), source: "manual" });
  if (candidate.type === "nutrition") await saveNutritionRecord({ userId, meal: data.meal as "breakfast" | "lunch" | "dinner" | "pantry", item: { name: String(data.name), calories: Number(data.calories ?? 0) }, totalCalories: Number(data.calories ?? 0) });
  if (candidate.type === "focus") await saveFocusSession({ userId, taskTitle: String(data.taskTitle), minutes: Number(data.minutes) });
  try {
    await Promise.allSettled([
      refreshRhythmScore(),
      refreshFdnbHealth(todayISO()),
      trackAnalyticsEvent(userId, "structured_entry_confirmed", { type: candidate.type }),
    ]);
  } catch (error) {
    console.warn("Rhythm refresh deferred after structured entry", error);
  }
  return candidate;
}
