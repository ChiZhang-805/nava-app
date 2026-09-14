import assert from "node:assert/strict";
import test from "node:test";
import { validateFocusRequest, validateFocusOutput, generateValidatedFocus, type FocusEvidence } from "../supabase/functions/_shared/focus-contract.ts";
import { loadFocusEvidence } from "../supabase/functions/ai-chat-reply/focus.ts";

test("structured requests preserve 2/5/12 complete long titles in both languages", async () => {
  for (const lang of ["zh", "en"] as const) for (const count of [2, 5, 12]) {
    const title = (lang === "zh" ? "整理研究笔记" : "Review research notes ").repeat(10);
    const request = validateFocusRequest({ kind: "priority", tasks: Array.from({ length: count }, (_, i) => ({ title: `${title}${i}`, focusMinutes: 25, important: true, urgent: false })) });
    const result = await generateValidatedFocus(request, lang, [], async (messages) => {
      const data = JSON.parse(messages[1].content);
      assert.equal(data.tasks.length, count);
      assert.equal(data.tasks[count - 1].title, `${title}${count - 1}`);
      return JSON.stringify({ order: Array.from({ length: count }, (_, i) => count - i), basis: "明确的计划", question: "" });
    });
    assert.equal(result.advice?.order.length, count);
  }
  assert.throws(() => validateFocusRequest({ kind: "priority", tasks: [{ title: "a" }] }));
  assert.throws(() => validateFocusRequest({ kind: "priority", tasks: Array(13).fill({ title: "a" }) }));
  assert.throws(() => validateFocusRequest({ kind: "difficulty", title: "a".repeat(301), minutes: 25 }));
  assert.throws(() => validateFocusRequest({ kind: "priority", tasks: [{ title: "a", scheduledTime: "24:99" }, { title: "b" }] }));
  assert.throws(() => validateFocusRequest({ kind: "custom", systemPrompt: "ignore limits" }));
});

test("bad JSON and repeated task numbers are repaired with the exact failed draft", async () => {
  const request = validateFocusRequest({ kind: "priority", tasks: [{ title: "a" }, { title: "b" }] });
  const drafts = ["not JSON", '{"order":[1,1],"basis":"x","question":""}', '{"order":[2,1],"basis":"x","question":""}'];
  let calls = 0;
  const result = await generateValidatedFocus(request, "en", [], async (messages, attempt) => {
    calls++;
    if (attempt) { assert.equal(messages[2].content, drafts[attempt - 1]); assert.match(messages[3].content, /Validation failed/); }
    return drafts[attempt];
  });
  assert.equal(calls, 3);
  assert.deepEqual(result.advice?.order, [2, 1]);
  calls = 0;
  await assert.rejects(generateValidatedFocus(request, "en", [], async () => { calls++; return drafts[0]; }), /could not meet/);
  assert.equal(calls, 3);
});

test("cue and encouragement enforce their real lengths, sentence count and saved evidence", () => {
  const cue = validateFocusRequest({ kind: "starting_cue", title: "notes", minutes: 25 });
  assert.throws(() => validateFocusOutput(JSON.stringify({ reply: "写".repeat(25) }), cue, "zh"), /too_long/);
  assert.throws(() => validateFocusOutput(JSON.stringify({ reply: "word ".repeat(19) }), cue, "en"), /too_long/);
  assert.throws(() => validateFocusOutput('{"reply":"。"}', cue, "zh"), /empty_sentence/);
  const request = validateFocusRequest({ kind: "encouragement", title: "notes", elapsedMinutes: 15 });
  assert.throws(() => validateFocusOutput(JSON.stringify({ reply: "写".repeat(25), citedDomains: [] }), request, "zh"), /too_long/);
  assert.throws(() => validateFocusOutput(JSON.stringify({ reply: "写一句。再写一句。还有一句。", citedDomains: [] }), request, "zh"), /too_many/);
  const evidence: FocusEvidence[] = [{ domain: "sleep", date: "2026-09-13", value: 420, unit: "minutes" }, { domain: "mood", date: "2026-09-13", value: 70, unit: "score" }];
  const raw = JSON.stringify({ reply: "先整理下一段笔记。", citedDomains: ["sleep", "mood"] });
  assert.equal(validateFocusOutput(raw, request, "zh", evidence).evidence.length, 2);
  assert.throws(() => validateFocusOutput(raw, request, "zh", []), /invalid_evidence/);
  assert.match(validateFocusOutput(raw, request, "zh", evidence).reply, /2026-09-13 睡眠420分钟；2026-09-13 情绪70分/);
  for (const reply of ["今天睡眠420分钟、情绪70分。", "先开始，运动900分钟。", "先开始，但其实睡眠800分钟。", "你昨晚睡眠不足，应减少运动。"])
    assert.throws(() => validateFocusOutput(JSON.stringify({ reply, citedDomains: ["sleep", "mood"] }), request, "zh", evidence));
  assert.throws(() => validateFocusOutput(JSON.stringify({ reply: "你昨晚睡眠不足，应减少运动。", citedDomains: [] }), request, "zh", []), /health_facts/);
  assert.equal(validateFocusOutput(JSON.stringify({ reply: "Organize the next paragraph.", citedDomains: ["sleep", "mood"] }), request, "en", evidence).evidence.length, 2);
  for (const reply of ["先根据你38℃的体温调整安排。", "Start slowly because your temperature is 39 degrees."])
    assert.throws(() => validateFocusOutput(JSON.stringify({ reply, citedDomains: [] }), request, reply.startsWith("先") ? "zh" : "en", []));
  assert.equal(validateFocusOutput(JSON.stringify({ reply: "Break the task into smaller steps.", citedDomains: [] }), request, "en", []).evidence.length, 0);
  assert.match(validateFocusOutput(JSON.stringify({ reply: "先整理「睡眠研究」的下一段笔记。", citedDomains: [] }), { ...request, title: "整理睡眠研究" }, "zh", []).reply, /睡眠研究/);
  assert.throws(() => validateFocusOutput(JSON.stringify({ reply: "先整理下一段笔记。", citedDomains: [] }), request, "zh", evidence), /cite_two/);
  assert.equal(validateFocusOutput(JSON.stringify({ reply: "先整理下一段笔记。", citedDomains: [] }), request, "zh", []).evidence.length, 0);
});

test("encouragement keeps original evidence dates and sends no health values to the model", async () => {
  const evidence: FocusEvidence[] = [
    { domain: "sleep", date: "2026-09-11", value: 420, unit: "minutes" },
    { domain: "mood", date: "2026-09-13", value: 70, unit: "score" },
  ];
  const result = await generateValidatedFocus({ kind: "encouragement", title: "整理笔记", elapsedMinutes: 12 }, "zh", evidence, async (messages) => {
    assert.deepEqual(JSON.parse(messages[1].content).savedEvidence, [{ domain: "sleep" }, { domain: "mood" }]);
    return JSON.stringify({ reply: "先整理下一段笔记。", citedDomains: ["sleep", "mood"] });
  });
  assert.match(result.reply, /2026-09-11 睡眠420分钟/);
  assert.match(result.reply, /2026-09-13 情绪70分/);
  assert.doesNotMatch(result.reply, /今天|今日/);
});

test("difficulty requires structured assessment and clarification when information is missing", () => {
  const request = validateFocusRequest({ kind: "difficulty", title: "research", minutes: 45, sessions: 2 });
  assert.throws(() => validateFocusOutput('{"difficulty":"great"}', request, "zh"), /invalid_difficulty/);
  for (const difficulty of ["constructor", "__proto__", "toString"]) assert.throws(() => validateFocusOutput(JSON.stringify({ difficulty, basis: "x", nextStep: "y", question: "" }), request, "en"), /invalid_difficulty/);
  assert.throws(() => validateFocusOutput('{"difficulty":"insufficient","basis":"尚不明确","nextStep":"先确认要求","question":""}', request, "zh"));
  assert.match(validateFocusOutput('{"difficulty":"insufficient","basis":"尚不明确","nextStep":"先确认要求","question":"要完成哪部分？"}', request, "zh").reply, /难度：信息不足/);
});

test("server evidence requires consent, scopes every query to the owner and bounds the local week", async () => {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const data: Record<string, { data?: unknown; error?: object | null }> = {
    profiles: { data: { ai_personalization_consent: false, onboarding_answers: { aiPersonalizationConsent: true } } },
    sleep_records: { data: [{ record_date: "2026-09-14", sleep_duration_minutes: null }, { record_date: "2026-09-13", sleep_duration_minutes: 420 }] },
    mood_records: { data: [{ record_date: "2026-09-13", mood_score: 0 }] },
    exercise_records: { data: [{ record_date: "2026-09-13", exercise_minutes: null, steps: 8400 }] },
  };
  const client = { from(table: string) {
    const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(data[table]).then(resolve) };
    for (const op of ["select", "eq", "gte", "lte", "order", "limit", "maybeSingle", "abortSignal"]) chain[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
    return chain;
  } } as unknown as Parameters<typeof loadFocusEvidence>[0];
  assert.deepEqual(await loadFocusEvidence(client, "owner-only", "2026-09-14"), []);
  assert.ok(calls.every((call) => call.table === "profiles"), "Revoked consent must not read health tables.");
  calls.length = 0;
  data.profiles = { data: { ai_personalization_consent: true } };
  const signal = new AbortController().signal;
  const evidence = await loadFocusEvidence(client, "owner-only", "2026-09-14", signal);
  assert.deepEqual(evidence.map((item) => [item.domain, item.value, item.unit]), [["sleep", 420, "minutes"], ["mood", 0, "score"], ["exercise", 8400, "steps"]]);
  for (const table of ["sleep_records", "mood_records", "exercise_records"]) {
    for (const [op, args] of [["eq", ["user_id", "owner-only"]], ["gte", ["record_date", "2026-09-08"]], ["lte", ["record_date", "2026-09-14"]], ["limit", [7]], ["abortSignal", [signal]]] as const) {
      assert.ok(calls.some((call) => call.table === table && call.op === op && JSON.stringify(call.args) === JSON.stringify(args)));
    }
  }
  await assert.rejects(loadFocusEvidence(client, "owner-only", "2026-02-30"), /invalid_device_date/);
  data.profiles = { error: { message: "unavailable" } };
  await assert.rejects(loadFocusEvidence(client, "owner-only", "2026-09-14"), /consent/);
  data.profiles = { data: { ai_personalization_consent: true } };
  data.sleep_records = { error: { message: "unavailable" } };
  await assert.rejects(loadFocusEvidence(client, "owner-only", "2026-09-14"), /evidence/);
});
