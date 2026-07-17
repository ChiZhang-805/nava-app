import type { WatchUserSnapshot } from "../types";

export type WatchAction =
  | { type: "mood.quickLog"; mood: number; recordedAt: string }
  | { type: "focus.start"; taskTitle?: string; startedAt: string }
  | { type: "focus.stop"; sessionId: string; endedAt: string }
  | { type: "sync.requestSnapshot" };

export type WatchAck =
  | { ok: true; actionId: string; syncedAt: string }
  | { ok: false; actionId: string; errorCode: string; message: string };

export async function publishWatchSnapshot(snapshot: WatchUserSnapshot) {
  localStorage.setItem("nava.watch.snapshot", JSON.stringify(snapshot));
  return snapshot;
}

export async function readLastWatchSnapshot(): Promise<WatchUserSnapshot | null> {
  const raw = localStorage.getItem("nava.watch.snapshot");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WatchUserSnapshot;
  } catch {
    return null;
  }
}

