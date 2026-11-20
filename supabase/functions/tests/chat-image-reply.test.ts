function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

Deno.test("chat vision is authenticated, consent-gated, per-image and separate from food extraction", async () => {
  const previous = { fetch: globalThis.fetch, serve: Deno.serve, env: Deno.env.get };
  let handler: (request: Request) => Promise<Response>;
  let authenticated = true, consent = true, visionConfigured = true, finishReason = "stop";
  const images = [
    { id: "food", kinds: ["food"], summary: "可见一盘饭", observations: ["份量不能精确测量"], uncertainties: [], confidence: .9 },
    { id: "gym", kinds: ["fitness"], summary: "可见健身器材", observations: ["不能确定用户是否运动"], uncertainties: [], confidence: .95 },
    { id: "selfie", kinds: ["face"], summary: "可见人脸", observations: ["光线偏暗"], uncertainties: ["不能判断情绪或健康"], confidence: .8 },
    { id: "cat", kinds: ["generic"], summary: "一只猫", observations: ["动物照片"], uncertainties: [], confidence: .95 },
  ];
  let output: unknown = images;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: (fn: typeof handler) => { handler = fn; } });
  Deno.env.get = name => ({ SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'fixture-anon',
    DASHSCOPE_API_KEY_NAVA: visionConfigured ? 'fixture-nava-vision' : undefined, DASHSCOPE_API_KEY: 'forbidden-generic',
    DEEPSEEK_API_KEY_NAVA: 'fixture-nava-text' } as Record<string,string|undefined>)[name];
  globalThis.fetch = (async (request: string | URL | Request, init?: RequestInit) => {
    const url = String(request instanceof Request ? request.url : request), body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, body });
    if (url.endsWith('/auth/v1/user')) return authenticated ? json({ id: 'fixture-user', aud: 'authenticated', role: 'authenticated' }) : json({ message: 'denied' }, 401);
    if (url.includes('/rpc/nava_consume_ai_quota')) return json(true);
    if (url.includes('/rest/v1/profiles?')) { assert(url.includes('id=eq.fixture-user'), 'consent escaped owner'); return json({ ai_personalization_consent: consent }); }
    if (url.includes('/rest/v1/ai_conversations?')) return json([]);
    if (url.startsWith('https://dashscope.aliyuncs.com/')) {
      assert(new Headers(init?.headers).get('authorization') === 'Bearer fixture-nava-vision', 'used generic key');
      return json({ model: 'qwen3-vl-plus', choices: [{ finish_reason: finishReason, message: { content: JSON.stringify({ images: output }) } }] });
    }
    if (url.startsWith('https://api.deepseek.com/')) return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ segments: [{ type: 'text', text: '图片中是猫咪，未保存记录。' }] }) } }] });
    throw new Error(`Unexpected data access: ${url}`);
  }) as typeof fetch;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO1kAAAAASUVORK5CYII=';
  try {
    await import('../ai-chat-reply/index.ts');
    const run = async (extra: Record<string, unknown> = {}) => {
      requests.length = 0;
      const response = await handler!(new Request('https://fixture/functions/v1/ai-chat-reply', { method: 'POST',
        headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
        body: JSON.stringify({ purpose: 'chat-images', message: '看看这些图片，不是都在记录午餐', lang: 'zh', images: images.map(item => ({ id: item.id, dataUrl: png })), ...extra }) }));
      return { status: response.status, data: await response.json() };
    };
    const result = await run();
    assert(result.status === 200 && result.data.images.length === 4 && result.data.canAutoSave === false, 'mixed images did not remain separate');
    const visual = requests.find(item => item.url.startsWith('https://dashscope'))!;
    assert(visual.body.model === 'qwen3-vl-plus', 'configured model omitted');
    const content = (visual.body.messages as Array<{ content: unknown }>)[1].content;
    assert(JSON.stringify(content).includes('不是都在记录午餐'), 'typed user text was dropped');
    assert(!requests.some(item => /diet-extract|face-analyze|storage|ai_conversations|nutrition_records/.test(item.url)), 'general image analysis saved or meal-routed content');
    const final = await run({ purpose: 'chat', images: undefined, message: '谢谢', imageAnalysis: result.data });
    assert(final.status === 200, 'validated image observations could not enter final chat');
    const finalPrompt = JSON.stringify(requests.find(item => item.url.startsWith('https://api.deepseek'))!.body.messages);
    assert(finalPrompt.includes('image_observations') && finalPrompt.includes('一只猫') && !finalPrompt.includes('base64'), 'text reply lost observations or received raw pixels');
    for (const mode of ['consent', 'auth', 'key']) {
      consent = mode !== 'consent'; authenticated = mode !== 'auth'; visionConfigured = mode !== 'key';
      assert((await run()).status === 400, `missing ${mode} succeeded`);
      assert(!requests.some(item => item.url.startsWith('https://dashscope')), `missing ${mode} forwarded pixels`);
    }
    consent = authenticated = visionConfigured = true;
    for (const invalid of [[], [{ id: 'bad', dataUrl: 'https://example.com/image.png' }]]) {
      assert((await run({ images: invalid })).status === 400, 'unsupported input succeeded');
      assert(!requests.some(item => item.url.startsWith('https://dashscope')), 'invalid input reached provider');
    }
    output = images.slice(1); assert((await run()).status === 400, 'missing image result accepted');
    output = [{ ...images[0], kinds: ['medical-diagnosis'] }, ...images.slice(1)]; assert((await run()).status === 400, 'unsupported classification accepted');
    output = images; finishReason = 'length'; assert((await run()).status === 400, 'incomplete model result accepted');
  } finally {
    globalThis.fetch = previous.fetch; Deno.env.get = previous.env;
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: previous.serve });
  }
});
