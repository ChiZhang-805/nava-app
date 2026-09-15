import assert from "node:assert/strict";
import test from "node:test";
import { buildReminderOccurrences, localReminderDate, reminderAt, reminderEligibility, reminderEvidence, reminderKinds, reminderMealFromView, reminderNativeId, reminderOccurrenceId, reminderTarget, resolveReminderPreferences, validReminderTime } from "../src/services/independentReminders.ts";
import { mergeMealDraft, removeMealDraft, selectMealDraft } from "../src/services/mealDrafts.ts";

const now = () => new Date(2026, 8, 15, 12, 30);
const empty = () => reminderEvidence("2026-09-15", null, null);
const allOn = () => resolveReminderPreferences(["mood", "nutrition_breakfast", "nutrition_lunch", "nutrition_dinner"].map((notification_type) => ({ notification_type, enabled: true, local_time: "12:30:00", timezone: "Asia/Shanghai" })), "Asia/Shanghai");
test("fresh preferences never silently opt in", () => {
  const values = resolveReminderPreferences([], "Asia/Shanghai");
  assert.ok(reminderKinds.every((kind) => !values[kind].enabled));
  assert.equal(values.breakfast.localTime, "08:30");
});
test("legacy unified diet preference is lunch only, explicit off wins", () => {
  const legacy = { notification_type: "nutrition", enabled: true, local_time: "13:17:00", timezone: "Asia/Shanghai" };
  const values = resolveReminderPreferences([legacy], "Asia/Shanghai");
  assert.equal(values.lunch.localTime, "13:17"); assert.equal(values.lunch.enabled, true);
  assert.equal(values.breakfast.enabled, false); assert.equal(values.dinner.enabled, false);
  assert.equal(resolveReminderPreferences([legacy, { ...legacy, notification_type: "nutrition_lunch", enabled: false }], "Asia/Shanghai").lunch.enabled, false);
});
test("strict 24-hour clock validation and fallback", () => {
  for (const value of ["00:00", "23:59", "09:07"]) assert.equal(validReminderTime(value), true);
  for (const value of ["24:00", "12:60", "8:00", "", "abc"]) assert.equal(validReminderTime(value), false);
  assert.throws(() => reminderAt(now(), "25:00"));
});
test("minute boundary and one-hour catch-up window", () => {
  const values = allOn();
  assert.equal(reminderEligibility("lunch", values, empty(), new Date(2026, 8, 15, 12, 29, 59)), "not-due");
  assert.equal(reminderEligibility("lunch", values, empty(), now()), "due");
  assert.equal(reminderEligibility("lunch", values, empty(), new Date(2026, 8, 15, 13, 30)), "not-due");
  assert.equal(reminderEligibility("lunch", values, empty(), new Date(2026, 8, 16, 12, 30)), "unknown");
  values.lunch.enabled = false;
  assert.equal(reminderEligibility("lunch", values, empty(), now()), "disabled");
  assert.equal(reminderEligibility("dinner", values, empty(), now()), "due");
});
test("a saved meal suppresses only that date and meal, not pantry or hydration", () => {
  const evidence = reminderEvidence("2026-09-15", null, { record_date: "2026-09-15", breakfast_items: [{ name: "egg" }], lunch_time: "12:00", dinner_items: [], pantry_items: [{ name: "tea" }], hydration_ml: 500 });
  assert.equal(evidence.breakfast, true); assert.equal(evidence.lunch, true); assert.equal(evidence.dinner, false);
  assert.equal(reminderEligibility("breakfast", allOn(), evidence, now()), "recorded");
  assert.deepEqual(reminderEvidence("2026-09-15", { record_date: "2026-09-14", mood_score: 50 }, { record_date: "2026-09-14", breakfast_items: [1] }), empty());
  assert.equal(reminderEvidence("2026-09-15", { record_date: "2026-09-15", mood_score: 0 }, null).mood, true);
});
test("native plan retains tomorrow after today's save and stops only the disabled slot", () => {
  const prefs = allOn(); const evidence = { ...empty(), mood: true };
  const plan = buildReminderOccurrences(prefs, evidence, new Date(2026, 8, 15, 8));
  assert.equal(plan.length, 55); assert.ok(!plan.some((item) => item.date === evidence.date && item.kind === "mood"));
  assert.ok(plan.some((item) => item.date === "2026-09-16" && item.kind === "mood"));
  assert.equal(new Set(plan.map((item) => item.id)).size, plan.length);
  prefs.breakfast.enabled = false;
  assert.ok(buildReminderOccurrences(prefs, evidence, now()).every((item) => item.kind !== "breakfast" && item.at > now()));
  for (const kind of reminderKinds) prefs[kind].enabled = false;
  assert.deepEqual(buildReminderOccurrences(prefs, evidence, now()), []);
});
test("calendar rollover including leap dates, no UTC-date bleed", () => {
  const date = new Date(2028, 1, 28, 23, 59);
  const plan = buildReminderOccurrences(allOn(), { ...empty(), date: localReminderDate(date) }, date, 3);
  assert.deepEqual([...new Set(plan.map((item) => item.date))], ["2028-02-29", "2028-03-01"]);
  assert.equal(reminderOccurrenceId("lunch", "2026-09-15"), "reminder:2026-09-15:lunch");
  assert.notEqual(reminderNativeId("lunch", "2026-09-15"), reminderNativeId("lunch", "2026-09-16"));
});
test("exact meal editor targets", () => {
  for (const kind of ["breakfast", "lunch", "dinner"] as const) assert.equal(reminderMealFromView(reminderTarget(kind).view), kind);
  assert.equal(reminderTarget("mood").module, "mood");
  assert.equal(reminderMealFromView("editor-pantry"), null);
});
test("opening and editing a different meal preserves the previous meal draft without nesting", () => {
  const breakfast = { meal: "breakfast", name: "eggs", photoPath: "breakfast.jpg" };
  const lunch = { meal: "lunch", name: "rice", photoPath: "lunch.jpg" };
  assert.equal(selectMealDraft(lunch, "breakfast"), null);
  const merged = mergeMealDraft(lunch, breakfast);
  assert.equal(selectMealDraft(merged, "breakfast")?.name, "eggs");
  assert.deepEqual(selectMealDraft(merged, "lunch"), lunch);
  const again = mergeMealDraft(merged, { ...lunch, name: "noodles" });
  assert.equal(selectMealDraft(again, "breakfast")?.photoPath, "breakfast.jpg");
  assert.equal(selectMealDraft(again, "breakfast")?.mealDrafts, undefined);
  const afterSave = removeMealDraft(again, "lunch");
  assert.equal(selectMealDraft(afterSave, "breakfast")?.name, "eggs");
  assert.equal(selectMealDraft(afterSave, "lunch"), null);
  assert.equal(removeMealDraft(afterSave, "breakfast"), null);
});
