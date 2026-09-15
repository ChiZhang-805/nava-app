import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { exerciseMascotFeedback } from "../src/services/exerciseMascotFeedback.ts";
import { createStreamingAiSpeaker } from "../src/services/aiSpeech.ts";
import { publicShareUrl } from "../src/services/publicShareUrl.ts";
import type { ExerciseSession } from "../src/services/exerciseSession.ts";
import type { TodaySnapshot } from "../src/types.ts";
const session: ExerciseSession = { version: 1, title: "Movement", plannedMinutes: 25, steps: ["Warm up", "Move", "Cool down"], stepSeconds: [300, 900, 300], startedAt: new Date(2026, 8, 15, 10).toISOString(), runningSince: new Date(2026, 8, 15, 10).toISOString(), elapsedSeconds: 0 };
test("mascot follows verified stage boundaries and never reports an unsaved record as saved", () => {
  for (const [seconds, state] of [[299, "stage-0"], [300, "stage-1"], [1199, "stage-1"], [1200, "stage-2"], [1500, "complete"]] as const) {
    const result = exerciseMascotFeedback(session, seconds, null, "2026-09-15", "zh");
    assert.equal(result.state, state); assert.doesNotMatch(result.message, /已保存|获得积分/);
  }
  assert.equal(exerciseMascotFeedback({ ...session, runningSince: null }, 1500, null, "2026-09-15", "zh").state, "paused");
  assert.equal(exerciseMascotFeedback({ ...session, stepSeconds: undefined }, 30, null, "2026-09-15", "zh").state, "unverified-stage");
});
test("mascot ignores stale dates, respects zero and gives cautious non-diagnostic feedback", () => {
  const snapshot = { date: "2026-09-15", sleep: { record_date: "2026-09-15", sleep_duration_minutes: 0 }, exercise: null } as TodaySnapshot;
  assert.match(exerciseMascotFeedback(session, 10, snapshot, "2026-09-15", "zh").evidence, /0 小时 0 分/);
  assert.doesNotMatch(exerciseMascotFeedback(session, 10, snapshot, "2026-09-16", "zh").evidence, /已记录睡眠/);
  const injured = { ...snapshot, exercise: { record_date: snapshot.date, has_injury: true } } as TodaySnapshot;
  assert.equal(exerciseMascotFeedback(session, 10, injured, "2026-09-15", "zh").state, "caution");
  assert.equal(exerciseMascotFeedback(session, 10, { ...injured, date: "2026-09-14" }, "2026-09-15", "zh").state, "stage-0");
});
test("cancelled streaming speech never resumes from late tokens and ignores duplicate settlement", async () => {
  const originalWindow = globalThis.window;
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const spoken: SpeechSynthesisUtterance[] = [];
  const activity: boolean[] = [];
  class Utterance { text: string; constructor(text: string) { this.text = text; } }
  Object.assign(globalThis, { window: { speechSynthesis: { getVoices: () => [], cancel: () => {}, speak: (value: SpeechSynthesisUtterance) => spoken.push(value) }, SpeechSynthesisUtterance: Utterance }, SpeechSynthesisUtterance: Utterance });
  try {
    const speaker = createStreamingAiSpeaker(null, "zh", (playing) => activity.push(playing));
    speaker.start(); speaker.update("先放松一下。继续吧。");
    assert.equal(spoken.length, 2);
    spoken[0].onend?.({} as SpeechSynthesisEvent); spoken[0].onerror?.({} as SpeechSynthesisErrorEvent);
    assert.equal(activity.at(-1), true);
    speaker.cancel(); await speaker.whenDone();
    speaker.update("迟到内容。仍在生成。"); speaker.finish("最终回复。");
    assert.equal(spoken.length, 2); assert.equal(activity.at(-1), false);
    speaker.start(); speaker.finish("新的回复。"); assert.equal(spoken.length, 3);
  } finally { Object.assign(globalThis, { window: originalWindow, SpeechSynthesisUtterance: originalUtterance }); }
});
test("native interruption contract cancels pending authorization and never auto-resumes", () => {
  const code = readFileSync("native/ios/NavaSpeechPlugin.swift", "utf8");
  for (const contract of [".began", ".oldDeviceUnavailable", "didEnterBackgroundNotification", "requestGeneration", "applicationState != .background", "if installedTap", "voice_interrupted"]) assert.ok(code.includes(contract));
  assert.doesNotMatch(code, /shouldResume/);
});
test("shared links contain only a real public entry, no private routing or native origin", () => {
  assert.equal(publicShareUrl("https://chizhang-805.github.io/nava-app-preview/?token=private#tab=ai"), "https://chizhang-805.github.io/nava-app-preview/");
  for (const url of ["capacitor://localhost/#tab=profile", "http://localhost:5225/?demo=1", "https://untrusted.example/user/private"]) assert.equal(publicShareUrl(url), "https://nava-app-preview-cz.chizhang1031.chatgpt.site/");
});
