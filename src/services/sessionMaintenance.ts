export type SleepMaintenanceSession = {
  version: 1;
  startedAt: string;
};

const MAX_SLEEP_SESSION_MS = 24 * 60 * 60 * 1_000;
const keyFor = (userId: string) => `nava.sleep-maintenance.v1:${userId}`;

function validStartedAt(value: unknown, now: Date) {
  if (typeof value !== "string") return false;
  const started = new Date(value).getTime();
  return Number.isFinite(started) && started <= now.getTime() + 60_000 && now.getTime() - started <= MAX_SLEEP_SESSION_MS;
}

export function loadSleepMaintenance(userId: string, now = new Date()): SleepMaintenanceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(keyFor(userId)) ?? "null") as Partial<SleepMaintenanceSession> | null;
    if (!parsed || parsed.version !== 1 || !validStartedAt(parsed.startedAt, now)) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    return { version: 1, startedAt: parsed.startedAt as string };
  } catch {
    window.localStorage.removeItem(keyFor(userId));
    return null;
  }
}

export async function hydrateSleepMaintenance(userId: string, now = new Date()): Promise<SleepMaintenanceSession | null> {
  const { clearActiveUserSession, loadActiveUserSession, saveActiveUserSession } = await import("./userCloudState.ts");
  const local = loadSleepMaintenance(userId, now);
  const remote = await loadActiveUserSession<Partial<SleepMaintenanceSession> & { clearedAt?: string }>(userId, "sleep");
  if (typeof remote?.clearedAt === "string") {
    window.localStorage.removeItem(keyFor(userId));
    return null;
  }
  const resolved = remote?.version === 1 && validStartedAt(remote.startedAt, now)
    ? { version: 1 as const, startedAt: remote.startedAt as string }
    : local;
  if (resolved) {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(resolved));
    if (!remote) await saveActiveUserSession(userId, "sleep", { ...resolved });
  } else if (remote) {
    await clearActiveUserSession(userId, "sleep");
  }
  return resolved;
}

export function startSleepMaintenance(userId: string, now = new Date()): SleepMaintenanceSession {
  const session: SleepMaintenanceSession = { version: 1, startedAt: now.toISOString() };
  if (typeof window !== "undefined") window.localStorage.setItem(keyFor(userId), JSON.stringify(session));
  void import("./userCloudState.ts")
    .then(({ saveActiveUserSession }) => saveActiveUserSession(userId, "sleep", { ...session }))
    .catch((error) => console.warn("Sleep session cloud sync deferred", error));
  return session;
}

export function clearSleepMaintenance(userId: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(keyFor(userId));
  void import("./userCloudState.ts")
    .then(({ clearActiveUserSession }) => clearActiveUserSession(userId, "sleep"))
    .catch((error) => console.warn("Sleep session cloud cleanup deferred", error));
}

function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function sleepMaintenanceFields(session: SleepMaintenanceSession, endedAt = new Date()) {
  const startedAt = new Date(session.startedAt);
  const durationMinutes = Math.max(1, Math.min(24 * 60, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000)));
  return {
    start: localTime(startedAt),
    end: localTime(endedAt),
    durationMinutes,
    // A manual start/end timer cannot observe sleep stages. Keep them empty
    // until HealthKit or the user supplies measured values.
    deepMinutes: 0,
    lightMinutes: 0,
    remMinutes: 0,
  };
}

export function sleepMaintenanceElapsedMinutes(session: SleepMaintenanceSession, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 60_000));
}
