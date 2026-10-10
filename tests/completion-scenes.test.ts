import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { completionSceneForReward } from "../src/services/rewardPresentation.ts";
import { journalGrowthTargets, isMissingGrowthRpc } from "../src/services/growthRewardContract.ts";

test("all nine scenes are reachable; reward and journal mappings agree", () => {
  const window: { NavaCompletionScenes?: { choose: (record: object, hour: number) => string; scenes: Record<string, { cat?: string; inkDuration?: number; actorMotion?: string; zh?: string }> } } = {};
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
  assert.deepEqual(
    { cat: api.scenes["03"].cat, inkDuration: api.scenes["03"].inkDuration, actorMotion: api.scenes["03"].actorMotion },
    { cat: "scene-03-cat-laptop.png", inkDuration: 3.2, actorMotion: "typing" },
  );
  assert.match(api.scenes["03"].zh ?? "", /每一份努力都在发光\s*✧/);
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

test("desktop controls expose all nine named scenes without a reward write", () => {
  const chrome = readFileSync("src/components/DesktopDevicePreviewChrome.tsx", "utf8");
  const celebration = readFileSync("src/components/RewardCelebration.tsx", "utf8");
  const styles = readFileSync("public/journal/css/celebration-garden.css", "utf8");
  for (const scene of ["01", "02", "03", "04", "05", "06", "07", "08", "09"]) {
    assert.match(chrome, new RegExp(`scene: "${scene}"`));
  }
  for (const label of ["通用晨间", "专注阅读", "任务／AI", "面部记录", "饮食记录", "运动记录", "睡眠记录", "情绪记录", "通用夜间"]) {
    assert.match(chrome, new RegExp(label));
  }
  assert.match(chrome, /data-preview-completion=\{scene\}/);
  assert.match(chrome, /onCompletionPreview\?\.\(scene\)/);
  assert.match(celebration, /sceneOverride \?\? completionSceneForReward/);
  assert.match(styles, /garden-actor\[data-motion="typing"\]/);
  assert.match(styles, /border:0;background:var\(--scene-color\)/);
  assert.doesNotMatch(styles, /box-shadow:0 0 0 9px/);
});
