import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { completionSceneForReward } from "../src/services/rewardPresentation.ts";
import { journalGrowthTargets, isMissingGrowthRpc } from "../src/services/growthRewardContract.ts";

test("all nine scenes are reachable; reward and journal mappings agree", () => {
  const window: { NavaCompletionScenes?: { choose: (record: object, hour: number) => string; scenes: Record<string, unknown> } } = {};
  vm.runInNewContext(readFileSync("public/journal/js/completion-scene.js", "utf8"), { window });
  const api = window.NavaCompletionScenes!;
  assert.equal(Object.keys(api.scenes).length, 9);
  for (const key of ["mood", "nutrition", "exercise", "face", "sleep", "focus", "task", "ai", "checkin", "share", "goal"]) {
    assert.equal(api.choose({ eventKey: `today:${key}` }, 12), completionSceneForReward(`today:${key}`, 12));
  }
  assert.equal(api.choose({ category: "focus", data: { task: "编程" } }, 12), "03");
  assert.equal(api.choose({ category: "focus", data: { task: "阅读" } }, 12), "02");
  assert.equal(api.choose({}, 22), "09");assert.equal(api.choose({}, 12), "01");
  for (const suffix of ["01", "02", "03", "04", "05", "06", "07", "08", "09"]) assert.ok(api.scenes[suffix]);
});

test("journal task display preserves exercise/focus thresholds", () => {
  assert.deepEqual([...journalGrowthTargets([{ category: "sport", data: { durationMinutes: 19 } }])], []);
  assert.deepEqual([...journalGrowthTargets([{ category: "sport", data: { durationMinutes: 20 } }])], ["exercise"]);
  assert.ok(journalGrowthTargets([{ category: "focus", data: { durationMinutes: 10 } }, { category: "focus", data: { durationMinutes: 15 } }]).has("focus"));
  assert.ok(journalGrowthTargets([{ category: "focus", data: { durationMinutes: 10 } }], 15).has("focus"));
  assert.equal(journalGrowthTargets([{ category: "focus", data: { durationMinutes: 24 } }]).has("focus"), false);
});

test("only a missing RPC permits rolling-release fallback", () => {
  assert.ok(isMissingGrowthRpc({ code: "PGRST202" }));
  for (const error of [null, { code: "42501" }, { code: "23505" }, { code: "500" }, { code: "PGRST301" }]) assert.equal(isMissingGrowthRpc(error), false);
});

test("completion presentation cannot award points or resurrect the trophy popup", () => {
  for (const file of ["public/journal/js/completion-scene.js", "public/journal/js/completion-host.js", "public/journal/js/celebration-garden.js", "src/components/RewardCelebration.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\.rpc\(|reward-points|reward-trophy|visiblePoints|setInterval\(/);
  }
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /onSaved=\{markJournalChanged\}/);
  assert.match(app, /claimGrowthAfterChange\(false\)/);
});
