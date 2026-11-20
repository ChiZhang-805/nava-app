function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

Deno.test('real admin Edge entry point authenticates before data/provider access and selects only aggregate-safe columns', async () => {
  const original = { fetch: globalThis.fetch, serve: Deno.serve, env: Deno.env.get };
  let handler: (request: Request) => Promise<Response>;
  let authenticated = true, admin = false;
  const calls: string[] = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const values: Record<string, string> = { SUPABASE_URL: 'https://admin-fixture.supabase.co', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-private', DEEPSEEK_API_KEY_NAVA: 'fixture-deepseek-private', DASHSCOPE_API_KEY_NAVA: 'fixture-dashscope-private' };
  Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (fn: typeof handler) => { handler = fn; } });
  Deno.env.get = name => values[name];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input)); calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return authenticated ? json({ id: 'fixture-admin', aud: 'authenticated', role: 'authenticated' }) : json({ message: 'expired' }, 401);
    if (url.pathname === '/rest/v1/rpc/nava_is_admin') return json(admin);
    if (url.pathname === '/rest/v1/food_render_jobs') {
      assert(admin && authenticated, 'data queried before verified admin');
      assert((init?.method ?? 'GET') === 'GET', 'status endpoint wrote data');
      assert(url.searchParams.get('select') === 'state,last_error_code,updated_at', 'private source columns requested');
      assert(url.searchParams.get('limit') === '50' && url.searchParams.has('updated_at'), 'unbounded observation query');
      return json([{ state: 'ready', last_error_code: null, updated_at: new Date(Date.now() - 60_000).toISOString() }]);
    }
    if (url.toString() === 'https://api.deepseek.com/user/balance') {
      assert(admin && authenticated, 'provider queried before verified admin');
      return json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '1.50', granted_balance: '0.00', topped_up_balance: '1.50' }] });
    }
    throw Error('Unexpected external request');
  }) as typeof fetch;
  try {
    await import('../admin-service-status/index.ts');
    const invoke = () => handler!(new Request('https://fixture/admin-service-status', { method: 'POST', headers: { Authorization: 'Bearer fixture-jwt' } }));
    let response = await invoke();
    assert(response.status === 403 && calls.length === 2 && calls[1].endsWith('nava_is_admin'), 'member crossed admin check');
    calls.length = 0; authenticated = false;
    response = await invoke();
    assert(response.status === 401 && calls.length === 1 && calls[0] === '/auth/v1/user', 'invalid token reached RPC/provider');
    calls.length = 0; authenticated = true; admin = true;
    response = await invoke(); const body = await response.text();
    assert(response.status === 200 && body.includes('recent_success'), 'admin read failed');
    for (const secret of [...Object.values(values), 'fixture-admin', 'fixture-jwt']) assert(!body.includes(secret), 'private context escaped response');
    assert(calls[0] === '/auth/v1/user' && calls[1].endsWith('nava_is_admin'), 'provider/data preceded admin authorization');
  } finally { globalThis.fetch = original.fetch; Deno.serve = original.serve; Deno.env.get = original.env; }
});
