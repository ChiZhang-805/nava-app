// Explicit deployment/test approval required. Uses only a disposable synthetic
// account; never reads existing users or prints API keys, tokens, photos or text.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

if (!process.argv.includes('--approved-live-test')) throw new Error('Explicit live-test approval required.');
const project = 'wxteapvwagvhhtrjrbim', url = `https://${project}.supabase.co`;
const output = path.resolve('../Build/TestRuns/App-Checks/food-render-live');
await mkdir(output, { recursive: true });
const cli = path.resolve('node_modules/.bin/supabase.cmd');
// Values stay in this process; never pass credentials through command arguments.
let raw;
try { raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', `& '${cli.replaceAll("'", "''")}' projects api-keys --project-ref ${project} --output json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch { throw new Error('Could not load canonical project test credentials. No values logged.'); }
const keys = JSON.parse(raw); raw = null;
const service = keys.find(key => key.name === 'service_role')?.api_key;
const anon = keys.find(key => key.name === 'anon')?.api_key;
if (!service || !anon) throw new Error('Canonical test credentials unavailable.');
const admin = createClient(url, service, { auth: { persistSession: false } });
const account = createClient(url, anon, { auth: { persistSession: false } });
const email = `nava-render-test-${crypto.randomUUID()}@example.invalid`, password = `${crypto.randomUUID()}Aa!9`;
let userId; const receipt = { project, startedAt: new Date().toISOString(), synthetic: true, results: [], cleaned: false };
async function persist() { await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2)); }
async function removeOwned(bucket, prefix) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error('Synthetic asset cleanup failed.');
  for (const entry of data) {
    const item = `${prefix}/${entry.name}`;
    if (!entry.id) await removeOwned(bucket, item);
    else { const removed = await admin.storage.from(bucket).remove([item]); if (removed.error) throw new Error('Synthetic asset cleanup failed.'); }
  }
}
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Could not create disposable test account.');
  userId = created.data.user.id;
  const consent = await admin.from('profiles').upsert({ id: userId, health_data_consent: true, ai_personalization_consent: true });
  if (consent.error) throw new Error('Could not prepare synthetic consent.');
  const login = await account.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error('Could not sign in disposable test account.');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  for (const kind of ['text', 'photo']) {
    const id = crypto.randomUUID();
    let mediaPath = null;
    if (kind === 'photo') {
      mediaPath = `${userId}/journal-food/${id}/synthetic-tomato-eggs.png`;
      const image = await readFile('docs/visual-prototypes/assets/diet-flow/tomato-eggs.png');
      const upload = await account.storage.from('diet-photos').upload(mediaPath, image, { contentType: 'image/png' });
      if (upload.error) throw new Error('Could not upload synthetic photo fixture.');
    }
    const saved = await account.rpc('save_journal_entry', { p_record: { id, category: 'food', recordDate: date, createdAt: new Date().toISOString(), data: { foods: kind === 'text' ? '燕麦酸奶' : '西红柿炒鸡蛋', meal: '午餐' }, source: 'manual', mediaPath }, p_expected_version: null });
    if (saved.error) throw new Error('Could not save synthetic food record.');
    receipt.results.push({ kind, recordId: id, state: 'saved' });
  }
  await persist();
  const until = Date.now() + 11 * 60_000;
  while (Date.now() < until) {
    const jobs = await admin.from('food_render_jobs').select('id,source_id,state,attempts,dispatch_count,asset_path,last_error_code,model_version,prompt_version,evidence_kind').eq('user_id', userId);
    if (jobs.error) throw new Error('Could not read synthetic job status.');
    for (const result of receipt.results) {
      const job = jobs.data.find(job => job.source_id === result.recordId);
      if (job) Object.assign(result, { state: job.state, attempts: job.attempts, dispatchCount: job.dispatch_count, errorCode: job.last_error_code, model: job.model_version, prompt: job.prompt_version, evidenceKind: job.evidence_kind });
      if (job?.state === 'ready' && job.asset_path && !result.image) {
        const image = await admin.storage.from('diet-renders').download(job.asset_path);
        if (image.error) throw new Error('Generated test image is not readable.');
        result.image = path.join(output, `${result.kind}-${job.id}.png`);
        await writeFile(result.image, new Uint8Array(await image.data.arrayBuffer()));
      }
    }
    await persist();
    if (receipt.results.every(result => result.state === 'ready' || result.state === 'needs_details' || result.state === 'failed' && (result.attempts >= 2 || result.dispatchCount >= 6))) break;
    await new Promise(resolve => setTimeout(resolve, 12_000));
  }
  receipt.passed = receipt.results.every(result => result.state === 'ready' && result.image);
} catch (error) {
  receipt.passed = false; receipt.error = error.message;
} finally {
  if (userId) {
    try {
      // Identity was returned by this run's create call; confirm before deletion.
      const check = await admin.auth.admin.getUserById(userId);
      if (check.error || check.data.user.email !== email) throw new Error('Synthetic identity check failed.');
      const pending = await admin.from('food_render_jobs').select('id').eq('user_id', userId).eq('state', 'processing');
      const revoked = await admin.from('profiles').update({ ai_personalization_consent: false }).eq('id', userId);
      if (pending.error || revoked.error) throw new Error('Synthetic job cancellation failed.');
      // Invalidate capabilities, then let an in-flight bounded worker discard its
      // candidate before removing the account. Normal terminal tests do not wait.
      if (pending.data.length) await new Promise(resolve => setTimeout(resolve, 145_000));
      await removeOwned('diet-photos', userId); await removeOwned('diet-renders', userId);
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) throw new Error('Synthetic account cleanup failed.');
      receipt.cleaned = true;
    } catch { receipt.cleanupError = 'Synthetic resources need cleanup; no existing users touched.'; }
  }
  receipt.finishedAt = new Date().toISOString(); await persist();
}
console.log(JSON.stringify({ passed: receipt.passed, cleaned: receipt.cleaned, receipt: path.join(output, 'receipt.json') }));
if (!receipt.passed || !receipt.cleaned) process.exitCode = 1;
