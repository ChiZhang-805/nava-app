import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat-presentation';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: '127.0.0.1', port: 5314, strictPort: true }, logLevel: 'silent' });
await server.listen();
const report = { passed: false, scope: 'Local UI fixtures verify rendering/persistence, not model quality. Avatar uploaded through the actual profile service in local demo mode.', results: [], errors: [] };
const user = '00000000-0000-4000-8000-000000000001';
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      for (const width of [360, 430]) {
        const context = await browser.newContext({ viewport: { width, height: width === 360 ? 740 : 932 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.route('**/profile-upload-fixture?demo=1', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Local profile upload fixture</body></html>' }));
        await page.goto('http://127.0.0.1:5314/profile-upload-fixture?demo=1');
        const upload = await page.evaluate(async user => {
          const { saveProfileAvatar } = await import('/src/services/profile.ts');
          const image = await fetch('/src/assets/figma/home-option2/home-mascot-v5.png').then(response => response.blob());
          const avatar = await saveProfileAvatar(user, new File([image], 'chosen-cat-photo.png', { type: 'image/png' }));
          sessionStorage.setItem('nava.review.demo.auth.v1', 'signed-in');
          localStorage.setItem(`nava.onboarding.v3.${user}`, JSON.stringify({ completed: true, version: 3, answers: {} }));
          const now = new Date().toISOString();
          localStorage.setItem(`nava-demo-conversation:${user}`, JSON.stringify([
            { id: crypto.randomUUID(), role: 'user', content: '我今天想轻松一点，和你聊聊周末的安排。', created_at: now },
            { id: '10000000-0000-4000-8000-000000000001', role: 'assistant', content: '[nava-reply:v1]' + JSON.stringify([
              { type: 'text', text: '收到啦～' },
              { type: 'text', text: '周末先留一点空闲，散散步、吃顿喜欢的饭，也很好呀。' },
              { type: 'sticker', id: 'hug' },
            ]), created_at: now },
            { id: crypto.randomUUID(), role: 'user', content: '好呀', created_at: now },
          ]));
          return { isImage: avatar.startsWith('data:image/png;base64,'), bytes: image.size };
        }, user);
        assert(upload.isImage && upload.bytes > 0);
        await page.goto('http://127.0.0.1:5314/?demo=1#tab=ai', { waitUntil: 'networkidle' });
        if (await page.locator('.launch-sequence').isVisible().catch(() => false)) await page.locator('.launch-sequence').click();
        await expect(page.locator('.chat-composer')).toBeVisible();
        await expect(page.locator('[data-message-id="10000000-0000-4000-8000-000000000001"]')).toHaveCount(3);
        await expect(page.locator('.chat-message-row.assistant .chat-sticker-image')).toHaveCount(1);
        await expect(page.locator('.chat-avatar.user img')).toHaveCount(2);
        assert(await page.locator('.chat-avatar.user img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
        await page.locator('.chat-list').evaluate(list => { list.scrollTop = 0; });
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('.app-header').getBoundingClientRect();
          const list = document.querySelector('.chat-list').getBoundingClientRect();
          const first = document.querySelector('.chat-message-row').getBoundingClientRect();
          return { headerHeight: header.height, listGap: list.top - header.bottom, firstGap: first.top - header.bottom };
        });
        assert(geometry.headerHeight <= 44.5 && geometry.listGap >= -1 && geometry.listGap <= 1 && geometry.firstGap <= 9, JSON.stringify(geometry));
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => new Promise(resolve => { window.copiedText = text; window.finishCopy = resolve; }) } }));
        const copy = page.locator('[data-message-id="10000000-0000-4000-8000-000000000001"][data-reply-part="0"] .chat-copy-message');
        await copy.click();
        await expect(copy).not.toHaveAttribute('data-copied', 'true');
        await page.evaluate(() => window.finishCopy());
        await expect(copy).toHaveAttribute('data-copied', 'true');
        assert.equal(await page.evaluate(() => window.copiedText), '收到啦～');
        await expect(copy).not.toHaveAttribute('data-copied', 'true', { timeout: 2500 });
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard unavailable'); } } }));
        await copy.click();
        await expect(copy).not.toHaveAttribute('data-copied', 'true');
        await expect(page.locator('.chat-media-notice')).toContainText('暂时没能复制');
        await page.locator('.chat-media-notice button').click();
        await page.locator('.chat-list').evaluate(list => { list.scrollTop = 0; });
        await page.screenshot({ path: `${output}/${engine}-${width}-uploaded-avatar-segments.png` });
        await page.reload({ waitUntil: 'networkidle' });
        if (await page.locator('.launch-sequence').isVisible().catch(() => false)) await page.locator('.launch-sequence').click();
        await expect(page.locator('[data-message-id="10000000-0000-4000-8000-000000000001"]')).toHaveCount(3);
        await expect(page.locator('.chat-avatar.user img')).toHaveCount(2);
        report.results.push({ engine, width, geometry, upload, groupedBubbles: 3, assistantSticker: 'hug', copiedOnlyAfterSuccess: true, copiedClears: true, failureDoesNotCheck: true, reload: true });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.passed = true;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await server.close(); await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); }
if (!report.passed) throw new Error(report.errors.join('\n'));
console.log(`Chat presentation: ${report.results.length} cases passed.`);
