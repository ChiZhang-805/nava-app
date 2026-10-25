import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ambientMascotAction, mascotIdleDelay, mascotTimePhase } from "../src/services/mascotBehavior.ts";

test("home interaction catalog uses only animations converted from the homepage folder", () => {
  const source = readFileSync(new URL("../src/services/homeMascotClips.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from "\.\.\/assets\/mascot\/animated\/([^"]+)"/g)].map((match) => match[1]);
  assert.equal(imports.length, 13);
  assert.ok(imports.every((name) => name.startsWith("home-")), `Unexpected non-home clip: ${imports.join(", ")}`);
  assert.doesNotMatch(source, /module-(?:diet|exercise|face|focus|mood|sleep)\.webp/);
});

test("local-time phase boundaries match the animator's 04 / 12 / 20 specification", () => {
  assert.deepEqual([0, 3, 4, 11, 12, 19, 20, 23].map(mascotTimePhase), ["night", "night", "morning", "morning", "day", "day", "night", "night"]);
  assert.ok(mascotIdleDelay(14) < mascotIdleDelay(8));
  assert.ok(mascotIdleDelay(8) < mascotIdleDelay(22));
});
test("no automatic action before inactivity threshold; no immediate repeat", () => {
  assert.equal(ambientMascotAction({ hour: 14, idleMs: 44_999 }), null);
  for (let n = 0; n < 100; n++) {
    assert.notEqual(ambientMascotAction({ hour: 14, idleMs: 180_000, lastAction: "read", random: n / 100 }), "read");
  }
});
test("night and positive mood exclude active actions, sleep concern prioritizes quiet motions", () => {
  for (let n = 0; n < 100; n++) {
    const args = { idleMs: 300_000, random: n / 100 };
    assert.ok(["read", "yawn", "nap", "curious"].includes(ambientMascotAction({ ...args, hour: 22 })!));
    assert.ok(["read", "yawn", "nap", "curious"].includes(ambientMascotAction({ ...args, hour: 14, positiveMood: true })!));
    assert.ok(["read", "yawn", "nap"].includes(ambientMascotAction({ ...args, hour: 14, sleepConcern: true })!));
  }
});
test("long inactivity makes fish/groom interaction available without forcing it every visit", () => {
  const choices = Array.from({ length: 100 }, (_, n) => ambientMascotAction({ hour: 14, idleMs: 180_000, random: n / 100 }));
  assert.ok(choices.includes("fish")); assert.ok(choices.includes("fluff"));
});
