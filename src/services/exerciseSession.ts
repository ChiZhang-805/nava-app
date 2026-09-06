import { clearActiveUserSession, loadActiveUserSession, saveActiveUserSession } from "./userCloudState.ts";

export type ExerciseSession = {
  version: 1;
  title: string;
  plannedMinutes: number;
  steps: string[];
  startedAt: string;
  runningSince: string | null;
  elapsedSeconds: number;
};

const MAX_EXERCISE_SESSION_MS = 12 * 60 * 60 * 1_000;
const keyFor = (userId: string) => `nava.exercise-session.v1:${userId}`;

function normalizedSession(value: Partial<ExerciseSession> | null, now = new Date()): ExerciseSession | null {
  if (!value || value.version !== 1 || typeof value.startedAt !== "string" || typeof value.title !== "string") return null;
  const startedAt = new Date(value.startedAt).getTime();
  if (!Number.isFinite(startedAt) || startedAt > now.getTime() + 60_000 || now.getTime() - startedAt > MAX_EXERCISE_SESSION_MS) return null;
  const runningSince = typeof value.runningSince === "string" && Number.isFinite(new Date(value.runningSince).getTime())
    ? value.runningSince
    : null;
  return {
    version: 1,
    title: value.title.trim().slice(0, 120) || "运动",
    plannedMinutes: Math.min(240, Math.max(1, Math.round(Number(value.plannedMinutes) || 1))),
    steps: Array.isArray(value.steps) ? value.steps.filter((item): item is string => typeof item === "string").slice(0, 8) : [],
    startedAt: value.startedAt,
    runningSince,
    elapsedSeconds: Math.min(12 * 60 * 60, Math.max(0, Math.round(Number(value.elapsedSeconds) || 0))),
  };
}

function readLocal(userId: string, now = new Date()) {
  if (typeof window === "undefined") return null;
  try {
    const session = normalizedSession(JSON.parse(window.localStorage.getItem(keyFor(userId)) ?? "null"), now);
    if (!session) window.localStorage.removeItem(keyFor(userId));
    return session;
  } catch {
    window.localStorage.removeItem(keyFor(userId));
    return null;
  }
}

function writeLocal(userId: string, session: ExerciseSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(keyFor(userId), JSON.stringify(session));
  else window.localStorage.removeItem(keyFor(userId));
}

export function exerciseSessionElapsedSeconds(session: ExerciseSession, now = new Date()) {
  const running = session.runningSince ? Math.max(0, (now.getTime() - new Date(session.runningSince).getTime()) / 1_000) : 0;
  return Math.max(0, Math.round(session.elapsedSeconds + running));
}

export async function hydrateExerciseSession(userId: string, now = new Date()) {
  const local = readLocal(userId, now);
  const remote = await loadActiveUserSession<Partial<ExerciseSession> & { clearedAt?: string }>(userId, "exercise");
  if (typeof remote?.clearedAt === "string") {
    writeLocal(userId, null);
    return null;
  }
  const resolved = normalizedSession(remote ?? null, now) ?? local;
  if (resolved) {
    writeLocal(userId, resolved);
    if (!remote) await saveActiveUserSession(userId, "exercise", { ...resolved });
  } else if (remote) await clearActiveUserSession(userId, "exercise");
  return resolved;
}

async function persist(userId: string, session: ExerciseSession) {
  writeLocal(userId, session);
  await saveActiveUserSession(userId, "exercise", { ...session });
  return session;
}

export function startExerciseSession(userId: string, plan: { title: string; minutes: number; steps: string[] }, now = new Date()) {
  const session: ExerciseSession = {
    version: 1,
    title: plan.title,
    plannedMinutes: plan.minutes,
    steps: plan.steps,
    startedAt: now.toISOString(),
    runningSince: now.toISOString(),
    elapsedSeconds: 0,
  };
  writeLocal(userId, session);
  void saveActiveUserSession(userId, "exercise", { ...session }).catch((error) => console.warn("Exercise session cloud sync deferred", error));
  return session;
}

export async function pauseExerciseSession(userId: string, session: ExerciseSession, now = new Date()) {
  if (!session.runningSince) return session;
  return persist(userId, { ...session, elapsedSeconds: exerciseSessionElapsedSeconds(session, now), runningSince: null });
}

export async function resumeExerciseSession(userId: string, session: ExerciseSession, now = new Date()) {
  if (session.runningSince) return session;
  return persist(userId, { ...session, runningSince: now.toISOString() });
}

export async function finishExerciseSession(userId: string, session: ExerciseSession, now = new Date()) {
  const elapsedSeconds = exerciseSessionElapsedSeconds(session, now);
  writeLocal(userId, null);
  await clearActiveUserSession(userId, "exercise");
  return { minutes: Math.max(1, Math.min(720, Math.round(elapsedSeconds / 60))), elapsedSeconds };
}

export function abandonExerciseSession(userId: string) {
  writeLocal(userId, null);
  void clearActiveUserSession(userId, "exercise").catch((error) => console.warn("Exercise session cloud cleanup deferred", error));
}

