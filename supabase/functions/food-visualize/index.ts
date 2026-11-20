import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';
import { loadConsentFlags } from '../_shared/consent.ts';
import { assertOwnedStoragePath } from '../_shared/storage-ownership.ts';
import { foodRenderDeadline, FoodRenderError, generateFoodAsset, prepareFoodEvidence, reviewFoodAsset, type SavedFoodInput } from '../_shared/food-render-provider.ts';
import { foodVisualStyleVersionV2 } from '../_shared/food-visual-v2.ts';

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
type Job = { id: string; user_id: string; source_revision: string; claimed_revision: string; prompt_version: string; worker_token: string; attempts: number; input: SavedFoodInput };

/** Only a durable saved-record job can spend credits. The report never calls this worker. */
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });
  const body = await boundedBody(request);
  if (!body || typeof body.jobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.jobId) || typeof body.workerToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.workerToken)) return jsonResponse({ error: 'saved_record_job_required' }, { status: 400 });
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return jsonResponse({ error: 'worker_unavailable' }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const claim = await admin.rpc('claim_food_render_job', { p_job_id: body.jobId, p_worker_token: body.workerToken });
  if (claim.error) return jsonResponse({ error: 'worker_unavailable' }, { status: 503 });
  const job = (claim.data as Job[] | null)?.[0];
  // Uniform response reveals no state for stale, duplicate, or invalid capabilities.
  if (!job) return jsonResponse({ accepted: false }, { status: 202 });
  EdgeRuntime.waitUntil(processJob(admin, job));
  return jsonResponse({ accepted: true }, { status: 202 });
});

async function boundedBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.body) return null;
  const reader = request.body.getReader(); let total = 0; let text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > 2048) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

async function processJob(admin: SupabaseClient, job: Job) {
  let assetPath: string | null = null;
  const finish = (path: string | null, model: string | null, quality: unknown, error: string | null) => admin.rpc('finish_food_render_job', {
    p_job_id: job.id, p_worker_token: job.worker_token, p_source_revision: job.claimed_revision,
    p_asset_path: path, p_model_version: model, p_quality: quality, p_error_code: error,
  });
  try {
    const deadline = foodRenderDeadline();
    const consent = await loadConsentFlags(admin, job.user_id);
    if (!consent.healthSync || !consent.aiPersonalization) throw new FoodRenderError('consent_revoked');
    if (job.prompt_version !== foodVisualStyleVersionV2) throw new FoodRenderError('style_version_mismatch');
    const input = job.input;
    let sourceUrl: string | null = null;
    if (input.photoPath) {
      if (input.photoBucket !== 'diet-photos') throw new FoodRenderError('invalid_evidence_bucket');
      assertOwnedStoragePath(input.photoPath, job.user_id, 'food');
      const source = await admin.storage.from('diet-photos').createSignedUrl(input.photoPath, 600);
      if (source.error || !source.data?.signedUrl) throw new FoodRenderError('evidence_unavailable');
      sourceUrl = source.data.signedUrl;
    }
    const evidence = await prepareFoodEvidence(input, sourceUrl, deadline);
    const generated = await generateFoodAsset(evidence, sourceUrl, job.attempts, deadline);
    if (generated.normalizationDiagnostics) console.info('food_render_normalized', generated.normalizationDiagnostics);
    assetPath = `${job.user_id}/${job.id}/${crypto.randomUUID()}.png`;
    const upload = await admin.storage.from('diet-renders').upload(assetPath, generated.bytes, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
    if (upload.error) throw new FoodRenderError('asset_upload_failed');
    const signed = await admin.storage.from('diet-renders').createSignedUrl(assetPath, 600);
    if (signed.error || !signed.data?.signedUrl) throw new FoodRenderError('asset_sign_failed');
    const quality = await reviewFoodAsset(evidence, sourceUrl, signed.data.signedUrl, deadline);
    // SQL checks current source identity, consent, and the rotated lease token again.
    const saved = await finish(assetPath, generated.modelVersion, { ...quality, promptVersion: foodVisualStyleVersionV2 }, null);
    // A lost response can follow a committed finish. Never remove an asset that
    // may already be the record's accepted image; a lease can safely retry later.
    if (saved.error) { console.info('food_render_result', { code: 'finish_unconfirmed' }); return; }
    if (saved.data !== true) throw new FoodRenderError('source_changed');
    assetPath = null;
  } catch (cause) {
    if (assetPath) await admin.storage.from('diet-renders').remove([assetPath]);
    const code = cause instanceof FoodRenderError ? cause.code : cause instanceof DOMException && cause.name === 'TimeoutError' ? 'provider_timeout' : 'render_failed';
    await finish(null, null, {}, code);
    console.info('food_render_result', { code, ...(cause instanceof FoodRenderError ? { diagnostics: cause.diagnostics } : {}) }); // Fixed codes/numbers only; no URLs, pixels, tokens or provider output.
  }
}
