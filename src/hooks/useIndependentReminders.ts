import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { listNavaNotifications, notificationPermissionState, publishNavaNotification, type NavaNotificationItem } from "../services/notifications";
import { localReminderDate, reminderAt, reminderChangeEvent, reminderEligibility, reminderKinds, reminderOccurrenceId, reminderPreviewEvent, reminderSavedEvent, type ReminderKind } from "../services/independentReminders";
import { cancelSavedReminder, loadReminderEvidence, loadReminderPreferences, reconcileNativeReminders, reminderMessage } from "../services/reminderDelivery";

export default function useIndependentReminders(userId: string | null, date: string, refreshKey: number, locale: "zh" | "en", present: (item: NavaNotificationItem) => void) {
  const presentRef = useRef(present);
  presentRef.current = present;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let generation = 0;
    let tail: Promise<unknown> = Promise.resolve();
    let lastRefresh = 0;
    const run = (preview?: { kind: ReminderKind; resolve: (value: string) => void }) => {
      const version = generation;
      const current = () => alive && version === generation;
      tail = tail.catch(() => undefined).then(async () => {
        if (!current()) { preview?.resolve("设置或记录已变化，请重新模拟。"); return; }
        const preferences = await loadReminderPreferences(userId);
        const now = new Date();
        const day = localReminderDate(now);
        const evidence = await loadReminderEvidence(userId, day);
        if (!current()) { preview?.resolve("设置或记录已变化，请重新模拟。"); return; }
        if (preview) {
          const state = reminderEligibility(preview.kind, preferences, evidence, reminderAt(now, preferences[preview.kind].localTime));
          if (state === "due") presentRef.current({ ...reminderMessage(preview.kind, day, locale), id: `preview:${reminderOccurrenceId(preview.kind, day)}` });
          preview.resolve(state === "due" ? "模拟提醒已显示；点击可进入对应记录。" : state === "disabled" ? "该提醒已关闭，不会触发。" : state === "recorded" ? "今天这一项已有记录，不重复提醒。" : "暂时无法核对，请重试。");
          return;
        }
        await reconcileNativeReminders(userId, preferences, evidence, locale, current);
        const nativeDelivery = Capacitor.isNativePlatform() && await notificationPermissionState() === "granted";
        if (!current() || nativeDelivery) return;
        for (const kind of reminderKinds) {
          if (reminderEligibility(kind, preferences, evidence, now) !== "due") continue;
          if (listNavaNotifications(userId, true).some((item) => item.id === reminderOccurrenceId(kind, day))) continue;
          publishNavaNotification(userId, reminderMessage(kind, day, locale), { present: true });
        }
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "提醒核对失败，请重试。";
        preview?.resolve(message);
        if (alive && !preview) window.dispatchEvent(new CustomEvent("nava:reminder-status", { detail: { userId, message } }));
      });
    };
    const refresh = () => {
      if (Date.now() - lastRefresh < 800) return;
      lastRefresh = Date.now();
      run();
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; date?: string; kind?: ReminderKind; preference?: { enabled: boolean } }>).detail;
      if (detail.userId !== userId || (detail.date && detail.date !== localReminderDate(new Date()))) return;
      generation++;
      if (detail.kind && (detail.date || detail.preference?.enabled === false)) {
        void cancelSavedReminder(userId, detail.kind, detail.date).catch(() => window.dispatchEvent(new CustomEvent("nava:reminder-status", { detail: { userId, message: "设备提醒取消失败，请重新打开应用核对。" } })));
      }
      run();
    };
    const visibility = () => { if (document.visibilityState === "visible") refresh(); };
    const preview = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: ReminderKind; resolve: (value: string) => void }>).detail;
      if (reminderKinds.includes(detail.kind)) run(detail);
    };
    refresh();
    // One bounded timer for the whole app, not one timer per module or reminder.
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener(reminderChangeEvent, changed);
    window.addEventListener(reminderSavedEvent, changed);
    window.addEventListener(reminderPreviewEvent, preview);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener(reminderChangeEvent, changed);
      window.removeEventListener(reminderSavedEvent, changed);
      window.removeEventListener(reminderPreviewEvent, preview);
    };
  }, [userId, date, refreshKey, locale]);
  useEffect(() => () => {
    if (userId) void reconcileNativeReminders(userId, null, null, "zh").catch(() => undefined);
  }, [userId]);
}
