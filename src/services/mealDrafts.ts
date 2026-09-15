type Draft = Record<string, unknown>;
/** Retain other meals when an explicit reminder opens a different editor. */
export function selectMealDraft(draft: Draft | null, meal: string): Draft | null {
  if (!draft) return null;
  if (draft.meal === meal) return draft;
  const entries = draft.mealDrafts as Record<string, Draft> | undefined;
  return entries?.[meal] ?? null;
}
export function mergeMealDraft(previous: Draft | null, next: Draft): Draft {
  const entries = { ...(previous?.mealDrafts as Record<string, Draft> | undefined) };
  if (previous && typeof previous.meal === "string" && previous.meal !== next.meal) {
    const flat = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "mealDrafts"));
    entries[previous.meal] = flat;
  }
  if (typeof next.meal === "string") delete entries[next.meal];
  return { ...next, mealDrafts: entries };
}
export function removeMealDraft(previous: Draft | null, meal: string): Draft | null {
  if (!previous) return null;
  const entries = { ...(previous.mealDrafts as Record<string, Draft> | undefined) };
  delete entries[meal];
  if (previous.meal !== meal) return { ...previous, mealDrafts: entries };
  const [nextMeal] = Object.keys(entries);
  if (!nextMeal) return null;
  const next = entries[nextMeal];
  delete entries[nextMeal];
  return { ...next, mealDrafts: entries };
}
