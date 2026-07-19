import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { WatchUserSnapshot } from "../types";
import { isDemoMode } from "./demo";
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
const PENDING_ACTIONS_KEY = "nava.watch.pending-actions.v1";
const PROCESSED_ACTIONS_KEY = "nava.watch.processed-actions.v1";
let flushPromise: Promise<number> | null = null;

type ResolvedWatchAction = WatchAction & { actionId: string };

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
  localStorage.setItem("nava.watch.snapshot", JSON.stringify(snapshot));
  if (!isDemoMode()) {
    try {
      await supabase.functions.invoke("watch-sync", {
        body: {
          type: "snapshot",
          date: new Date(snapshot.lastSyncedAt).toISOString().slice(0, 10),
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

export async function readLastWatchSnapshot(): Promise<WatchUserSnapshot | null> {
  const raw = localStorage.getItem("nava.watch.snapshot");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WatchUserSnapshot;
  } catch {
    return null;
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

export function enqueueWatchAction(action: WatchAction) {
  const resolved = resolveAction(action);
  const processed = new Set(readActionList(PROCESSED_ACTIONS_KEY).map((item) => item.actionId));
  if (processed.has(resolved.actionId)) return resolved;
  const pending = readActionList(PENDING_ACTIONS_KEY);
  if (!pending.some((item) => item.actionId === resolved.actionId)) {
    writeActionList(PENDING_ACTIONS_KEY, [...pending, resolved], 100);
  }
  return resolved;
}

export async function flushPendingWatchActions() {
  if (isDemoMode()) return 0;
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    const pending = readActionList(PENDING_ACTIONS_KEY);
    const processed = readActionList(PROCESSED_ACTIONS_KEY);
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
      writeActionList(PROCESSED_ACTIONS_KEY, processed, 200);
      writeActionList(PENDING_ACTIONS_KEY, pending.slice(completed), 100);
    }

    if (completed >= pending.length) writeActionList(PENDING_ACTIONS_KEY, [], 100);
    return completed;
  })();

  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}

export async function enqueueAndFlushWatchAction(action: WatchAction) {
  enqueueWatchAction(action);
  return flushPendingWatchActions();
}

export async function subscribeWatchActions(listener: (action: WatchAction) => void) {
  if (isDemoMode()) return null;

  if (!Capacitor.isNativePlatform() || !NavaWatchBridge.addListener) return null;
  return NavaWatchBridge.addListener("watchAction", listener);
}
