import { applyFoodObservations, configuredServices, createAdminServiceStatusHandler, loadDeepSeekBalance, parseDeepSeekBalance, type StatusDependencies } from '../_shared/admin-service-status.ts';
import type { AdminServiceSnapshot } from '../_shared/admin-service-contract.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const now = new Date('2026-11-20T12:00:00Z');
const checkedAt = now.toISOString();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const goodBalance = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '0.01000001', granted_balance: '0', topped_up_balance: '0.01000001' }] };
const canonical = 'https://wxteapvwagvhhtrjrbim.supabase.co';

Deno.test('admin service status: authorization, isolated configuration and safe observation contract', async t => {
  let access: 'admin' | 'member' | 'unauthenticated' = 'admin';
  let env: Record<string, string | undefined> = { DEEPSEEK_API_KEY_NAVA: 'test-secret-never-output', SUPABASE_URL: canonical, DASHSCOPE_API_KEY: 'legacy-never-output' };
  let reads = 0, providerCalls = 0, observationCalls = 0;
  let providerResponse = () => json(goodBalance);
  let observations: Awaited<ReturnType<StatusDependencies['readFoodObservations']>> = [];
  const request = (async (input: Request | URL | string, init?: RequestInit) => {
    providerCalls++;
    assert(String(input) === 'https://api.deepseek.com/user/balance', 'unexpected/paid endpoint');
    assert(init?.method === 'GET' && init.redirect === 'error', 'balance must be read-only without redirects');
    assert(new Headers(init.headers).get('Authorization') === 'Bearer test-secret-never-output', 'wrong project credential');
    return providerResponse();
  }) as typeof fetch;
  const dependencies: StatusDependencies = {
    authorize: async () => access,
    environment: name => { reads++; return env[name]; },
    readFoodObservations: async () => { observationCalls++; return observations; },
    fetch: request, now: () => now,
  };
  const handler = createAdminServiceStatusHandler(dependencies);
  const invoke = () => handler(new Request('https://nava.invalid/admin-service-status', { method: 'POST', body: JSON.stringify({ endpoint: 'https://attacker.invalid', model: 'paid-probe' }) }));
  await t.step('unauthenticated and non-admin callers cannot inspect env, DB or provider', async () => {
    for (const denied of ['unauthenticated', 'member'] as const) {
      access = denied; reads = providerCalls = observationCalls = 0;
      const response = await invoke();
      assert(response.status === (denied === 'member' ? 403 : 401), 'incorrect denial status');
      assert(reads === 0 && providerCalls === 0 && observationCalls === 0, 'denied user crossed authorization boundary');
    }
    access = 'admin';
  });
  await t.step('authorization outages stay closed and hide raw errors', async () => {
    const closed = createAdminServiceStatusHandler({ ...dependencies, authorize: async () => { throw Error('private DB and secret'); } });
    const response = await closed(new Request('https://nava.invalid', { method: 'POST' }));
    assert(response.status === 503 && await response.text() === '{"error":"authorization_unavailable"}', 'auth failure leaked');
  });
  await t.step('preflight and unsupported methods never inspect service data', async () => {
    reads = providerCalls = observationCalls = 0;
    assert((await handler(new Request('https://nava.invalid', { method: 'OPTIONS' }))).status === 200, 'preflight');
    assert((await handler(new Request('https://nava.invalid'))).status === 405, 'method guard');
    assert(!reads && !providerCalls && !observationCalls, 'method guard touched secrets');
  });
  await t.step('only NAVA DeepSeek key is selected; generic and other project keys are ignored', async () => {
    const unavailable = await loadDeepSeekBalance(name => ({ DEEPSEEK_API_KEY: 'forbidden', DEEPSEEK_API_KEY_MyLaptop: 'forbidden' } as Record<string, string>)[name], request, checkedAt);
    assert(unavailable.state === 'unconfigured', 'cross-project key fallback');
  });
  await t.step('canonical food legacy config never enables unrelated vision routes', () => {
    let services = configuredServices(name => env[name]);
    assert(services.find(item => item.id === 'food_visual')?.configuration === 'configured', 'canonical legacy food configuration');
    for (const id of ['chat_images', 'record_food_image', 'record_face_image', 'diet_photo', 'face_photo']) assert(services.find(item => item.id === id)?.configuration === 'missing', `${id} used food legacy authorization`);
    services = configuredServices(name => name === 'SUPABASE_URL' ? 'https://other.supabase.co' : env[name]);
    assert(services.find(item => item.id === 'food_visual')?.configuration === 'missing', 'legacy outside canonical');
  });
  await t.step('custom entry-point URL precedence and optional provider keys are represented', () => {
    const custom = { ...env, NAVA_AI_CHAT_URL: 'https://private-provider.invalid', NAVA_DIET_EXTRACT_URL: 'https://private-provider.invalid', NAVA_FACE_ANALYZE_URL: 'http://invalid.test', NAVA_DIET_VISION_KEY: '', DASHSCOPE_API_KEY_NAVA: 'not-selected-over-empty' };
    const services = configuredServices(name => custom[name as keyof typeof custom]);
    assert(services.find(item => item.id === 'chat_text')?.credentials[0].name === 'NAVA_AI_CHAT_URL', 'custom chat precedence');
    assert(services.find(item => item.id === 'diet_photo')?.configuration === 'configured', 'optional custom provider key is not required');
    assert(services.find(item => item.id === 'record_food_image')?.configuration === 'missing', 'nullish key precedence changed');
    assert(services.find(item => item.id === 'face_photo')?.configuration === 'invalid', 'invalid HTTPS configuration');
  });
  await t.step('partial dedicated Aidge credentials do not silently use legacy credentials', () => {
    const values = { ...env, AIDGE_ACCESS_KEY_ID_NAVA: 'dedicated', ALIYUN_ACCESS_KEY_ID: 'legacy', ALIYUN_ACCESS_KEY_SECRET: 'legacy' };
    const feature = configuredServices(name => values[name as keyof typeof values]).find(item => item.id === 'food_matting');
    assert(feature?.configuration === 'missing' && feature.credentials.every(item => item.name.startsWith('AIDGE_')), 'partial dedicated matting fallback');
  });
  await t.step('exact decimals and true zero are preserved; missing/malformed balances remain unknown', () => {
    assert(parseDeepSeekBalance(goodBalance, checkedAt).balances[0].total === '0.01000001', 'decimal rounded');
    const zero = { is_available: false, balance_infos: [{ currency: 'CNY', total_balance: '0.00', granted_balance: '0.00', topped_up_balance: '0.00' }] };
    assert(parseDeepSeekBalance(zero, checkedAt).state === 'insufficient' && parseDeepSeekBalance(zero, checkedAt).balances[0].total === '0.00', 'zero became unavailable');
    for (const invalid of [{}, { is_available: true }, { ...goodBalance, is_available: 'true' }, { ...goodBalance, balance_infos: [] }, { ...goodBalance, balance_infos: [{ ...goodBalance.balance_infos[0], total_balance: 1 }] }, { ...goodBalance, balance_infos: [{ ...goodBalance.balance_infos[0], currency: 'SECRET' }] }]) assert(parseDeepSeekBalance(invalid, checkedAt).state === 'unknown', 'malformed balance became success');
  });
  await t.step('401/403/402/429/5xx are fixed states and provider bodies never leak', async () => {
    for (const [status, expected] of [[401, 'unauthorized'], [403, 'unauthorized'], [402, 'insufficient'], [429, 'rate_limited'], [500, 'unavailable'], [503, 'unavailable'], [400, 'unknown']] as const) {
      providerResponse = () => json({ error: 'private secret provider payload' }, status);
      const result = await loadDeepSeekBalance(name => env[name], request, checkedAt);
      assert(result.state === expected && !JSON.stringify(result).includes('private'), `provider status ${status}`);
    }
    providerResponse = () => json(goodBalance);
  });
  await t.step('oversized/malformed/network responses cannot pass as available', async () => {
    for (const response of [() => new Response('x'.repeat(20_000)), () => new Response('{'), () => { throw new Error('secret request URL'); }]) {
      providerResponse = response;
      const result = await loadDeepSeekBalance(name => env[name], request, checkedAt);
      assert(['unknown', 'unavailable'].includes(result.state) && result.balances.length === 0, 'bad response passed');
    }
    providerResponse = () => json(goodBalance);
  });
  await t.step('healthy balance does not turn unobserved features green; no sensitive fields escape', async () => {
    observations = [{ state: 'failed', last_error_code: 'aidge_nopermission', updated_at: '2026-11-20T11:59:00Z', ...{ user_id: 'private-user', input: { photo: 'private-photo' }, asset_path: 'private-path' } }];
    const response = await invoke(); const text = await response.text(); const data: AdminServiceSnapshot = JSON.parse(text);
    assert(response.headers.get('Cache-Control') === 'no-store', 'sensitive admin response cached');
    for (const secret of ['never-output', 'private-user', 'private-photo', 'private-path', 'attacker.invalid', 'paid-probe']) assert(!text.includes(secret), `leaked ${secret}`);
    assert(data.deepseek.state === 'available' && data.services.find(item => item.id === 'chat_text')?.signal === 'unknown', 'balance misrepresented as feature verification');
    assert(data.services.find(item => item.id === 'food_visual')?.errorCode === 'permission_denied', 'food permission error not categorized');
  });
  await t.step('known account rejection marks only features using that exact provider key red', async () => {
    providerResponse = () => json({ error: 'private provider message' }, 401);
    const response = await invoke(); const data: AdminServiceSnapshot = await response.json();
    assert(data.services.find(item => item.id === 'chat_text')?.reason === 'provider_unavailable', 'known blocked provider remained unverified');
    assert(data.services.find(item => item.id === 'food_visual')?.reason !== 'provider_unavailable', 'different provider was blocked');
    providerResponse = () => json(goodBalance);
  });
  await t.step('recent successful food result is green; stale/missing/input errors are grey', () => {
    for (const [state, time, expected] of [['ready', '2026-11-20T11:58:00Z', 'success'], ['ready', '2026-11-20T09:00:00Z', 'unknown'], ['needs_details', '2026-11-20T11:59:00Z', 'unknown']] as const) {
      const services = configuredServices(name => env[name]);
      applyFoodObservations(services, [{ state, updated_at: time }], now);
      assert(services.find(item => item.id === 'food_visual')?.signal === expected, `${state}/${time}`);
    }
    const services = configuredServices(name => env[name]);
    applyFoodObservations(services, [{ state: 'failed', updated_at: '2026-11-20T11:59:00Z', last_error_code: 'secret_private_user_123' }], now);
    assert(services.find(item => item.id === 'food_visual')?.errorCode === 'processing_failed', 'stored arbitrary error leaked');
  });
  await t.step('future/old/nonterminal dates are excluded and aggregate is capped at 50', () => {
    const services = configuredServices(name => env[name]);
    const rows = Array.from({ length: 70 }, () => ({ state: 'ready', updated_at: '2026-11-20T11:58:00Z' }));
    rows.push({ state: 'ready', updated_at: '2026-11-21T11:58:00Z' }, { state: 'processing', updated_at: checkedAt }, { state: 'ready', updated_at: 'bad-date' });
    const activity = applyFoodObservations(services, rows, now);
    assert(activity.sampled === 50 && activity.ready === 50, 'unbounded/private telemetry');
    const empty = applyFoodObservations(services, null, now);
    assert(!empty.available && empty.sampled === 0, 'DB outage is not zero healthy activity');
  });
  await t.step('all normalized PNG rejection codes map to a fixed safe category, never a raw diagnostic', () => {
    for (const suffix of ['file_size','signature','malformed','crc','canvas_size','pixel_format','interlace','compression','no_foreground','no_transparency','transparency_ratio','subject_opacity','subject_geometry','subject_clipped','unexpected_private_value']) {
      const services = configuredServices(name => env[name]);
      applyFoodObservations(services, [{ state: 'failed', updated_at: '2026-11-20T11:59:00Z', last_error_code: `png_${suffix}` }], now);
      assert(services.find(item => item.id === 'food_visual')?.errorCode === (suffix === 'unexpected_private_value' ? 'processing_failed' : 'transparent_output_invalid'), 'PNG category/allowlist differs');
    }
  });
  await t.step('DB outage is isolated from the independent balance query', async () => {
    const isolated = createAdminServiceStatusHandler({ ...dependencies, readFoodObservations: async () => { throw Error('private SQL'); } });
    const response = await isolated(new Request('https://nava.invalid', { method: 'POST' }));
    const data: AdminServiceSnapshot = await response.json();
    assert(data.deepseek.state === 'available' && !data.foodActivity.available && data.services.find(item => item.id === 'food_visual')?.reason === 'observation_unavailable', 'partial query error not isolated');
  });
  env = {};
});
