import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat-cloud-reset';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());

// All transport is in memory. No real account, cloud write, or model call is used.
function installTransport(supabase) {
  const owner = '00000000-0000-4000-8000-000000000001';
  const state = { owner, live: [], archives: [], writes: [], reads: [], failArchives: false, eraseArchiveAfterRead: false, eraseOnReply: false };
  const scoped = filters => { if (filters.user_id !== owner) throw new Error('Missing owner scope'); };
  const result = data => ({ data: structuredClone(data), error: null });
  supabase.auth.getSession = async () => ({ data: { session: { access_token: 'local-fixture' } }, error: null });
  Object.defineProperty(supabase, 'functions', { value: { invoke: async (name) => {
    if (name !== 'ai-chat-reply') throw new Error('Unexpected AI extraction');
    if (state.eraseOnReply) state.live = [];
    return result({ reply: 'Local reply' });
  } } });
  supabase.from = table => {
    if (table === 'profiles') return { select: () => ({ eq: (key, value) => ({ maybeSingle: async () => {
      if (key !== 'id' || value !== owner) throw new Error('Missing profile owner');
      return result({ id: owner, nickname: 'Tester', health_data_consent: true, ai_personalization_consent: false, onboarding_completed_at: new Date().toISOString(), onboarding_version: 3 });
    } }) }) };
    if (!['ai_conversation_archives', 'ai_conversations'].includes(table)) throw new Error(`Unexpected table: ${table}`);
    const collection = () => table === 'ai_conversations' ? state.live : state.archives;
    const build = (operation, payload) => {
      const filters = {};
      let ids;
      let range;
      const run = async single => {
        if (operation !== 'insert') scoped(filters);
        else if (payload.user_id !== owner) throw new Error('Missing insert owner');
        state.reads.push({ table, operation, filters: { ...filters } });
        if (operation === 'read' && table === 'ai_conversation_archives' && state.failArchives) return { data: null, error: { message: 'offline fixture' } };
        const matches = row => (!filters.id || row.id === filters.id) && (!filters.updated_at || row.updated_at === filters.updated_at) && (!ids || ids.includes(row.id));
        let rows = collection().filter(matches);
        if (operation === 'read') {
          if (range) rows = rows.slice(range[0], range[1] + 1);
          const response = result(single ? rows[0] ?? null : rows);
          if (table === 'ai_conversation_archives' && filters.id && state.eraseArchiveAfterRead) { state.archives = []; state.eraseArchiveAfterRead = false; }
          return response;
        }
        if (operation === 'insert') {
          const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: crypto.randomUUID(), ...payload };
          collection().push(row); state.writes.push({ table, operation, row: structuredClone(row) }); return result(row);
        }
        if (operation === 'update') {
          rows.forEach(row => Object.assign(row, payload, { updated_at: crypto.randomUUID() }));
          if (rows.length) state.writes.push({ table, operation }); return result(rows[0] ?? null);
        }
        if (table === 'ai_conversations') state.live = collection().filter(row => !matches(row));
        else state.archives = collection().filter(row => !matches(row));
        state.writes.push({ table, operation }); return result(null);
      };
      const query = {
        eq: (key, value) => { filters[key] = value; return query; }, in: (_key, values) => { ids = values; return query; },
        select: () => query, order: () => query, limit: () => query,
        range: (start, end) => { range = [start, end]; return query; },
        maybeSingle: () => run(true), single: () => run(true), then: (resolve, reject) => run(false).then(resolve, reject),
      };
      return query;
    };
    return { select: () => build('read'), insert: payload => build('insert', payload), update: payload => build('update', payload), delete: () => build('delete') };
  };
  return state;
}

const fixture = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {supabase} from '/src/services/supabaseClient.ts';
import {LocaleProvider} from '/src/i18n.tsx';
import AIScreen from '/src/features/AIScreen.tsx';
window.fixture=(${installTransport.toString()})(supabase);
window.cloud=await import('/src/services/userCloudState.ts');
window.ai=await import('/src/services/ai.ts');
const root=createRoot(document.getElementById('root'));
let commandId=0;
window.mountChat=(props={})=>root.render(React.createElement(LocaleProvider,null,React.createElement(AIScreen,{user:{id:window.fixture.owner,email:'fixture@example.invalid'},speechEnabled:false,...props})));
window.chatCommand=type=>window.mountChat({command:{id:++commandId,type}});
window.fixtureReady=true;`;
const server = await createServer({
  server: { host: '127.0.0.1', port: 5316, strictPort: true, hmr: false }, logLevel: 'silent',
  plugins: [{ name: 'chat-cloud-reset-fixture', resolveId: id => id === '/__chat-reset.js' ? '\0chat-reset-fixture.js' : undefined, load: id => id === '\0chat-reset-fixture.js' ? fixture : undefined }],
});
await server.listen();
const html = await server.transformIndexHtml('/reset-contract', '<html><body><div class="phone-frame"><div id="root"></div></div><script type="module" src="/__chat-reset.js"></script></body></html>');
const report = { passed: false, scope: 'Actual services and AIScreen with local-only Supabase transport; no production deletion.', results: [], errors: [] };
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
      page.on('pageerror', error => report.errors.push(error.stack ?? error.message));
      page.on('console', message => {
        // A routed fixture document can block Vite's optional HMR websocket in
        // Chromium; it is unrelated to app transport and is not used by tests.
        if (message.type() === 'error' && !/WebSocket|\[vite\]|Failed to send error to Vite/.test(message.text())) report.errors.push(message.text());
      });
      page.on('requestfailed', request => report.errors.push(`Failed fixture request: ${request.url()} ${request.failure()?.errorText}`));
      await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:5316/') ? route.continue() : route.abort());
      await page.route('**/reset-contract*', route => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://127.0.0.1:5316/reset-contract?demo=0');
      await page.waitForFunction(() => window.fixtureReady === true);
      const service = await page.evaluate(async () => {
        const s = window.fixture, cloud = window.cloud;
        const stamp = new Date().toISOString();
        const message = { id: crypto.randomUUID(), role: 'user', content: 'stale local text', created_at: stamp };
        const archive = { id: crypto.randomUUID(), createdAt: stamp, title: 'Old chat', messages: [message] };
        let missingRejected = false;
        try { await cloud.saveConversationArchive(s.owner, archive); } catch { missingRejected = true; }
        if (!missingRejected || s.writes.length) throw new Error('Deleted local history recreated an archive');
        s.live = [{ ...message, content: 'authoritative cloud text' }];
        const saved = await cloud.saveConversationArchive(s.owner, { ...archive, messages: [...archive.messages, { ...message, id: crypto.randomUUID() }] });
        if (saved.messages.length !== 1 || saved.messages[0].content !== 'authoritative cloud text') throw new Error('Archive accepted unconfirmed local messages/content');
        const writes = s.writes.length;
        s.eraseArchiveAfterRead = true;
        let racedRejected = false;
        try { await cloud.saveConversationArchive(s.owner, saved); } catch { racedRejected = true; }
        if (!racedRejected || s.archives.length || s.writes.length !== writes) throw new Error('Archive update resurrected deletion during read');
        s.live = []; s.writes = []; s.eraseOnReply = true;
        let replyRejected = false;
        try { await window.ai.sendAiMessage({ userId: s.owner, message: '[nava-sticker:hug]', history: [], lang: 'en' }); } catch { replyRejected = true; }
        if (!replyRejected || s.live.length || s.writes.some(write => write.row?.role === 'assistant')) throw new Error('In-flight reply reinserted after server clear');
        s.eraseOnReply = false; s.writes = [];
        window.staleArchive = archive;
        return { missingRejected, cloudContentAuthoritative: true, racedRejected, replyRejected };
      });
      // Cache reconciliation: an empty successful cloud result clears only chat.
      await page.evaluate(() => {
        const s = window.fixture;
        localStorage.setItem(`nava-ai-history:${s.owner}`, JSON.stringify([window.staleArchive]));
        localStorage.setItem(`nava-ai-active-archive:${s.owner}`, window.staleArchive.id);
        localStorage.setItem('preserved-journal-fixture', 'keep');
        window.mountChat();
      });
      await expect.poll(() => page.evaluate(() => localStorage.getItem(`nava-ai-history:${window.fixture.owner}`))).toBe('[]');
      await expect.poll(() => page.evaluate(() => localStorage.getItem(`nava-ai-active-archive:${window.fixture.owner}`))).toBe(null);
      await expect(page.locator('.chat-message-row')).toHaveCount(1);
      assert.equal(await page.evaluate(() => localStorage.getItem('preserved-journal-fixture')), 'keep');
      assert.equal(await page.evaluate(() => window.fixture.writes.some(write => write.table === 'ai_conversation_archives')), false);
      // Foreground refresh removes a previously visible archive and its pointer.
      await page.evaluate(() => {
        const s = window.fixture, a = window.staleArchive;
        s.archives = [{ id: a.id, created_at: a.createdAt, updated_at: 'v1', messages: [{ __navaArchive: { version: 1, dayKey: a.createdAt.slice(0,10), title: 'Cloud chat' } }, ...a.messages] }];
        window.chatCommand('history');
      });
      await page.locator('.ai-history-open').click();
      await expect(page.locator('.chat-bubble')).toContainText(['stale local text']);
      await page.evaluate(() => { window.fixture.archives = []; window.fixture.live = []; window.dispatchEvent(new Event('focus')); });
      await expect.poll(() => page.evaluate(() => localStorage.getItem(`nava-ai-active-archive:${window.fixture.owner}`))).toBe(null);
      await expect.poll(() => page.evaluate(() => localStorage.getItem(`nava-ai-history:${window.fixture.owner}`))).toBe('[]');
      await expect(page.locator('.chat-bubble')).not.toContainText(['stale local text']);
      // A temporary network failure is not an authoritative empty result.
      await page.evaluate(() => {
        localStorage.setItem(`nava-ai-history:${window.fixture.owner}`, JSON.stringify([window.staleArchive]));
        window.fixture.failArchives = true;
        window.chatCommand('history');
      });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(`nava-ai-history:${window.fixture.owner}`)).length), 1);
      // A stale open current chat cannot be archived after a cloud wipe.
      await page.evaluate(() => { window.fixture.failArchives = false; window.fixture.live = []; window.fixture.archives = []; window.fixture.writes = []; window.chatCommand('new'); });
      await expect.poll(() => page.evaluate(() => window.fixture.live.length)).toBe(1);
      assert.equal(await page.evaluate(() => window.fixture.writes.filter(write => write.table === 'ai_conversation_archives').length), 0);
      await page.screenshot({ path: `${output}/${engine}-cloud-reset.png` });
      report.results.push({ engine, ...service, authoritativeEmptyClearsCache: true, activeArchiveClearedOnResume: true, unrelatedStoragePreserved: true, offlineCachePreserved: true, staleCurrentNotArchived: true });
      await page.close();
      // The existing demo local authority remains independent of the real cloud.
      const demo = await browser.newPage();
      await demo.route('**/reset-contract*', route => route.fulfill({ contentType: 'text/html', body: html }));
      await demo.goto('http://127.0.0.1:5316/reset-contract?demo=1');
      await demo.waitForFunction(() => window.fixtureReady === true);
      assert.equal(await demo.evaluate(async () => {
        const stamp = new Date().toISOString();
        await window.cloud.saveConversationArchive(window.fixture.owner, { id: crypto.randomUUID(), createdAt: stamp, messages: [{ id: crypto.randomUUID(), role: 'user', content: 'demo retained', created_at: stamp }] });
        return (await window.cloud.loadConversationArchives(window.fixture.owner)).length;
      }), 1);
      await demo.close();
    } finally { await browser.close(); }
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.passed = true;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await server.close(); await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); }
if (!report.passed) throw new Error(report.errors.join('\n'));
console.log('Both engines passed cloud reset, stale archive prevention, foreground refresh, in-flight deletion, ownership and demo isolation.');
