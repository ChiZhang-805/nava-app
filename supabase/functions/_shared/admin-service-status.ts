import type { AdminServiceSnapshot, ConfigState, CredentialMetadata, DeepSeekBalance, FunctionStatus, ServiceId } from './admin-service-contract.ts';

export type EnvironmentReader = (name: string) => string | undefined;
export type FoodObservation = { state?: unknown; last_error_code?: unknown; updated_at?: unknown };
export type StatusDependencies = {
  authorize: (req: Request) => Promise<'admin' | 'member' | 'unauthenticated'>;
  environment: EnvironmentReader;
  readFoodObservations: () => Promise<FoodObservation[]>;
  fetch: typeof fetch;
  now: () => Date;
};
const canonical = 'https://wxteapvwagvhhtrjrbim.supabase.co';
const balanceEndpoint = 'https://api.deepseek.com/user/balance';
const present = (get: EnvironmentReader, name: string) => Boolean(get(name)?.trim());
const selected = (get: EnvironmentReader, names: string[]) => names.find(name => get(name) !== undefined) ?? names.at(-1)!;
const credential = (get: EnvironmentReader, name: string, required = true): CredentialMetadata => ({ name, configured: present(get, name), required });
function validHttps(value: string | undefined) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

/** Mirrors entry-point precedence; does not execute a model, inspect arbitrary envs, or return env values. */
export function configuredServices(get: EnvironmentReader): FunctionStatus[] {
  const direct = (id: ServiceId, names: string[], invalid = false): FunctionStatus => row(id, names.map(name => credential(get, name)), invalid);
  const row = (id: ServiceId, credentials: CredentialMetadata[], invalid = false): FunctionStatus => {
    const configuration: ConfigState = invalid ? 'invalid' : credentials.some(item => item.required && !item.configured) ? 'missing' : 'configured';
    return { id, configuration, credentials, signal: configuration === 'configured' ? 'unknown' : 'error', reason: configuration === 'configured' ? 'not_observed' : configuration === 'missing' ? 'configuration_missing' : 'configuration_invalid', observedAt: null, errorCode: null };
  };
  const customOr = (id: ServiceId, prefix: string, fallback: () => FunctionStatus) => get(`${prefix}_URL`)
    ? row(id, [credential(get, `${prefix}_URL`), credential(get, `${prefix}_KEY`, false)], !validHttps(get(`${prefix}_URL`))) : fallback();
  const vision = (id: ServiceId, prefix: string, usesEndpoint = true) => {
    const key = selected(get, [`${prefix}_KEY`, 'DASHSCOPE_API_KEY_NAVA']);
    const endpoint = `${prefix}_URL`;
    return direct(id, [key], usesEndpoint && get(endpoint) !== undefined && !validHttps(get(endpoint)));
  };
  const deepseek = (id: ServiceId) => direct(id, ['DEEPSEEK_API_KEY_NAVA']);
  // Food generation alone has explicit legacy authorization for the canonical project.
  const renderKey = get('DASHSCOPE_API_KEY_NAVA') ? 'DASHSCOPE_API_KEY_NAVA' : get('SUPABASE_URL') === canonical ? 'DASHSCOPE_API_KEY' : 'DASHSCOPE_API_KEY_NAVA';
  const renderDependencies = [credential(get, renderKey)]; // evidence planning and critic always use DashScope
  const customRender = get('NAVA_FOOD_RENDER_URL');
  if (customRender) renderDependencies.push(credential(get, 'NAVA_FOOD_RENDER_URL'), credential(get, 'NAVA_FOOD_RENDER_KEY', false));
  const dedicatedMatting = Boolean(get('AIDGE_ACCESS_KEY_ID_NAVA') || get('AIDGE_ACCESS_KEY_SECRET_NAVA'));
  const mattingNames = dedicatedMatting || get('SUPABASE_URL') !== canonical
    ? ['AIDGE_ACCESS_KEY_ID_NAVA', 'AIDGE_ACCESS_KEY_SECRET_NAVA'] : ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET'];
  const customMatting = get('NAVA_FOOD_MATTING_URL');
  return [
    customOr('chat_text', 'NAVA_AI_CHAT', () => deepseek('chat_text')),
    vision('chat_images', 'NAVA_CHAT_VISION'),
    deepseek('record_text'),
    vision('record_food_image', 'NAVA_DIET_VISION', false),
    vision('record_face_image', 'NAVA_FACE_VISION', false),
    customOr('extract_text', 'NAVA_AI_EXTRACT', () => deepseek('extract_text')),
    customOr('diet_photo', 'NAVA_DIET_EXTRACT', () => vision('diet_photo', 'NAVA_DIET_VISION')),
    customOr('face_photo', 'NAVA_FACE_ANALYZE', () => vision('face_photo', 'NAVA_FACE_VISION')),
    deepseek('health_report'), deepseek('diet_report'),
    row('food_visual', renderDependencies, Boolean(customRender && !validHttps(customRender)) || Boolean(get('NAVA_FOOD_RENDER_QA_COMPATIBLE_URL') && !validHttps(get('NAVA_FOOD_RENDER_QA_COMPATIBLE_URL')))),
    customMatting
      ? row('food_matting', [credential(get, 'NAVA_FOOD_MATTING_URL'), credential(get, 'NAVA_FOOD_MATTING_KEY', false)], !validHttps(customMatting))
      : direct('food_matting', mattingNames),
  ];
}

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function decimal(value: unknown): value is string { return typeof value === 'string' && /^-?\d{1,16}(?:\.\d{1,12})?$/.test(value); }
export function parseDeepSeekBalance(value: unknown, checkedAt: string): DeepSeekBalance {
  const data = object(value);
  const unknown: DeepSeekBalance = { state: 'unknown', checkedAt, balances: [] };
  if (!data || typeof data.is_available !== 'boolean' || !Array.isArray(data.balance_infos) || !data.balance_infos.length || data.balance_infos.length > 2) return unknown;
  const balances: DeepSeekBalance['balances'] = [];
  for (const item of data.balance_infos) {
    const info = object(item);
    if (!info || !['CNY', 'USD'].includes(String(info.currency)) || !decimal(info.total_balance) || !decimal(info.granted_balance) || !decimal(info.topped_up_balance) || balances.some(row => row.currency === info.currency)) return unknown;
    balances.push({ currency: info.currency as 'CNY' | 'USD', total: info.total_balance, granted: info.granted_balance, toppedUp: info.topped_up_balance });
  }
  return { state: data.is_available ? 'available' : 'insufficient', checkedAt, balances };
}

export async function loadDeepSeekBalance(get: EnvironmentReader, request: typeof fetch, checkedAt: string): Promise<DeepSeekBalance> {
  const key = get('DEEPSEEK_API_KEY_NAVA')?.trim();
  const result = (state: DeepSeekBalance['state']): DeepSeekBalance => ({ state, checkedAt, balances: [] });
  if (!key) return result('unconfigured');
  try {
    const response = await request(balanceEndpoint, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      // Never read or forward provider error bodies: they may contain credentials or identity.
      await response.body?.cancel();
      return result(response.status === 401 || response.status === 403 ? 'unauthorized' : response.status === 402 ? 'insufficient' : response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'unavailable' : 'unknown');
    }
    const reader = response.body?.getReader();
    if (!reader) return result('unknown');
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 16_384) { await reader.cancel(); return result('unknown'); } chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return parseDeepSeekBalance(JSON.parse(new TextDecoder().decode(bytes)), checkedAt);
  } catch { return result('unavailable'); }
}

// Return fixed categories only, even if a stored provider error happens to contain private data.
function foodError(code: unknown) {
  if (typeof code !== 'string') return 'processing_failed';
  if (/^(aidge_(nopermission|forbidden|unauthorized|invalidaccesskeyid)|.*_(401|403))$/.test(code)) return 'permission_denied';
  if (/^(aidge_(insufficientbalance|accountoverdue|freequotaexhausted)|.*_402)$/.test(code)) return 'insufficient_balance';
  if (code === 'quality_rejected') return 'quality_rejected';
  if (/^(invalid_transparent_output|transparent_output_unavailable|png_(file_size|signature|malformed|crc|canvas_size|pixel_format|interlace|compression|no_foreground|no_transparency|transparency_ratio|subject_opacity|subject_geometry|subject_clipped))$/.test(code)) return 'transparent_output_invalid';
  if (code === 'provider_not_configured' || code === 'aidge_not_configured') return 'configuration_missing';
  if (/^(render_failed|render_timeout|matting_failed|request_timeout|attempts_exhausted|dispatch_exhausted|dispatch_unavailable)$/.test(code)) return code;
  return 'processing_failed';
}

export function applyFoodObservations(services: FunctionStatus[], observations: FoodObservation[] | null, now: Date): AdminServiceSnapshot['foodActivity'] {
  const feature = services.find(item => item.id === 'food_visual')!;
  const result: AdminServiceSnapshot['foodActivity'] = { available: observations !== null, windowHours: 24, sampleLimit: 50, sampled: 0, ready: 0, failed: 0, needsDetails: 0 };
  if (observations === null) { if (feature.configuration === 'configured') feature.reason = 'observation_unavailable'; return result; }
  const recent = observations.flatMap(item => {
    const date = typeof item.updated_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(item.updated_at) ? Date.parse(item.updated_at) : NaN;
    return Number.isFinite(date) && date <= now.getTime() && now.getTime() - date <= 86_400_000 && ['ready', 'failed', 'needs_details'].includes(String(item.state)) ? [{ item, date }] : [];
  }).sort((a, b) => b.date - a.date).slice(0, 50);
  result.sampled = recent.length;
  for (const { item } of recent) { if (item.state === 'ready') result.ready++; else if (item.state === 'failed') result.failed++; else result.needsDetails++; }
  if (recent.length && feature.configuration === 'configured') {
    const { item, date } = recent[0];
    feature.observedAt = new Date(date).toISOString();
    if (now.getTime() - date > 3_600_000) feature.reason = 'observation_stale';
    else if (item.state === 'ready') { feature.signal = 'success'; feature.reason = 'recent_success'; }
    else if (item.state === 'failed') { feature.signal = 'error'; feature.reason = 'recent_failure'; feature.errorCode = foodError(item.last_error_code); }
    else feature.reason = 'needs_details';
  }
  return result;
}

const headers = { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
export function createAdminServiceStatusHandler(deps: StatusDependencies) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    let access: Awaited<ReturnType<StatusDependencies['authorize']>>;
    try { access = await deps.authorize(req); } catch { return reply({ error: 'authorization_unavailable' }, 503); }
    if (access !== 'admin') return reply({ error: access === 'member' ? 'administrator_required' : 'authentication_required' }, access === 'member' ? 403 : 401);
    // Deliberately no user-supplied endpoints, keys, model names or probe operation.
    const now = deps.now(); const checkedAt = now.toISOString();
    try {
      const services = configuredServices(deps.environment);
      const [deepseek, observations] = await Promise.all([
        loadDeepSeekBalance(deps.environment, deps.fetch, checkedAt),
        deps.readFoodObservations().catch(() => null),
      ]);
      if (deepseek.state === 'insufficient' || deepseek.state === 'unauthorized') {
        for (const service of services) if (service.configuration === 'configured' && service.credentials.some(item => item.name === 'DEEPSEEK_API_KEY_NAVA' && item.required)) {
          service.signal = 'error'; service.reason = 'provider_unavailable'; service.observedAt = checkedAt;
          service.errorCode = deepseek.state === 'insufficient' ? 'insufficient_balance' : 'permission_denied';
        }
      }
      const foodActivity = applyFoodObservations(services, observations, now);
      const snapshot: AdminServiceSnapshot = { version: 1, checkedAt, deepseek, services, foodActivity };
      return reply(snapshot);
    } catch { return reply({ error: 'status_unavailable' }, 503); }
  };
}
