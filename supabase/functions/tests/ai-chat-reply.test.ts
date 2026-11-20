import { describeChatSticker } from "../_shared/chat-stickers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("chat endpoint keeps sticker, consent and complete single-reply contracts", async () => {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const originalEnvGet = Deno.env.get;
  let handler: ((request: Request) => Response | Promise<Response>) | undefined;
  let consent = true;
  let finishReason = "stop";
  let answer = "那就慢一点呀～";
  let currentMessage = "[nava-sticker:rest]";
  let archiveExists = true;
  const archiveId = "00000000-0000-4000-8000-000000000001";
  const messageId = "00000000-0000-4000-8000-000000000002";
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

  Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: (callback: typeof handler) => { handler = callback; } });
  Deno.env.get = (name: string) => ({
    SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_ANON_KEY: "fixture-anon",
    DEEPSEEK_API_KEY_NAVA: "fixture-only-no-network",
  } as Record<string, string>)[name];
  globalThis.fetch = (async (request: string | URL | Request, init?: RequestInit) => {
    const url = String(request instanceof Request ? request.url : request);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, body });
    if (url.endsWith("/auth/v1/user")) return json({ id: "fixture-user", aud: "authenticated", role: "authenticated" });
    if (url.includes("/rpc/nava_consume_ai_quota")) return json(true);
    if (url.includes("/rest/v1/profiles?")) {
      assert(url.includes("id=eq.fixture-user"), "profile lookup escaped the authenticated user");
      return json({ ai_personalization_consent: consent });
    }
    if (url.includes("/rest/v1/ai_conversation_archives?")) {
      const query = new URL(url).searchParams;
      assert(query.get("user_id") === "eq.fixture-user" && query.get("id") === `eq.${archiveId}`, "archive query omitted owner/id checks");
      assert(!init?.method || init.method === "GET", "reply path wrote/moved archived messages");
      assert(query.get("select") === (consent ? "id,messages" : "id"), "revoked consent fetched archive content");
      if (!archiveExists) return json(null);
      return json({ id: archiveId, ...(consent ? { messages: [
        { __navaArchive: { version: 1, dayKey: "2026-11-19", title: "private-title" } },
        { id: "past-user", role: "user", content: "archive-specific-message", created_at: "2026-11-19T10:00:01Z" },
        { id: "past-assistant", role: "assistant", content: "earlier reply", created_at: "2026-11-19T10:00:02Z" },
        { id: messageId, role: "user", content: currentMessage, created_at: "2026-11-20T10:00:01Z" },
        { id: "concurrent", role: "user", content: currentMessage, created_at: "2026-11-20T10:00:02Z" },
      ] } : {}) });
    }
    if (url.includes("/rest/v1/ai_conversations?")) {
      assert(consent, "history was fetched after consent revocation");
      assert(url.includes("user_id=eq.fixture-user"), "history escaped the authenticated user");
      return json([
        { role: "user", content: currentMessage, created_at: "2026-11-20T10:00:03Z" },
        { role: "assistant", content: "先慢慢来。", created_at: "2026-11-20T10:00:02Z" },
        { role: "user", content: "[nava-sticker:hug]", created_at: "2026-11-20T10:00:01Z" },
      ]);
    }
    if (url === "https://api.deepseek.com/chat/completions") {
      if (body.response_format) return json({ choices: [{ message: { content: JSON.stringify({ intent: "question", domains: [], lookbackDays: 7, complexity: "simple" }) }, finish_reason: "stop" }] });
      return json({ choices: [{ message: { content: answer }, finish_reason: finishReason }] });
    }
    throw new Error(`Unexpected network request in local fixture: ${url}`);
  }) as typeof fetch;

  try {
    await import("../ai-chat-reply/index.ts");
    assert(handler, "Edge handler was not registered");
    const run = async (extra: Record<string, unknown> = {}) => {
      requests.length = 0;
      const response = await handler!(new Request("https://fixture.supabase.co/functions/v1/ai-chat-reply", {
        method: "POST", headers: { authorization: "Bearer fixture-token", "content-type": "application/json" },
        body: JSON.stringify({ message: currentMessage, lang: "zh", stream: true, ...extra }),
      }));
      assert(response.status === 200, "SSE did not open");
      const body = await response.text();
      return { body, events: body.split("\n\n").filter((entry) => entry.startsWith("event:")).map((entry) => ({
        name: entry.split("\n")[0].slice(7), data: JSON.parse(entry.split("\n")[1].slice(6)),
      })) };
    };

    const first = await run({ dataType: "sleep", extractedData: { minutes: 420 } });
    assert(first.events.length === 1 && first.events[0].name === "done", "answer was split into synthetic delta events");
    assert(first.events[0].data.reply === answer, "complete answer changed");
    assert(first.events[0].data.provider === "deepseek" && Array.isArray(first.events[0].data.knowledgeTrace), "source metadata was lost");
    const firstModel = requests.find((entry) => entry.url.startsWith("https://api.deepseek.com"))!.body;
    const messages = firstModel.messages as Array<{ role: string; content: string }>;
    assert(requests.filter((entry) => entry.url.startsWith("https://api.deepseek.com")).length === 1, "sticker unnecessarily called the route model");
    assert(messages.at(-1)?.content === describeChatSticker(currentMessage, "zh"), "current sticker lost expressive semantics or retained extracted health data");
    assert(messages.filter((item) => item.content === describeChatSticker(currentMessage, "zh")).length === 1, "current sticker was duplicated in history");
    assert(messages.some((item) => item.content === describeChatSticker("[nava-sticker:hug]", "zh")), "past sticker was not normalized");
    assert(!requests.some((entry) => /sleep_records|health_metric_snapshots/.test(entry.url)), "sticker triggered health retrieval");

    await run({ archiveId, messageId });
    assert(!requests.some((entry) => entry.url.includes("/ai_conversations?")), "archive mode read today's live table");
    const archiveMessages = requests.find((entry) => entry.url.startsWith("https://api.deepseek.com"))!.body.messages as Array<{ role: string; content: string }>;
    assert(archiveMessages.some((item) => item.content === "archive-specific-message"), "selected archive was omitted");
    assert(!JSON.stringify(archiveMessages).includes("private-title"), "archive metadata became prompt text");
    assert(archiveMessages.filter((item) => item.content === describeChatSticker(currentMessage, "zh")).length === 2, "exact current ID dedup removed an unrelated identical turn");

    consent = false;
    await run();
    assert(!requests.some((entry) => entry.url.includes("ai_conversations?")), "revoked history was loaded");
    const deniedMessages = requests.find((entry) => entry.url.startsWith("https://api.deepseek.com"))!.body.messages as Array<{ role: string }>;
    assert(deniedMessages.length === 2, "unauthorized history reached model");
    await run({ archiveId, messageId });
    const consentArchive = requests.find((entry) => entry.url.includes("/ai_conversation_archives?"));
    assert(consentArchive && new URL(consentArchive.url).searchParams.get("select") === "id", "ownership was not checked without history consent");
    const archiveDeniedMessages = requests.find((entry) => entry.url.startsWith("https://api.deepseek.com"))!.body.messages as unknown[];
    assert(archiveDeniedMessages.length === 2, "archive content reached model after revocation");
    for (const allowed of [true, false]) {
      consent = allowed;
      archiveExists = false;
      const missing = await run({ archiveId, messageId });
      assert(missing.events.length === 1 && missing.events[0].name === "error", "missing/foreign archive was accepted");
      assert(!requests.some((entry) => entry.url.includes("/ai_conversations?") || entry.url.startsWith("https://api.deepseek.com")), "missing archive fell back to another conversation");
    }
    archiveExists = true;

    currentMessage = "[nava-sticker:unknown]";
    await run();
    const unknownModel = requests.filter((entry) => entry.url.startsWith("https://api.deepseek.com")).at(-1)!.body;
    assert((unknownModel.messages as Array<{ content: string }>).at(-1)?.content === currentMessage, "unknown marker was interpreted");

    for (const failure of [{ text: "", reason: "stop" }, { text: "not complete.", reason: "length" }]) {
      currentMessage = "[nava-sticker:hello]";
      answer = failure.text;
      finishReason = failure.reason;
      const result = await run();
      assert(result.events.length === 1 && result.events[0].name === "error", "empty or incomplete answer was reported as success");
    }
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.get = originalEnvGet;
    Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: originalServe });
  }
});
