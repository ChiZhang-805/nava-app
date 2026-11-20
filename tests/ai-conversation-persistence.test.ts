import assert from "node:assert/strict";
import test from "node:test";
import { createConversationWriteQueue, persistConversationArchive } from "../src/services/aiConversationPersistence.ts";
import { mergeConversationSnapshots } from "../src/services/aiConversationSessions.ts";
import type { ChatMessage } from "../src/types.ts";
import type { ConversationSnapshot } from "../src/services/aiConversationSessions.ts";

const message = (id: string, day: number): ChatMessage => ({ id, role: "user", content: id, created_at: `2026-11-${day}T12:00:00Z` });
const archive: ConversationSnapshot = { id: "stable-archive", createdAt: "2026-11-10T12:00:00Z", dayKey: "2026-11-10", title: "Old conversation", messages: [message("start", 10)] };

function fixture(options: { commitThenThrow?: boolean; failBeforeCommit?: boolean } = {}) {
  let saved = structuredClone(archive), version = 1, writes = 0, reads = 0;
  const store = {
    read: async () => { reads++; return { archive: structuredClone(saved), version: String(version) }; },
    compareAndSwap: async (next: typeof archive, expected: string | null) => {
      if (expected !== String(version)) return false;
      if (options.failBeforeCommit) throw new Error("offline before commit");
      writes++; saved = structuredClone(next); version++;
      if (options.commitThenThrow) throw new Error("response lost after commit");
      return true;
    },
  };
  return { store, saved: () => saved, writes: () => writes, reads: () => reads };
}

test("concurrent archive branches both survive CAS retry without moving current chat rows", async () => {
  const state = fixture();
  await Promise.all([
    persistConversationArchive({ ...archive, messages: [...archive.messages, message("device-a", 20)] }, state.store),
    persistConversationArchive({ ...archive, messages: [...archive.messages, message("device-b", 19)] }, state.store),
  ]);
  assert.deepEqual(state.saved().messages.map(item => item.id), ["start", "device-b", "device-a"]);
  assert.equal(state.saved().id, archive.id);
  assert(state.reads() >= 3, "CAS loser rereads the other device's committed branch");
});

test("a commit-after-error is read back and acknowledged without duplicate message or second write", async () => {
  const state = fixture({ commitThenThrow: true });
  const result = await persistConversationArchive({ ...archive, messages: [message("once", 20)] }, state.store, true);
  assert.equal(state.writes(), 1);
  assert.equal(result.messages.filter(item => item.id === "once").length, 1);
  assert.equal(state.reads(), 2);
});

test("a precommit error never reports success and leaves the stored archive intact", async () => {
  const state = fixture({ failBeforeCommit: true });
  await assert.rejects(persistConversationArchive({ ...archive, messages: [message("failed", 20)] }, state.store), /offline/);
  assert.deepEqual(state.saved(), archive);
  assert.equal(state.writes(), 0);
});

test("a deleted or inaccessible archive is never recreated by an old send", async () => {
  let writes = 0;
  await assert.rejects(persistConversationArchive(archive, {
    read: async () => null,
    compareAndSwap: async () => { writes++; return true; },
  }, true), /no longer exists/);
  assert.equal(writes, 0);
});

test("snapshot hydration unions both branches rather than discarding the older timestamp branch", () => {
  const combined = mergeConversationSnapshots([
    { ...archive, messages: [...archive.messages, message("device-a", 20)] },
    { ...archive, messages: [...archive.messages, message("device-b", 19)] },
  ]);
  assert.deepEqual(combined[0].messages.map(item => item.id), ["start", "device-b", "device-a"]);
});

test("immutable existing IDs cannot be replaced by a stale branch", async () => {
  const state = fixture();
  const result = await persistConversationArchive({ ...archive, messages: [{ ...archive.messages[0], content: "stale overwrite" }] }, state.store);
  assert.equal(result.messages[0].content, "start");
  assert.equal(state.writes(), 0);
});

test("write queue resumes after an error", async () => {
  const queue = createConversationWriteQueue();
  const first = queue.run(async () => { throw new Error("offline"); });
  const second = queue.run(async () => 2);
  await assert.rejects(first);
  assert.equal(await second, 2);
});
