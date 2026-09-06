import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type Token } from "@capacitor/push-notifications";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import type { NavaNotificationTarget } from "./notifications";

export type RemotePushProvider = "apns" | "fcm" | "hms";
export type RemotePushRegistrationState = "unsupported" | "denied" | "prompt" | "registered";

const installationKey = "nava-native-installation-id:v1";
const openEvent = "nava:remote-notification-opened";
let activeUserId: string | null = null;
let listeners: PluginListenerHandle[] = [];

function installationId() {
  const existing = window.localStorage.getItem(installationKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(installationKey, created);
  return created;
}

function providerForPlatform(): RemotePushProvider | null {
  const platform = Capacitor.getPlatform();
  if (platform === "ios") return "apns";
  if (platform === "android") return "fcm";
  return null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function normalizeTarget(data: Record<string, unknown> | undefined): NavaNotificationTarget | undefined {
  if (!data) return undefined;
  let candidate: unknown = data.target;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { candidate = null; }
  }
  if (!candidate || typeof candidate !== "object") candidate = data;
  const raw = candidate as Record<string, unknown>;
  if (!(["today", "record", "ai", "trends", "profile"] as const).includes(raw.tab as NavaNotificationTarget["tab"])) return undefined;
  return {
    tab: raw.tab as NavaNotificationTarget["tab"],
    ...(typeof raw.module === "string" ? { module: raw.module as NavaNotificationTarget["module"] } : {}),
    ...(typeof raw.view === "string" ? { view: raw.view } : {}),
  };
}

async function persistToken(userId: string, token: Token) {
  const provider = providerForPlatform();
  if (!provider || !token.value) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("push_device_tokens").upsert({
    user_id: userId,
    installation_id: installationId(),
    provider,
    token: token.value,
    token_hash: await sha256(token.value),
    platform: Capacitor.getPlatform(),
    locale: navigator.language || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    enabled: true,
    last_seen_at: now,
    invalidated_at: null,
  }, { onConflict: "user_id,provider,installation_id" });
  if (error) throw error;
}

async function clearListeners() {
  const current = listeners;
  listeners = [];
  await Promise.allSettled(current.map((listener) => listener.remove()));
}

async function attachListeners(userId: string) {
  if (activeUserId === userId && listeners.length > 0) return;
  await clearListeners();
  activeUserId = userId;
  const registration = await PushNotifications.addListener("registration", (token) => {
    void persistToken(userId, token).catch((error) => console.warn("Remote push token sync deferred", error));
  });
  const registrationError = await PushNotifications.addListener("registrationError", (error) => {
    console.warn("Remote push registration failed", error.error);
  });
  const received = await PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
    void notification;
    // Foreground presentation is handled by the native plugin. The matching
    // user_notifications row is the durable, cross-device source of truth.
  });
  const opened = await PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
    window.dispatchEvent(new CustomEvent<NavaNotificationTarget | undefined>(openEvent, { detail: normalizeTarget(action.notification.data) }));
  });
  listeners = [registration, registrationError, received, opened];
}

export async function registerRemotePush(userId: string, requestPermission = false): Promise<RemotePushRegistrationState> {
  if (isDemoMode() || !Capacitor.isNativePlatform() || !providerForPlatform()) return "unsupported";
  await attachListeners(userId);
  let permission = await PushNotifications.checkPermissions();
  if ((permission.receive === "prompt" || permission.receive === "prompt-with-rationale") && requestPermission) permission = await PushNotifications.requestPermissions();
  if (permission.receive === "denied") return "denied";
  if (permission.receive !== "granted") return "prompt";
  if (Capacitor.getPlatform() === "android") {
    await PushNotifications.createChannel({
      id: "nava_general",
      name: "NAVA",
      description: "Health, focus, and recovery reminders",
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  }
  await PushNotifications.register();
  return "registered";
}

export async function deactivateRemotePush(userId: string) {
  if (isDemoMode() || !Capacitor.isNativePlatform()) return;
  const now = new Date().toISOString();
  await supabase.from("push_device_tokens")
    .update({ enabled: false, invalidated_at: now, last_seen_at: now })
    .eq("user_id", userId)
    .eq("installation_id", installationId());
  await PushNotifications.unregister().catch(() => undefined);
  activeUserId = null;
  await clearListeners();
}

export function subscribeRemoteNotificationActions(listener: (target?: NavaNotificationTarget) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<NavaNotificationTarget | undefined>).detail);
  window.addEventListener(openEvent, handler);
  return () => window.removeEventListener(openEvent, handler);
}
