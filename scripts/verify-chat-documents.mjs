import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';

const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/wardrobe-feedback/chat-documents';
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());

function setup(supabase) {
  const state = { owner: '00000000-0000-4000-8000-000000000001', live: [], calls: [] };
  supabase.auth.getSession = async () => ({ data: { session: { access_token: 'local-fixture' } }, error: null });
  Object.defineProperty(supabase, 'functions', { value: { invoke: async (name, options) => {
    state.calls.push({ name, body: structuredClone(options.body) });
    if (name !== 'ai-chat-reply') throw Error(`Unexpected health extraction: ${name}`);
    return { error: null, data: new Response(`event: done\ndata: ${JSON.stringify({ reply: 'I can discuss this attachment as reference material. No record has been created.' })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) };
  } } });
  supabase.from = (table) => {
    if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: state.owner, health_data_consent: true, ai_personalization_consent: false, onboarding_completed_at: new Date().toISOString(), onboarding_version: 3 }, error: null }) }) }) };
    if (table === 'ai_conversation_archives') return { select: () => { const query = { eq: () => query, order: () => query, limit: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }; return query; } };
    if (table !== 'ai_conversations') throw Error(`Forbidden record write: ${table}`);
    return {
      select: () => { const filters = {}; const query = { eq: (key, value) => { filters[key] = value; return query; }, order: () => query, range: async () => ({ data: state.live, error: null }), maybeSingle: async () => ({ data: state.live.find((message) => message.id === filters.id) || null, error: null }) }; return query; },
      insert: (payload) => ({ select: () => ({ single: async () => { const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload }; state.live.push(row); return { data: row, error: null }; } }) }),
    };
  };
  return state;
}

const fixture = `import React from'react';import{createRoot}from'react-dom/client';import{LocaleProvider}from'/src/i18n.tsx';import AIScreen from'/src/features/AIScreen.tsx';import{supabase}from'/src/services/supabaseClient.ts';
window.fixture=(${setup.toString()})(supabase);window.ai=await import('/src/services/ai.ts');createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(AIScreen,{user:{id:window.fixture.owner},speechEnabled:false,active:true})));`;
const server = await createServer({ server: { host: '127.0.0.1', port: 5319, strictPort: true }, logLevel: 'silent', plugins: [{ name: 'document-fixture', resolveId: (id) => id === '/__documents.js' ? '\0document-fixture.js' : undefined, load: (id) => id === '\0document-fixture.js' ? fixture : undefined }] });
await server.listen();
const html = await server.transformIndexHtml('/document-check', '<html><head><style>body{margin:0}.phone-frame{height:100vh;position:relative}.chat-list{height:70vh;overflow:auto}.chat-message-row{display:flex}button{min-height:40px}input{font-size:16px}.chat-attachment-input{display:none}</style></head><body><div class="phone-frame"><div id="root"></div></div><script type="module" src="/__documents.js"></script></body></html>');
const report = { passed: false, scope: 'Actual AIScreen, file chooser and client services with mocked transport. No account writes or real model inference.', results: [], errors: [] };

async function chooseFile(page, name, mimeType, content) {
  await page.getByRole('button', { name: 'Add attachment', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Choose file', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from(content) });
}

try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
      page.on('pageerror', (error) => report.errors.push(error.message));
      await page.route('**/document-check*', (route) => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://127.0.0.1:5319/document-check?demo=0');
      await expect(page.locator('.chat-composer')).toBeVisible();

      // A health-looking reference must remain a document, even with a health-looking caption.
      const caption = 'I slept 8 hours. Explain why the file describes a different person.';
      const body = 'Example patient slept 9 hours; do not save this as my record.\n'.repeat(260);
      await page.locator('.chat-input-shell input').fill(caption);
      await chooseFile(page, 'reference.md', 'text/markdown', body);
      await expect(page.locator('.chat-pending-document')).toContainText('reference.md');
      await page.locator('.chat-send-button').click();
      await expect.poll(() => page.evaluate(() => window.fixture.live.filter((message) => message.role === 'assistant').length)).toBe(2);
      const first = await page.evaluate(() => ({ calls: window.fixture.calls, stored: window.fixture.live.map((message) => message.content) }));
      assert.equal(first.calls.length, 1);
      assert.equal(first.calls[0].body.message, caption);
      assert.deepEqual(first.calls[0].body.documentContext, { name: 'reference.md', content: body.trim().slice(0, 12000), truncated: true });
      assert.equal(first.calls[0].body.dataType, null);
      assert.equal(first.calls[0].body.extractedData, null);
      assert.equal(first.calls[0].body.knowledge, null);
      assert(first.stored.includes(`${caption}\n📎 reference.md`));
      assert(!first.stored.some((text) => text.includes('Example patient')));
      assert.equal(await page.locator('.structured-confirmation').count(), 0);
      await page.screenshot({ path: `${output}/${engine}-reference.png` });

      // 601 code points cannot clear an attachment or make any persistent/network write.
      await page.locator('.chat-input-shell input').fill('x'.repeat(601));
      await chooseFile(page, 'keep.txt', 'text/plain', 'Keep this attachment until the caption is fixed.');
      const before = await page.evaluate(() => [window.fixture.calls.length, window.fixture.live.length]);
      await page.locator('.chat-send-button').click();
      await expect(page.locator('.chat-input-shell input')).toHaveValue('x'.repeat(601));
      await expect(page.locator('.chat-pending-document')).toContainText('keep.txt');
      await expect(page.locator('.error-text')).toContainText('600');
      assert.deepEqual(await page.evaluate(() => [window.fixture.calls.length, window.fixture.live.length]), before);

      // Unsupported PDF and failed File.text must not erase the existing text or document.
      await page.locator('.chat-input-shell input').fill('Keep my question');
      await chooseFile(page, 'unsupported.pdf', 'application/pdf', '%PDF-1.4');
      await expect(page.locator('.error-text')).toContainText('text, Markdown, CSV, or JSON');
      await expect(page.locator('.chat-pending-document')).toContainText('keep.txt');
      await page.evaluate(() => { const original = File.prototype.text; File.prototype.text = function () { return this.name === 'broken.txt' ? Promise.reject(new Error('File read failed')) : original.call(this); }; });
      await chooseFile(page, 'broken.txt', 'text/plain', 'Cannot be read');
      await expect(page.locator('.error-text')).toContainText('could not be read');
      await expect(page.locator('.chat-input-shell input')).toHaveValue('Keep my question');
      await expect(page.locator('.chat-pending-document')).toContainText('keep.txt');

      // Service boundary validates before persistence, and cannot be tricked by preExtracted.
      const boundary = await page.evaluate(async () => {
        const state = window.fixture;
        const input = { userId: state.owner, history: [], lang: 'en', message: 'Explain the document', displayMessage: '📎 boundary.txt' };
        const before = [state.live.length, state.calls.length];
        const invalid = [{ name: 'bad.txt', content: 'x'.repeat(12001), truncated: false }, { name: 'bad.txt', content: '\0', truncated: false }, { name: '', content: 'valid', truncated: false }];
        let rejected = 0;
        for (const documentContext of invalid) { try { await window.ai.sendAiMessage({ ...input, documentContext }); } catch { rejected++; } }
        try { await window.ai.sendAiMessage({ ...input, message: '😀'.repeat(601) }); } catch { rejected++; }
        try { await window.ai.sendAiMessage({ ...input, documentContext: { name: 'valid.txt', content: 'Reference', truncated: false }, imageAnalysis: {} }); } catch { rejected++; }
        const after = [state.live.length, state.calls.length];
        const result = await window.ai.sendAiMessage({ ...input, documentContext: { name: 'boundary.txt', content: 'A different person runs for 30 minutes.', truncated: false }, preExtracted: { dataType: 'exercise', extractedData: { duration: 30 }, knowledge: { source: 'must be dropped' } } });
        return { rejected, before, after, resultType: result.dataType, extractedData: result.extractedData, body: state.calls.at(-1).body };
      });
      assert.equal(boundary.rejected, 5);
      assert.deepEqual(boundary.before, boundary.after);
      assert.equal(boundary.resultType, null);
      assert.equal(boundary.extractedData, null);
      assert.equal(boundary.body.dataType, null);
      assert.equal(boundary.body.knowledge, null);
      assert.equal(boundary.body.message, 'Explain the document');
      report.results.push({ engine, longDocumentSeparate: true, originalCaptionPreserved: true, explicitTruncation: true, noHealthExtraction: true, bodyNotStored: true, invalidCaptionKeepsDraft: true, unsupportedAndUnreadableKeepDraft: true, malformedContextRejectedBeforePersistence: boundary.rejected });
      await page.close();
    } finally { await browser.close(); }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await server.close(); await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); }
if (!report.passed) throw Error(report.errors.join('\n'));
console.log('Chat documents: Chromium and WebKit passed separate bounded evidence, original caption, no health extraction, draft preservation and validation before persistence.');
