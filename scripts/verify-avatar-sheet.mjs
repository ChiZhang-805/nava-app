import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = process.env.NAVA_WARDROBE_EVIDENCE_DIR ?? 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: '127.0.0.1', port: 5309, strictPort: true }, logLevel: 'silent' });
await server.listen();
const report = { passed: false, scope: 'Local demo in Chromium/WebKit; real browser file chooser opened and cancelled without upload.', results: [], errors: [] };
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      for (const [route, selector] of [['#tab=profile&view=account', '.avatar-button'], ['#tab=today&view=profile-details', '[data-profile-details-avatar]']]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        await context.addInitScript(() => {
          sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
          localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001', JSON.stringify({ completed: true, version: 3, answers: {}, source: 'local' }));
        });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:5309/?demo=1${route}`, { waitUntil: 'networkidle' });
        const launch = page.locator('.launch-sequence');
        if (await launch.isVisible().catch(() => false)) await launch.click();
        const trigger = page.locator(selector);
        await trigger.focus();
        await trigger.press('Enter');
        const sheet = page.locator('.avatar-picker');
        await expect(sheet).toBeVisible();
        await page.waitForTimeout(300);
        const geometry = await sheet.evaluate((element) => {
          const frame = document.querySelector('.phone-frame').getBoundingClientRect(), rect = element.getBoundingClientRect();
          const layer = element.parentElement;
          const style = getComputedStyle(layer);
          return { height: rect.height, bottomGap: frame.bottom - rect.bottom, background: style.backgroundColor, blur: style.backdropFilter, portal: layer.parentElement.classList.contains('phone-frame'), handleHeight: element.querySelector('.nava-bottom-sheet-grabber').getBoundingClientRect().height };
        });
        assert.equal(geometry.portal, true);
        assert.equal(geometry.background, 'rgba(0, 0, 0, 0)');
        assert.equal(geometry.blur, 'none');
        assert(geometry.height < 250 && geometry.bottomGap <= 36 && geometry.handleHeight >= 44, JSON.stringify(geometry));
        await expect(sheet.locator('.nava-bottom-sheet-grabber')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        const chooserEvent = page.waitForEvent('filechooser');
        await sheet.getByRole('button', { name: '从相册选择', exact: true }).click();
        const chooser = await chooserEvent;
        await chooser.setFiles([]);
        await expect(sheet).toHaveCount(0);
        await trigger.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${output}/${engine}-${route.includes('account') ? 'account' : 'detailed-profile'}-avatar.png` });
        await sheet.locator('.nava-bottom-sheet-grabber').click();
        await expect(sheet).toHaveCount(0);
        report.results.push({ engine, route, geometry, chooser: 'opened and cancelled', dismiss: 'Escape and handle click' });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  report.passed = true;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await server.close(); await writeFile(`${output}/avatar-report.json`, JSON.stringify(report, null, 2)); }
if (!report.passed) throw new Error(report.errors.join('\n'));
console.log(`Avatar sheets: ${report.results.length} cases passed.`);
