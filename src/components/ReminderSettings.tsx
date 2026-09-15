import { Bell, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { loadReminderPreferences, saveReminderPreference } from "../services/reminderDelivery";
import { notificationPermissionState } from "../services/notifications";
import { reminderLabels, type ReminderKind, type ReminderPreferences } from "../services/independentReminders";
import "../styles/reminders.css";

export default function ReminderSettings({ userId, locale, scope = "all" }: { userId: string; locale: "zh" | "en"; scope?: "all" | "mood" | "diet" }) {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<ReminderPreferences | null>(null);
  const [busy, setBusy] = useState<ReminderKind | "loading" | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [permission, setPermission] = useState("prompt");
  const zh = locale === "zh";
  const kinds: ReminderKind[] = scope === "mood" ? ["mood"] : scope === "diet" ? ["breakfast", "lunch", "dinner"] : ["mood", "breakfast", "lunch", "dinner"];
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy("loading"); setMessage(""); setFailed(false);
    void Promise.all([loadReminderPreferences(userId), notificationPermissionState()]).then(([values, state]) => {
      if (alive) { setPreferences(values); setPermission(state); }
    }).catch(() => { if (alive) { setFailed(true); setMessage(zh ? "提醒设置读取失败，请关闭后重试。" : "Unable to load settings. Reopen to retry."); } })
      .finally(() => { if (alive) setBusy(null); });
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; message: string }>).detail;
      if (detail.userId === userId) { setFailed(true); setMessage(detail.message); }
    };
    window.addEventListener("nava:reminder-status", onStatus);
    return () => { alive = false; window.removeEventListener("nava:reminder-status", onStatus); };
  }, [open, userId, zh]);
  const save = async (kind: ReminderKind, change: Partial<ReminderPreferences[ReminderKind]>) => {
    if (!preferences || busy) return;
    setBusy(kind); setMessage(""); setFailed(false);
    try {
      const saved = await saveReminderPreference(userId, kind, { ...preferences[kind], ...change });
      setPreferences((current) => current && { ...current, [kind]: saved });
      setMessage(zh ? "已保存到账号" : "Saved to your account");
    } catch { setFailed(true); setMessage(zh ? "尚未确认保存，请重新打开核对后重试。" : "Save not confirmed. Reopen to check before retrying."); }
    finally { setBusy(null); }
  };
  return <section className="reminder-settings" data-reminder-settings={scope}>
    <button className="reminder-settings-heading" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Bell size={20} /><strong>{zh ? "提醒设置" : "Reminder settings"}</strong><ChevronDown size={18} className={open ? "is-open" : ""} />
    </button>
    {open && <div className="reminder-settings-body">
      <p>{zh ? "每天独立提醒；当天保存后不再提醒该项。时间按设备所在地执行。" : "Daily, independent reminders. A saved entry skips today's reminder. Times follow your device's local clock."}</p>
      {busy === "loading" && <span role="status"><Loader2 size={18} />{zh ? "读取设置中" : "Loading settings"}</span>}
      {preferences && busy !== "loading" && kinds.map((kind) => <div className="reminder-setting-row" key={kind} data-reminder-kind={kind}>
        <span>{reminderLabels[kind][zh ? 0 : 1]}</span>
        <input type="time" aria-label={`${reminderLabels[kind][zh ? 0 : 1]}${zh ? "提醒时间" : " reminder time"}`} value={preferences[kind].localTime} disabled={!!busy} onChange={(event) => { if (event.target.validity.valid && event.target.value) void save(kind, { localTime: event.target.value }); }} />
        <button type="button" className="reminder-switch" role="switch" aria-checked={preferences[kind].enabled} aria-label={`${reminderLabels[kind][zh ? 0 : 1]}${zh ? "提醒" : " reminder"}`} disabled={!!busy} onClick={() => void save(kind, { enabled: !preferences[kind].enabled })}><span /></button>
      </div>)}
      <p className="reminder-delivery-note">{zh ? (permission === "granted" ? "网页关闭后无法保证提醒送达；锁屏提醒需安装版及系统权限。" : "系统通知未授权；网页打开时仍有应用内提醒。") : (permission === "granted" ? "Closed web pages cannot guarantee delivery. Lock-screen alerts require the installed app and system permission." : "System alerts are not authorized. In-app reminders still work while the page is open.")}</p>
      {message && <p role={failed ? "alert" : "status"} className={failed ? "reminder-error" : "reminder-saved"}>{message}</p>}
    </div>}
  </section>;
}
