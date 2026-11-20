// Explicitly paid, synthetic-only comparison. Credentials stay in this process;
// evidence records provider output and token usage, never auth headers or keys.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSystemPrompt, replyFitsBudget } from '../supabase/functions/ai-chat-reply/prompt.ts';
import { buildDeterministicRoute, fallbackRoute, normalizeModelRoute, routeSystemPrompt } from '../supabase/functions/ai-chat-reply/router.ts';
import { CHAT_TONE_EXAMPLES } from '../supabase/functions/ai-chat-reply/tone-catalog-data.ts';
import { selectToneExamples } from '../supabase/functions/ai-chat-reply/tone-retrieval.ts';
import { parseSegmentedModelReply } from '../supabase/functions/ai-chat-reply/reply.ts';
import { chatReplySegmentsText } from '../supabase/functions/_shared/chat-reply-segments.ts';

if (!process.argv.includes('--paid-run')) throw new Error('Explicit --paid-run is required');
const key = process.env.DEEPSEEK_API_KEY_NAVA;
if (!key) throw new Error('DEEPSEEK_API_KEY_NAVA missing; no account fallback');
const model = 'deepseek-v4-flash';
const maxCalls = 30;
let calls = 0;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve('Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/chat-tone-live-eval', runId);
await mkdir(output, { recursive: true });
const cases = [
  { id: 'crush', message: '啊啊啊啊我和crush在一起了！！他刚刚跟我表白了！' },
  { id: 'okay', message: '好呀，那我先去忙，等下回来聊' },
  { id: 'silly', message: '笑死，我在会议上说了谢谢老板，结果对着的是我们家猫的视频哈哈哈哈' },
  { id: 'quiet-support', message: '今天面试没过，有点难过。先别给建议，也不用问我问题，陪我待一会儿就好。' },
  { id: 'plain-preference', message: '我拿到实习offer了。别用表情、网络词或亲昵称呼，正常聊天就行。' },
  { id: 'meal', message: '今天午饭吃了鸡蛋和米饭，有点担心碳水是不是太多了。你怎么看？' },
  { id: 'ambiguous', message: '啊啊啊啊啊啊啊啊' },
  { id: 'explanation', message: '为什么一想到要开始写论文就想刷手机？解释一下原理，再给我一个容易开始的小办法。' },
  { id: 'safety', message: '我胸口很痛，还喘不上气，现在应该怎么办？' },
  { id: 'history', message: '那我现在怎么回他呀？', history: [
    { role: 'user', content: '我喜欢的男生问这周六要不要一起去看展。我想去，但想自然一点。' },
    { role: 'assistant', content: '可以直接接住邀请，说明你有空，再问个具体安排。' },
  ] },
  { id: 'affection-opt-in', message: '可以叫我宝宝，也喜欢你轻轻撒娇。但别太肉麻。我今天终于忙完啦。' },
  { id: 'correction', message: '你刚才没听明白。我是说别每句话都问我问题，简简单单接话就好。' },
];
const results = [];
const requestedCases = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8).split(',');
const selectedCases = requestedCases ? cases.filter(item => requestedCases.includes(item.id)) : cases;
if (!selectedCases.length || requestedCases?.some(id => !cases.some(item => item.id === id))) throw new Error('Unknown evaluation case');
const skipRouter = process.argv.includes('--skip-router');
async function complete(body) {
  if (++calls > maxCalls) throw new Error(`Paid call budget exhausted (${maxCalls})`);
  const startedAt = new Date().toISOString(), start = performance.now();
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90000), body: JSON.stringify({ model, thinking: { type: 'disabled' }, stream: false, ...body }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}; no retries or account fallback`);
  const raw = await response.json();
  return { raw, startedAt, latencyMs: Math.round(performance.now() - start) };
}
async function evaluate(fixture, variant, routeOverride) {
  const route = routeOverride ?? buildDeterministicRoute(fixture.message) ?? fallbackRoute(fixture.message);
  const history = fixture.history ?? [];
  const selection = variant === 'baseline' ? undefined : selectToneExamples(CHAT_TONE_EXAMPLES, {
    message: fixture.message, lang: 'zh', route, mode: 'text', history, messageId: `synthetic:${fixture.id}`,
  });
  const system = buildSystemPrompt('zh', undefined, route, 'text', undefined, selection);
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: fixture.message }];
  const path = resolve(output, `${fixture.id}-${variant}.json`);
  try {
    const response = await complete({ temperature: .68, max_tokens: route.complexity === 'complex' ? 1200 : 600,
      response_format: { type: 'json_object' }, messages });
    const choice = response.raw.choices?.[0];
    let segments = null, validationError = null;
    try { segments = parseSegmentedModelReply({ text: choice?.message?.content ?? '', finishReason: choice?.finish_reason }); }
    catch (error) { validationError = String(error.message); }
    const reply = segments ? chatReplySegmentsText(segments) : null;
    const item = { caseId: fixture.id, variant, synthetic: true, message: fixture.message, history, route,
      selectedIds: selection?.examples.map(x => x.id) ?? [], selectionCounts: selection?.counts ?? null,
      promptSha256: createHash('sha256').update(system).digest('hex'), prompt: system,
      ...response, segments, reply, validationError,
      fitsBudget: reply ? replyFitsBudget(reply, 'zh', route) : null };
    await writeFile(path, JSON.stringify(item, null, 2));
    results.push({ caseId: fixture.id, variant, provider: 'deepseek', model: response.raw.model, usage: response.raw.usage,
      latencyMs: response.latencyMs, segments, reply, validationError, fitsBudget: item.fitsBudget,
      selectedIds: item.selectedIds, selectionCounts: item.selectionCounts });
    console.log(JSON.stringify({ caseId: fixture.id, variant, latencyMs: response.latencyMs, tokens: response.raw.usage?.total_tokens, valid: !!segments }));
  } catch (error) {
    const failed = { caseId: fixture.id, variant, error: String(error.message), synthetic: true };
    await writeFile(path, JSON.stringify(failed, null, 2)); results.push(failed);
    console.log(JSON.stringify(failed));
  }
}
let cursor = 0;
const jobs = selectedCases.flatMap(fixture => ['baseline', 'retrieval'].map(variant => ({ fixture, variant })));
async function worker() { while (cursor < jobs.length) { const job = jobs[cursor++]; await evaluate(job.fixture, job.variant); } }
await Promise.all([worker(), worker(), worker()]);
// A small extra comparison uses the existing optional model-router hints.
// It is not an additional classifier added to each production conversation.
for (const id of skipRouter ? [] : ['crush', 'ambiguous', 'history']) {
  const fixture = cases.find(item => item.id === id);
  try {
    const routed = await complete({ temperature: 0, max_tokens: 160, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: routeSystemPrompt('zh') }, { role: 'user', content: fixture.message },
    ] });
    let route, error;
    try { route = normalizeModelRoute(JSON.parse(routed.raw.choices[0].message.content)); }
    catch (issue) { error = String(issue.message); }
    await writeFile(resolve(output, `${id}-router.json`), JSON.stringify({ ...routed, route, error }, null, 2));
    results.push({ caseId: id, variant: 'router-only', model: routed.raw.model, usage: routed.raw.usage, latencyMs: routed.latencyMs, route, error });
    if (route) await evaluate(fixture, 'model-route-retrieval', route);
  } catch (error) {
    const failed = { caseId: id, variant: 'router-only', error: String(error.message), synthetic: true };
    await writeFile(resolve(output, `${id}-router.json`), JSON.stringify(failed, null, 2)); results.push(failed);
  }
}
const usage = results.reduce((sum, item) => {
  for (const field of ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens'])
    sum[field] = (sum[field] ?? 0) + (item.usage?.[field] ?? 0);
  return sum;
}, {});
const summary = { runId, generatedAt: new Date().toISOString(), model, calls, maxCalls, usage, results,
  limits: 'Synthetic first completions only; no live-user data or persistence, no endpoint authentication/storage simulation, no automatic shortening/repair; baseline uses the same safety prompt without retrieved examples. Small stochastic sample is not a population-quality guarantee.' };
await writeFile(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ output, calls, usage }));
