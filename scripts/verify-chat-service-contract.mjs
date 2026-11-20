import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: '127.0.0.1', port: 5313, strictPort: true }, logLevel: 'silent' });
await server.listen();
const results = [];
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      await page.route('**/contract?demo=0', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Local service contract</body></html>' }));
      await page.goto('http://127.0.0.1:5313/contract?demo=0');
      const result = await page.evaluate(async () => {
        const { supabase } = await import('/src/services/supabaseClient.ts');
        const { sendAiMessage, loadConversation } = await import('/src/services/ai.ts');
        const owner = '00000000-0000-4000-8000-000000000001';
        const writes = [], calls = [], deltas = [], statuses = [], queries = [];
        const archiveId = '10000000-0000-4000-8000-000000000001';
        let archiveRow = { id: archiveId, created_at: '2026-11-10T12:00:00Z', updated_at: 'v1', messages: [{ __navaArchive: { version: 1, title: 'Saved', dayKey: '2026-11-10' } }] };
        let revision = 1;
        let currentMutations = 0;
        supabase.auth.getSession = async () => ({ data: { session: { access_token: 'test-token-not-a-secret' } }, error: null });
        Object.defineProperty(supabase, 'functions', { value: { invoke: async (name, options) => {
          calls.push({ name, body: options.body });
          if (name !== 'ai-chat-reply') throw new Error('A sticker must not reach health extraction');
          return { data: new Response('event: done\ndata: {"reply":"抱抱你～"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), error: null };
        } } });
        supabase.from = (table) => {
          if (table === 'ai_conversation_archives') {
            return {
              select: () => {
                const filters = {};
                const query = { eq: (key, value) => { filters[key] = value; return query; }, maybeSingle: async () => {
                  if (filters.user_id !== owner || filters.id !== archiveId) throw new Error('Missing owner scope');
                  return { data: structuredClone(archiveRow), error: null };
                } };
                return query;
              },
              update: (payload) => {
                const filters = {};
                const query = { eq: (key, value) => { filters[key] = value; return query; }, select: () => query, maybeSingle: async () => {
                  if (filters.user_id !== owner || filters.id !== archiveId) throw new Error('Missing owner scope');
                  if (filters.updated_at !== archiveRow.updated_at) return { data: null, error: null };
                  writes.push(structuredClone(payload));
                  archiveRow = { ...archiveRow, ...payload, updated_at: `v${++revision}` };
                  return { data: { id: archiveId }, error: null };
                } };
                return query;
              },
            };
          }
          if (table !== 'ai_conversations') throw new Error('Unexpected table');
          return {
            insert: (payload) => {
              currentMutations++;
              return { select: () => ({ single: async () => ({ data: { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }, error: null }) }) };
            },
            select: () => {
              const query = {
                eq: (key, value) => { queries.push([key, value]); return query; },
                order: () => query,
                range: async (start) => ({ data: Array.from({ length: start === 0 ? 500 : 2 }, (_, index) => ({ id: `${start + index}`, role: 'user', content: 'saved', created_at: new Date().toISOString() })), error: null }),
              };
              return query;
            },
          };
        };
        const started = performance.now();
        const reply = await sendAiMessage({ userId: owner, archiveId, message: '[nava-sticker:hug]', displayMessage: '[nava-sticker:hug]', history: [], lang: 'zh', onDelta: content => deltas.push(content), onStatus: status => statuses.push(status?.id ?? null) });
        const milliseconds = performance.now() - started;
        const loaded = await loadConversation(owner);
        return { milliseconds, writes, calls, deltas, statuses, archiveRow, currentMutations, loaded: loaded.length, queries, reply: reply.assistantMessage.content };
      });
      assert.equal(result.calls.length, 1);
      assert.equal(result.calls[0].name, 'ai-chat-reply');
      assert.equal(result.calls[0].body.message, '[nava-sticker:hug]');
      assert.equal(result.writes.length, 2);
      assert.equal(result.archiveRow.messages[1].content, '[nava-sticker:hug]');
      assert.equal(result.archiveRow.messages[2].content, '抱抱你～');
      assert.deepEqual(result.deltas, ['抱抱你～']);
      assert.equal(result.statuses.at(-1), null);
      assert(result.milliseconds < 650, `Reply waited for decorative processing steps: ${result.milliseconds}ms`);
      assert.equal(result.currentMutations, 0);
      assert.equal(result.calls[0].body.archiveId, result.archiveRow.id);
      assert.equal(result.calls[0].body.messageId, result.archiveRow.messages[1].id);
      assert.equal(result.loaded, 502, 'Long conversations must not silently truncate at 80 messages');
      assert(result.queries.every(([key, value]) => key === 'user_id' && value === '00000000-0000-4000-8000-000000000001'));
      results.push({ engine, ...result });
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
await writeFile(`${output}/service-contract.json`, JSON.stringify({ passed: true, scope: 'Actual client service in browser with fully mocked Supabase transport; no production messages or credentials used.', results }, null, 2));
console.log('Chat service contract: both engines passed sticker persistence, no health extraction, done-only SSE, owner scoping, pagination, and immediate reply.');
