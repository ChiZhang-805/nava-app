import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/auth-keyboard';
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
await server.listen();
const report = [];
const viewportStyles = await readFile(new URL('../src/styles/mobile-viewport.css', import.meta.url), 'utf8');

async function verifyDensityBoundaries(browser, engine) {
  // Desktop engines report a zero safe area. Reproduce native inset geometry
  // explicitly and measure the original DOM bounds, not a clipped AX frame.
  for (const { width, height, safeTop, visibleHeights } of [
    { width: 375, height: 667, safeTop: 20, visibleHeights: [314, 323, 334, 339, 350, 377, 390, 420, 450, 460] },
    { width: 430, height: 932, safeTop: 59, visibleHeights: [440, 470, 502, 540, 573] },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    try {
      await context.route('**/*.supabase.co/**', route => route.fulfill({ json: [] }));
      await context.addInitScript(() => {
        const vv = window.visualViewport;
        let keyboardHeight;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'height');
        Object.defineProperty(vv, 'height', { get: () => keyboardHeight ?? descriptor.get.call(vv) });
        window.authTestKeyboard = value => { keyboardHeight = value; vv.dispatchEvent(new Event('resize')); };
      });
      const page = await context.newPage();
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
      await page.locator('.auth-screen').waitFor();
      await page.addStyleTag({ content: viewportStyles.replaceAll('env(safe-area-inset-top)', `${safeTop}px`) });
      for (const language of ['zh', 'en']) {
        if (language === 'en') await page.locator('.auth-locale').click();
        await page.locator('.auth-social-button--wechat').click();
        await page.locator('.auth-feedback-slot .error-text').waitFor();
        for (const visible of visibleHeights) {
          await page.locator('.auth-fields input').first().evaluate(input => input.focus({ preventScroll: true }));
          await page.evaluate(value => window.authTestKeyboard(value), visible);
          await page.waitForFunction(value => document.documentElement.dataset.keyboardOpen === 'true'
            && Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--nava-visible-height')) - value) < 1, visible);
          await page.waitForTimeout(100);
          const geometry = await page.evaluate(() => {
            const region = document.querySelector('.auth-form-region');
            const regionRect = region.getBoundingClientRect();
            const form = document.querySelector('.auth-form');
            const buttons = [...document.querySelectorAll('.auth-social-button')].map(button => {
              const box = button.getBoundingClientRect();
              let top = box.top, bottom = box.bottom, left = box.left, right = box.right;
              for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
                const style = getComputedStyle(ancestor);
                const clip = ancestor.getBoundingClientRect();
                if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                  top = Math.max(top, clip.top + ancestor.clientTop);
                  bottom = Math.min(bottom, clip.top + ancestor.clientTop + ancestor.clientHeight);
                }
                if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                  left = Math.max(left, clip.left + ancestor.clientLeft);
                  right = Math.min(right, clip.left + ancestor.clientLeft + ancestor.clientWidth);
                }
              }
              return { label: button.textContent, height: box.height, bottom: box.bottom,
                clippedY: box.height - Math.max(0, bottom - top), clippedX: box.width - Math.max(0, right - left) };
            });
            return { regionHeight: regionRect.height, regionBottom: regionRect.bottom,
              scrollHeight: region.scrollHeight, clientHeight: region.clientHeight, scrollTop: region.scrollTop,
              formHeight: form.getBoundingClientRect().height, buttons };
          });
          const state = { engine, width, height, safeTop, language, visible, geometry };
          report.push(state);
          assert(geometry.scrollHeight <= geometry.clientHeight + 1, `Login density overflow: ${JSON.stringify(state)}`);
          assert.equal(geometry.scrollTop, 0, 'The login form must fit without scrolling');
          for (const button of geometry.buttons) {
            assert(button.height >= 28 && button.clippedY <= 1 && button.clippedX <= 1,
              `Shortcut is only partially visible: ${JSON.stringify(state)}`);
            assert(button.bottom <= geometry.regionBottom + 1 && button.bottom <= visible, 'Shortcut exceeds visible region');
          }
          if (visible === 339) await page.screenshot({ path: `${output}/${engine}-${width}-safe-${safeTop}-${language}-density.png` });
        }
        await page.evaluate(() => { document.activeElement.blur(); window.authTestKeyboard(undefined); });
        await page.waitForFunction(() => !document.documentElement.dataset.keyboardOpen);
      }
    } finally { await context.close(); }
  }
}
try {
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    if (process.env.NAVA_AUTH_ENGINE && process.env.NAVA_AUTH_ENGINE !== engine) continue;
    const browser = await launcher.launch();
    try {
      await verifyDensityBoundaries(browser, engine);
      if (process.env.NAVA_AUTH_DENSITY_ONLY) continue;
      for (const [width, height] of [[320,568],[375,667],[360,740],[375,812],[390,844],[402,874],[430,932]]) {
        if (process.env.NAVA_AUTH_WIDTH && width !== Number(process.env.NAVA_AUTH_WIDTH)) continue;
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN' });
        await context.route('**/*.supabase.co/**', route => route.fulfill({ json: [] }));
        await context.addInitScript(() => {
          const vv = window.visualViewport;
          let height;
          const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'height');
          Object.defineProperty(vv, 'height', { get: () => height ?? descriptor.get.call(vv) });
          window.authTestKeyboard = value => { height = value; vv.dispatchEvent(new Event('resize')); };
        });
        const page = await context.newPage();
        for (const mode of ['login', 'register', 'reset', 'otp']) {
          await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
          await page.locator('.auth-screen').waitFor().catch(async error => {
            await page.screenshot({ path: `${output}/${engine}-${width}-${height}-${mode}-startup-failure.png` });
            throw error;
          });
          if (mode === 'register') await page.locator('.auth-mode-icon').click();
          if (mode === 'reset') await page.locator('.auth-forgot').click();
          if (mode === 'otp') await page.locator('.auth-method-switch').click();
          await page.waitForTimeout(900);
          const surfaces = await page.locator('.input-wrap').evaluateAll(elements => elements.map(element => {
            const surface = element.querySelector('.continuous-field-surface');
            const frame = element.getBoundingClientRect();
            const shape = surface?.getBoundingClientRect();
            return { ready: element.dataset.continuousReady, path: surface?.querySelector('path')?.getAttribute('d'),
              width: frame.width, height: frame.height, shapeWidth: shape?.width, shapeHeight: shape?.height };
          }));
          for (const surface of surfaces) {
            assert.equal(surface.ready, 'true');
            assert(/c/i.test(surface.path ?? ''), 'Continuous surface must contain curve transitions');
            assert.equal(surface.width, surface.shapeWidth);
            assert.equal(surface.height, surface.shapeHeight);
          }
          const measure = () => page.evaluate(() => {
            const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom }; };
            return { backdrop:rect('.auth-backdrop'), brand:rect('.nava-wordmark'), region:rect('.auth-form-region'), scrollY, scrollX };
          });
          const before = await measure();
          const fields = page.locator('.auth-fields input');
          for (let index = 0; index < await fields.count(); index++) {
            // Do not use Playwright scrollIntoView: that would hide an app bug.
            await fields.nth(index).evaluate(input => input.focus({ preventScroll: true }));
            const visible = height - (height < 700 ? 290 : 360);
            await page.evaluate(h => window.authTestKeyboard(h), visible);
            await page.waitForFunction(h => document.documentElement.dataset.keyboardOpen === 'true'
              && document.querySelector('.auth-form-region').getBoundingClientRect().bottom <= h + 1,
            visible, { timeout: 4000 }).catch(async error => {
              console.log(await page.evaluate(() => ({vv:visualViewport.height, layout:innerHeight, active:document.activeElement?.outerHTML, root:document.documentElement.outerHTML.slice(0,500)})));
              throw error;
            });
            await fields.nth(index).evaluate(input => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(input.getBoundingClientRect().top)))));
            const after = await measure();
            const field = await fields.nth(index).boundingBox();
            assert.deepEqual(after.backdrop, before.backdrop, `${engine}/${width}/${mode}: wallpaper moved`);
            assert.equal(after.scrollY, 0, 'outer document scrolled');
            assert(after.brand.y >= 0 && after.brand.bottom <= after.region.y + 1, 'brand escaped header');
            assert(after.region.bottom <= visible + 1, `${engine}/${width}/${mode}/${index}: form extends behind keyboard ${JSON.stringify({after,visible})}`);
            assert(field.y >= after.region.y && field.y + field.height <= visible, `${engine}/${width}/${mode}/${index}: focused field hidden ${JSON.stringify({field, after, visible})}`);
            if (mode === 'login') {
              for (const selector of ['.auth-secondary-links', '.auth-social-button--wechat', '.auth-social-button--apple', '.auth-social-button--qq']) {
                assert(await page.locator(selector).isVisible(), `Missing login route: ${selector}`);
              }
              {
                const last = await page.locator('.auth-social-button--qq').boundingBox();
                assert(last.height >= (visible <= 300 ? 28 : 32), 'Compact shortcut hit area is too small');
                assert(visible - last.y - last.height >= 0 && visible - last.y - last.height <= 28,
                  `Shortcut gap: ${JSON.stringify({visible,last})}`);
                const firstField = await page.locator('.auth-fields .field').nth(0).boundingBox();
                const secondField = await page.locator('.auth-fields .field').nth(1).boundingBox();
                const submit = await page.locator('.auth-submit').boundingBox();
                const locale = await page.locator('.auth-locale').boundingBox();
                const minimumGap = visible <= 300 ? 3.5 : 7.5;
                assert(secondField.y - firstField.y - firstField.height >= minimumGap, 'Input rows are crowded');
                assert(submit.y - secondField.y - secondField.height >= minimumGap, 'Submit crowds password');
                assert(firstField.y >= locale.y + locale.height, 'Language control overlaps form');
                assert(after.brand.y >= locale.y + locale.height - 1, 'Brand must sit below language control');
                for (const label of await page.locator('.auth-fields .field-label').all()) {
                  assert(await label.isVisible(), 'Field label disappeared');
                  assert((await label.boundingBox()).height >= 14, 'Field label collapsed');
                }
                if (visible > 320) {
                  assert(firstField.y - after.brand.bottom >= 8, 'Brand needs breathing room below');
                  assert(after.brand.y - locale.y - locale.height >= 4, 'Brand needs breathing room above');
                }
                assert.equal(await page.locator('.auth-form-region').evaluate(el => el.scrollTop), 0, 'Login requires scrolling');
              }
            }
            report.push({ engine,width,height,mode,index,before,after,field });
          }
          if (mode === 'login') {
            const beforeError = await page.locator('.auth-submit').boundingBox();
            // Real UI path: unconfigured WeChat reports an error without navigating.
            await page.locator('.auth-social-button--wechat').click();
            await page.locator('.auth-feedback-slot .error-text').waitFor();
            await fields.first().evaluate(input => input.focus({ preventScroll: true }));
            await page.waitForTimeout(180);
            const feedback = await page.locator('.auth-feedback-slot').boundingBox();
            const password = await page.locator('.auth-fields .field').nth(1).boundingBox();
            const submit = await page.locator('.auth-submit').boundingBox();
            const links = await page.locator('.auth-secondary-links').boundingBox();
            const divider = await page.locator('.auth-social-divider').boundingBox();
            const shortcuts = await page.locator('.auth-social-options').boundingBox();
            assert.deepEqual(submit, beforeError, 'Feedback must not shift the submit button');
            assert(feedback.y >= password.y + password.height && feedback.y + feedback.height <= submit.y + 1, 'Feedback must have its own row above submit');
            assert.equal(Math.round(submit.width), Math.round(password.width), 'Submit must remain full width');
            assert(links.y >= submit.y + submit.height && divider.y >= links.y + links.height && shortcuts.y >= divider.y + divider.height, 'Login reading order changed');
            assert(shortcuts.y + shortcuts.height <= height - (height < 700 ? 290 : 360), 'Feedback pushes shortcuts behind keyboard');
            assert.equal(await page.locator('.auth-form-region').evaluate(el => el.scrollTop), 0);
            await page.screenshot({path: `${output}/${engine}-${width}-${height}-login-feedback.png`});
          }
          if (width === 430 || (width === 375 && height === 667)) {
            await page.screenshot({ path: `${output}/${engine}-${width}-${height}-${mode}-keyboard-layout.png` });
          }
          await page.evaluate(() => { document.activeElement.blur(); window.authTestKeyboard(undefined); });
          await page.waitForFunction(() => !document.documentElement.dataset.keyboardOpen, undefined, { timeout: 3000 }).catch(async error => {
            console.log(await page.evaluate(() => ({vv:visualViewport.height, layout:innerHeight, active:document.activeElement?.outerHTML, root:document.documentElement.outerHTML.slice(0,500)})));
            throw error;
          });
          const restored = await measure();
          assert.deepEqual(restored.backdrop, before.backdrop);
          assert.deepEqual(restored.brand, before.brand, 'brand did not restore');
          const state = await page.evaluate(() => ({ keyboard:document.documentElement.dataset.keyboardOpen, scroll:document.querySelector('.auth-form-region').scrollTop }));
          assert(!state.keyboard && state.scroll === 0, 'keyboard layout did not reset');
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  await writeFile(`${output}/browser-layout.json`, JSON.stringify({ source:'Browser geometry regression; NOT native keyboard evidence', results:report }, null, 2));
  await server.close();
}
console.log(`Authentication keyboard geometry: ${report.length} field states passed in Chromium and WebKit.`);
