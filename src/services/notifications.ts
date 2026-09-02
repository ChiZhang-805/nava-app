import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

const SLEEP_ID = 41001;
const WEEKLY_ID = 41002;

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 22,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 30,
  };
}
async function savePreference(userId: string, type: "sleep" | "weekly_report", localTime: string) {
  if (isDemoMode()) return;
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    notification_type: type,
    enabled: true,
    local_time: localTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    last_scheduled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,notification_type" });
  if (error) {
    if (/notification_preferences|schema cache|does not exist/i.test(error.message)) {
      throw new Error("共享后端尚未启用通知偏好存储，本次提醒设置没有保存到账号。");
    }
    throw error;
  }
}

export async function enableNavaNotifications(userId: string, sleepTime = "22:30") {
  const sleep = parseTime(sleepTime);
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") throw new Error("需要通知权限才能发送睡眠和周报提醒。");
    await LocalNotifications.cancel({ notifications: [{ id: SLEEP_ID }, { id: WEEKLY_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: SLEEP_ID,
          title: "NAVA · 睡眠提醒",
          body: "该准备入睡了，给今天一个安静的收尾。",
          schedule: { on: { hour: sleep.hour, minute: sleep.minute }, allowWhileIdle: true },
          extra: { destination: "records/sleep" },
        },
        {
          id: WEEKLY_ID,
          title: "NAVA · 本周健康报告",
          body: "小猫已经整理好你的跨模块周报。",
          schedule: { on: { weekday: 2, hour: 8, minute: 0 }, allowWhileIdle: true },
          extra: { destination: "reports/weekly" },
        },
      ],
    });
  } else {
    if (!("Notification" in window)) throw new Error("当前浏览器不支持系统通知。");
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") throw new Error("需要通知权限才能发送提醒。");
  }
  await Promise.all([
    savePreference(userId, "sleep", `${sleep.hour.toString().padStart(2, "0")}:${sleep.minute.toString().padStart(2, "0")}`),
    savePreference(userId, "weekly_report", "08:00"),
  ]);
}
