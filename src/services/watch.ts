import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { WatchUserSnapshot } from "../types";
import { isDemoMode } from "./demo";
import { todayISO } from "./date";
import { supabase } from "./supabaseClient";

export type WatchAction =
  | { actionId?: string; type: "mood.quickLog"; mood: number; recordedAt: string }
  | { actionId?: string; type: "focus.start"; sessionId?: string; taskTitle?: string; startedAt: string }
  | { actionId?: string; type: "focus.stop"; sessionId: string; endedAt: string; durationMinutes?: number; taskTitle?: string }
  | { actionId?: string; type: "sync.requestSnapshot"; recordedAt?: string };

export type WatchAck =
  | { ok: true; actionId: string; syncedAt: string }
  | { ok: false; actionId: string; errorCode: string; message: string };

interface NavaWatchBridgePlugin {
  publishSnapshot: (options: { snapshot: WatchUserSnapshot }) => Promise<{ ok: boolean }>;
  isReachable: () => Promise<{ reachable: boolean; paired: boolean }>;
  addListener?: (eventName: "watchAction", listenerFunc: (action: WatchAction) => void) => Promise<PluginListenerHandle>;
}

const NavaWatchBridge = registerPlugin<NavaWatchBridgePlugin>("NavaWatchBridge");
const WATCH_SNAPSHOT_KEY = "nava.watch.snapshot.v1";
const PENDING_ACTIONS_KEY = "nava.watch.pending-actions.v1";
const PROCESSED_ACTIONS_KEY = "nava.watch.processed-actions.v1";
const flushPromises = new Map<string, Promise<number>>();

type ResolvedWatchAction = WatchAction & { actionId: string };

function accountKey(base: string, userId: string) {
  return `${base}.${userId}`;
}

function readActionList(key: string): ResolvedWatchAction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.actionId === "string" && typeof item.type === "string") : [];
  } catch {
    return [];
  }
}

function writeActionList(key: string, actions: ResolvedWatchAction[], limit: number) {
  localStorage.setItem(key, JSON.stringify(actions.slice(-limit)));
}

function resolveAction(action: WatchAction): ResolvedWatchAction {
  return { ...action, actionId: action.actionId?.trim() || crypto.randomUUID() } as ResolvedWatchAction;
}

export async function publishWatchSnapshot(snapshot: WatchUserSnapshot) {
  localStorage.setItem(accountKey(WATCH_SNAPSHOT_KEY, snapshot.userId), JSON.stringify(snapshot));
  if (!isDemoMode()) {
    try {
      await supabase.functions.invoke("watch-sync", {
        body: {
          type: "snapshot",
          date: todayISO(new Date(snapshot.lastSyncedAt)),
          snapshot,
        },
      });
    } catch {
      // Native transfer and local cache still proceed if backend sync is unavailable.
    }
  }
  if (Capacitor.isNativePlatform()) {
    try {
      await NavaWatchBridge.publishSnapshot({ snapshot });
    } catch {
      // Local snapshot remains available for the app even if no Watch is paired.
    }
  }
  return snapshot;
}

export async function readLastWatchSnapshot(userId: string): Promise<WatchUserSnapshot | null> {
  const raw = localStorage.getItem(accountKey(WATCH_SNAPSHOT_KEY, userId));
  let localSnapshot: WatchUserSnapshot | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) as WatchUserSnapshot : null;
    if (parsed?.userId === userId) localSnapshot = parsed;
  } catch {
    localSnapshot = null;
  }

  if (isDemoMode()) return localSnapshot;
  try {
    const { data, error } = await supabase
      .from("watch_snapshots")
      .select("payload,pushed_at")
      .eq("user_id", userId)
      .order("pushed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const serverSnapshot = data?.payload as WatchUserSnapshot | null;
    if (!serverSnapshot || serverSnapshot.userId !== userId) return localSnapshot;
    if (!localSnapshot || Date.parse(serverSnapshot.lastSyncedAt) > Date.parse(localSnapshot.lastSyncedAt)) {
      localStorage.setItem(accountKey(WATCH_SNAPSHOT_KEY, userId), JSON.stringify(serverSnapshot));
      return serverSnapshot;
    }
    return localSnapshot;
  } catch {
    return localSnapshot;
  }
}

export async function getWatchReachability() {
  if (isDemoMode()) return { paired: true, reachable: true };

  if (!Capacitor.isNativePlatform()) return { paired: false, reachable: false };
  try {
    return await NavaWatchBridge.isReachable();
  } catch {
    return { paired: false, reachable: false };
  }
}

export function enqueueWatchAction(userId: string, action: WatchAction) {
  const resolved = resolveAction(action);
  const processedKey = accountKey(PROCESSED_ACTIONS_KEY, userId);
  const pendingKey = accountKey(PENDING_ACTIONS_KEY, userId);
  const processed = new Set(readActionList(processedKey).map((item) => item.actionId));
  if (processed.has(resolved.actionId)) return resolved;
  const pending = readActionList(pendingKey);
  if (!pending.some((item) => item.actionId === resolved.actionId)) {
    writeActionList(pendingKey, [...pending, resolved], 100);
  }
  return resolved;
}

export async function flushPendingWatchActions(userId: string) {
  if (isDemoMode()) return 0;
  const existing = flushPromises.get(userId);
  if (existing) return existing;

  const pendingKey = accountKey(PENDING_ACTIONS_KEY, userId);
  const processedKey = accountKey(PROCESSED_ACTIONS_KEY, userId);
  const flushPromise = (async () => {
    const pending = readActionList(pendingKey);
    const processed = readActionList(processedKey);
    const processedIds = new Set(processed.map((item) => item.actionId));
    let completed = 0;

    for (const action of pending) {
      if (processedIds.has(action.actionId)) {
        completed += 1;
        continue;
      }
      const response = await supabase.functions.invoke<{
        ok: boolean;
        result?: { action?: { snapshot?: WatchUserSnapshot } };
        status?: string;
      }>("watch-sync", { body: { type: "action", action } });
      if (response.error) throw response.error;
      if (!response.data?.ok) throw new Error(`Watch action is ${response.data?.status ?? "pending"}.`);
      const snapshot = response.data.result?.action?.snapshot;
      if (snapshot) await publishWatchSnapshot(snapshot);
      processed.push(action);
      processedIds.add(action.actionId);
      completed += 1;
      writeActionList(processedKey, processed, 200);
      writeActionList(pendingKey, pending.slice(completed), 100);
    }

    if (completed >= pending.length) writeActionList(pendingKey, [], 100);
    return completed;
  })();
  flushPromises.set(userId, flushPromise);

  try {
    return await flushPromise;
  } finally {
    flushPromises.delete(userId);
  }
}

export async function enqueueAndFlushWatchAction(userId: string, action: WatchAction) {
  enqueueWatchAction(userId, action);
  return flushPendingWatchActions(userId);
}

export async function subscribeWatchActions(listener: (action: WatchAction) => void) {
  if (isDemoMode()) return null;

  if (!Capacitor.isNativePlatform() || !NavaWatchBridge.addListener) return null;
  return NavaWatchBridge.addListener("watchAction", listener);
}
