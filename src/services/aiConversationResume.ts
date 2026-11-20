import type { ChatMessage } from "../types";
import type { ConversationSnapshot } from "./aiConversationSessions";

type ResumeStore = {
  loadCurrent: () => Promise<ChatMessage[]>;
  archiveCurrent: (messages: ChatMessage[]) => Promise<void>;
  restore: (messages: ChatMessage[]) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
};

export class ConversationRecoveryRequired extends Error {}

export function createConversationWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const task = tail.then(operation);
      tail = task.catch(() => undefined);
      return task;
    },
  };
}

/**
 * The deployed reply function reads ai_conversations. Restore the selected
 * archive there before accepting a send, rather than supplying client-only
 * history. Never remove the current conversation before its backup succeeds.
 */
export async function resumeArchivedConversation(snapshot: ConversationSnapshot, store: ResumeStore) {
  if (!snapshot.messages.length) throw new Error("This conversation has no messages.");
  const current = await store.loadCurrent();
  const targetIds = new Set(snapshot.messages.map((message) => message.id));
  const currentIds = new Set(current.map((message) => message.id));
  if (current.length && current[0].id === snapshot.messages[0].id) {
    // The selected archive can lag behind the live turn (or another device).
    // Reopening the same session must never discard its newer messages.
    const combined = new Map(snapshot.messages.map((message) => [message.id, message]));
    for (const message of current) combined.set(message.id, message);
    const merged = [...combined.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    await store.restore(merged);
    return merged;
  }
  if (current.length && current.every((message) => targetIds.has(message.id)) && snapshot.messages.every((message) => currentIds.has(message.id))) {
    return current;
  }
  if (current.length) await store.archiveCurrent(current);
  // A single database upsert is atomic. Delete is deliberately the final step.
  await store.restore(snapshot.messages);
  try {
    await store.remove(current.filter((message) => !targetIds.has(message.id)).map((message) => message.id));
  } catch (error) {
    // A multi-batch delete may have partially completed. Restore every original
    // row first; both complete archives remain durable if rollback also fails.
    try {
      await store.restore(current);
      await store.remove(snapshot.messages.filter((message) => !currentIds.has(message.id)).map((message) => message.id));
    } catch {
      throw new ConversationRecoveryRequired("Conversation switch could not finish. Your messages are saved in history; reopen a saved conversation before continuing.");
    }
    throw error;
  }
  return snapshot.messages;
}
