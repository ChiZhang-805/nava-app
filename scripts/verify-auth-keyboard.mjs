import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const output = 'Q:/NAVA-Workspace/Build/TestRuns/App-Checks/auth-keyboard';
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
await server.listen();
const report = [];
try {
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    if (process.env.NAVA_AUTH_ENGINE && process.env.NAVA_AUTH_ENGINE !== engine) continue;
    const browser = await launcher.launch();
    try {
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
          await page.locator('.auth-screen').waitFor();
          if (mode === 'register') await page.locator('.auth-mode-icon').click();
          if (mode === 'reset') await page.locator('.auth-forgot').click();
          if (mode === 'otp') await page.locator('.auth-method-switch').click();
          await page.waitForTimeout(900);
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
            assert(field.y >= after.region.y && field.y + field.height <= visible, `${engine}/${width}/${mode}/${index}: focused field hidden`);
            report.push({ engine,width,height,mode,index,before,after,field });
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
