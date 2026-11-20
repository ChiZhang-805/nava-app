import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
import { inspectHealthExplorer } from './health-explorer-checks.mjs';

const root = process.cwd();
const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/health-report-explorer-flip';
applyProjectPublicEnv(root);
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5248 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const sizes = [{width:320,height:568},{width:320,height:740},{width:360,height:740},{width:375,height:812},{width:390,height:844},{width:430,height:932}];
const report = [];
const quick = process.argv.includes('--quick');
const finalEvidence = process.argv.includes('--final-evidence');
try {
  for (const [engine, launcher] of Object.entries(quick ? { chromium } : { chromium, webkit })) {
    const browser = await launcher.launch();
    try {
      for (const viewport of quick ? sizes.filter((size) => [320,390].includes(size.width)) : finalEvidence ? sizes.filter((size) => size.height === 568 || [375,390].includes(size.width)) : sizes) {
        for (const locale of quick ? ['zh'] : ['zh','en']) {
          const context = await browser.newContext({ viewport, locale: locale === 'zh' ? 'zh-CN' : 'en-US', isMobile: true, hasTouch: true, timezoneId:'Asia/Shanghai', reducedMotion:'reduce' });
          await context.addInitScript((locale) => {
            sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
            localStorage.setItem('nava.locale', locale);
            localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001', JSON.stringify({completed:true,completedAt:new Date().toISOString(),version:3,answers:{},source:'local'}));
          },locale);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror',(error)=>errors.push(error.message));
          await page.goto(`${url}?demo=1#tab=record`,{waitUntil:'networkidle'});
          const launch = page.locator('.launch-sequence');
          if (await launch.isVisible().catch(()=>false)) await launch.click();
          await expect(page.locator('[data-health-explorer]')).toBeVisible();
          for (const state of ['populated','empty']) {
            if (state === 'empty') {
              await page.locator('[data-health-category=sleep]').scrollIntoViewIfNeeded();
              await page.locator('[data-health-category=sleep]').click();
              await page.locator('.health-explorer-track').press('ArrowRight');
              await page.evaluate(()=>localStorage.setItem('nava.review.demo.empty-snapshot-date.v1','2020-01-01'));
              await page.locator('.health-explorer-all').click();
              await page.locator('.health-explorer-sheet input[type=date]').fill('2020-01-01');
              await page.keyboard.press('Escape');
              await expect(page.locator('.health-explorer-sheet')).toHaveCount(0);
              await expect(page.locator('.health-explorer-card[aria-hidden="false"] .health-explorer-empty')).toBeVisible();
              await page.locator('[data-health-category=mood]').scrollIntoViewIfNeeded();
              await page.locator('[data-health-category=mood]').click();
            }
            await expect(page.locator('[data-health-category]')).toHaveCount(6); // Demo sensor values are not Apple Health provenance.
            await expect(page.locator('.health-explorer-pagination, .health-explorer-bottom, .health-explorer-toolbar input')).toHaveCount(0);
            if (!quick) {
              await expect(page.locator('.health-explorer-categories img')).toHaveCount(6);
              await expect.poll(() => page.locator('.health-explorer-categories img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
            }
            await page.screenshot({ path:path.join(output,`${engine}-${viewport.width}${viewport.height < 640 ? '-short' : ''}-${locale}-${state}.png`) });
            const geometry = await inspectHealthExplorer(page);
            for (const category of ['mood','face','focus','sleep','exercise','diet']) {
              const tab = page.locator(`[data-health-category="${category}"]`);
              await tab.click(); // Locator click re-resolves if a data refresh replaces the tab.
              await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category',category);
              await inspectHealthExplorer(page);
              if (state === 'empty') await expect(page.locator('.health-explorer-card[aria-hidden="false"] .health-explorer-empty')).toBeVisible();
              const active = page.locator('.health-explorer-card[data-active="true"]');
              const plotted = await active.locator('.trend-point').evaluateAll(nodes => nodes.filter(node => node.querySelector('circle')).map(node => ({label:node.dataset.label,value:Number(node.dataset.value)})));
              await active.locator('.health-explorer-flip').click();
              await expect(active).toHaveAttribute('data-side','back');
              await expect.poll(() => active.locator('.health-explorer-back').evaluate(node=>getComputedStyle(node).opacity)).toBe('1');
              const records = await active.locator('[data-record-date]').evaluateAll(nodes => nodes.map(node => ({date:node.dataset.recordDate,value:Number(node.dataset.recordValue)})));
              if (records.length !== Math.min(5,plotted.length)) throw new Error('Backside added or lost entries');
              for (const record of records) {
                const label=`${Number(record.date.slice(5,7))}/${Number(record.date.slice(8))}`;
                if (!plotted.some(point => point.label === label && point.value === record.value)) throw new Error('Backside value differs from actual chart');
              }
              await inspectHealthExplorer(page);
              if (category === 'mood') await page.screenshot({path:path.join(output,`${engine}-${viewport.width}${viewport.height<640?'-short':''}-${locale}-${state}-back.png`)});
              await active.locator('.health-explorer-flip').click();
              await expect(active).toHaveAttribute('data-side','front');
              const id = await active.getAttribute('data-chart-id');
              if (await page.locator('.health-explorer-card').count() > 1) {
                await page.locator('.health-explorer-track').press('ArrowRight');
                await expect(active).not.toHaveAttribute('data-chart-id',id);
                await page.locator('.health-explorer-track').press('ArrowLeft');
                await expect(active).toHaveAttribute('data-chart-id',id);
              }
            }
            await page.locator('.health-explorer-all').click();
            await expect(page.locator('.health-explorer-sheet')).toBeVisible();
            await page.locator('.health-explorer-chart-list section').nth(2).locator('button').last().click();
            await expect(page.locator('.health-explorer-sheet')).toHaveCount(0);
            await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category','focus');
            await inspectHealthExplorer(page);
            if (viewport.height < 640) await page.screenshot({ path:path.join(output,`${engine}-${viewport.width}-short-${locale}-${state}-scrolled.png`) });
            await page.locator('[data-health-category=mood]').scrollIntoViewIfNeeded();
            await page.locator('[data-health-category=mood]').click();
            await page.locator('[data-health-category=mood]').press('ArrowRight');
            await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category','face');
            await page.locator('[data-health-category=mood]').click();
            report.push({engine,viewport,locale,state,geometry});
          }
          // Existing weekly report and recording routes still work independently of selection.
          await page.locator('.health-report-tabs button').last().click();
          await expect(page.locator('.weekly-health-report')).toBeVisible();
          await page.locator('.health-report-tabs button').first().click();
          await page.locator('[data-health-category=diet]').scrollIntoViewIfNeeded();
          await page.locator('[data-health-category=diet]').click();
          await page.locator('.health-explorer-card[data-active="true"] .health-explorer-flip').click();
          await page.locator('.health-explorer-card[data-active="true"] .health-explorer-record').click();
          await expect(page.locator('.journal-experience iframe')).toBeVisible();
          await expect.poll(()=>new URL(page.url()).hash).toContain('module=diet');
          if(errors.length)throw new Error(errors.join('\n'));
          await context.close();
          console.log(`${engine} ${viewport.width}x${viewport.height} ${locale}: empty/populated, categories, carousel, flip details, all charts, weekly, entry passed`);
        }
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); await writeFile(path.join(output, quick?'quick-report.json':finalEvidence?'evidence-report.json':'report.json'),JSON.stringify(report,null,2)); }
console.log(`Health explorer passed ${report.length} viewport/locale/state cases.`);
