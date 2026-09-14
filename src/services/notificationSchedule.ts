/** Replace only the schedules owned by this update, never the entire suite. */
export async function replaceNotificationSchedules<T extends { id: number }>(
  adapter: { cancel(input: { notifications: { id: number }[] }): Promise<unknown>; schedule(input: { notifications: T[] }): Promise<unknown> },
  notifications: T[],
) {
  if (!notifications.length) return;
  if (new Set(notifications.map((item) => item.id)).size !== notifications.length) throw new Error("Duplicate notification schedule IDs.");
  await adapter.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
  await adapter.schedule({ notifications });
}
