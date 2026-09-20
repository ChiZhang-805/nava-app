import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export type ReminderPermissionResult = "granted" | "denied" | "cancelled" | "settings" | "unsupported";
const NativePermission = registerPlugin<{
  ensurePermission(options: { locale: "zh" | "en" }): Promise<{ status: ReminderPermissionResult }>;
  status(): Promise<{ granted: boolean }>;
}>("NavaNotificationPermission");

export async function reminderPermissionGranted() {
  if (Capacitor.getPlatform() === "ios") return (await NativePermission.status()).granted;
  if (Capacitor.isNativePlatform()) return (await LocalNotifications.checkPermissions()).display === "granted";
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function ensureReminderPermission(locale: "zh" | "en"): Promise<ReminderPermissionResult> {
  if (Capacitor.getPlatform() === "ios") return (await NativePermission.ensurePermission({ locale })).status;
  if (Capacitor.isNativePlatform()) {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return "granted";
    if (current.display === "denied") return "denied";
    return (await LocalNotifications.requestPermissions()).display === "granted" ? "granted" : "denied";
  }
  if (typeof Notification === "undefined") return "unsupported";
  // Invoke directly from the user gesture. Never ask during app startup.
  const status = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "cancelled";
}
