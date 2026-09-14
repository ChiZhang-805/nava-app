import {
  refreshRhythmScore,
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveNutritionItems,
  saveNutritionRecord,
  saveSleepRecord,
  saveSleepSummaryRecord,
} from "./records";
import { addTodo } from "./productivity";
import { todayISO } from "./date";
import { refreshFdnbHealth } from "./dnb";
import { trackAnalyticsEvent } from "./analytics";
import { type StructuredEntry } from "./structuredEntryParser";

export { parseStructuredEntry } from "./structuredEntryParser";
export type { StructuredEntry, StructuredEntryType } from "./structuredEntryParser";

export async function confirmStructuredEntry(userId: string, candidate: StructuredEntry): Promise<unknown> {
  if (candidate.type === "multi" && candidate.entries?.length) {
    const saved = [];
    for (const item of candidate.entries) saved.push(await confirmStructuredEntry(userId, item));
    return { ...candidate, saved };
  }
  const data = candidate.payload;
  if (candidate.type === "todo") {
    return addTodo(
      userId,
      String(data.title ?? candidate.summary),
      "ai",
      String(data.scheduledDate ?? todayISO()),
      data.scheduledTime ? String(data.scheduledTime) : undefined,
      {
        focusMinutes: finitePositiveInteger(data.focusMinutes),
        focusSessions: finitePositiveInteger(data.focusSessions),
      },
      candidate.id,
    );
  }
  if (candidate.type === "mood") await saveMoodRecord({
    userId,
    moodScore: Number(data.moodScore),
    factors: Array.isArray(data.factors) ? data.factors as string[] : [],
    diary: String(data.diary ?? ""),
  });
  if (candidate.type === "sleep") {
    if (typeof data.start === "string" && typeof data.end === "string") {
      await saveSleepRecord({ userId, start: data.start, end: data.end, durationMinutes: Number(data.durationMinutes), source: "manual" });
    } else {
      await saveSleepSummaryRecord({ userId, durationMinutes: Number(data.durationMinutes), source: "manual" });
    }
  }
  if (candidate.type === "exercise") await saveExerciseRecord({
    userId,
    steps: finiteNumber(data.steps),
    calories: finiteNumber(data.calories),
    minutes: finiteNumber(data.minutes),
    source: "manual",
  });
  if (candidate.type === "nutrition") {
    const items = Array.isArray(data.items)
      ? data.items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item, index) => ({
          name: String(item.name ?? "饮食记录"),
          source_id: `${candidate.id}:${index}`,
          amount: item.amount ? String(item.amount) : undefined,
          weight_grams: finiteNumber(item.weight_grams),
          calories: Math.max(0, Math.round(Number(item.calories ?? 0))),
          protein_grams: finiteNumber(item.protein_grams),
          carbohydrate_grams: finiteNumber(item.carbohydrate_grams),
          fat_grams: finiteNumber(item.fat_grams),
          confidence: finiteNumber(item.confidence),
          nutrition_source: item.nutrition_source === "user_corrected" ? "user_corrected" as const
            : item.nutrition_source === "vision_estimate" ? "vision_estimate" as const
            : undefined,
        }))
      : [];
    if (items.length > 0) {
      await saveNutritionItems({
        userId,
        date: data.date ? String(data.date) : undefined,
        meal: data.meal as "breakfast" | "lunch" | "dinner" | "pantry",
        items,
        append: true,
        photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
        proteinGrams: finiteNumber(data.proteinGrams),
        carbohydrateGrams: finiteNumber(data.carbohydrateGrams),
        fatGrams: finiteNumber(data.fatGrams),
        mealTime: new Date().toTimeString().slice(0, 5),
      });
    } else {
      await saveNutritionRecord({
        userId,
        meal: data.meal as "breakfast" | "lunch" | "dinner" | "pantry",
        item: { name: String(data.name), calories: Number(data.calories ?? 0), source_id: candidate.id },
        totalCalories: Number(data.calories ?? 0),
      });
    }
  }
  if (candidate.type === "focus") await saveFocusSession({ userId, taskTitle: String(data.taskTitle), minutes: Number(data.minutes), source: "ai", sourceActionId: candidate.id });
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

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function finitePositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}
