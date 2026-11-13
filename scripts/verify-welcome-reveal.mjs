import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const output = 'Q:/NAVA-Workspace/Build/TestRuns/App-Checks/welcome-reveal';
await mkdir(output, { recursive: true });
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {LocaleProvider} from '/src/i18n.tsx';import Onboarding from '/src/features/OnboardingScreen.tsx';
import '/src/styles/global.css';import '/src/styles/product-ui.css';
createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Onboarding,{user:{id:'welcome-preview-only'},mode:'first',previewOnly:true,onComplete:()=>{window.didComplete=true;}})));
</script></body></html>`;
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5276, strictPort: true }, plugins: [{ name: 'welcome-preview', configureServer(server) {
  server.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__welcome.html')) return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, fixture));
  });
} }] });
await server.listen();
const report = [];
try {
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    if (process.argv.includes('--webkit') && engine !== 'webkit') continue;
    const browser = await launcher.launch();
    try {
      for (const config of [
        { width: 375, height: 667, lang: 'zh' },
        { width: 360, height: 740, lang: 'zh' },
        { width: 375, height: 812, lang: 'zh' },
        { width: 430, height: 932, lang: 'zh' },
        { width: 390, height: 844, lang: 'en' },
        { width: 430, height: 932, lang: 'zh', reduced: true },
      ]) {
        if (process.argv.includes('--tall') && (config.width !== 430 || config.reduced)) continue;
        const context = await browser.newContext({ viewport: config, isMobile: true, hasTouch: true, deviceScaleFactor: config.width === 430 ? 3 : 1, reducedMotion: config.reduced ? 'reduce' : 'no-preference' });
        try {
          await context.addInitScript(lang => localStorage.setItem('nava.locale', lang), config.lang);
          const page = await context.newPage(), errors = [];
          page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
          await page.goto('http://127.0.0.1:5276/__welcome.html', { waitUntil: 'domcontentloaded' });
          const frame = page.frameLocator('iframe');
          // Artwork deliberately ignores pointer events; tap its visual position
          // so the real screen hit target receives the same event as a finger.
          const tapArt = async locator => {
            const box = await locator.boundingBox();
            assert.ok(box);
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          };
          const ready = () => expect.poll(() => frame.locator('body').evaluate(() => window.NavaOnboarding?.getState().ready)).toBe(true);
          const visual = () => frame.locator('body').evaluate(() => window.NavaOnboarding.getVisualState());
          const complete = async () => { const state = await visual(); return state.inkTime[config.lang] >= state.letterDuration; };
          await ready();
          await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'welcome');
          await expect(frame.locator('#next')).toBeEnabled();
          if (!config.reduced) {
            assert.equal(await complete(), false, 'The letter starts progressively');
            await frame.locator('#language').tap();
            await expect(frame.locator('#language-menu')).toBeVisible();
            assert.equal(await complete(), false, 'Opening a functional menu must not reveal the letter');
            await frame.locator(`[data-language="${config.lang}"]`).tap();
            assert.equal(await complete(), false, 'Language choice must not reveal the letter');
            await frame.locator('#pet-hit').tap();
            assert.equal(await complete(), false, 'Pet interaction must remain independent');
            await tapArt(frame.locator('#headline'));
          }
          await expect.poll(complete).toBe(true);
          await expect(frame.locator('.signature')).toHaveClass(/visible/);
          await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'welcome');
          const pixelCount = await frame.locator('.letter-canvas').evaluate(canvas => {
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 100) count++;
            return count;
          });
          assert.ok(pixelCount > 10000, 'The completed letter is actually drawn');
          await tapArt(frame.locator('.letter-canvas'));
          await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'welcome');
          const name = `${engine}-${config.width}-${config.lang}${config.reduced ? '-reduced-motion' : ''}`;
          assert.equal(await page.evaluate(() => Boolean(window.didComplete)), false, 'Revealing text never completes onboarding');
          await frame.locator('#next').tap();
          await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'gender');
          await expect.poll(() => frame.locator('body').evaluate(() => window.NavaOnboarding.getState().transition)).toBe(false);
          await tapArt(frame.locator('#headline'));
          await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'gender');
          await frame.locator('[data-option="male"]').tap();
          await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'role');
          if (!config.reduced) {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await ready();
            assert.equal(await complete(), false);
            await frame.locator('#next').tap();
            await expect(frame.locator('#screen')).toHaveAttribute('data-step', 'gender');
          }
          // Keep the final evidence on the welcome page after checking navigation.
          await page.reload({ waitUntil: 'domcontentloaded' });
          await ready();
          await tapArt(frame.locator('#headline'));
          await expect.poll(complete).toBe(true);
          await expect(frame.locator('.signature')).toHaveCSS('opacity', '1');
          await page.screenshot({ path: `${output}/${name}.png` });
          assert.deepEqual(errors, []);
          report.push({ engine, ...config, pixelCount, passed: true, source: 'Application code in a browser; not an iOS simulator or physical device' });
          console.log(`${name}: reveal, control isolation, direct start and next steps passed`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
} finally { await server.close(); }
