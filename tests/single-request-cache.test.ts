import assert from "node:assert/strict";
import test from "node:test";
import { loadSingleKey, type SingleRequestRef } from "../src/services/singleRequestCache.ts";

test("same-key reads share one in-flight and resolved request", async () => {
  const slot: SingleRequestRef<number> = { current: null };
  let calls = 0;
  let release!: (value: number) => void;
  const pending = new Promise<number>((resolve) => { release = resolve; });
  const loader = () => {
    calls += 1;
    return pending;
  };

  const first = loadSingleKey(slot, "user:date", loader);
  const second = loadSingleKey(slot, "user:date", loader);
  assert.equal(first, second);
  assert.equal(calls, 1);
  release(42);
  assert.equal(await first, 42);
  assert.equal(await loadSingleKey(slot, "user:date", loader), 42);
  assert.equal(calls, 1);
});

test("force and key changes cross the real-data boundary again", async () => {
  const slot: SingleRequestRef<number> = { current: null };
  let calls = 0;
  const loader = async () => ++calls;

  assert.equal(await loadSingleKey(slot, "day-one", loader), 1);
  assert.equal(await loadSingleKey(slot, "day-one", loader, true), 2);
  assert.equal(await loadSingleKey(slot, "day-two", loader), 3);
});

test("failed requests are evicted so retry cannot reuse a rejection", async () => {
  const slot: SingleRequestRef<number> = { current: null };
  let calls = 0;
  const loader = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary failure");
    return 7;
  };

  await assert.rejects(loadSingleKey(slot, "user:date", loader), /temporary failure/);
  assert.equal(slot.current, null);
  assert.equal(await loadSingleKey(slot, "user:date", loader), 7);
  assert.equal(calls, 2);
});
