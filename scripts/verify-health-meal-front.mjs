import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const sourceRevision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
const output = `Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/health-meal-front/${sourceRevision}`;
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const results = [], errors = [];
let currentPage, currentCase;
const activeSelector = '.health-explorer-card[data-active="true"]';

async function selectMeal(page, id) {
  const active = page.locator(activeSelector);
  const ids = await page.locator('.health-explorer-card').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.chartId))]);
  assert(ids.includes(id), `Missing saved meal ${id}`);
  for (let step = 0; step < ids.length; step++) {
    const current = await active.getAttribute('data-chart-id');
    if (current === id) break;
    await page.locator('.health-explorer-track').press('ArrowRight');
    await expect(active).toHaveAttribute('data-chart-id', ids[(ids.indexOf(current) + 1) % ids.length]);
  }
  await expect(active).toHaveAttribute('data-chart-id', id);
  await expect(active).toHaveAttribute('data-side', 'front');
  await expect.poll(() => active.evaluate(card => {
    const track = card.closest('.health-explorer-track');
    return Math.abs(track.scrollLeft - (card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2));
  })).toBeLessThanOrEqual(1);
  await expect(active.locator('.health-explorer-back')).toHaveCSS('visibility', 'hidden');
  await expect.poll(() => active.evaluate(node => node.getAnimations({ subtree: true }).every(animation => ['finished', 'idle'].includes(animation.playState)))).toBe(true);
  if (page.viewportSize().height <= 640) await page.locator('.record-hub--explorer').evaluate(node => { node.scrollTop = node.scrollHeight; });
  return active;
}

async function inspectMeal(page, active, expected, locale) {
  const rows = active.locator('[data-front-nutrient]');
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.frontNutrient))).toEqual(['calories', 'protein', 'carbs', 'fat']);
  const labels = locale === 'zh' ? ['热量', '蛋白质', '碳水', '脂肪'] : ['Energy', 'Protein', 'Carbohydrate', 'Fat'];
  await expect(rows.locator('dt')).toHaveText(labels);
  const units = ['kcal', 'g', 'g', 'g'];
  for (let index = 0; index < expected.values.length; index++) {
    const row = rows.nth(index), value = expected.values[index];
    if (value === null) {
      expect(await row.getAttribute('data-front-nutrient-value')).toBeNull();
      await expect(row.locator('dd')).toHaveText('—');
      await expect(row.locator('dd span')).toHaveCount(0);
      await expect(row).toHaveAttribute('data-missing', 'true');
    } else {
      await expect(row).toHaveAttribute('data-front-nutrient-value', String(value));
      await expect(row.locator('dd')).toHaveText(`${value} ${units[index]}`);
      await expect(row).toHaveAttribute('data-missing', 'false');
    }
  }
  await expect(active.locator('.health-explorer-meal-estimate')).toHaveCount(expected.estimated ? 1 : 0);
  const visual = active.locator('.health-explorer-meal-visual');
  if (expected.photo) {
    await expect(visual).toHaveAttribute('data-photo-kind', 'dish');
    await expect.poll(() => visual.locator('img').evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    await expect(visual.locator('img')).toHaveAttribute('src', 'https://meal-fixture.invalid/saved-photo.webp');
  } else {
    await expect(visual).toHaveAttribute('data-photo-kind', 'empty');
    await expect(visual.locator('img')).toHaveCount(0);
    await expect(visual.locator('.health-explorer-photo-empty svg')).toBeVisible();
  }
  const layout = await active.evaluate(card => {
    const rect = node => { const value = node.getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
    const front = card.querySelector('.health-explorer-front');
    const nav = document.querySelector('.bottom-nav');
    const chat = nav.querySelector('[data-tab="ai"]'), orb = chat.querySelector('.ai-nav-orb');
    return {
      card: rect(card), title: rect(front.querySelector('h3')), visual: rect(front.querySelector('.health-explorer-meal-visual')),
      nutrition: rect(front.querySelector('.health-explorer-front-nutrition')), meta: rect(front.querySelector('.health-explorer-meal-meta')),
      rows: [...front.querySelectorAll('[data-front-nutrient]')].map(node => ({ row: rect(node), align: getComputedStyle(node).alignItems, label: rect(node.querySelector('dt')), value: rect(node.querySelector('dd')) })),
      navTop: nav.getBoundingClientRect().top, chatTop: Math.min(chat.getBoundingClientRect().top, orb?.getBoundingClientRect().top ?? Infinity),
      overflow: front.scrollWidth > front.clientWidth + 1,
      emptyIconSize: front.querySelector('.health-explorer-photo-empty svg')?.getBoundingClientRect().width,
    };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.visual.top).toBeGreaterThanOrEqual(layout.title.bottom - 1);
  expect(layout.nutrition.top).toBeGreaterThanOrEqual(layout.visual.bottom - 1);
  expect(layout.meta.top).toBeGreaterThanOrEqual(layout.nutrition.bottom - 1);
  expect(layout.meta.bottom).toBeLessThanOrEqual(layout.card.bottom - 8);
  if (expected.photo) expect(layout.visual.height, 'The photo remains a substantive part of the card').toBeGreaterThanOrEqual(80);
  else expect(layout.emptyIconSize).toBeLessThanOrEqual(36);
  for (const [index, row] of layout.rows.entries()) {
    expect(Math.abs(row.label.left - layout.rows[0].label.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(row.value.right - layout.rows[0].value.right)).toBeLessThanOrEqual(1);
    expect(row.value.left - row.label.right).toBeGreaterThanOrEqual(8);
    // Calories use a larger type size; their glyph boxes need not share a center.
    // Require the intended common baseline and overlapping single-row boxes.
    expect(row.align).toBe('baseline');
    expect(Math.min(row.label.bottom, row.value.bottom) - Math.max(row.label.top, row.value.top)).toBeGreaterThanOrEqual(12);
    if (index) expect(row.row.top).toBeGreaterThanOrEqual(layout.rows[index - 1].row.bottom);
  }
  expect(layout.navTop - layout.card.bottom).toBeGreaterThanOrEqual(15.5);
  expect(layout.navTop - layout.card.bottom).toBeLessThanOrEqual(24.5);
  expect(layout.chatTop - layout.card.bottom).toBeGreaterThanOrEqual(5.5);
  return layout;
}

try {
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch();
    try {
      for (const { width, height, locale } of [{ width: 320, height: 568, locale: 'zh' }, { width: 430, height: 932, locale: 'en' }]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: locale === 'zh' ? 'zh-CN' : 'en-US', timezoneId: 'Asia/Shanghai', reducedMotion: 'no-preference' });
        try {
          await context.addInitScript(language => {
            sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
            localStorage.setItem('nava.locale', language);
            localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001', JSON.stringify({ completed: true, version: 3, answers: {} }));
            const now = new Date(), date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            localStorage.setItem('nava.review.demo.journal.v1', '[]');
            // Explicit local fixtures. The photo request below is intercepted;
            // this is not evidence of a user's real meal or a vision result.
            localStorage.setItem('nava.review.demo.records.v1', JSON.stringify({ nutritions: { [date]: {
              id: 'front-fixture', record_date: date, total_calories: 380, ai_feedback: null,
              breakfast_photo_url: 'https://meal-fixture.invalid/saved-photo.webp', breakfast_time: '08:15',
              breakfast_items: [{ name: language === 'zh' ? '照片样例餐食' : 'Saved photo fixture', calories: 380, protein_grams: 18, carbohydrate_grams: 42, fat_grams: 12, nutrition_source: 'vision_estimate' }],
              lunch_time: '12:30', lunch_items: [{ name: language === 'zh' ? '无糖茶' : 'Unsweetened tea', calories: 0, fat_grams: 0 }],
              dinner_time: '18:30', dinner_items: [{ name: language === 'zh' ? '尚未填写营养的餐食' : 'Meal without nutrition values' }],
            } } }));
          }, locale);
          await context.route('**/*.supabase.co/**', route => route.fulfill({ json: [] }));
          await context.route('https://meal-fixture.invalid/saved-photo.webp', route => route.fulfill({ path: path.resolve('public/assets/health-report/examples/oat-yogurt.webp'), contentType: 'image/webp' }));
          const page = await context.newPage(); currentPage = page; currentCase = `${engine}-${width}-${locale}`;
          const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
          await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=record`, { waitUntil: 'networkidle' });
          if (await page.locator('.launch-sequence').isVisible()) await page.locator('.launch-sequence').click();
          await page.locator('[data-health-category="diet"]').click();
          const checks = [];
          for (const meal of [
            { meal: 'dinner', values: [null, null, null, null], photo: false, estimated: false },
            { meal: 'lunch', values: [0, null, null, 0], photo: false, estimated: false },
            { meal: 'breakfast', values: [380, 18, 42, 12], photo: true, estimated: true },
          ]) {
            const active = await selectMeal(page, `nutrition-front-fixture-${meal.meal}-0`);
            checks.push({ ...meal, layout: await inspectMeal(page, active, meal, locale) });
            await page.screenshot({ path: path.join(output, `${currentCase}-${meal.meal}.png`) });
          }
          expect(pageErrors).toEqual([]);
          results.push({ engine, width, height, locale, checks });
          console.log(`${currentCase}: four nutrient rows, photo/unknown/zero, geometry passed`);
        } finally {
          if (!results.some(result => result.engine === engine && result.width === width)) {
            const page = context.pages()[0];
            if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `${engine}-${width}-${locale}-failure.png`) }).catch(() => {});
          }
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
} catch (error) {
  errors.push(String(error)); process.exitCode = 1; console.error(error);
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(output, `${currentCase}-failure.png`) }).catch(() => {});
} finally {
  await server.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ sourceRevision, passed: errors.length === 0 && results.length === 4, results, errors }, null, 2));
}
