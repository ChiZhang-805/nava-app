import { Bell, ChevronDown, Loader2, Smile, Sunrise, Sun, Sunset, MoonStar, Footprints, Timer, ScanFace, Clock3, Sparkles, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ensureReminderPermission, reminderPermissionGranted } from "../services/reminderPermission";
import { loadEffectiveReminderPreferences, loadReminderPreferences, saveReminderPreference } from "../services/reminderDelivery";
import { localReminderDate, reminderKinds, reminderLabels, type ReminderKind, type ReminderPreferences } from "../services/independentReminders";
import "../styles/reminders.css";
import useDeviceDate from "../hooks/useDeviceDate";

const icons = { mood: Smile, breakfast: Sunrise, lunch: Sun, dinner: Sunset, sleep: MoonStar, exercise: Footprints, focus: Timer, face: ScanFace };
export default function ReminderSettings({ userId, locale, scope = "all", standalone = false }: { userId: string; locale: "zh" | "en"; scope?: "all" | "mood" | "diet" | "sleep"; standalone?: boolean }) {
  const [open, setOpen] = useState(standalone);
  const [preferences, setPreferences] = useState<ReminderPreferences | null>(null);
  const [effective, setEffective] = useState<ReminderPreferences | null>(null);
  const [busy, setBusy] = useState<ReminderKind | "loading" | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef<ReminderKind | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const savingRef = useRef(false);
  const saveRef = useRef<(kind: ReminderKind) => Promise<void>>(async () => {});
  const zh = locale === "zh";
  const deviceDate = useDeviceDate();
  const kinds: readonly ReminderKind[] = scope === "mood" || scope === "sleep" ? [scope] : scope === "diet" ? ["breakfast", "lunch", "dinner"] : reminderKinds;
  useEffect(() => {
    alive.current = true;
    generation.current += 1;
    const resume = async () => {
      if (!alive.current || !pending.current || savingRef.current) return;
      const kind = pending.current; pending.current = null;
      const version = generation.current;
      try { if (await reminderPermissionGranted() && alive.current && version === generation.current) await saveRef.current(kind); }
      catch { if (alive.current && version === generation.current) { setFailed(true); setMessage(locale === "zh" ? "未能核对通知权限，请重试" : "Couldn't check notification access. Retry."); } }
    };
    const visible = () => { if (document.visibilityState === "visible") void resume(); };
    document.addEventListener("visibilitychange", visible);
    const native = Capacitor.isNativePlatform() ? NativeApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void resume(); }) : null;
    return () => { alive.current = false; generation.current += 1; pending.current = null; document.removeEventListener("visibilitychange", visible); void native?.then((listener) => listener.remove()); };
  }, [userId, locale]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy("loading"); setMessage(""); setFailed(false);
    void loadReminderPreferences(userId).then(async (values) => {
      if (alive) setPreferences(values);
      const schedule = await loadEffectiveReminderPreferences(userId, values, localReminderDate(new Date()));
      if (alive) setEffective(schedule);
    }).catch(() => { if (alive) { setFailed(true); setMessage(zh ? "读取失败，请重试" : "Couldn't load settings. Retry."); } })
      .finally(() => { if (alive) setBusy(null); });
    return () => { alive = false; };
  }, [open, userId, zh, reload, deviceDate]);
  useEffect(() => {
    if (!open) return;
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; message: string }>).detail;
      if (detail?.userId === userId) { setFailed(true); setMessage(detail.message); }
    };
    window.addEventListener("nava:reminder-status", onStatus);
    return () => window.removeEventListener("nava:reminder-status", onStatus);
  }, [open, userId]);
  useEffect(() => {
    if (!message || failed) return;
    const timeout = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [message, failed]);
  const save = async (kind: ReminderKind, change: Partial<ReminderPreferences[ReminderKind]>, authorized = false) => {
    if (!preferences || busy || savingRef.current) return;
    savingRef.current = true; pending.current = null;
    const version = generation.current;
    const current = () => alive.current && generation.current === version;
    setBusy(kind); setMessage(""); setFailed(false);
    try {
      if (change.enabled === true && !authorized) {
        const permission = await ensureReminderPermission(locale);
        if (!current()) return;
        if (permission !== "granted") {
          if (permission === "settings") pending.current = kind;
          else if (permission === "denied" || permission === "unsupported") {
            setMessage(zh ? (permission === "denied" ? "请在设置中允许通知后重试" : "此浏览器不支持系统通知") : (permission === "denied" ? "Allow notifications in Settings, then retry" : "System notifications aren't supported in this browser"));
          }
          return;
        }
      }
      if (!current()) return;
      const saved = await saveReminderPreference(userId, kind, { ...preferences[kind], ...change });
      if (!current()) return;
      if (change.enabled === true && Capacitor.isNativePlatform()) {
        // Registration is independent of local scheduling and never prompts or opts in other reminders.
        void import("../services/remotePush").then(({ registerRemotePush }) => registerRemotePush(userId, false)).catch(() => undefined);
      }
      const next = { ...preferences, [kind]: saved };
      setPreferences(next);
      const schedule = await loadEffectiveReminderPreferences(userId, next, localReminderDate(new Date()));
      if (!current()) return;
      setEffective(schedule);
      setMessage(zh ? "已保存" : "Saved");
    } catch { if (current()) { setFailed(true); setMessage(zh ? "请重新读取，核对设置" : "Reload to check your settings"); } }
    finally { savingRef.current = false; if (current()) setBusy(null); }
  };
  saveRef.current = (kind) => save(kind, { enabled: true }, true);
  return <section className={`reminder-settings${standalone ? " is-standalone" : ""}`} data-reminder-settings={scope}>
    {!standalone && <button className="reminder-settings-heading" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Bell size={20} /><strong>{zh ? "提醒设置" : "Reminder settings"}</strong><ChevronDown size={18} className={open ? "is-open" : ""} />
    </button>}
    {open && <div className="reminder-settings-body">
      {busy === "loading" && <span role="status"><Loader2 size={18} />{zh ? "读取中" : "Loading"}</span>}
      {preferences && busy !== "loading" && kinds.map((kind) => {
        const value = preferences[kind]; const Icon = icons[kind]; const label = reminderLabels[kind][zh ? 0 : 1];
        return <div className="reminder-setting-row" key={kind} data-reminder-kind={kind} data-enabled={value.enabled}>
          <div className="reminder-item-heading"><span className="reminder-item-icon"><Icon size={22} /></span><strong>{label}</strong>
            <button type="button" className="reminder-switch" role="switch" aria-checked={value.enabled} aria-label={`${label}${zh ? "提醒" : " reminder"}`} disabled={!!busy} onClick={() => void save(kind, { enabled: !value.enabled })}><span /></button>
          </div>
          {value.enabled && <div className="reminder-item-controls">
            <div className="reminder-mode" role="group" aria-label={`${label}${zh ? "提醒方式" : " timing"}`}>
              <button type="button" aria-pressed={value.mode === "smart"} disabled={!!busy} onClick={() => void save(kind, { mode: "smart" })}><Sparkles size={15} />{zh ? "智能" : "Smart"}</button>
              <button type="button" aria-pressed={value.mode === "fixed"} disabled={!!busy} onClick={() => void save(kind, { mode: "fixed" })}><Clock3 size={15} />{zh ? "固定时间" : "Fixed time"}</button>
            </div>
            {value.mode === "fixed" ? <input type="time" aria-label={`${label}${zh ? "提醒时间" : " reminder time"}`} value={value.localTime} disabled={!!busy} onChange={(event) => { if (event.target.validity.valid && event.target.value) void save(kind, { localTime: event.target.value }); }} />
              : <span className="reminder-smart-time" aria-label={`${label}${zh ? "预计提醒时间" : " planned time"}`}>{zh ? "预计" : "Around"}<time>{effective?.[kind].localTime ?? "—"}</time></span>}
          </div>}
        </div>;
      })}
      {message && <div className={`reminder-feedback ${failed ? "reminder-error" : "reminder-saved"}`}><span role={failed ? "alert" : "status"}>{message}</span>{failed && <button type="button" onClick={() => setReload((v) => v + 1)}><RotateCcw size={16} />{zh ? "重试" : "Retry"}</button>}</div>}
    </div>}
  </section>;
}
