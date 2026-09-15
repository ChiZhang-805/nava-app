// Real public form authentication, read-only account layout checks. AI is out of scope.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from 'node:crypto';
import { chromium, expect } from "@playwright/test";
import { inspectRingPaint } from './module-ring-paint.mjs';
import { IPHONE_PREVIEW_DEVICES } from '../src/constants/iphonePreviewDevices.ts';
const responsive = process.argv.includes('--responsive');
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure launcher.");
const output = responsive ? 'Q:/NAVA-Workspace/Build/TestRuns/responsive-release' : "Q:/NAVA-Workspace/Build/TestRuns/calendar-report-release";
await mkdir(output, { recursive: true });
const receipt = { passed: false, aiTested: false, results: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const base of ["https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/"]) {
    const parity = [];
    if (responsive) {
      const assets = new URL('../dist/assets/', import.meta.url);
      const names = (await readdir(assets)).filter((name) => /^(index|App|RecordsScreen|RecordModuleDashboard)-.*\.(js|css)$/.test(name));
      const html = await (await fetch(base, { cache:'no-store' })).text();
      const entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
      assert(entry, 'Public entry script missing');
      const entryUrl = new URL(entry, base);
      assert(names.includes(entryUrl.pathname.split('/').pop()), 'Public entry is stale');
      for (const name of names) {
        const response = await fetch(new URL(name, entryUrl), { cache:'no-store' });
        assert(response.ok, `Missing public asset: ${name}`);
        const remote = Buffer.from(await response.arrayBuffer());
        const local = await readFile(new URL(name, assets));
        const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
        assert.equal(hash(remote), hash(local), `Public asset differs: ${name}`);
        parity.push({ name, bytes:remote.length, sha256:hash(remote) });
      }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: !responsive, hasTouch: !responsive, reducedMotion: "reduce" });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      let healthWrites = 0;
      await page.route("**/rest/v1/**", (route) => {
        const request = route.request(), table = new URL(request.url()).pathname.split("/").pop();
        if (["active_user_sessions", "record_drafts"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
        if (["ai_conversations", "ai_conversation_archives"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table)) healthWrites++;
          return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only visual acceptance"}' });
        }
        return route.continue();
      });
      await page.route("**/functions/v1/**", (route) => {
        const target = new URL(route.request().url());
        if (target.hostname === "wxteapvwagvhhtrjrbim.supabase.co" && target.pathname === "/functions/v1/auth-account-status") return route.continue();
        return route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"AI outside visual acceptance"}' });
      });
      await page.goto(`${base}?demo=1`, { waitUntil: "domcontentloaded" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      const form = page.locator(".auth-form--signIn"); await expect(form).toBeVisible();
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/v1/token" && response.status() === 200);
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password);
      await form.locator('button[type="submit"]').click();
      const response = await responsePromise, authenticated = await response.json();
      assert.equal(new URL(response.url()).hostname, "wxteapvwagvhhtrjrbim.supabase.co");
      assert.equal(authenticated.user?.email?.toLowerCase(), email.toLowerCase());
      await expect(page.locator(".bottom-nav")).toBeVisible();
      const geometry = [];
      if (responsive) {
        for (const size of [
          ...[[360,740],[375,812],[390,844],[430,932]].map(([width,height]) => ({ width,height,name:`${width}x${height}` })),
          ...IPHONE_PREVIEW_DEVICES.map((device) => ({ width:1365,height:1050,name:device.id,device })),
        ]) {
          await page.setViewportSize({ width:size.width, height:size.height });
          if (size.device) await page.locator('.nava-device-selector select').selectOption(size.device.id);
          await page.evaluate(() => { location.hash = 'tab=record'; });
          await expect(page.locator('.record-module-entry')).toHaveCount(6);
          await page.locator('.record-hub-date input').fill('2026-09-13');
          await expect(page.locator('.record-module-entry.is-complete')).toHaveCount(6);
          await page.waitForTimeout(800);
          const paint = await inspectRingPaint(page, '.record-module-entry .module-progress-ring');
          // Pixel sampling of off-screen scrolled cards is intentionally skipped;
          // each card is brought into the viewport before its closure is checked.
          const cards = page.locator('.record-module-entry');
          for (let index = 0; index < 6; index++) {
            const card = cards.nth(index);
            await card.scrollIntoViewIfNeeded();
            const ring = await inspectRingPaint(page, `.record-module-entry:nth-child(${index + 1}) .module-progress-ring`);
            assert(ring[0].coverage >= .99, `Public completed ring is open: ${size.name}`);
            const contained = await card.evaluate((node) => {
              const bounds = node.getBoundingClientRect();
              return [...node.querySelectorAll('.record-module-header,.record-module-points > span,.module-progress-ring')].every((child) => {
                const b = child.getBoundingClientRect();
                // Header scrollWidth deliberately includes the ring's 4px
                // overhang. Check that against the card, not the text lane.
                return b.left >= bounds.left && b.right <= bounds.right && b.top >= bounds.top && b.bottom <= bounds.bottom
                  && (!child.matches('.record-module-points > span') || (child.scrollWidth <= child.clientWidth + 1 && getComputedStyle(child).whiteSpace === 'nowrap'));
              });
            });
            if (!contained) {
              await page.locator('.phone-frame').screenshot({ path:`${output}/failed-${new URL(base).hostname}-${size.name}-${index}.png` });
              const detail = await card.evaluate((node) => ({ module:node.dataset.recordModule, source:node.dataset.summarySource,
                box:node.getBoundingClientRect().toJSON(), children:[...node.querySelectorAll('.record-module-header,.record-module-points > span')].map((child) => ({
                  box:child.getBoundingClientRect().toJSON(), scrollWidth:child.scrollWidth, clientWidth:child.clientWidth, whiteSpace:getComputedStyle(child).whiteSpace, characters:child.textContent.length,
                })) }));
              await writeFile(`${output}/failed-geometry.json`,JSON.stringify(detail,null,2));
              assert.fail(`Public card clips content: ${size.name}/${detail.module}; inspect private screenshot`);
            }
          }
          await page.locator('.record-module-grid').evaluate((node) => { node.scrollTop=0; });
          assert.equal(await page.locator('.phone-frame').evaluate((node) => node.scrollWidth > node.clientWidth + 1),false);
          await page.screenshot({ path:`${output}/${new URL(base).hostname}-${size.name}.png` });
          geometry.push({ name:size.name, allSixContained:true, allSixClosed:true, initialPaint:paint });
        }
        assert.equal(healthWrites,0);
        receipt.results.push({ base, realLogin:true, canonicalProject:true, demoBypassRejected:true, healthWrites, parity, geometry });
        console.log(`PASS public responsive rings/cards: ${new URL(base).hostname}`);
        continue;
      }
      for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => { location.hash = "tab=today&view=calendar"; });
        await expect(page.locator(".home-calendar-overview")).toBeVisible();
        await expect(page.locator(".home-year-header strong svg")).toHaveCount(1);
        await page.getByRole("button", { name: "更多月历操作" }).click();
        await page.getByRole("menuitem", { name: "回到本月" }).click();
        const checkRows = async (selector) => page.locator(selector).evaluateAll((cells) => cells.map((cell) => {
          const a = cell.querySelector(":scope > span").getBoundingClientRect();
          const b = cell.querySelector("strong").getBoundingClientRect();
          const c = cell.getBoundingClientRect();
          return { centerDelta: Math.abs((a.top + a.bottom - b.top - b.bottom) / 2), gap: b.left - a.right, contained: a.left >= c.left && b.right <= c.right };
        }));
        const calendar = await checkRows(".home-calendar-overview > div");
        assert(calendar.every((row) => row.centerDelta <= 1 && row.gap >= 3 && row.contained));
        await page.screenshot({ path: `${output}/${new URL(base).hostname}-${width}-calendar.png` });
        await page.locator('[data-tab="record"]').click();
        await page.getByRole("tab", { name: "本周报告", exact: true }).click();
        await expect(page.locator(".weekly-score-card")).toBeVisible();
        const weekly = await checkRows(".weekly-score-card > div");
        assert(weekly.every((row) => row.centerDelta <= 1 && row.gap >= 3 && row.contained));
        await expect(page.locator(".weekly-trend-card > header strong")).toHaveCSS("font-size", "16px");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `${output}/${new URL(base).hostname}-${width}-weekly.png` });
        geometry.push({ width, height, calendar, weekly });
      }
      assert.equal(healthWrites, 0);
      receipt.results.push({ base, realLogin: true, canonicalProject: true, demoBypassRejected: true, healthWrites, geometry });
      console.log(`PASS public calendar/report: ${new URL(base).hostname}`);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally { await browser.close(); await writeFile(`${output}/public.json`, JSON.stringify(receipt, null, 2)); }
