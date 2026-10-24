import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Wardrobe layout regression. Run from repository root; never confirms an unlock.
// Example: node scripts/verify-wardrobe-layout.mjs --case desktop
// NAVA_WARDROBE_EVIDENCE_DIR routes evidence into <root>/layout; --output takes precedence.
// --base-url http://127.0.0.1:5276 reuses a local server; otherwise starts port 5294.
const repository = process.cwd();
const argumentsList = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argumentsList.indexOf(name);
  return index < 0 ? fallback : argumentsList[index + 1];
};
const defaultOutput = process.env.NAVA_WARDROBE_EVIDENCE_DIR ? resolve(process.env.NAVA_WARDROBE_EVIDENCE_DIR, 'layout') : resolve(repository, 'artifacts', 'test-runs', 'wardrobe-layout');
const output = resolve(option('--output', defaultOutput));
const filter = new RegExp(option('--case', '.'));
const port = Number(option('--port', '5294'));
let base = option('--base-url', null);
applyProjectPublicEnv(repository);
await mkdir(output, { recursive: true });

const mobileSizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const cases = [
  ...mobileSizes.map(([width, height]) => ({ id: `mobile-${width}x${height}`, width, height, mobile: true })),
  ...mobileSizes.map(([width, height]) => ({ id: `mobile-safe59-34-${width}x${height}`, width, height, mobile: true, safe: { top: 59, bottom: 34, left: 0, right: 0 } })),
  ...[859, 861, 900].map((height) => ({ id: `desktop-1440x${height}-iphone14`, width: 1440, height, mobile: false, device: 'iphone-14' })),
  { id: 'desktop-1280x800-iphone15pro', width: 1280, height: 800, mobile: false, device: 'iphone-15-pro' },
  { id: 'desktop-1365x1000-iphone15promax', width: 1365, height: 1000, mobile: false, device: 'iphone-15-pro-max' },
  { id: 'fallback-mobile-safe59-34-360x740', width: 360, height: 740, mobile: true, safe: { top: 59, bottom: 34, left: 0, right: 0 }, webglUnavailable: true },
  { id: 'fallback-desktop-1440x900-iphone14', width: 1440, height: 900, mobile: false, device: 'iphone-14', webglUnavailable: true },
].filter((scenario) => filter.test(scenario.id));
if (!cases.length) throw new Error('No test case matched --case');

const report = {
  passed: false,
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { cwd: repository, encoding: 'utf8' }).trim(),
  evidenceScope: 'Local demo only; real GLB renderer plus two deliberate WebGL-unavailable image-fallback cases; full viewport screenshots; native Chromium env() safe-area override, not real iOS hardware.',
  rules: { noAutomaticScrolling: true, noUnlockConfirmation: true, cornerInsetCssPixels: 12, geometryToleranceCssPixels: 1 },
  scenarios: [],
  errors: [],
};
let server;
let browser;

function requireCheck(result, condition, message) {
  if (!condition) result.failures.push(message);
}

async function afterPaint(page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function ensureVisual(page, scenario) {
  await expect(page.locator('.mascot-wardrobe-character')).toHaveAttribute('data-renderer', scenario.webglUnavailable ? 'unavailable' : 'ready', { timeout: 90000 });
  if (scenario.webglUnavailable) {
    await expect(page.locator('.mascot-wardrobe-character img')).toHaveCount(1);
    await page.locator('.mascot-wardrobe-character img').evaluate((image) => image.decode());
    await expect(page.locator('.mascot-wardrobe-character')).not.toHaveAttribute('aria-label', /转身/);
  }
  // The fallback can resolve before the page's entry transform finishes.
  // Measure settled layout; do not disable animation or scroll into view.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})));
  });
}

async function measure(page, buttonSelector = '.mascot-wardrobe-action button') {
  return page.evaluate(({ buttonSelector }) => {
    const rect = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const describe = (element) => element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' ? `.${element.className.trim().replace(/\s+/g, '.')}` : ''}` : null;
    const selectors = ['.phone-frame', '.safe-top', '.figma-app-header', '.app-content', '.screen-panel', '.profile-subpage', '.mascot-wardrobe', '.mascot-wardrobe-preview', '.mascot-wardrobe-character', '.mascot-wardrobe-look-summary', '.mascot-wardrobe-tabs', '.mascot-wardrobe-grid', '.mascot-wardrobe-pagination', '.mascot-wardrobe-action', '.mascot-wardrobe-action button', '.ios-home-gesture', '.ios-home-gesture > span', '.nava-device-home-indicator', '.mascot-wardrobe-sheet', '.mascot-wardrobe-sheet-actions'];
    const boxes = Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const style = getComputedStyle(element);
      return [selector, { ...rect(element), clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft, offsetHeight: element.offsetHeight, overflowX: style.overflowX, overflowY: style.overflowY, padding: style.padding, flex: style.flex, minHeight: style.minHeight, display: style.display, visibility: style.visibility }];
    }));
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    document.body.append(probe);
    const probeStyle = getComputedStyle(probe);
    const safeArea = { top: parseFloat(probeStyle.paddingTop), right: parseFloat(probeStyle.paddingRight), bottom: parseFloat(probeStyle.paddingBottom), left: parseFloat(probeStyle.paddingLeft) };
    probe.remove();
    const element = document.querySelector(buttonSelector);
    const button = rect(element);
    const clippedBy = [];
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (element) {
      let ancestor = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        const r = ancestor.getBoundingClientRect();
        const clipX = /hidden|clip|auto|scroll/.test(style.overflowX);
        const clipY = /hidden|clip|auto|scroll/.test(style.overflowY);
        if (clipX) { clip.left = Math.max(clip.left, r.left); clip.right = Math.min(clip.right, r.right); }
        if (clipY) { clip.top = Math.max(clip.top, r.top); clip.bottom = Math.min(clip.bottom, r.bottom); }
        if (clipX || clipY) clippedBy.push({ element: describe(ancestor), clipX, clipY, ...rect(ancestor) });
        ancestor = ancestor.parentElement;
      }
    }
    const inset = button ? Math.min(12, button.width / 4, button.height / 4) : 0;
    const points = button ? [
      ['center', button.left + button.width / 2, button.top + button.height / 2],
      ['top-left', button.left + inset, button.top + inset],
      ['top-right', button.right - inset, button.top + inset],
      ['bottom-left', button.left + inset, button.bottom - inset],
      ['bottom-right', button.right - inset, button.bottom - inset],
    ].map(([name, x, y]) => {
      const target = document.elementFromPoint(x, y);
      return { name, x, y, hit: Boolean(target && element && (target === element || element.contains(target))), target: describe(target) };
    }) : [];
    const frame = boxes['.phone-frame'];
    const gesture = boxes['.ios-home-gesture'];
    const scale = frame && frame.offsetHeight ? frame.height / frame.offsetHeight : 1;
    const visibleGesture = gesture && gesture.width > 0 && gesture.height > 0 && gesture.display !== 'none' && gesture.visibility !== 'hidden' ? gesture : null;
    const content = boxes['.app-content'];
    const safeBoundary = frame ? frame.bottom - safeArea.bottom * scale : innerHeight - safeArea.bottom;
    const bottomBoundary = Math.min(clip.bottom, content?.bottom ?? innerHeight, visibleGesture?.top ?? Infinity, safeBoundary);
    return {
      viewport: { width: innerWidth, height: innerHeight, visualWidth: visualViewport?.width, visualHeight: visualViewport?.height, dpr: devicePixelRatio, scrollX, scrollY },
      documentOverflow: { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight },
      desktopPreviewActive: matchMedia('(hover: hover) and (pointer: fine) and (min-width: 700px) and (min-height: 700px)').matches,
      legacyLargeViewportMedia: matchMedia('(min-width:420px) and (min-height:860px)').matches,
      device: document.querySelector('.nava-app-stage')?.dataset.navaPreviewDevice,
      renderer: document.querySelector('.mascot-wardrobe-character')?.getAttribute('data-renderer'),
      fallbackImages: [...document.querySelectorAll('.mascot-wardrobe-character img')].map((image) => ({ ...rect(image), decoded: image.complete && image.naturalWidth > 0 })),
      modelLoadingCount: document.querySelectorAll('.mascot-wardrobe-model-loading').length,
      skin: document.querySelector('.mascot-wardrobe-turntable')?.getAttribute('data-skin'),
      hintCount: document.querySelectorAll('.mascot-wardrobe-motion-hint').length,
      safeArea, scale, boxes,
      button: { selector: buttonSelector, ...button, text: element?.textContent?.trim(), disabled: element?.disabled, clip, clippedBy, points, safeBoundary, bottomBoundary, bottomGap: button ? bottomBoundary - button.bottom : null, gestureGap: button && visibleGesture ? visibleGesture.top - button.bottom : null },
      demoWardrobeStorage: sessionStorage.getItem('nava.demo.mascot-wardrobe.v1'),
    };
  }, { buttonSelector });
}

function checkLayout(result, geometry, scenario, stage) {
  const check = (condition, message) => requireCheck(result, condition, `${stage}: ${message}`);
  const b = geometry.button;
  check(geometry.renderer === (scenario.webglUnavailable ? 'unavailable' : 'ready'), 'unexpected renderer state');
  check(geometry.modelLoadingCount === 0, 'loading status remained after renderer settled');
  if (scenario.webglUnavailable) {
    const character = geometry.boxes['.mascot-wardrobe-character'];
    const summary = geometry.boxes['.mascot-wardrobe-look-summary'];
    check(geometry.fallbackImages.length > 0 && geometry.fallbackImages.every((image) => image.decoded), 'fallback image did not decode');
    check(geometry.fallbackImages.every((image) => image.left >= character.left - 1 && image.right <= character.right + 1 && image.top >= character.top - 1 && image.bottom <= character.bottom + 1), 'fallback art extends outside its character area and may overlap the look summary');
    check(geometry.fallbackImages.every((image) => image.bottom <= summary.top), 'fallback art is covered by the look summary');
  }
  check(geometry.hintCount === 0, 'operation hint line is still present');
  check(geometry.desktopPreviewActive === !scenario.mobile, 'wrong desktop/mobile media path');
  check(geometry.documentOverflow.x <= 1, `document horizontal overflow ${geometry.documentOverflow.x}`);
  check(Math.abs(geometry.viewport.scrollY) <= 1, 'document scrolled vertically');
  for (const selector of ['.app-content', '.screen-panel', '.profile-subpage', '.mascot-wardrobe']) {
    const item = geometry.boxes[selector];
    check(Boolean(item), `${selector} missing`);
    if (!item) continue;
    check(item.scrollHeight - item.clientHeight <= 1, `${selector} vertical overflow ${item.scrollHeight - item.clientHeight}`);
    check(Math.abs(item.scrollTop) <= 1, `${selector} auto-scrolled to ${item.scrollTop}`);
  }
  const content = geometry.boxes['.app-content'];
  for (const selector of ['.mascot-wardrobe-preview', '.mascot-wardrobe-tabs', '.mascot-wardrobe-grid', '.mascot-wardrobe-pagination']) {
    const item = geometry.boxes[selector];
    check(item && item.top >= content.top - 1 && item.bottom <= content.bottom + 1, `${selector} extends outside content`);
  }
  check(b.width > 0 && b.height > 0, 'action has no visible box');
  check(b.left >= b.clip.left - 1 && b.right <= b.clip.right + 1 && b.top >= b.clip.top - 1 && b.bottom <= b.clip.bottom + 1, 'action extends outside an ancestor clipping boundary');
  check(b.bottomGap >= -1, `action overlaps home gesture/safe-area by ${(-b.bottomGap).toFixed(2)}px`);
  check(b.points.length === 5 && b.points.every((point) => point.hit), `action hit test failed: ${b.points.filter((point) => !point.hit).map((point) => `${point.name} -> ${point.target}`).join(', ')}`);
  if (scenario.safe) {
    check(geometry.safeArea.top === scenario.safe.top && geometry.safeArea.bottom === scenario.safe.bottom, `safe-area env override failed: ${JSON.stringify(geometry.safeArea)}`);
    check(geometry.boxes['.safe-top'].height >= scenario.safe.top - 1, 'top safe area is not reserved');
  }
}

async function capture(page, result, scenario, stage) {
  await afterPaint(page);
  const geometry = await measure(page);
  result.states[stage] = geometry;
  checkLayout(result, geometry, scenario, stage);
  const filename = `${scenario.id}-${stage}.png`;
  await page.screenshot({ path: resolve(output, filename), fullPage: false });
  result.screenshots.push(filename);
  return geometry;
}

async function runScenario(scenario) {
  const result = { ...scenario, passed: false, states: {}, screenshots: [], failures: [], pageErrors: [], sheetOpened: false, sheetCancelled: false };
  report.scenarios.push(result);
  const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, isMobile: scenario.mobile, hasTouch: scenario.mobile, locale: 'zh-CN', deviceScaleFactor: 1 });
  try {
    await context.addInitScript((device) => {
      sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
      localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001', JSON.stringify({ completed: true, version: 3, answers: {} }));
      localStorage.setItem('nava.desktop-preview-device.v1', device);
    }, scenario.device ?? 'iphone-15-pro-max');
    if (scenario.webglUnavailable) {
      await context.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type.startsWith('webgl') ? null : original.call(this, type, ...args);
        };
      });
    }
    const page = await context.newPage();
    page.on('pageerror', (error) => result.pageErrors.push(error.message));
    if (scenario.safe) {
      const protocol = await context.newCDPSession(page);
      await protocol.send('Emulation.setSafeAreaInsetsOverride', { insets: { ...scenario.safe, topMax: scenario.safe.top, bottomMax: scenario.safe.bottom, leftMax: 0, rightMax: 0 } });
    }
    await page.goto(`${base.replace(/\/$/, '')}/?demo=1#tab=profile&view=wardrobe`, { waitUntil: 'domcontentloaded' });
    await page.locator('.mascot-wardrobe').waitFor({ timeout: 30000 });
    if (await page.locator('.launch-sequence').isVisible()) await page.locator('.launch-sequence').click();
    await ensureVisual(page, scenario);
    await expect(page.locator('.mascot-wardrobe-turntable')).toHaveAttribute('data-skin', 'skin-cream');
    await capture(page, result, scenario, 'cream');
    if (!scenario.webglUnavailable) {
      await page.locator('.mascot-wardrobe-view-toggle').click();
      await expect(page.locator('.mascot-wardrobe-character')).toHaveAttribute('data-view-mode', '2d');
      await expect(page.locator('.mascot-wardrobe-flat-frame')).toBeVisible({ timeout: 30000 });
      const source = await page.locator('.mascot-wardrobe-flat-frame').getAttribute('src');
      requireCheck(result, /\/(?:src\/assets\/wardrobe\/front\/|assets\/)accessory-none(?:-[^/?]+)?\.png(?:\?.*)?$/.test(source ?? ''), `2D mode did not use the approved transparent frontal artwork: ${source}`);
      const alpha = await page.locator('.mascot-wardrobe-flat-frame').evaluate(async (image) => {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const corner = context.getImageData(0, 0, 1, 1).data[3];
        const center = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3];
        return { corner, center };
      });
      requireCheck(result, alpha.corner === 0 && alpha.center > 0, `2D PNG alpha is wrong: ${JSON.stringify(alpha)}`);
      await capture(page, result, scenario, 'flat-front');
      await page.locator('.mascot-wardrobe-character').click();
      await page.waitForTimeout(500);
      const stableSource = await page.locator('.mascot-wardrobe-flat-frame').getAttribute('src');
      requireCheck(result, stableSource === source, '2D preview changed away from the approved exact frontal artwork');
      await page.getByRole('tab', { name: '饰品' }).click();
      await page.locator('.mascot-wardrobe-item').filter({ hasText: '铃铛项圈' }).click();
      await expect(page.locator('.mascot-wardrobe-flat-frame')).toHaveAttribute('src', /accessory-bell-collar/);
      await page.locator('.mascot-wardrobe-flat-frame').evaluate((image) => image.decode());
      await capture(page, result, scenario, 'flat-bell-collar');
      await page.locator('.mascot-wardrobe-view-toggle').click();
      await expect(page.locator('.mascot-wardrobe-character')).toHaveAttribute('data-view-mode', '3d');
      await page.getByRole('tab', { name: '皮肤' }).click();
    }

    const warm = page.locator('.mascot-wardrobe-item').filter({ hasText: '暖橘' });
    const warmPoint = await warm.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: Boolean(hit && (hit === element || element.contains(hit))) };
    });
    if (!warmPoint.hit) throw new Error('Warm-orange card center is not directly reachable without scrolling');
    // Coordinate clicks cannot silently scroll a clipped container into view.
    if (scenario.mobile) await page.touchscreen.tap(warmPoint.x, warmPoint.y);
    else await page.mouse.click(warmPoint.x, warmPoint.y);
    await expect(page.locator('.mascot-wardrobe-action button')).toHaveText('兑换');
    await expect(page.locator('.mascot-wardrobe-turntable')).toHaveAttribute('data-skin', 'skin-warm-orange');
    await ensureVisual(page, scenario);
    const warmGeometry = await capture(page, result, scenario, 'warm-orange');
    requireCheck(result, !warmGeometry.button.disabled, 'warm-orange exchange button is disabled');
    const center = warmGeometry.button.points.find((point) => point.name === 'center');
    if (!center?.hit || warmGeometry.button.bottomGap < -1) throw new Error('Exchange action is clipped or blocked; refusing an auto-scroll workaround');
    if (scenario.mobile) await page.touchscreen.tap(center.x, center.y);
    else await page.mouse.click(center.x, center.y);
    const sheet = page.getByRole('dialog', { name: '小猫衣橱操作' });
    await expect(sheet).toContainText('确认兑换暖橘');
    result.sheetOpened = true;
    await afterPaint(page);
    result.states.sheet = await measure(page, '.mascot-wardrobe-sheet-actions button:first-child');
    const sheetFilename = `${scenario.id}-exchange-sheet.png`;
    await page.screenshot({ path: resolve(output, sheetFilename), fullPage: false });
    result.screenshots.push(sheetFilename);
    const cancel = result.states.sheet.button;
    requireCheck(result, cancel.text === '取消', 'sheet cancellation control is not the expected button');
    requireCheck(result, cancel.points.every((point) => point.hit), 'sheet cancel button has a blocked hit point');
    requireCheck(result, cancel.bottomGap >= -1, 'sheet cancel button overlaps the home gesture or safe area');
    const cancelCenter = cancel.points.find((point) => point.name === 'center');
    if (!cancelCenter?.hit) throw new Error('Cancel center is blocked');
    if (scenario.mobile) await page.touchscreen.tap(cancelCenter.x, cancelCenter.y);
    else await page.mouse.click(cancelCenter.x, cancelCenter.y);
    await expect(sheet).toHaveCount(0);
    result.sheetCancelled = true;
    const restored = await capture(page, result, scenario, 'after-cancel');
    requireCheck(result, restored.demoWardrobeStorage === warmGeometry.demoWardrobeStorage, 'cancel unexpectedly changed demo wardrobe state');
    requireCheck(result, restored.button.text === '兑换', 'cancel unexpectedly unlocked the skin');
  } catch (error) {
    result.failures.push(error.stack ?? String(error));
  } finally {
    result.failures.push(...result.pageErrors.map((message) => `pageerror: ${message}`));
    result.passed = result.failures.length === 0 && result.sheetOpened && result.sheetCancelled;
    await context.close();
    console.log(JSON.stringify({ case: scenario.id, passed: result.passed, failures: result.failures, actionGap: result.states['warm-orange']?.button.bottomGap }));
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  }
}

try {
  if (base) {
    const url = new URL(base);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('The demo harness may only run against localhost');
  } else {
    server = await createServer({ root: repository, server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'silent' });
    await server.listen();
    base = server.resolvedUrls.local[0];
  }
  report.base = base;
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const scenario of cases) await runScenario(scenario);
  report.passed = report.scenarios.every((scenario) => scenario.passed);
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  if (server) await server.close();
}
console.log(`Wardrobe layout: ${report.scenarios.filter((scenario) => scenario.passed).length}/${cases.length} passed. Evidence: ${output}`);
if (!report.passed) process.exitCode = 1;
