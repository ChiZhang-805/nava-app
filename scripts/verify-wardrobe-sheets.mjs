import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = process.env.NAVA_WARDROBE_EVIDENCE_DIR ?? 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: '127.0.0.1', port: 5308, strictPort: true }, logLevel: 'silent' });
await server.listen();
const report = { passed: false, scope: 'Real app source in local demo; Chromium and WebKit browser checks, not native iOS hardware.', cases: [], errors: [] };
try {
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
        const reducedMotion = width === 375 ? 'reduce' : 'no-preference';
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion });
        const page = await context.newPage();
        const errors = [], models = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => { if (/\.glb(?:\?|$)/.test(request.url())) models.push(request.url()); });
        await page.addInitScript(() => {
          sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
          localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001', JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: 'local' }));
          localStorage.setItem('nava.locale.v1', 'zh');
        });
        await page.goto('http://127.0.0.1:5308/?demo=1#tab=profile&view=wardrobe', { waitUntil: 'networkidle' });
        const launch = page.locator('.launch-sequence');
        if (await launch.isVisible().catch(() => false)) await launch.click();
        await expect(page.locator('.mascot-wardrobe-character')).toHaveAttribute('data-renderer', '2d-static');
        await expect(page.locator('.mascot-wardrobe canvas')).toHaveCount(0);
        await expect(page.locator('.mascot-wardrobe-view-toggle')).toHaveCount(0);
        await page.locator('.mascot-wardrobe-item').filter({ hasText: '暖橘' }).click();
        await expect(page.locator('.mascot-wardrobe-artwork')).toHaveAttribute('data-skin', 'skin-warm-orange');
        await page.getByRole('tab', { name: '饰品', exact: true }).click();
        await page.locator('.mascot-wardrobe-item').filter({ hasText: '铃铛项圈' }).click();
        await expect(page.locator('.mascot-wardrobe-artwork image[data-accessory="accessory-bell-collar"]')).toHaveCount(1);
        await expect(page.locator('.mascot-wardrobe-artwork')).toHaveAttribute('data-skin', 'skin-warm-orange');
        await page.screenshot({ path: `${output}/${engine}-${width}-2d-look.png` });
        const inertBefore = await page.locator('[inert]').count();
        const trigger = page.locator('.mascot-wardrobe-action button');
        // Safari does not focus buttons on a pointer click; use an explicit keyboard origin.
        await trigger.focus();
        await trigger.press('Enter');
        const dialog = page.getByRole('dialog', { name: '小猫衣橱操作' });
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(300);
        const geometry = await dialog.evaluate((element) => {
          const layer = element.parentElement;
          const phone = layer.parentElement;
          const a = layer.getBoundingClientRect(), b = phone.getBoundingClientRect(), d = element.getBoundingClientRect();
          const style = getComputedStyle(layer);
          return { fullPhone: Math.abs(a.top - b.top) < 2 && Math.abs(a.bottom - b.bottom) < 2, background: style.backgroundColor, backdropFilter: style.backdropFilter, height: d.height, bottomGap: b.bottom - d.bottom, portalClass: phone.className, clipping: element.scrollHeight > element.clientHeight + 1 };
        });
        assert(geometry.fullPhone, JSON.stringify(geometry));
        assert.equal(geometry.background, 'rgba(0, 0, 0, 0)');
        assert.equal(geometry.backdropFilter, 'none');
        assert(geometry.height < height * .62, JSON.stringify(geometry));
        assert(geometry.bottomGap >= 10 && geometry.bottomGap <= 36, JSON.stringify(geometry));
        assert.equal(geometry.clipping, false);
        await page.screenshot({ path: `${output}/${engine}-${width}-confirm.png` });
        const handle = page.locator('.nava-bottom-sheet-grabber');
        await expect(handle).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(dialog.getByRole('button', { name: '确认兑换', exact: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(handle).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await dialog.getByRole('button', { name: '确认兑换', exact: true }).click();
        await expect(dialog.getByText('已经是你的啦')).toBeVisible();
        await page.waitForTimeout(500);
        const success = await dialog.evaluate((element) => {
          const last = element.querySelector('.mascot-wardrobe-sheet-secondary').getBoundingClientRect();
          return { height: element.getBoundingClientRect().height, emptyBottom: element.getBoundingClientRect().bottom - last.bottom, motion: getComputedStyle(element.querySelector('.nava-sheet-success-mark')).animationName };
        });
        assert(success.emptyBottom <= 15, JSON.stringify(success));
        assert.equal(success.motion === 'none', reducedMotion === 'reduce');
        await page.screenshot({ path: `${output}/${engine}-${width}-success.png` });
        await dialog.getByRole('button', { name: '立即穿戴', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nava.demo.mascot-wardrobe.v1')));
        assert.equal(stored.equipped.skinId, 'skin-warm-orange');
        assert.deepEqual(stored.equipped.accessoryIds, ['accessory-bell-collar']);
        assert.equal(stored.balance, 560);
        // A genuine pointer gesture on the grabber dismisses without selecting or scrolling the page.
        await page.getByRole('tab', { name: '皮肤', exact: true }).click();
        await page.locator('.mascot-wardrobe-item').filter({ hasText: '雾灰' }).click();
        await trigger.click();
        await page.waitForTimeout(300);
        const h = await handle.boundingBox();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 90, { steps: 8 });
        await page.mouse.up();
        await expect(dialog).toHaveCount(0);
        assert.equal(await page.locator('[inert]').count(), inertBefore);
        assert.deepEqual(models, []);
        assert.deepEqual(errors, []);
        report.cases.push({ engine, width, height, reducedMotion, geometry, success, commerce: 'unlock, exact balance, equipped skin + accessory passed', dismissal: 'Escape, Tab trap, focus restore, pointer drag passed', webglRequests: models.length });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  report.passed = true;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await server.close(); await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); }
if (!report.passed) throw new Error(report.errors.join('\n'));
console.log(`Wardrobe sheets: ${report.cases.length} browser/size cases passed. ${output}`);
