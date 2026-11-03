// Real public form authentication, read-only account layout checks. AI is out of scope.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from 'node:crypto';
import { chromium, expect } from "@playwright/test";
import { inspectRingPaint } from './module-ring-paint.mjs';
import { IPHONE_PREVIEW_DEVICES } from '../src/constants/iphonePreviewDevices.ts';
const responsive = process.argv.includes('--responsive');
const phoneSystem = process.argv.includes('--phone-system');
const allPages = process.argv.includes('--all-pages') || phoneSystem;
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure launcher.");
const output = phoneSystem ? 'Q:/NAVA-Workspace/Build/TestRuns/App-Checks/phone-system-preview/public' : allPages ? 'Q:/NAVA-Workspace/Build/TestRuns/all-pages-responsive/public' : responsive ? 'Q:/NAVA-Workspace/Build/TestRuns/responsive-release' : "Q:/NAVA-Workspace/Build/TestRuns/calendar-report-release";
await mkdir(output, { recursive: true });
const receipt = { passed: false, aiTested: false, results: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const base of ["https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/"]) {
    const parity = [];
    {
      const assets = new URL('../dist/assets/', import.meta.url);
      const names = (await readdir(assets)).filter((name) => /^(index|App|HomeCalendarExperience|RecordsScreen|RecordModuleDashboard)-.*\.(js|css)$/.test(name) || (phoneSystem && /^(AppIcon-512@2x|camera|messages|clock|contacts|notes|phone|settings|weather)-.*\.png$/.test(name)));
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
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, isMobile: !(responsive || allPages), hasTouch: !(responsive || allPages), reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      if (allPages) await context.addInitScript(() => {
        // Explicit speech hardware fixture, never a model or health-record fixture.
        window.SpeechRecognition = class {
          start() { window.__layoutRecognition = this; }
          stop() { this.onend?.(); }
          abort() { this.onend?.(); }
        };
      });
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      let healthWrites = 0;
      await page.route("**/rest/v1/**", (route) => {
        const request = route.request(), table = new URL(request.url()).pathname.split("/").pop();
        if (["active_user_sessions", "record_drafts"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
        if (table === "ai_conversations") {
          // Preserve the real .insert().select().single() response shape without
          // writing the APP's rule-based greeting to the authenticated account.
          const body = request.method() === "POST"
            ? { ...request.postDataJSON(), id: "qa-local-greeting", created_at: new Date().toISOString() }
            : [];
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        }
        if (table === "ai_conversation_archives") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
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
      if (allPages) {
        await page.addStyleTag({content:'*,*::before,*::after { transition-duration:0s !important; animation-duration:0s !important; }'});
        const sizes = [
          ...[[360,740],[375,812],[390,844],[430,932]].map(([width,height])=>({width,height,name:`${width}x${height}`})),
          {width:1365,height:1050,name:'iphone-17',device:IPHONE_PREVIEW_DEVICES.find(device=>device.id==='iphone-17')},
        ];
        const routes = [
          ['home','tab=today','.option-two-home'],
          ['calendar','tab=today&view=calendar','.home-calendar-overview'],
          ['report-hub','tab=record','.record-module-grid'],
          ['sleep','tab=record&module=sleep','[data-module-view="sleep-overview"]'],
          ['focus','tab=record&module=focus','[data-module-view="focus-overview"]'],
          ...['mood','sleep','exercise','diet','focus','face'].map(module=>[`${module}-editor`,`tab=record&module=${module}&view=editor`,`.record-detail[data-record-detail="${module}"] .record-editor-stack`]),
          ['chat','tab=ai','.chat-layout'],
        ];
        for (const size of sizes) {
          await page.setViewportSize({width:size.width,height:size.height});
          if(size.device) await page.locator('.nava-device-selector select').selectOption(size.device.id);
          for(const [name,hash,selector] of routes) {
            await page.evaluate(hash=>{ location.hash=hash; },hash);
            await expect(page.locator(selector)).toBeVisible();
            await page.waitForTimeout(250);
            if (name === 'chat') {
              await expect(page.locator('.chat-message-row.assistant .chat-bubble p').first()).toHaveText(/\S/);
              await expect(page.locator('.chat-layout')).not.toContainText('Invalid Date');
            }
            const fields = page.locator('form:not([hidden]) .record-editor-fields');
            if(name.endsWith('-editor') && name!=='face-editor') {
              await expect(fields).toHaveCount(1);
              await expect(page.locator('.record-editor-stack > form:not([hidden]) > .section-card > .action-button')).toHaveCount(1);
              const text = fields.locator('textarea').first();
              if(await text.count()) await text.fill('仅用于布局验收的长输入，不提交记录。'.repeat(12));
              await fields.evaluate(node=>{node.scrollTop=node.scrollHeight;});
            }
            if(name==='face-editor') {
              const actions=page.locator('.record-editor-stack .face-photo-actions button');
              await expect(actions).toHaveCount(2);
              for(const action of await actions.all()) {
                await action.scrollIntoViewIfNeeded();
                assert(await action.evaluate(node=>{
                  const a=node.getBoundingClientRect(), c=node.closest('.section-card').getBoundingClientRect();
                  return a.left>=c.left && a.right<=c.right && a.top>=c.top && a.bottom<=c.bottom && node.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2));
                }),`${size.name}/face-editor photo action clipped`);
              }
            }
            if(name==='chat' && size.device) {
              const mic=page.locator('.chat-voice-button');
              await mic.focus(); await page.keyboard.press('Enter');
              await expect(mic).toHaveAttribute('aria-pressed','true');
              await page.evaluate(()=>window.__layoutRecognition.onresult({results:[{0:{transcript:'中断后保留的测试文字'},isFinal:false}]}));
              await page.locator('[data-preview-event="call"]').click();
              await expect(mic).toHaveAttribute('aria-pressed','false');
              await expect(page.locator('.chat-input-shell input')).toHaveValue('中断后保留的测试文字');
              await expect(page.locator('.chat-media-notice')).toHaveCount(0);
              await expect(page.locator('[data-preview-event-result]')).toContainText('录音已停止');
              await expect(page.locator('.phone-frame')).not.toContainText(/模拟中断|模拟来电|网页预览事件/);
              await page.screenshot({path:`${output}/${new URL(base).hostname}-simulation-boundary.png`});
              await page.locator('.chat-input-shell input').fill('');
            }
            const box = await page.locator('.phone-frame').evaluate(frame=> {
              const editor = frame.querySelector('.record-editor-stack > form:not([hidden]) > .section-card');
              const action = editor?.querySelector(':scope > .action-button');
              const a=action?.getBoundingClientRect(), c=editor?.getBoundingClientRect();
              return {width:frame.clientWidth,height:frame.clientHeight,overflow:frame.scrollWidth-frame.clientWidth,
                actionInside:a&&c ? a.left>=c.left && a.right<=c.right && a.top>=c.top && a.bottom<=c.bottom : null,
                actionHit:a ? action.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2)) : null};
            });
            assert(box.overflow<=1,`${size.name}/${name} escapes phone width`);
            if(box.actionInside!==null) assert(box.actionInside && box.actionHit,`${size.name}/${name} save action clipped or covered`);
            await page.locator('.phone-frame').screenshot({path:`${output}/${new URL(base).hostname}-${size.name}-${name}.png`});
            geometry.push({size:size.name,screen:name,...box});
          }
        }
        if (phoneSystem) {
          const system = page.locator('.ios-system-layer');
          const action = (name) => page.locator(`[data-phone-action="${name}"]`).click();
          const trigger = (name) => page.locator(`[data-preview-event="${name}"]`).click();
          await action('end-call');
          const draft = await page.locator('.chat-input-shell input').inputValue();
          await trigger('other'); await expect(system).toHaveAttribute('data-surface','home');
          await expect.poll(() => system.locator('.ios-app-icon img').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth >= 128)), { message:'All current system icons must decode before acceptance', timeout:15000 }).toBe(true);
          await expect(system.locator('.ios-calendar small')).toHaveText(/^周[一二三四五六日]$/);
          await expect(system.locator('.ios-mail-art')).toHaveCount(2);
          assert.ok(await system.locator('.ios-app-icon:not(.ios-calendar)').evaluateAll(icons => icons.every(icon => getComputedStyle(icon).backgroundColor === 'rgba(0, 0, 0, 0)')));
          await page.screenshot({path:`${output}/${new URL(base).hostname}-home-icons.png`});
          await system.getByRole('button',{name:'天气',exact:true}).click();
          await system.getByRole('button',{name:'搜索',exact:true}).click();
          await expect(page.locator('.nava-preview-controls')).not.toContainText(/系统事件随时可用|只有图标按压反馈|仅网页测试/);
          await expect(system).toHaveAttribute('data-surface','home');
          await trigger('call'); await expect(system).toHaveAttribute('data-call','banner');
          await page.screenshot({path:`${output}/${new URL(base).hostname}-home-call.png`});
          await system.getByRole('button',{name:'接听',exact:true}).click();
          await expect(system).toHaveAttribute('data-call','active');
          await system.getByRole('button',{name:'挂断',exact:true}).click();
          await action('lock'); await expect(system).toHaveAttribute('data-surface','off');
          await trigger('call'); await expect(system).toHaveAttribute('data-call','full');
          await expect(system.locator('.ios-answer-slider')).toBeVisible();
          await page.screenshot({path:`${output}/${new URL(base).hostname}-locked-call.png`});
          await action('end-call'); await action('unlock');
          await system.getByRole('button',{name:'打开 NAVA',exact:true}).click();
          await expect(page.locator('.chat-input-shell input')).toHaveValue(draft);
          await action('lock'); await trigger('message');
          await expect(system.locator('.ios-lock-notices')).toContainText('NAVA');
          await expect.poll(() => system.locator('.ios-lock-notices img').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
          await page.screenshot({path:`${output}/${new URL(base).hostname}-locked-notification.png`});
          await system.locator('.ios-lock-notices .ios-notice').first().click();
          await expect(system).toHaveAttribute('data-surface','locked');
          await action('unlock'); await expect(page).toHaveURL(/view=notifications/);
          geometry.push({screen:'system-harness',realLogin:true,draftPreserved:true,lockedCall:true,notificationDeepLink:true,iconsDecoded:true});
        }
        assert.equal(healthWrites,0);
        receipt.results.push({base,realLogin:true,canonicalProject:true,demoBypassRejected:true,healthWrites,greetingWrite:'APP rule-based greeting reflected by a local single-row response; no database write',simulationBoundary:'real APP with speech hardware fixture; no message sent',parity,geometry});
        console.log(`PASS public multi-page smoke: ${new URL(base).hostname}, ${geometry.length} states`);
        continue;
      }
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
        const months = [];
        for (const state of ["current", "previous"]) {
          if (state === "previous") await page.getByRole("button", { name: "上个月", exact: true }).click();
          await expect(page.locator(".home-calendar-card")).toBeVisible({ timeout: 30000 });
          const month = await page.evaluate(() => {
            const grid = document.querySelector(".home-calendar-grid");
            const dates = [...grid.querySelectorAll("[data-date]")];
            const [year, month] = dates[0].getAttribute("data-date").split("-").map(Number);
            const expectedRows = Math.ceil(((new Date(year, month - 1, 1).getDay() + 6) % 7 + new Date(year, month, 0).getDate()) / 7);
            const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
            return { expectedRows, actualRows: grid.children.length / 7, height: rect(".home-calendar-card").height,
              trailingBlank: grid.getBoundingClientRect().bottom - dates.at(-1).getBoundingClientRect().bottom,
              calendarBottomGap: rect(".home-calendar-card").bottom - grid.getBoundingClientRect().bottom,
              annualGap: rect(".home-year-card").top - rect(".home-calendar-card").bottom,
              navClearance: rect(".bottom-nav").top - rect(".home-year-card").bottom };
          });
          assert.equal(month.actualRows, month.expectedRows);
          assert(Math.abs(month.trailingBlank) <= 1 && month.calendarBottomGap >= 5 && month.calendarBottomGap <= 14);
          assert(month.annualGap >= 6 && month.annualGap <= 11 && month.navClearance >= 5);
          months.push({ state, ...month });
        }
        await page.getByRole("button", { name: "更多月历操作" }).click();
        await page.getByRole("menuitem", { name: "回到本月" }).click();
        await expect(page.locator(".home-calendar-card")).toBeVisible({ timeout: 30000 });
        await page.screenshot({ path: `${output}/${new URL(base).hostname}-${width}-calendar.png` });
        await page.locator('[data-tab="record"]').click();
        await page.getByRole("tab", { name: "本周报告", exact: true }).click();
        await expect(page.locator(".weekly-score-card")).toBeVisible();
        const weekly = await checkRows(".weekly-score-card > div");
        assert(weekly.every((row) => row.centerDelta <= 1 && row.gap >= 3 && row.contained));
        await expect(page.locator(".weekly-trend-card > header strong")).toHaveCSS("font-size", "16px");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `${output}/${new URL(base).hostname}-${width}-weekly.png` });
        geometry.push({ width, height, calendar, months, weekly });
      }
      assert.equal(healthWrites, 0);
      receipt.results.push({ base, realLogin: true, canonicalProject: true, demoBypassRejected: true, healthWrites, parity, geometry });
      console.log(`PASS public calendar/report: ${new URL(base).hostname}`);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally { await browser.close(); await writeFile(`${output}/public.json`, JSON.stringify(receipt, null, 2)); }
