import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { WatchUserSnapshot } from "../types";
import { isDemoMode } from "./demo";

export type WatchAction =
  | { type: "mood.quickLog"; mood: number; recordedAt: string }
  | { type: "focus.start"; taskTitle?: string; startedAt: string }
  | { type: "focus.stop"; sessionId: string; endedAt: string; durationMinutes?: number; taskTitle?: string }
  | { type: "sync.requestSnapshot" };

export type WatchAck =
  | { ok: true; actionId: string; syncedAt: string }
  | { ok: false; actionId: string; errorCode: string; message: string };

interface NavaWatchBridgePlugin {
  publishSnapshot: (options: { snapshot: WatchUserSnapshot }) => Promise<{ ok: boolean }>;
  isReachable: () => Promise<{ reachable: boolean; paired: boolean }>;
  addListener?: (eventName: "watchAction", listenerFunc: (action: WatchAction) => void) => Promise<PluginListenerHandle>;
}

const NavaWatchBridge = registerPlugin<NavaWatchBridgePlugin>("NavaWatchBridge");

export async function publishWatchSnapshot(snapshot: WatchUserSnapshot) {
  localStorage.setItem("nava.watch.snapshot", JSON.stringify(snapshot));
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

export async function subscribeWatchActions(listener: (action: WatchAction) => void) {
  if (isDemoMode()) return null;

  if (!Capacitor.isNativePlatform() || !NavaWatchBridge.addListener) return null;
  return NavaWatchBridge.addListener("watchAction", listener);
}
