import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.REVIEW_BASE_URL || "http://127.0.0.1:4174";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Local-only fixture acceptance.");
const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/record-integrity-v149";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: "zh-CN", viewport: { width: 390, height: 844 } });
  await page.goto(`${base}?demo=1`, { waitUntil: "networkidle" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  await page.locator('input[autocomplete="username"]').fill("13800138000");
  await page.locator('input[autocomplete="current-password"]').fill("12345678");
  await page.locator(".auth-submit").click();
  await page.locator(".onboarding-screen, .phone-frame").first().waitFor();
  const onboarding = page.locator(".onboarding-screen");
  if (await onboarding.isVisible()) {
    await page.locator(".onboarding-welcome").waitFor({ state: "hidden", timeout: 6000 });
    for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
      await expect(onboarding).toHaveAttribute("data-onboarding-step", step);
      await page.locator(".onboarding-option-grid button").first().click();
      if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
    }
    await page.locator(".onboarding-consent-row input").first().check({ force: true });
    await page.locator(".onboarding-next").click();
  }
  await expect(page.locator(".bottom-nav")).toBeVisible();
  for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}?demo=1#tab=home`, { waitUntil: "networkidle" });
    const date = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("nava-record-draft")) localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("nava-record-draft")) sessionStorage.removeItem(key);
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      localStorage.setItem("nava.review.demo.records.v1", JSON.stringify({ sleeps: {}, focus: {}, faces: {},
        exercises: { [date]: { id: "fixture-exercise", record_date: date, steps: null, calories: null, exercise_minutes: null } },
        nutritions: { [date]: { id: "fixture-diet", record_date: date, breakfast_items: [], lunch_items: [], dinner_items: [], pantry_items: [], total_calories: null, protein_grams: null, carbohydrate_grams: null, fat_grams: null, hydration_ml: null } },
      }));
      return date;
    });
    await page.goto(`${base}?demo=1#tab=record&module=exercise&view=editor`, { waitUntil: "networkidle" });
    const exercise = page.locator('.record-detail[data-record-detail="exercise"] form:not([hidden])');
    const metrics = exercise.locator('input[type="number"]');
    for (let n=0; n<3; n++) await expect(metrics.nth(n)).toHaveValue("");
    await expect(exercise.locator(".exercise-recovery-estimate")).toHaveCount(0);
    await metrics.nth(0).fill("0");
    await exercise.locator('button[type="submit"]').click();
    await expect.poll(() => page.evaluate((date) => JSON.parse(localStorage.getItem("nava.review.demo.records.v1")).exercises[date].steps, date)).toBe(0);
    const saved = await page.evaluate((date) => JSON.parse(localStorage.getItem("nava.review.demo.records.v1")).exercises[date], date);
    assert.equal(saved.calories, null); assert.equal(saved.exercise_minutes, null);
    await page.goto(`${base}?demo=1#tab=record&module=diet&view=editor`, { waitUntil: "networkidle" });
    const diet = page.locator('.record-detail[data-record-detail="diet"] form:not([hidden])');
    const amounts = diet.locator('input[type="number"]');
    for (let n=0; n<5; n++) await expect(amounts.nth(n)).toHaveValue("");
    await diet.locator(".diet-food-field textarea").fill("本地空值验收餐食");
    await amounts.nth(1).fill("0");
    await diet.locator('button[type="submit"]').click();
    await expect.poll(() => page.evaluate((date) => JSON.parse(localStorage.getItem("nava.review.demo.records.v1")).nutritions[date].protein_grams, date)).toBe(0);
    const meal = await page.evaluate((date) => JSON.parse(localStorage.getItem("nava.review.demo.records.v1")).nutritions[date], date);
    assert.equal(meal.total_calories, null); assert.equal(meal.fat_grams, null); assert.equal(meal.hydration_ml, null);
    await page.goto(`${base}?demo=1#tab=record&module=diet`, { waitUntil: "networkidle" });
    await expect(page.locator(".diet-macro-ring")).toHaveClass(/is-missing/);
    await expect(page.locator(".diet-macro-ring > span")).toContainText("--");
    await expect(page.locator(".diet-nutrition-summary > span").first()).toContainText("0");
    await expect(page.locator(".diet-nutrition-summary")).toBeVisible();
    await page.waitForTimeout(850);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    await page.screenshot({ path: `${output}/unknown-diet-${width}.png` });
    await page.goto(`${base}?demo=1#tab=record&module=exercise`, { waitUntil: "networkidle" });
    await expect(page.locator(".exercise-dashboard")).toContainText("--");
    await expect(page.locator(".exercise-dashboard")).toBeVisible();
    await page.waitForTimeout(850);
    await page.screenshot({ path: `${output}/unknown-exercise-${width}.png` });
    const confirmation = await page.evaluate(async (date) => {
      const { parseStructuredEntry, updateStructuredEntryField } = await import("/src/services/structuredEntryParser.ts");
      const { confirmStructuredEntry } = await import("/src/services/structuredEntry.ts");
      const { isDemoMode } = await import("/src/services/demo.ts");
      if (!isDemoMode()) throw new Error("Confirmation fixture cannot run against a real account.");
      const user = "00000000-0000-4000-8000-000000000001";
      const candidate = parseStructuredEntry("步数4000", "zh", { dataType: "exercise", extractedData: { steps: 4000 } }, { allowLocalHealthFallback: false });
      const field = candidate.fields.find((item) => item.path === "steps");
      await confirmStructuredEntry(user, updateStructuredEntryField(candidate, field.id, ""));
      const cleared = JSON.parse(localStorage.getItem("nava.review.demo.records.v1")).exercises[date].steps;
      const fixtures = JSON.parse(localStorage.getItem("nava.review.demo.records.v1"));
      fixtures.nutritions[date] = { id: "isolated-confirmation", record_date: date, breakfast_items: [], lunch_items: [], dinner_items: [], pantry_items: [] };
      localStorage.setItem("nava.review.demo.records.v1", JSON.stringify(fixtures));
      const meal = parseStructuredEntry("米饭和炖菜", "zh", { dataType: "nutrition", extractedData: {
        meal: "lunch", totalCalories: 500, proteinGrams: 12, fatGrams: 0, items: [{ name: "米饭", calories: 200, protein_grams: 12 }, { name: "炖菜" }],
      } }, { allowLocalHealthFallback: false });
      await confirmStructuredEntry(user, meal);
      const saved = JSON.parse(localStorage.getItem("nava.review.demo.records.v1")).nutritions[date];
      return { cleared, total: saved.total_calories, last: saved.lunch_items[saved.lunch_items.length-1].calories, protein: saved.lunch_items[0].meal_summary.protein_grams, fat: saved.lunch_items[0].meal_summary.fat_grams };
    }, date);
    assert.deepEqual(confirmation, { cleared: null, total: null, last: null, protein: 12, fat: 0 });
    await page.evaluate((date) => {
      localStorage.setItem("nava-todos:00000000-0000-4000-8000-000000000001", JSON.stringify(Array.from({ length: 13 }, (_, n) => ({
        id: `local-only-limit-${n}`, title: `本地边界测试任务${n+1}`, scheduledDate: date, completed: false, source: "manual", createdAt: new Date().toISOString(),
      }))));
    }, date);
    await page.goto(`${base}?demo=1#tab=record&module=focus`, { waitUntil: "networkidle" });
    await expect(page.locator(".focus-ai-priority-button")).toContainText("13 项");
    await expect(page.locator(".focus-ai-priority-button")).toBeDisabled();
    await expect(page.locator('.focus-ai-priority-note[role="status"]')).toContainText("2–12");
    await expect(page.locator(".focus-todo-copy")).toHaveCount(13);
    console.log(`${width}x${height}: local form save/read, unknown vs zero, no invented recovery, summary and fit passed.`);
  }
} finally { await browser.close(); }
