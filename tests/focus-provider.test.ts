import assert from "node:assert/strict";
import test from "node:test";
import { createFocusRun } from "../supabase/functions/ai-chat-reply/focus-provider.ts";
import { generateValidatedFocus } from "../supabase/functions/_shared/focus-contract.ts";

const envelope = (content = '{"reply":"Open notes."}', finish_reason = "stop") => Response.json({ choices: [{ message: { content }, finish_reason }] });
const forever = () => new Promise<never>(() => {});
const stalledBody = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("\n\n")); } }));
const fakeFetch = (fn: () => Promise<Response>) => fn as typeof fetch;

test("deadline bounds evidence, provider headers and body even if an adapter ignores abort", async () => {
  for (const stage of ["evidence", "provider_headers", "provider_body"]) {
    const run = createFocusRun("starting_cue", "en", new AbortController().signal, {
      timeoutMs: 30, fetch: fakeFetch(stage === "provider_headers" ? forever : async () => stalledBody()),
    });
    try {
      await assert.rejects(stage === "evidence" ? run.bounded(forever) : run.complete("secret", {}), { name: "FocusTimeoutError" });
      assert.equal(run.signal.aborted, true);
      assert.equal(run.diagnostics().outcome, "deadline");
      assert.equal(run.diagnostics().phase, stage);
      await assert.rejects(run.complete("secret", {}), { name: "FocusTimeoutError" });
      assert.equal(run.diagnostics().calls, stage === "evidence" ? 0 : 1);
    } finally { run.dispose(); }
  }
});

test("caller cancellation is separate from timeout and stops dispatch/body/backoff", async () => {
  for (const stage of ["before", "headers", "body", "backoff"]) {
    const caller = new AbortController();
    if (stage === "before") caller.abort();
    const run = createFocusRun("priority", "zh", caller.signal, { timeoutMs: 2_000, retryDelayMs: 100,
      fetch: fakeFetch(stage === "body" ? async () => stalledBody()
        : stage === "backoff" ? async () => new Response(null, { status: 503 }) : forever) });
    const timer = setTimeout(() => caller.abort(), 20);
    try {
      await assert.rejects(run.complete("secret", {}), { name: "AbortError" });
      assert.equal(run.diagnostics().outcome, "cancelled");
      assert.equal(run.diagnostics().calls, stage === "before" ? 0 : 1);
      if (stage === "backoff") assert.equal(run.diagnostics().phase, "retry_wait");
    } finally { clearTimeout(timer); run.dispose(); }
  }
});

test("primary keep-alive stall cancels before a single alternate, with truthful model provenance", async () => {
  const models: string[] = [];
  const signals: AbortSignal[] = [];
  const run = createFocusRun("starting_cue", "en", new AbortController().signal, { timeoutMs: 2_000, primaryTimeoutMs: 20, primaryModel: "deepseek-v4-flash",
    fetch: (async (_url, init) => {
      signals.push(init!.signal!);
      models.push(JSON.parse(String(init!.body)).model);
      if (models.length === 1) return stalledBody();
      assert.equal(signals[0].aborted, true);
      return envelope();
    }) as typeof fetch });
  try {
    assert.equal(await run.complete("secret", {}), '{"reply":"Open notes."}');
    assert.deepEqual(models, ["deepseek-v4-flash", "deepseek-v4-pro"]);
    assert.equal(run.model(), "deepseek-v4-pro");
    assert.deepEqual(run.diagnostics().transfers[0], { model: "deepseek-v4-flash", bytes: 2, nonWhitespace: false });
    assert.equal(run.diagnostics().transfers[1].nonWhitespace, true);
    assert.equal(await run.complete("secret", {}), '{"reply":"Open notes."}');
    assert.equal(models[2], "deepseek-v4-pro", "Repairs remain on the alternate; no oscillation.");
  } finally { run.dispose(); }
});

test("one global transport retry is bounded and never reflects provider error text", async () => {
  for (const first of ["network", 429, 502, 503, 504, 400, 401, 402]) {
    let calls = 0;
    const run = createFocusRun("starting_cue", "en", new AbortController().signal, { retryDelayMs: 1,
      fetch: fakeFetch(async () => {
        if (++calls > 1) return envelope();
        if (first === "network") throw new TypeError("private input / key");
        return new Response("private input / key", { status: first });
      }) });
    try {
      if (typeof first === "number" && first < 429) await assert.rejects(run.complete("secret", { private: "private task" }), (error: Error) => !/private|secret/.test(error.message));
      else assert.equal(await run.complete("secret", {}), '{"reply":"Open notes."}');
      assert.equal(calls, typeof first === "number" && first < 429 ? 1 : 2);
      assert.doesNotMatch(JSON.stringify(run.diagnostics()), /private|secret|Open notes/);
    } finally { run.dispose(); }
  }
});

test("format repairs and transport share one deadline and at most four total HTTP calls", async () => {
  let calls = 0;
  const run = createFocusRun("starting_cue", "en", new AbortController().signal, { retryDelayMs: 1,
    fetch: fakeFetch(async () => ++calls === 1 ? new Response(null, { status: 503 }) : envelope(calls === 4 ? '{"reply":"Open notes."}' : "invalid")) });
  try {
    const result = await generateValidatedFocus({ kind: "starting_cue", title: "private task", minutes: 25 }, "en", [], () => run.complete("secret", {}));
    assert.equal(result.reply, "Open notes.");
    assert.equal(calls, 4);
    await assert.rejects(run.complete("secret", {}), /retry limit/);
    assert.equal(calls, 4);
  } finally { run.dispose(); }
  let repairCalls = 0;
  const stalled = createFocusRun("starting_cue", "en", new AbortController().signal, { timeoutMs: 30,
    fetch: fakeFetch(async () => ++repairCalls === 1 ? envelope("invalid") : forever()) });
  try {
    await assert.rejects(generateValidatedFocus({ kind: "starting_cue", title: "a", minutes: 25 }, "en", [], () => stalled.complete("secret", {})), { name: "FocusTimeoutError" });
    assert.equal(repairCalls, 2);
  } finally { stalled.dispose(); }
});

test("insufficient retry budget, invalid envelopes and truncated model output fail safely", async () => {
  for (const [response, expected] of [[new Response(null, { status: 503 }), "error"], [new Response("not json"), "error"], [Response.json({}), ""], [envelope(undefined, "length"), ""]] as const) {
    const run = createFocusRun("starting_cue", "en", new AbortController().signal, { timeoutMs: 900, fetch: fakeFetch(async () => response) });
    try {
      if (expected === "error") await assert.rejects(run.complete("secret", {}));
      else assert.equal(await run.complete("secret", {}), expected);
      assert.equal(run.diagnostics().calls, 1);
      assert.equal(run.diagnostics().retryUsed, false);
    } finally { run.dispose(); }
  }
});

test("primary budget exhaustion is localized and never leaks an internal timeout", async () => {
  const run = createFocusRun("priority", "zh", new AbortController().signal, { timeoutMs: 900, primaryTimeoutMs: 20, fetch: fakeFetch(async () => stalledBody()) });
  try {
    await assert.rejects(run.complete("secret", {}), (error: Error) => error.name === "FocusTimeoutError" && /AI 响应超时/.test(error.message));
    assert.equal(run.diagnostics().outcome, "deadline");
    assert.equal(run.diagnostics().calls, 1);
  } finally { run.dispose(); }
});

test("alternate cancellation and exhausted total deadline never switch back", async () => {
  for (const cancelled of [true, false]) {
    const caller = new AbortController();
    let calls = 0;
    const run = createFocusRun("priority", "en", caller.signal, { timeoutMs: 1_100, primaryTimeoutMs: 20,
      fetch: fakeFetch(async () => { if (++calls === 2 && cancelled) caller.abort(); return stalledBody(); }) });
    try {
      await assert.rejects(run.complete("secret", {}), { name: cancelled ? "AbortError" : "FocusTimeoutError" });
      assert.equal(calls, 2);
      assert.equal(run.diagnostics().switched, true);
    } finally { run.dispose(); }
  }
});

test("primary budget is fixed across format attempts, not reset for every repair", async () => {
  let calls = 0;
  const started = Date.now();
  const run = createFocusRun("starting_cue", "en", new AbortController().signal, { timeoutMs: 2_000, primaryTimeoutMs: 80,
    fetch: fakeFetch(async () => {
      calls++;
      if (calls === 1) { await new Promise(resolve => setTimeout(resolve, 45)); return envelope("invalid"); }
      return calls === 2 ? stalledBody() : envelope();
    }) });
  try {
    await generateValidatedFocus({ kind: "starting_cue", title: "a", minutes: 25 }, "en", [], () => run.complete("secret", {}));
    assert.equal(calls, 3);
    assert.ok(Date.now() - started < 120, "The repair must use only the remaining primary budget.");
  } finally { run.dispose(); }
});

test("bounded reader preserves split UTF-8 and rejects oversized bodies without exposing them", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"reply":"先打开笔记。"}' } }] }));
  const run = createFocusRun("starting_cue", "zh", new AbortController().signal, { fetch: fakeFetch(async () => new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }))) });
  try { assert.equal(await run.complete("secret", {}), '{"reply":"先打开笔记。"}'); }
  finally { run.dispose(); }
  const huge = createFocusRun("priority", "en", new AbortController().signal, { fetch: fakeFetch(async () => new Response("private task".repeat(7_000))) });
  try {
    await assert.rejects(huge.complete("secret", {}), /invalid response/);
    assert.doesNotMatch(JSON.stringify(huge.diagnostics()), /private task|secret/);
    assert.equal(huge.diagnostics().calls, 1);
  } finally { huge.dispose(); }
});
