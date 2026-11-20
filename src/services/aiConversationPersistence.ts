export type ArchiveMessage = { id: string; created_at: string };
export type StoredConversation<T> = {
  id: string;
  createdAt: string;
  dayKey?: string;
  title?: string;
  messages: T[];
};
export type VersionedConversation<T> = { archive: StoredConversation<T>; version: string };
export type ArchiveStore<T> = {
  read: () => Promise<VersionedConversation<T> | null>;
  compareAndSwap: (archive: StoredConversation<T>, expectedVersion: string | null) => Promise<boolean>;
};

/** Message IDs are immutable: an existing row wins, and distinct branches unite. */
export function unionConversationMessages<T extends ArchiveMessage>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) if (!byId.has(message.id)) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

/** The current chat table is never used as an archive's working buffer. */
export async function persistConversationArchive<T extends ArchiveMessage>(
  incoming: StoredConversation<T>, store: ArchiveStore<T>, requireExisting = false,
): Promise<StoredConversation<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    let current: VersionedConversation<T> | null;
    try { current = await store.read(); }
    catch (error) { lastError = error; continue; }
    if (!current && requireExisting) throw new Error("Conversation no longer exists or is not accessible.");
    const merged: StoredConversation<T> = {
      ...incoming,
      createdAt: current?.archive.createdAt ?? incoming.createdAt,
      dayKey: current?.archive.dayKey ?? incoming.dayKey,
      messages: unionConversationMessages(current?.archive.messages ?? [], incoming.messages),
    };
    // This also confirms a successful commit whose response was lost.
    if (current && JSON.stringify(merged) === JSON.stringify(current.archive)) return current.archive;
    try {
      if (await store.compareAndSwap(merged, current?.version ?? null)) return merged;
    } catch (error) { lastError = error; }
    // Both a conflict and an ambiguous transport error require a fresh read.
  }
  throw lastError instanceof Error ? lastError : new Error("Conversation changed repeatedly. Please try again.");
}

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
