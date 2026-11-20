/** Presentation receipt only. Rewards and saved records remain server-owned. */
type SavedRecord = { id: string; category: string; createdAt: string; version?: number };
type ReceiptStorage = Pick<Storage, 'getItem' | 'setItem'>;
const categories = new Set(['mood', 'food', 'sport', 'focus', 'sleep', 'face']);

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function createdDay(record: SavedRecord): string | null {
  const date = new Date(record.createdAt);
  return Number.isFinite(date.getTime()) ? localDay(date) : null;
}

/** Call only with the acknowledged save result. One first NEW entry across all
 * six categories per account/device day; edits, replays and failed saves cannot
 * claim it. Known server entries also prevent replay after local data clearing.
 * An unavailable store suppresses optional presentation, never the actual save. */
export function claimJournalDailyCompletion(
  userId: string,
  saved: SavedRecord,
  previous: readonly SavedRecord[],
  now = new Date(),
  storage?: ReceiptStorage,
): boolean {
  if (!userId || !saved.id || !categories.has(saved.category) || saved.version !== 1 || !Number.isFinite(now.getTime())) return false;
  const day = localDay(now);
  if (createdDay(saved) !== day || previous.some(record => record.id === saved.id || (categories.has(record.category) && createdDay(record) === day))) return false;
  try {
    const receipts = storage ?? window.localStorage;
    const key = `nava:journal-completion:v1:${encodeURIComponent(userId)}:${day}`;
    if (receipts.getItem(key) !== null) return false;
    // Synchronous read/write makes multiple save callbacks in this WebView
    // share the same claim before either can present a completion screen.
    receipts.setItem(key, 'shown');
    return receipts.getItem(key) === 'shown';
  } catch {
    return false;
  }
}
