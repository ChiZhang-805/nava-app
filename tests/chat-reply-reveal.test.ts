import test from "node:test";
import assert from "node:assert/strict";
import { createReplyRevealClock, replyRevealOffsets } from "../src/services/chatReplyReveal.ts";
import type { ChatReplySegment } from "../supabase/functions/_shared/chat-reply-segments.ts";

function fixture() {
  let now = 0, sequence = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const scheduler = createReplyRevealClock({ set: (fn: () => void, delay: number) => { const id = ++sequence; jobs.set(id, { at: now + delay, fn }); return id; }, clear: (id: number) => { jobs.delete(id); } });
  return { scheduler, jobs, advance: (ms: number) => { now += ms; for (const [id, job] of [...jobs].sort((a,b) => a[1].at-b[1].at)) if (job.at <= now) { jobs.delete(id); job.fn(); } } };
}
const parts: ChatReplySegment[] = [...Array.from({ length: 6 }, (_, index) => ({ type: "text" as const, text: `第${index+1}条，慢慢聊呀。` })), { type: "sticker", id: "hug" }];

test("one through seven parts keep 250–650ms gaps, with at most three seconds total", () => {
  for (let count = 1; count <= 7; count++) for (const text of ["好呀", "长".repeat(1000)]) {
    const offsets = replyRevealOffsets(parts.slice(0, count).map(part => part.type === "text" ? { ...part, text } : part));
    assert.equal(offsets[0], 0); assert.equal(offsets.length, count); assert.ok(offsets.at(-1)! <= 3000);
    offsets.slice(1).forEach((offset, index) => assert.ok(offset-offsets[index] >= 250 && offset-offsets[index] <= 650));
  }
});
test("first bubble is immediate; full saved response is presented in original order", () => {
  const { scheduler, advance } = fixture(), counts: number[] = [];
  scheduler.start(parts, false, count => counts.push(count)); assert.deepEqual(counts, [1]);
  advance(249); assert.deepEqual(counts, [1]); advance(3000); assert.deepEqual(counts, [1,2,3,4,5,6,7]);
});
test("cancel on scope change/unmount ignores already queued callbacks; new reply replaces old schedule", () => {
  const { scheduler, jobs, advance } = fixture(), old: number[] = [], next: number[] = [];
  scheduler.start(parts, false, count => old.push(count)); const late = [...jobs.values()][0].fn;
  scheduler.cancel(); late(); advance(4000); assert.deepEqual(old, [1]);
  scheduler.start(parts, false, count => old.push(count)); scheduler.start(parts.slice(0,2), false, count => next.push(count));
  advance(4000); assert.deepEqual(old,[1,1]); assert.deepEqual(next,[1,2]);
});
test("reduced motion and a single part finish immediately without timers", () => {
  const { scheduler, jobs } = fixture(), counts: number[] = [];
  scheduler.start(parts, true, count => counts.push(count)); scheduler.start(parts.slice(0,1), false, count => counts.push(count));
  assert.deepEqual(counts,[7,1]); assert.equal(jobs.size,0);
});
