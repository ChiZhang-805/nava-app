import assert from "node:assert/strict";
import test from "node:test";
import { createConversationWriteQueue, resumeArchivedConversation } from "../src/services/aiConversationResume.ts";
import { conversationLastMessageAt, mergeConversationSnapshots } from "../src/services/aiConversationSessions.ts";
import type { ChatMessage } from "../src/types.ts";
import type { ConversationSnapshot } from "../src/services/aiConversationSessions.ts";

const message = (id: string, day: number): ChatMessage => ({ id, role: "user", content: id, created_at: `2026-11-${day}T12:00:00Z` });
const target: ConversationSnapshot = { id: "stable-archive", createdAt: "2026-11-10T12:00:00Z", dayKey: "2026-11-10", title: "Old conversation", messages: [message("old-1", 10), message("old-2", 11)] };
function fixture(fail?: "backup" | "restore" | "delete" | "rollback") {
  let rows = [message("today", 20)];
  const backups: ChatMessage[][] = [];
  const calls: string[] = [];
  let deletes = 0;
  let restores = 0;
  const store = {
    loadCurrent: async () => rows.map(row => ({ ...row })),
    archiveCurrent: async (messages: ChatMessage[]) => { calls.push("backup"); if (fail === "backup") throw new Error("backup failed"); backups.push(messages); },
    restore: async (messages: ChatMessage[]) => {
      calls.push("restore"); restores++;
      if (fail === "restore" || (fail === "rollback" && restores > 1)) throw new Error("restore failed");
      const all = new Map(rows.map(row => [row.id, row]));
      for (const row of messages) all.set(row.id, row);
      rows = [...all.values()];
    },
    remove: async (ids: string[]) => {
      calls.push("delete"); deletes++;
      rows = rows.filter(row => !ids.includes(row.id));
      if ((fail === "delete" || fail === "rollback") && deletes === 1) throw new Error("partial delete failed");
    },
  };
  return { store, calls, backups, rows: () => rows };
}

test("resume persists a complete backup, restores historical IDs, then removes only old live rows", async () => {
  const data = fixture();
  const result = await resumeArchivedConversation(target, data.store);
  assert.deepEqual(data.calls, ["backup", "restore", "delete"]);
  assert.equal(data.backups[0][0].id, "today");
  assert.deepEqual(result, target.messages);
  assert.deepEqual(data.rows(), target.messages);
  assert.equal(target.id, "stable-archive");
});

for (const failure of ["backup", "restore", "delete"] as const) {
  test(`${failure} failure keeps the previous live messages recoverable and never mutates the selected archive`, async () => {
    const data = fixture(failure);
    await assert.rejects(resumeArchivedConversation(target, data.store));
    assert.deepEqual(data.rows(), [message("today", 20)]);
    assert.deepEqual(target.messages, [message("old-1", 10), message("old-2", 11)]);
    if (failure === "backup") assert.deepEqual(data.calls, ["backup"]);
    if (failure === "restore") assert.deepEqual(data.calls, ["backup", "restore"]);
  });
}

test("rollback failure is explicit and the original messages still have a durable backup", async () => {
  const data = fixture("rollback");
  await assert.rejects(resumeArchivedConversation(target, data.store), /reopen a saved conversation/);
  assert.deepEqual(data.backups[0], [message("today", 20)]);
});

test("reopening the same archive retains newer live turns", async () => {
  const data = fixture();
  data.store.loadCurrent = async () => [...target.messages, message("continued", 20)];
  const result = await resumeArchivedConversation(target, data.store);
  assert.equal(result.at(-1)?.id, "continued");
  assert(!data.calls.includes("delete"));
});

test("archive identity/start date stay fixed while latest-message time controls ordering and merge", () => {
  const continued = { ...target, messages: [...target.messages, message("continued", 20)] };
  const other = { ...target, id: "other", createdAt: "2026-11-18T12:00:00Z", messages: [message("other", 18)] };
  const result = mergeConversationSnapshots([continued, other, target]);
  assert.equal(result[0].id, "stable-archive");
  assert.equal(result[0].createdAt, target.createdAt);
  assert.equal(conversationLastMessageAt(result[0]), "2026-11-20T12:00:00Z");
});

test("archive and switch operations serialize and recover after a rejected write", async () => {
  const queue = createConversationWriteQueue();
  const order: string[] = [];
  const first = queue.run(async () => { await new Promise(resolve => setTimeout(resolve, 5)); order.push("first"); throw new Error("offline"); });
  const second = queue.run(async () => { order.push("second"); return 2; });
  await assert.rejects(first);
  assert.equal(await second, 2);
  assert.deepEqual(order, ["first", "second"]);
});
