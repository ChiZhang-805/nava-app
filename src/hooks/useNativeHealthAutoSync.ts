import { App as CapacitorApp, type AppState } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { useEffect, useRef } from "react";
import {
  readPendingNativeHealthUpdate,
  getHealthAuthorizationStatus,
  getLastHealthSyncAt,
  isHealthSyncEnabled,
  startNativeHealthBackgroundDelivery,
  subscribeNativeHealthChanges,
  syncNativeHealthNow,
} from "../services/health";

const AUTO_SYNC_COOLDOWN_MS = 15 * 60 * 1000;
const inFlightByUser = new Map<string, Promise<boolean>>();
const lastAttemptByUser = new Map<string, number>();

async function syncIfDue(userId: string, force: boolean) {
  const existing = inFlightByUser.get(userId);
  if (existing) return existing;

  const task = (async () => {
    const authorization = await getHealthAuthorizationStatus();
    if (!authorization.available || !authorization.requested) return false;
    if (!force) {
      const lastAttempt = lastAttemptByUser.get(userId) ?? 0;
      if (Date.now() - lastAttempt < AUTO_SYNC_COOLDOWN_MS) return false;
      const lastSync = await getLastHealthSyncAt(userId);
      const lastSyncTime = Date.parse(lastSync ?? "");
      if (Number.isFinite(lastSyncTime) && Date.now() - lastSyncTime < AUTO_SYNC_COOLDOWN_MS) return false;
    }
    lastAttemptByUser.set(userId, Date.now());
    const result = await syncNativeHealthNow(userId);
    return !("skipped" in result && result.skipped) && result.uploaded > 0;
  })().finally(() => inFlightByUser.delete(userId));

  inFlightByUser.set(userId, task);
  return task;
}

/**
 * Keeps native Apple Health data moving without changing browser behavior.
 * Background observer callbacks are made durable by Swift; this hook uploads while the
 * bridge is alive and consumes any pending callback on the next app launch/foreground.
 */
export default function useNativeHealthAutoSync(userId: string | null, onSynced: () => void, consentRefreshKey = 0) {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;
    let active = true;
    let foregroundListener: PluginListenerHandle | null = null;
    let healthListener: PluginListenerHandle | null = null;

    const run = (force: boolean) => {
      void syncIfDue(userId, force)
        .then((synced) => {
          if (active && synced) onSyncedRef.current();
        })
        .catch((error) => console.warn("Automatic Apple Health sync deferred", error));
    };

    void (async () => {
      if (!await isHealthSyncEnabled(userId) || !active) return;
      const { enabled, errors } = await startNativeHealthBackgroundDelivery();
      if (!enabled && errors.length > 0) console.warn("HealthKit background delivery is not active", errors);

      try {
        const { pending } = await readPendingNativeHealthUpdate();
        run(pending);
      } catch (error) {
        console.warn("Unable to consume pending HealthKit update", error);
        run(false);
      }

      const appHandle = await CapacitorApp.addListener("appStateChange", ({ isActive }: AppState) => {
        if (isActive) run(false);
      });
      if (active) foregroundListener = appHandle;
      else void appHandle.remove();

      const nextHealthListener = await subscribeNativeHealthChanges(() => run(true));
      if (nextHealthListener) {
        if (active) healthListener = nextHealthListener;
        else void nextHealthListener.remove();
      }
    })().catch((error) => console.warn("Unable to prepare consent-authorized HealthKit sync", error));

    return () => {
      active = false;
      void foregroundListener?.remove();
      void healthListener?.remove();
    };
  }, [consentRefreshKey, userId]);
}
