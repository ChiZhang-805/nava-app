import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

// Independent interaction gate. The larger health-explorer visual gate owns
// chart values, empty states, all categories and recording routes.
applyProjectPublicEnv(process.cwd());
const sourceRevision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
const output = `Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/health-report-explorer-interactions/${sourceRevision}`;
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const results = [], errors = [];
const activeSelector = '.health-explorer-card[data-active="true"]';

async function startLineAnimationSample(page) {
  await page.evaluate(() => {
    const token = (window.__reportAnimationToken ?? 0) + 1;
    window.__reportAnimationToken = token;
    window.__reportAnimationSamples = [];
    const start = performance.now();
    const sample = () => {
      if (window.__reportAnimationToken !== token || performance.now() - start > 4000) return;
      const card = document.querySelector('.health-explorer-card[data-active="true"]');
      const line = card?.querySelector('.trend-line');
      if (line) window.__reportAnimationSamples.push({ time: performance.now(), id: card.dataset.chartId, offset: Number.parseFloat(getComputedStyle(line).strokeDashoffset), animation: getComputedStyle(line).animationName });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function finishLineAnimationSample(page, id, reducedMotion) {
  await expect.poll(() => page.evaluate((id) => window.__reportAnimationSamples.some((sample) => sample.id === id), id)).toBe(true);
  if (reducedMotion !== 'reduce') await expect.poll(() => page.evaluate((id) => window.__reportAnimationSamples.some((sample) => sample.id === id && sample.offset > .05), id), { message: 'A new active chart visibly draws its trace' }).toBe(true);
  await expect.poll(() => page.locator(`${activeSelector} .trend-line`).first().evaluate((node) => Number.parseFloat(getComputedStyle(node).strokeDashoffset))).toBe(0);
  await expect.poll(() => page.locator(`${activeSelector} .line-trend-chart`).evaluate((node) => node.getAnimations({ subtree: true }).every((animation) => ['finished', 'idle'].includes(animation.playState)))).toBe(true);
  const samples = await page.evaluate((id) => window.__reportAnimationSamples.filter((sample) => sample.id === id), id);
  const inactive = await page.locator('.health-explorer-card[data-active="false"] .trend-line').evaluateAll((nodes) => nodes.map((node) => ({ animation: getComputedStyle(node).animationName, offset: Number.parseFloat(getComputedStyle(node).strokeDashoffset) })));
  expect(inactive.every((sample) => sample.animation === 'none' && sample.offset === 0)).toBe(true);
  if (reducedMotion === 'reduce') {
    expect(samples.every((sample) => sample.animation === 'none' && sample.offset === 0)).toBe(true);
    return { id, reduced: true, static: true };
  }
  const first = samples.find((sample) => sample.offset > .05), final = samples.find((sample) => sample.time >= first.time && sample.offset === 0);
  assert(final, 'The trace must reach its fully drawn state');
  expect(final.time - first.time).toBeLessThanOrEqual(1000);
  return { id, reduced: false, progressObserved: true, elapsedMs: final.time - first.time };
}

async function settleTrack(page) {
  const settled = await page.locator('.health-explorer-track').evaluate(async (node) => {
    let previous = node.scrollLeft, stable = 0;
    for (let frame = 0; frame < 180; frame++) {
      await new Promise(requestAnimationFrame);
      const current = node.scrollLeft;
      stable = Math.abs(current - previous) < .25 ? stable + 1 : 0;
      previous = current;
      if (stable >= 5) return true;
    }
    return false;
  });
  expect(settled, 'Carousel must finish scrolling and recentering').toBe(true);
}

async function expectActive(page, id, side = 'front') {
  const active = page.locator(activeSelector);
  try {
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('data-chart-id', id);
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'carousel-failure.png') });
    await writeFile(path.join(output, 'carousel-failure.json'), JSON.stringify(await page.evaluate(() => {
      const track = document.querySelector('.health-explorer-track');
      return { route: location.hash, scrollLeft: track?.scrollLeft, width: track?.clientWidth, focus: document.activeElement?.outerHTML?.slice(0, 240),
        cards: [...(track?.children ?? [])].map((card) => ({ id: card.dataset.chartId, active: card.dataset.active, side: card.dataset.side, left: card.offsetLeft, width: card.offsetWidth })), events: window.__navaCarouselTrace };
    }), null, 2));
    throw error;
  }
  await expect(active).toHaveAttribute('data-side', side);
  await expect(active).toHaveAttribute('aria-hidden', 'false');
  await settleTrack(page);
  await expect(active).toHaveAttribute('data-chart-id', id);
}

async function assertFaceBoundary(page, side) {
  const active = page.locator(activeSelector);
  for (const face of ['front', 'back']) {
    const element = active.locator(`.health-explorer-${face}`);
    await expect(element).toHaveAttribute('aria-hidden', String(face !== side));
    expect(await element.evaluate((node) => node.inert), `${face} inert state`).toBe(face !== side);
    // WebKit can composite a mirrored hidden backface despite inert/aria-hidden.
    // Require the settled non-current surface to be explicitly unpainted too.
    await expect(element).toHaveCSS('visibility', face === side ? 'visible' : 'hidden');
    if (face !== side) await expect(element).toHaveCSS('pointer-events', 'none');
  }
  const flip = active.locator('.health-explorer-flip');
  await expect(flip).toHaveAttribute('aria-pressed', String(side === 'back'));
  await expect.poll(async () => {
    const rect = await flip.boundingBox();
    return Boolean(rect && rect.width >= 43.9 && rect.height >= 43.9);
  }, { message: 'The active, settled flip target must be at least 44 × 44' }).toBe(true);
  expect(await page.locator('.health-explorer-card[data-active="false"] .health-explorer-flip').evaluateAll((nodes) => nodes.every((node) => node.disabled || Boolean(node.closest('[inert]'))))).toBe(true);
}

async function chooseVisibleNeighbor(page) {
  const neighbors = await page.locator('.health-explorer-track').evaluate((track) => {
    const active = track.querySelector('.health-explorer-card[data-active="true"]');
    const current = active.getBoundingClientRect(), bounds = track.getBoundingClientRect();
    return [...track.querySelectorAll('.health-explorer-neighbor')].flatMap((button) => {
      const card = button.closest('.health-explorer-card'), rect = button.getBoundingClientRect();
      if (card.dataset.active === 'true') return [];
      const left = Math.max(0, bounds.left, rect.left), right = Math.min(innerWidth, bounds.right, rect.right);
      const top = Math.max(0, bounds.top, rect.top), bottom = Math.min(innerHeight, bounds.bottom, rect.bottom);
      if (right - left < 2 || bottom - top < 2) return [];
      return [['left', left, Math.min(right, current.left)], ['right', Math.max(left, current.right), right]].flatMap(([direction, start, end]) => {
        if (end - start < 2) return [];
        const y = (top + bottom) / 2;
        // The track may bleed past a clipping ancestor. Use the actual painted
        // and hit-testable strip, never the center of an offscreen button box.
        const hits = Array.from({ length: 32 }, (_, index) => start + (index + .5) * (end - start) / 32).filter((x) => {
          const hit = document.elementFromPoint(x, y);
          return hit && (hit === button || button.contains(hit));
        });
        return hits.length ? [{ id: card.dataset.chartId, direction, x: hits[Math.floor(hits.length / 2)], y, visibleHitWidth: hits.length * (end - start) / 32 }] : [];
      });
    });
  });
  if (new Set(neighbors.map((entry) => entry.direction)).size !== 2) {
    await page.screenshot({ path: path.join(output, 'neighbor-failure.png') });
    await writeFile(path.join(output, 'neighbor-failure.json'), JSON.stringify(await page.locator('.health-explorer-track').evaluate((track) => ({
      viewport: { width: innerWidth, height: innerHeight }, track: track.getBoundingClientRect().toJSON(), scrollLeft: track.scrollLeft,
      cards: [...track.querySelectorAll('.health-explorer-card')].map((card) => {
        const button = card.querySelector('.health-explorer-neighbor'), rect = button?.getBoundingClientRect();
        return { id: card.dataset.chartId, active: card.dataset.active, card: card.getBoundingClientRect().toJSON(), button: rect?.toJSON(), hidden: card.getAttribute('aria-hidden'), inert: card.inert, pointer: button && getComputedStyle(button).pointerEvents, hit: rect && document.elementFromPoint(Math.min(innerWidth - 1, Math.max(1, rect.x + rect.width / 2)), Math.min(innerHeight - 1, Math.max(1, rect.y + rect.height / 2)))?.className };
      }),
    })), null, 2));
  }
  expect([...new Set(neighbors.map((entry) => entry.direction))].sort(), 'Both adjacent previews must accept a tap').toEqual(['left', 'right']);
  for (const neighbor of neighbors) {
    expect(neighbor.visibleHitWidth, 'Adjacent cards reveal a narrow, usable edge').toBeGreaterThanOrEqual(7.5);
    expect(neighbor.visibleHitWidth).toBeLessThanOrEqual(12.5);
  }
  const target = neighbors.find((entry) => entry.direction === 'right');
  await page.mouse.click(target.x, target.y);
  await expectActive(page, target.id);
  return target.id;
}

async function inspectReportChart(page, expectedDomain) {
  const chart = page.locator(`${activeSelector} .health-explorer-front .line-trend-chart.is-report`);
  await expect(chart).toBeVisible();
  await expect.poll(() => chart.evaluate((node) => node.getAnimations({ subtree: true }).every((animation) => ['finished', 'idle'].includes(animation.playState)))).toBe(true);
  await expect.poll(() => chart.evaluate((node) => {
    const view = node.querySelector('svg').viewBox.baseVal;
    return Math.abs(view.width - node.clientWidth) <= 1.5 && Math.abs(view.height - node.clientHeight) <= 1.5;
  })).toBe(true);
  const geometry = await chart.evaluate((node) => {
    const svg = node.querySelector('svg'), plot = node.closest('.health-explorer-plot');
    const view = svg.viewBox.baseVal, style = getComputedStyle(plot);
    const dates = [...svg.querySelectorAll('.trend-date')].map((label) => {
      const bounds = label.getBBox();
      return { value: label.textContent, fontSize: Number.parseFloat(getComputedStyle(label).fontSize), left: bounds.x, right: bounds.x + bounds.width, top: bounds.y, bottom: bounds.y + bounds.height };
    });
    const grid = [...svg.querySelectorAll('.trend-grid-line')].map((line) => ({ left: Number(line.getAttribute('x1')), right: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y1')) }));
    const points = [...svg.querySelectorAll('.trend-point')].filter((point) => point.querySelector('circle')).map((point) => ({ value: Number(point.getAttribute('data-value')), y: Number(point.querySelector('circle').getAttribute('cy')) }));
    return { width: view.width, height: view.height, plotWidth: plot.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight), plotHeight: plot.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom), axisLabels: svg.querySelectorAll('.trend-axis-value').length, dates, grid, points };
  });
  expect(geometry.axisLabels, 'Report front has no vertical number labels').toBe(0);
  expect(geometry.grid).toHaveLength(3);
  expect(Math.abs(geometry.width - geometry.plotWidth), 'Chart must use the available logical plot width').toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.height - geometry.plotHeight), 'Chart must use the available logical plot height').toBeLessThanOrEqual(2);
  const grid = geometry.grid[0];
  expect(grid.left, 'Removing Y labels must release their horizontal gutter').toBeLessThanOrEqual(22);
  expect(geometry.width - grid.right).toBeLessThanOrEqual(22);
  expect((grid.right - grid.left) / geometry.width).toBeGreaterThanOrEqual(.82);
  for (const date of geometry.dates) {
    expect(date.fontSize).toBe(12);
    expect(date.left, `Clipped date ${date.value}`).toBeGreaterThanOrEqual(-.5);
    expect(date.right).toBeLessThanOrEqual(geometry.width + .5);
    expect(date.top).toBeGreaterThanOrEqual(-.5);
    expect(date.bottom).toBeLessThanOrEqual(geometry.height + .5);
  }
  if (expectedDomain) {
    const top = Math.min(...geometry.grid.map((line) => line.y)), bottom = Math.max(...geometry.grid.map((line) => line.y));
    for (const point of geometry.points) {
      const expected = bottom - (point.value - expectedDomain[0]) / (expectedDomain[1] - expectedDomain[0]) * (bottom - top);
      expect(Math.abs(point.y - expected), 'Removing labels must preserve the explicit scale').toBeLessThanOrEqual(.01);
    }
  }
  return geometry;
}

async function selectSpecificChart(page, id) {
  const category = /^(journal|nutrition)-/.test(id) ? 'diet' : id.split('-')[0];
  await page.locator(`[data-health-category="${category}"]`).click();
  const track = page.locator('.health-explorer-track');
  const ids = await page.locator('.health-explorer-card').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.dataset.chartId))]);
  assert(ids.includes(id), `The ${category} carousel must contain ${id}`);
  await track.focus();
  for (let step = 0; step < ids.length; step++) {
    const current = await page.locator(activeSelector).getAttribute('data-chart-id');
    if (current === id) break;
    await track.press('ArrowRight');
    await expectActive(page, ids[(ids.indexOf(current) + 1) % ids.length]);
  }
  await expectActive(page, id);
}

async function inspectMealCard(page) {
  const id = 'journal-chart-meal-known';
  await selectSpecificChart(page, id);
  const active = page.locator(activeSelector);
  await expect(active).toHaveAttribute('data-card-kind', 'meal');
  await expect(active.locator('.health-explorer-front h3')).toHaveText('Fixture salmon, rice and greens');
  await expect(active.locator('.line-trend-chart')).toHaveCount(0);
  await expect(active.locator('.health-explorer-meal-visual')).toHaveAttribute('data-photo-kind', 'empty');
  await expect(active.locator('.health-explorer-meal-visual img')).toHaveCount(0);
  await active.locator('.health-explorer-flip').click();
  await expectActive(page, id, 'back');
  await assertFaceBoundary(page, 'back');
  await expect(active.locator('[data-nutrient="calories"]')).toHaveAttribute('data-nutrient-value', '520');
  await expect(active.locator('[data-nutrient="protein"], [data-nutrient="carbs"], [data-nutrient="fat"]')).toHaveCount(0);
  await selectSpecificChart(page, 'journal-chart-meal-zero');
  await page.locator(`${activeSelector} .health-explorer-flip`).click();
  await expectActive(page, 'journal-chart-meal-zero', 'back');
  await assertFaceBoundary(page, 'back');
  await expect(page.locator(`${activeSelector} [data-nutrient="calories"]`)).toHaveAttribute('data-nutrient-value', '0');
  return { preservedWholeMeal: true, missingNutrientsOmitted: true, explicitZeroPreserved: true, missingPhotoNotInvented: true };
}

async function inspectSimplifiedLayout(page) {
  await expect(page.locator('.health-report-tabs, .health-explorer-pagination')).toHaveCount(0);
  await expect(page.locator('.health-explorer-all, .health-explorer-sheet, .health-explorer-toolbar input')).toHaveCount(0);
  // The approved 320 × 568 layout deliberately scrolls its report region;
  // measure the fully revealed card. Normal-height layouts must fit without it.
  if (page.viewportSize().height <= 640) await page.locator('.record-hub--explorer').evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const layout = await page.locator('[data-health-explorer]').evaluate((root) => {
    const card = root.querySelector('.health-explorer-card[data-active="true"]').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const chat = document.querySelector('.bottom-nav [data-tab="ai"]'), orb = chat.querySelector('.ai-nav-orb');
    const chatTop = Math.min(chat.getBoundingClientRect().top, orb ? orb.getBoundingClientRect().top : Infinity);
    const backgrounds = [...root.querySelectorAll('.health-explorer-categories > button > span, .health-explorer-card[data-active="true"] .health-explorer-flip')].map((node) => {
      const style = getComputedStyle(node);
      return { class: node.className, flip: node.classList.contains('health-explorer-flip'), background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, radius: Number.parseFloat(style.borderRadius) };
    });
    const headingPositions = ['.health-explorer-toolbar h2', '.health-explorer-heading h2'].map((selector) => {
      const heading = root.querySelector(selector), range = document.createRange();
      const text = [...heading.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      range.selectNodeContents(text);
      return { iconLeft: heading.querySelector('img, svg').getBoundingClientRect().left, textLeft: range.getBoundingClientRect().left };
    });
    return { navGap: nav.top - card.bottom, chatGap: chatTop - card.bottom, backgrounds, headingPositions };
  });
  if (layout.navGap < 15.5 || layout.navGap > 24.5 || layout.chatGap < 5.5) {
    await page.screenshot({ path: path.join(output, 'spacing-failure.png') });
    await writeFile(path.join(output, 'spacing-failure.json'), JSON.stringify(layout, null, 2));
  }
  expect(layout.navGap).toBeGreaterThanOrEqual(15.5);
  expect(layout.navGap).toBeLessThanOrEqual(24.5);
  expect(layout.chatGap, 'The raised chat control must not overlap the main card').toBeGreaterThanOrEqual(5.5);
  expect(Math.abs(layout.headingPositions[0].iconLeft - layout.headingPositions[1].iconLeft), 'Toolbar and category icons align').toBeLessThanOrEqual(1);
  expect(Math.abs(layout.headingPositions[0].textLeft - layout.headingPositions[1].textLeft), 'Toolbar and category text align').toBeLessThanOrEqual(1);
  for (const item of layout.backgrounds) {
    if (item.flip) {
      expect(item.background, 'Only the flip control has no tile background').toBe('rgba(0, 0, 0, 0)');
      expect(item.image).toBe('none');
      expect(item.shadow).toBe('none');
    } else {
      expect(item.background, 'Category illustration tiles remain visible').not.toBe('rgba(0, 0, 0, 0)');
      expect(item.radius).toBeGreaterThanOrEqual(12);
    }
  }
  return layout;
}

try {
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch();
    try {
      for (const { width, height, locale } of [{ width: 320, height: 568, locale: 'zh' }, { width: 430, height: 932, locale: 'en' }]) {
        for (const reducedMotion of ['no-preference', 'reduce']) {
          const context = await browser.newContext({ viewport: { width, height }, locale: locale === 'zh' ? 'zh-CN' : 'en-US', isMobile: true, hasTouch: true, reducedMotion, timezoneId: 'Asia/Shanghai' });
          try {
            await context.addInitScript((language) => {
              sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
              localStorage.setItem('nava.locale', language);
              localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001', JSON.stringify({ completed: true, version: 3, answers: {}, source: 'local' }));
              // Local-only truthful chart fixtures: explicit 1–10 mood values
              // and six-digit step values. No server or real account writes.
              const journal = [];
              for (let index = 0; index < 7; index++) {
                const day = new Date(); day.setDate(day.getDate() - index);
                const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                journal.push({ id: `chart-mood-${index}`, category: 'mood', recordDate: date, data: { intensity: index + 2 }, createdAt: day.toISOString(), source: 'manual' });
                journal.push({ id: `chart-steps-${index}`, category: 'sport', recordDate: date, data: { steps: 123456 + index * 12345, durationMinutes: 45 }, createdAt: day.toISOString(), source: 'manual' });
                if (index === 0) {
                  journal.push({ id: 'chart-meal-known', category: 'food', recordDate: date, data: { foods: 'Fixture salmon, rice and greens', meal: '午餐', mealTime: '12:30', calories: 520 }, createdAt: day.toISOString(), source: 'manual' });
                  journal.push({ id: 'chart-meal-zero', category: 'food', recordDate: date, data: { foods: 'Fixture green tea', meal: '加餐', mealTime: '15:00', calories: 0 }, createdAt: day.toISOString(), source: 'manual' });
                }
              }
              localStorage.setItem('nava.review.demo.journal.v1', JSON.stringify(journal));
              window.__navaCarouselTrace = [];
              for (const type of ['scroll', 'keydown']) document.addEventListener(type, (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement) || !target.closest('.health-explorer-track')) return;
                const track = target.closest('.health-explorer-track');
                window.__navaCarouselTrace.push({ type, key: event.key, time: performance.now(), scrollLeft: track.scrollLeft, active: track.querySelector('[data-active="true"]')?.getAttribute('data-chart-id'), focus: document.activeElement?.className });
                window.__navaCarouselTrace = window.__navaCarouselTrace.slice(-80);
              }, true);
            }, locale);
            await context.route('**/*.supabase.co/**', (route) => route.fulfill({ json: [] }));
            const page = await context.newPage();
            const pageErrors = [];
            page.on('pageerror', (error) => pageErrors.push(error.message));
            await page.goto(`${url}?demo=1#tab=record`, { waitUntil: 'networkidle' });
            if (await page.locator('.launch-sequence').isVisible()) await page.locator('.launch-sequence').click();
            await expect(page.locator('[data-health-explorer]')).toBeVisible();
            await page.locator('[data-health-category="all"]').click();
            await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category', 'all');
            await expect(page.locator('.health-explorer-weekly-content .weekly-health-report')).toBeVisible();
            await expect(page.locator('.health-explorer-card')).toHaveCount(0);
            await expect(page.locator('[data-health-category]:not([data-health-category="all"]):not([data-health-category="heart"])')).toHaveCount(7);
            await expect(page.locator('[data-health-category="all"] strong')).toHaveText(locale === 'zh' ? '全部' : 'All');
            await expect(page.locator('[data-health-category="all"] img')).toHaveAttribute('src', /\/all\.webp$/);
            const meal = await inspectMealCard(page);
            await startLineAnimationSample(page);
            await page.locator('[data-health-category="energy"]').click();
            await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category', 'energy');
            await expect(page.locator('.health-explorer-heading h2')).toHaveText(locale === 'zh' ? '能量记录' : 'Energy records');
            await expect(page.locator('.health-explorer-pagination')).toHaveCount(0);
            const ids = await page.locator('.health-explorer-card').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.dataset.chartId))]);
            expect(ids).toEqual(['energy-calories', 'energy-protein', 'energy-carbs', 'energy-fat', 'energy-water']);
            const original = await page.locator(activeSelector).getAttribute('data-chart-id');
            const start = ids.indexOf(original);
            await expectActive(page, original);
            const motion = [await finishLineAnimationSample(page, original, reducedMotion)];
            await assertFaceBoundary(page, 'front');

            // The hidden recording action must neither gain focus nor receive
            // a pointer through the visible graph face.
            const hiddenRecord = page.locator(`${activeSelector} .health-explorer-record`);
            await page.locator(`${activeSelector} .health-explorer-flip`).focus();
            expect(await hiddenRecord.evaluate((node) => { node.focus(); return document.activeElement === node; })).toBe(false);
            const frontHit = await page.locator(activeSelector).evaluate((card) => {
              const front = card.querySelector('.health-explorer-front').getBoundingClientRect();
              const hidden = card.querySelector('.health-explorer-record').getBoundingClientRect();
              const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
              const x = Math.max(front.left + 8, Math.min(front.right - 8, hidden.x + hidden.width / 2));
              const y = Math.max(front.top + 8, Math.min(front.bottom - 8, nav.top - 8, hidden.y + hidden.height / 2));
              const hit = document.elementFromPoint(x, y);
              return { x, y, insideVisibleCard: Boolean(hit && card.contains(hit)), hiddenRecordHit: Boolean(hit?.closest('.health-explorer-record')) };
            });
            if (frontHit.insideVisibleCard) {
              expect(frontHit.hiddenRecordHit).toBe(false);
              const route = new URL(page.url()).hash;
              await page.mouse.click(frontHit.x, frontHit.y);
              await expect(page.locator('.journal-experience')).toHaveCount(0);
              expect(new URL(page.url()).hash).toBe(route);
              await expectActive(page, original);
            }

            // Keyboard users traverse real charts, including both wrap edges;
            // physical duplicate cards must not become extra data/pages.
            const track = page.locator('.health-explorer-track');
            await track.focus();
            for (let step = 1; step <= ids.length; step++) {
              if (step === 1) await startLineAnimationSample(page);
              await track.press('ArrowRight');
              await expectActive(page, ids[(start + step) % ids.length]);
              if (step === 1) motion.push(await finishLineAnimationSample(page, ids[(start + step) % ids.length], reducedMotion));
            }
            await track.press('ArrowLeft');
            const previous = ids[(start - 1 + ids.length) % ids.length];
            await expectActive(page, previous);
            await track.press('ArrowRight');
            await expectActive(page, original);

            if (reducedMotion === 'reduce') {
              // A physical clone recenter is not a new logical chart. A user
              // who immediately opens details at the wrap edge must not have
              // that interaction/focus discarded by the delayed recenter.
              await selectSpecificChart(page, ids[ids.length - 1]);
              await track.focus();
              await track.press('ArrowRight');
              await expect(page.locator(activeSelector)).toHaveAttribute('data-chart-id', ids[0]);
              await page.locator(`${activeSelector} .health-explorer-flip`).focus();
              await page.keyboard.press('Space');
              await expect(page.locator(activeSelector)).toHaveAttribute('data-side', 'back');
              await page.waitForTimeout(240); // Covers the carousel's 160ms recenter task.
              await expect(page.locator(activeSelector)).toHaveAttribute('data-side', 'back');
              await expect(page.locator(`${activeSelector} .health-explorer-flip`)).toBeFocused();
              await selectSpecificChart(page, original);
            }

            const flip = page.locator(`${activeSelector} .health-explorer-flip`);
            await flip.focus();
            await flip.press('Space');
            await expectActive(page, original, 'back');
            await assertFaceBoundary(page, 'back');
            await expect(flip).toBeFocused();
            for (let press = 0; press < 4; press++) {
              await page.keyboard.press('Tab');
              expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[inert], .health-explorer-card[data-active="false"]')))).toBe(false);
            }
            if (reducedMotion === 'reduce') {
              const rotations = await page.locator(activeSelector).evaluate((card) => [card, ...card.querySelectorAll('*')].filter((node) => {
                const value = getComputedStyle(node).transform;
                return value !== 'none' && !new DOMMatrixReadOnly(value).is2D;
              }).map((node) => node.className));
              expect(rotations, 'Reduce Motion must not rotate the card in 3D').toEqual([]);
            }
            await page.screenshot({ path: path.join(output, `${engine}-${width}-${locale}-${reducedMotion}-back.png`), animations: 'disabled' });

            // A page change clears the flipped state; a neighbor tap selects
            // its graph only and must not bubble into the flip control.
            await track.focus();
            await track.press('ArrowRight');
            await expectActive(page, ids[(start + 1) % ids.length]);
            await assertFaceBoundary(page, 'front');
            const neighbor = await chooseVisibleNeighbor(page);
            await assertFaceBoundary(page, 'front');
            await page.locator(`${activeSelector} .health-explorer-flip`).click();
            await expectActive(page, neighbor, 'back');
            await page.locator('[data-health-category="mood"]').click();
            await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category', 'mood');
            await expect(page.locator(activeSelector)).toHaveAttribute('data-side', 'front');
            await assertFaceBoundary(page, 'front');
            const charts = [];
            for (const [id, domain] of [['mood-intensity', [1, 10]], ['mood-legacy-rating', [0, 100]], ['exercise-steps', undefined]]) {
              await selectSpecificChart(page, id);
              charts.push({ id, ...await inspectReportChart(page, domain) });
            }
            const layout = await inspectSimplifiedLayout(page);
            await page.screenshot({ path: path.join(output, `${engine}-${width}-${locale}-${reducedMotion}-front.png`), animations: 'disabled' });
            expect(pageErrors).toEqual([]);
            results.push({ engine, width, height, locale, reducedMotion, realCharts: ids.length, keyboardWrapBothEdges: true, neighborTap: true, hiddenFaceInert: true, resetOnPageAndCategory: true, flipTarget44: true, meal, charts, layout, motion });
            console.log(`${engine} ${width} ${locale} ${reducedMotion}: carousel/flip boundaries passed`);
          } finally { await context.close(); }
        }
      }
    } finally { await browser.close(); }
  }
} catch (error) {
  errors.push(String(error));
  process.exitCode = 1;
  console.error(error);
} finally {
  await server.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ sourceRevision, passed: errors.length === 0 && results.length === 8, results, errors }, null, 2));
}
