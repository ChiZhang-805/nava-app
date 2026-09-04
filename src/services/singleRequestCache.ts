export type SingleRequestSlot<T> = {
  key: string;
  promise: Promise<T>;
} | null;

export type SingleRequestRef<T> = {
  current: SingleRequestSlot<T>;
};

/**
 * Reuses the latest successful or in-flight request for one logical data key.
 * Failures are evicted immediately, while callers can force a fresh boundary
 * read after a save, retry, or foreground transition.
 */
export function loadSingleKey<T>(
  slotRef: SingleRequestRef<T>,
  key: string,
  loader: () => Promise<T>,
  force = false,
) {
  if (!force && slotRef.current?.key === key) return slotRef.current.promise;
  const promise = loader();
  slotRef.current = { key, promise };
  void promise.catch(() => {
    if (slotRef.current?.promise === promise) slotRef.current = null;
  });
  return promise;
}
