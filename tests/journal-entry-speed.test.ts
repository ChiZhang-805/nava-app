import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { performance } from "node:perf_hooks";

const journalRoot = new URL("../public/journal/js/", import.meta.url);
const hostBridge = readFileSync(new URL("../src/features/JournalExperience.tsx", import.meta.url), "utf8");
const journalApp = readFileSync(new URL("app.js", journalRoot), "utf8");
const journalReview = readFileSync(new URL("review.js", journalRoot), "utf8");
const todoPage = readFileSync(new URL("../src/features/TodayTodoPage.tsx", import.meta.url), "utf8");
const aiScreen = readFileSync(new URL("../src/features/AIScreen.tsx", import.meta.url), "utf8");

test("every voice surface reaches its real AI boundary after speech recognition", () => {
  assert.match(hostBridge, /mood:'mood',diet:'food',exercise:'sport',focus:'focus',sleep:'sleep',face:'face'/);
  assert.match(hostBridge, /method==='voice-start'[\s\S]*startVoiceInput/);
  assert.match(hostBridge, /method==='ai'[\s\S]*journalAI/);
  assert.match(journalApp, /const result = await speech\.stop\(\)[\s\S]*await organizeWords\(pending, serial\)/);
  assert.match(journalApp, /const draft = await AI\.extract/);
  assert.match(journalReview, /result = await this\.input\.stop\(\)[\s\S]*await this\.send\(result\.text/);
  assert.match(todoPage, /startVoiceInput\([\s\S]*applyVoiceTranscript/);
  assert.match(todoPage, /applyVoiceTranscript[\s\S]*estimateTodoDuration\(task, locale\)/);
  assert.equal((aiScreen.match(/await startVoiceInput\(/g) ?? []).length, 2, "AI composer and voice call must both start real speech input");
  assert.match(aiScreen, /async function submit[\s\S]*sendAiMessage/);
  assert.match(aiScreen, /submitVoiceCallTurn[\s\S]*sendAiMessage/);
});

function journalModules() {
  const context = vm.createContext({ __fluffyModules: {}, console });
  for (const file of ["model.js", "sleep-time.js", "catalog.js", "journal-guidance.js"]) {
    vm.runInContext(readFileSync(new URL(file, journalRoot), "utf8"), context, { filename: file });
  }
  return context.__fluffyModules as Record<string, Record<string, (...args: unknown[]) => unknown>>;
}

test("all six journal modules produce an immediate high-confidence draft", () => {
  const early = journalModules()["journal-guidance.js"].early;
  const cases = [
    ["mood", "我现在觉得很放松，因为完成了今天的工作", { mood: "很放松", reason: "完成了今天的工作" }],
    ["food", "午餐吃了鸡肉米饭，大概一碗", { meal: "午餐", foods: "鸡肉米饭", portion: "一碗" }],
    ["sport", "今天跑步30分钟，跑了5公里", { activity: "跑步", durationMinutes: 30, notes: "5公里" }],
    ["sleep", "昨晚11点睡，早上7点醒来，感觉很精神，中途醒过一次", { bedtime: "23:00", wakeTime: "07:00", quality: "很精神", notes: "中途醒过一次" }],
    ["face", "我今天感觉精神还好，眼周有一点黑眼圈，皮肤有点泛红", { feeling: "精神还好", eyeArea: "有一点黑眼圈", skinAppearance: "有点泛红" }],
    ["focus", "我想专注读论文45分钟，希望读完方法部分", { task: "读论文", durationMinutes: 45, notes: "读完方法部分" }],
  ] as const;
  for (const [category, words, expected] of cases) {
    const draft = early(category, words, { recordDate: "2026-10-02" }) as { fields: Record<string, unknown> };
    assert.deepEqual({ ...draft.fields }, expected, category);
  }
});

test("quick drafts do not invent unspecified values", () => {
  const early = journalModules()["journal-guidance.js"].early;
  assert.deepEqual({ ...(early("mood", "我没事", {}) as { fields: object }).fields }, {});
  assert.deepEqual({ ...(early("sport", "今天运动了一会儿", {}) as { fields: object }).fields }, {});
  assert.deepEqual({ ...(early("food", "今天吃得还行", {}) as { fields: object }).fields }, {});
  assert.deepEqual({ ...(early("sleep", "昨晚睡了一觉", { recordDate: "2026-10-02" }) as { fields: object }).fields }, {});
});

test("text journal extraction uses bounded per-module output budgets", async () => {
  const context = vm.createContext({ __fluffyModules: {}, console, Date });
  for (const file of ["model.js", "sleep-time.js", "catalog.js", "journal-guidance.js"]) {
    vm.runInContext(readFileSync(new URL(file, journalRoot), "utf8"), context, { filename: file });
  }
  context.__fluffyModules["entry-i18n.js"] = { language: () => "zh" };
  vm.runInContext(readFileSync(new URL("ai-journal.js", journalRoot), "utf8"), context, { filename: "ai-journal.js" });
  const extract = context.__fluffyModules["ai-journal.js"].extract as (...args: unknown[]) => Promise<unknown>;
  const budgets: Record<string, number> = {};
  for (const category of ["sport", "food", "mood", "sleep", "face", "focus"]) {
    const api = {
      provider: "deepseek", model: "deepseek-flash", routes: { chat: "journal" },
      request: async (_path: string, payload: { max_tokens: number }) => {
        budgets[category] = payload.max_tokens;
        return { choices: [{ finish_reason: "stop", message: { content: '{"fields":{},"warnings":[]}' } }] };
      },
    };
    await extract(api, category, "只记录我明确说出的内容", null, new AbortController().signal, { recordDate: "2026-10-02", current: {} });
  }
  assert.deepEqual(budgets, { sport: 420, food: 720, mood: 560, sleep: 480, face: 520, focus: 420 });
});

test("speech release with an existing transcript no longer waits the old 2.2 second tail", async () => {
  let frame = 0;
  type SpeechContext = vm.Context & { __fluffyModules: Record<string, Record<string, unknown>>; globalThis?: vm.Context };
  const context = vm.createContext({
    __fluffyModules: { "ai-policy.js": { AIError: Error } }, console, performance,
    requestAnimationFrame: () => ++frame, cancelAnimationFrame: () => {}, setTimeout, clearTimeout,
  }) as SpeechContext;
  context.globalThis = context;
  vm.runInContext(readFileSync(new URL("speech.js", journalRoot), "utf8"), context, { filename: "speech.js" });
  class Recognition {
    onstart?: () => void;
    start() { setTimeout(() => this.onstart?.(), 0); }
    stop() {}
    abort() {}
  }
  class AudioContext {
    state = "running";
    resume() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 0, getByteTimeDomainData(data: Uint8Array) { data.fill(128); } }; }
    close() { this.state = "closed"; return Promise.resolve(); }
  }
  const Session = context.__fluffyModules["speech.js"].SpeechSession as new (callbacks: object, environment: object) => {
    finalText: string;
    start(): Promise<boolean>;
    stop(): Promise<{ text: string }>;
  };
  const speech = new Session({}, {
    Recognition, AudioContext,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
  });
  await speech.start();
  speech.finalText = "今天感觉很好";
  const started = performance.now();
  const result = await speech.stop();
  const elapsed = performance.now() - started;
  assert.equal(result.text, "今天感觉很好");
  assert.ok(elapsed >= 100 && elapsed < 1000, `unexpected speech tail ${elapsed}ms`);
});
