import { ArrowLeft, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import ReminderSettings from "../components/ReminderSettings";
import { enableNavaNotificationSuite, notificationPermissionState } from "../services/notifications";

export default function ReminderSettingsPage({ userId, locale, onBack }: { userId: string; locale: "zh" | "en"; onBack: () => void }) {
  const [permission, setPermission] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zh = locale === "zh";
  useEffect(() => { void notificationPermissionState().then(setPermission); }, []);
  const enable = async () => {
    setBusy(true); setError("");
    try { await enableNavaNotificationSuite(userId, "22:30", locale); }
    catch { setError(zh ? "未获得通知权限" : "Notification permission not granted"); }
    finally { setPermission(await notificationPermissionState()); setBusy(false); }
  };
  return <section className="home-experience reminder-settings-page" data-reminder-page>
    <header className="home-experience-header"><button type="button" className="home-experience-back" onClick={onBack} aria-label={zh ? "返回通知中心" : "Back to notifications"}><ArrowLeft size={21} /></button><div><h1>{zh ? "提醒设置" : "Reminder settings"}</h1></div><span className="reminder-header-spacer" /></header>
    <ReminderSettings userId={userId} locale={locale} standalone />
    <div className="reminder-system-permission"><BellRing size={21} /><strong>{zh ? "系统通知" : "System notifications"}</strong><button type="button" disabled={busy || ["granted", "unsupported", "checking"].includes(permission)} onClick={() => void enable()}>{busy ? (zh ? "开启中" : "Enabling") : permission === "granted" ? (zh ? "已开启" : "Enabled") : permission === "unsupported" ? (zh ? "不可用" : "Unavailable") : (zh ? "开启" : "Enable")}</button></div>
    {error && <p className="reminder-error" role="alert">{error}</p>}
  </section>;
}
