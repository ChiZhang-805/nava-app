import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: '127.0.0.1', port: 5312, strictPort: true }, logLevel: 'silent' });
await server.listen();
const report = { passed: false, scope: 'Real Chromium/WebKit with the app local demo persistence; cloud mutation failure paths covered separately by service tests.', results: [], errors: [] };
const user = '00000000-0000-4000-8000-000000000001';
const historyKey = `nava-ai-history:${user}`;
const activeKey = `nava-ai-active-archive:${user}`;
const oldId = '10000000-0000-4000-8000-000000000001';
async function openHistory(page) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '历史', exact: true }).click();
  await expect(page.locator('.ai-history-sheet')).toBeVisible();
}
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      for (const width of [360, 430]) {
        const context = await browser.newContext({ viewport: { width, height: width === 360 ? 740 : 932 }, isMobile: true, hasTouch: true });
        await context.addInitScript(({ user, oldId }) => {
          sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
          localStorage.setItem(`nava.onboarding.v3.${user}`, JSON.stringify({ completed: true, version: 3, answers: {} }));
          if (localStorage.getItem('chat-test-seeded')) return;
          localStorage.setItem('chat-test-seeded', 'yes');
          const now = Date.now();
          const day = new Date(now);
          const localDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          // Chat persistence is independent of the already-covered reward UI.
          localStorage.setItem(`nava-growth-activities:${user}:${localDay}:v1`, JSON.stringify(['checkin', 'ai', 'share']));
          const stamp = delta => new Date(now + delta).toISOString();
          const long = '我刚刚吃了一份烤鸡加上一小碗米饭，今天想和你聊聊生活里的小事情。';
          const current = [
            { id: crypto.randomUUID(), role: 'assistant', content: long, created_at: stamp(-3000) },
            { id: crypto.randomUUID(), role: 'user', content: long, created_at: stamp(-2000) },
            { id: crypto.randomUUID(), role: 'user', content: '好呀', created_at: stamp(-1000) },
          ];
          localStorage.setItem(`nava-demo-conversation:${user}`, JSON.stringify(current));
          localStorage.setItem(`nava-ai-history:${user}`, JSON.stringify([
            { id: oldId, createdAt: stamp(-86400000 * 5), dayKey: stamp(-86400000 * 5).slice(0, 10), title: '周末的小事', messages: [
              { id: oldId, role: 'user', content: '还记得我们的周末计划吗', created_at: stamp(-86400000 * 5) },
              { id: crypto.randomUUID(), role: 'assistant', content: '当然啦，慢慢聊。', created_at: stamp(-86400000 * 5 + 1000) },
            ] },
            { id: crypto.randomUUID(), createdAt: stamp(-86400000), dayKey: stamp(-86400000).slice(0, 10), title: '最近的聊天', messages: [
              { id: crypto.randomUUID(), role: 'user', content: '今天也很好', created_at: stamp(-86400000) },
            ] },
          ]));
        }, { user, oldId });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(`${engine}-${width}: ${error.message}`));
        await page.goto('http://127.0.0.1:5312/?demo=1#tab=ai', { waitUntil: 'networkidle' });
        if (await page.locator('.launch-sequence').isVisible().catch(() => false)) await page.locator('.launch-sequence').click();
        try { await expect(page.locator('.chat-composer')).toBeVisible({ timeout: 15000 }); }
        catch (error) { await page.screenshot({ path: `${output}/${engine}-${width}-failure.png` }); throw error; }
        await expect(page.locator('.app-header h1')).toHaveText('瓦咪儿');
        const geometry = await page.locator('.chat-message-row').evaluateAll(rows => rows.map(row => {
          const bubble = row.querySelector('.chat-bubble').getBoundingClientRect();
          const text = row.querySelector('p').getBoundingClientRect();
          return { left: bubble.left, right: bubble.right, width: bubble.width, textWidth: text.width, height: text.height };
        }));
        assert.equal(geometry.length, 3);
        assert(Math.abs(geometry[0].left - geometry[1].left) < 1 && Math.abs(geometry[0].right - geometry[1].right) < 1, JSON.stringify(geometry));
        assert(Math.abs(geometry[0].height - geometry[1].height) < 1, JSON.stringify(geometry));
        assert(geometry[2].width < geometry[1].width * .7, JSON.stringify(geometry));
        await page.screenshot({ path: `${output}/${engine}-${width}-bubbles.png` });
        await openHistory(page);
        await page.locator('.ai-history-open').filter({ hasText: '周末的小事' }).click();
        await expect(page.locator('.ai-history-sheet')).toHaveCount(0);
        await expect(page.locator('.chat-archive-return')).toHaveCount(0);
        await expect(page.locator('.chat-composer')).toBeVisible();
        await expect(page.locator('.app-header h1')).toHaveText('瓦咪儿');
        await page.locator('.chat-input-shell input').fill('继续聊聊周末吧');
        await page.locator('.chat-send-button').click();
        await expect(page.locator('.ai-streaming-row')).toHaveCount(0, { timeout: 20000 });
        await expect.poll(async () => page.evaluate(({ historyKey, oldId }) => JSON.parse(localStorage.getItem(historyKey)).find(item => item.id === oldId)?.messages.length, { historyKey, oldId })).toBe(4);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), activeKey), oldId);
        await page.locator('.chat-attachment-trigger').click();
        await page.getByRole('menuitem', { name: '表情', exact: true }).click();
        await page.locator('[data-sticker-id="hug"]').click();
        await expect(page.locator('.chat-sticker-image')).toHaveCount(1);
        await expect(page.locator('.ai-streaming-row')).toHaveCount(0, { timeout: 20000 });
        await expect.poll(async () => page.evaluate(({ historyKey, oldId }) => JSON.parse(localStorage.getItem(historyKey)).find(item => item.id === oldId)?.messages.length, { historyKey, oldId })).toBe(6);
        await openHistory(page);
        await expect(page.locator('.ai-history-open').first()).toContainText('周末的小事');
        const saved = await page.evaluate(({ historyKey, oldId }) => JSON.parse(localStorage.getItem(historyKey)).find(item => item.id === oldId), { historyKey, oldId });
        assert.equal(saved.messages.filter(message => message.content === '[nava-sticker:hug]').length, 1);
        await page.locator('.ai-history-sheet header button').click();
        await page.reload({ waitUntil: 'networkidle' });
        if (await page.locator('.launch-sequence').isVisible().catch(() => false)) await page.locator('.launch-sequence').click();
        await expect(page.locator('.chat-sticker-image')).toHaveCount(1);
        await expect(page.locator('.chat-message-row')).toHaveCount(6);
        await expect(page.locator('.chat-copy-message')).toHaveCount(6);
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.chatTestCopied = text; } } }));
        await page.locator('.chat-sticker-bubble .chat-copy-message').click();
        assert.equal(await page.evaluate(() => window.chatTestCopied), '抱抱');
        await page.screenshot({ path: `${output}/${engine}-${width}-resumed-sticker.png` });
        await openHistory(page);
        page.once('dialog', dialog => dialog.accept());
        await page.locator('.ai-history-row').filter({ hasText: '周末的小事' }).locator('.ai-history-delete').click();
        await expect.poll(async () => page.evaluate(({ historyKey, oldId }) => JSON.parse(localStorage.getItem(historyKey)).some(item => item.id === oldId), { historyKey, oldId })).toBe(false);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), activeKey), null);
        await page.locator('.ai-history-sheet header button').click();
        await expect(page.locator('.chat-message-row')).toHaveCount(1);
        report.results.push({ engine, width, geometry, archiveId: saved.id, messagesAfterContinuation: saved.messages.length, reloadedSticker: true, explicitCopy: 'label copied', deleteActive: 'archived and live rows removed, new greeting created' });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.passed = true;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await server.close(); await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); }
if (!report.passed) throw new Error(report.errors.join('\n'));
console.log(`Chat continuation and bubble layout: ${report.results.length} cases passed.`);
