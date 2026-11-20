import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthReportDishes } from "../src/services/healthReportMeals.ts";
import type { TrendBundle, NutritionRecord } from "../src/types.ts";
import type { JournalRecord } from "../src/services/journal.ts";
import type { FoodRenderJob } from '../src/services/foodRenderJobs.ts';

const date = "2026-11-20";
const bundle = (patch: Partial<TrendBundle>): TrendBundle => ({ moods: [], sleeps: [], exercises: [], nutritions: [], faces: [], focus: [], focusDistributions: [], healthMetrics: [], rhythms: [], ...patch });
const record = (patch: Partial<NutritionRecord>): NutritionRecord => ({ id: "n1", record_date: date, total_calories: 1600, ai_feedback: null, ...patch });
const journal = (patch: Partial<JournalRecord>): JournalRecord => ({ id: "j1", category: "food", recordDate: date, data: {}, createdAt: `${date}T12:00:00Z`, ...patch });
const render = (patch: Partial<FoodRenderJob> = {}): FoodRenderJob => ({ id: 'job', source_kind: 'journal_entries', source_id: 'j1', item_key: 'whole_meal', source_revision: '1', record_date: date, state: 'ready', input: { name: '燕麦酸奶', amount: null, photoPath: null, sourceItemId: null, meal: null }, asset_path: 'owner/job/image.png', evidence_kind: 'text', updated_at: `${date}T12:00:00Z`, ...patch });

test('saved generated images bind to unchanged food evidence, never to renamed dishes', () => {
  const input = bundle({ journal: [journal({ data: { foods: '燕麦酸奶', calories: 200 } })], foodRenders: [render()] });
  assert.equal(buildHealthReportDishes(input, date, 'zh')[0].renderPath, 'owner/job/image.png');
  input.journal![0].data.calories = 300;
  assert.equal(buildHealthReportDishes(input, date, 'zh')[0].renderPath, 'owner/job/image.png');
  input.journal![0].data.foods = '西红柿炒鸡蛋';
  assert.equal(buildHealthReportDishes(input, date, 'zh')[0].renderPath, undefined);
  input.journal![0].data.foods = '燕麦酸奶';
  input.foodRenders![0].state = 'stale';
  assert.equal(buildHealthReportDishes(input, date, 'zh')[0].renderPath, undefined);
});

test('pending images never invent an asset and journal photos use only the explicit private contract', () => {
  const path = 'owner/journal-food/j1/photo.jpg';
  const input = bundle({ journal: [journal({ data: { foods: '燕麦酸奶' }, mediaPath: path })], foodRenders: [render({ state: 'processing', input: { ...render().input, photoPath: path } })] });
  const card = buildHealthReportDishes(input, date, 'zh')[0];
  assert.equal(card.photoPath, path);
  assert.equal(card.renderPath, null);
  assert.equal(card.renderState, 'processing');
  input.journal![0].mediaPath = 'owner/journal-food/j2/other.jpg';
  assert.equal(buildHealthReportDishes(input, date, 'zh')[0].photoPath, null);
  assert.equal(buildHealthReportDishes(input, date, 'zh')[0].renderPath, undefined);
});

test("empty and daily-total-only records never become invented dishes", () => {
  assert.deepEqual(buildHealthReportDishes(null, date, "zh"), []);
  assert.deepEqual(buildHealthReportDishes(bundle({ nutritions: [record({})] }), date, "en"), []);
});

test("food illustrations require explicit demo opt-in and never replace a real photo", () => {
  const input = bundle({ nutritions: [record({ breakfast_items: [{ name: "燕麦酸奶", calories: 360 }] })] });
  assert.equal(buildHealthReportDishes(input, date, "zh")[0].illustrationSrc, undefined);
  assert.equal(buildHealthReportDishes(input, date, "zh", { demoIllustrations: true })[0].illustrationSrc, "assets/health-report/examples/oat-yogurt.webp");
  input.nutritions[0].breakfast_photo_url = "real-user/breakfast.jpg";
  assert.equal(buildHealthReportDishes(input, date, "zh", { demoIllustrations: true })[0].illustrationSrc, undefined);
});

test("individual dish nutrients stay independent of meal and daily summaries", () => {
  const cards = buildHealthReportDishes(bundle({ nutritions: [record({ lunch_photo_url: "user/lunch.jpg", lunch_time: "12:30:00", lunch_items: [
    { name: "烤鸡", calories: 320, protein_grams: 32, nutrition_source: "vision_estimate", meal_summary: { protein_grams: 45, carbohydrate_grams: 60, fat_grams: 20, hydration_ml: 0 } },
    { name: "米饭", amount: "一碗", calories: 200 },
  ] })] }), date, "zh");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].nutrients.calories, 320);
  assert.equal(cards[1].nutrients.calories, 200);
  assert.equal(cards[1].nutrients.protein, null);
  assert.equal(cards[0].nutrients.carbs, null);
  assert.equal(cards[0].estimated, true);
  assert.equal(cards[1].estimated, false);
  assert.ok(cards.every(card => card.photoKind === "meal" && card.time === "12:30"));
});

test("single dish photos and photo-only meals have honest image labels", () => {
  const cards = buildHealthReportDishes(bundle({ nutritions: [record({ breakfast_photo_url: "user/b.jpg", breakfast_items: [{ name: "鸡蛋" }], dinner_photo_url: "user/d.jpg" })] }), date, "en");
  assert.equal(cards[0].photoKind, "dish");
  assert.equal(cards[1].photoKind, "meal");
  assert.equal(cards[1].title, "Dinner");
  assert.ok(cards.every(card => card.nutrients.calories === null));
});

test("free-text meal stays one record; unknown nutrients and transient images are not invented", () => {
  const cards = buildHealthReportDishes(bundle({ journal: [journal({ data: { foods: "鸡肉、米饭和青菜", meal: "午餐", mealTime: "12:05", calories: "520", protein: "", carbs: false, fat: -3 }, mediaPath: "unknown-bucket/photo.jpg", estimated: true })] }), date, "en");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, "鸡肉、米饭和青菜");
  assert.equal(cards[0].meal, "Lunch");
  assert.deepEqual(cards[0].nutrients, { calories: 520, protein: null, carbs: null, fat: null });
  assert.equal(cards[0].photoPath, null);
  assert.equal(cards[0].estimated, true);
});

test("window and duplicate IDs are bounded, but a journal entry must not hide another saved meal that day", () => {
  const j = journal({ data: { foods: "茶", calories: 0 } });
  const cards = buildHealthReportDishes(bundle({ journal: [j, j, journal({ id: "old", recordDate: "2026-11-13" }), journal({ id: "future", recordDate: "2026-11-21" })], nutritions: [record({ lunch_items: [{ name: "重叠旧记录" }] }), record({ id: "yesterday", record_date: "2026-11-19", lunch_items: [{ name: "午餐" }] })] }), date, "zh");
  assert.equal(cards.length, 3);
  assert.equal(cards[0].nutrients.calories, 0);
  assert.equal(cards[1].title, "重叠旧记录");
  assert.equal(cards[2].date, "2026-11-19");
});
