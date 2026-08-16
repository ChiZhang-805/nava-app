import {
  Activity,
  ArrowLeft,
  Bell,
  BellOff,
  Bluetooth,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Gauge,
  HeartPulse,
  MoonStar,
  Pause,
  Play,
  PhoneIncoming,
  Plus,
  RefreshCw,
  Square,
  TimerReset,
  TrendingUp,
  Watch,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useLocale } from "../i18n";
import type { RecordModule } from "./RecordsScreen";

type MoodFactor = { value: string; label: string };

type Props = {
  module: RecordModule;
  moodScore: number;
  setMoodScore: (value: number) => void;
  moodFactors: MoodFactor[];
  selectedFactors: string[];
  toggleFactor: (value: string) => void;
  diary: string;
  setDiary: (value: string) => void;
  onSaveMood: (event: FormEvent<HTMLFormElement>) => void;
  sleepStart: string;
  sleepEnd: string;
  deepSleep: number;
  lightSleep: number;
  remSleep: number;
  sleepRating: number;
  steps: number;
  calories: number;
  exerciseMinutes: number;
  focusTitle: string;
  focusMinutes: number;
  setFocusTitle: (value: string) => void;
  setFocusMinutes: (value: number) => void;
  onOpenEditor: () => void;
  onSaveFocusMinutes: (minutes: number) => Promise<void>;
  busy: string | null;
  initialView?: string | null;
  onViewChange?: (view: string | null) => void;
};

const moodFaces = [
  { score: 88, zh: "愉悦", en: "Bright" },
  { score: 76, zh: "平静", en: "Calm" },
  { score: 62, zh: "一般", en: "Neutral" },
  { score: 46, zh: "疲惫", en: "Tired" },
  { score: 30, zh: "低落", en: "Low" },
];

const focusBars = [18, 34, 52, 77];
const stepBars = [9, 12, 8, 10, 14, 12, 11, 15, 13, 17, 20, 28, 38, 45, 28, 29, 27, 31, 54, 33, 64, 38, 18, 12];

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function AssistantCard({ text, onClick }: { text: string; onClick?: () => void }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };

  return (
    <section
      className={["figma-module-card", "module-assistant-card", onClick ? "is-interactive" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="module-assistant-icon"><Activity size={18} /></span>
      <div><strong>NAVA</strong><p>{text}</p></div>
      {onClick && <span className="module-assistant-arrow" aria-hidden="true"><ChevronRight size={18} /></span>}
    </section>
  );
}

function ModuleDetailView({
  title,
  locale,
  onBack,
  children,
}: {
  title: string;
  locale: "zh" | "en";
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="module-dashboard module-subview" data-module-view="module-subview">
      <button className="module-inline-back" type="button" onClick={onBack}><ArrowLeft size={18} />{locale === "zh" ? "返回" : "Back"}</button>
      <section className="figma-module-card module-subview-card">
        <header><strong>{title}</strong></header>
        {children}
      </section>
    </div>
  );
}

function HistoryView({ module, locale, onBack }: { module: RecordModule; locale: "zh" | "en"; onBack: () => void }) {
  const moduleNames: Record<RecordModule, { zh: string; en: string }> = {
    mood: { zh: "情绪", en: "Mood" },
    sleep: { zh: "睡眠", en: "Sleep" },
    exercise: { zh: "运动", en: "Activity" },
    diet: { zh: "饮食", en: "Diet" },
    focus: { zh: "专注", en: "Focus" },
    face: { zh: "面部", en: "Face" },
  };
  const values = module === "mood" ? [76, 81, 74, 88, 83, 79, 86] : module === "sleep" ? [78, 81, 73, 84, 80, 86, 83] : [62, 75, 69, 82, 77, 88, 84];
  return (
    <ModuleDetailView title={`${moduleNames[module][locale]}${locale === "zh" ? "历史记录" : " history"}`} locale={locale} onBack={onBack}>
      <div className="module-history-chart" aria-label={locale === "zh" ? "近七天记录" : "Last seven days"}>
        {values.map((value, index) => <span key={index}><i style={{ height: `${value}%` }} /><small>{locale === "zh" ? `${index + 1}日` : `D${index + 1}`}</small></span>)}
      </div>
      <div className="module-history-list">
        {[0, 1, 2].map((index) => <p key={index}><CalendarDays size={16} /><span>{locale === "zh" ? `最近第 ${index + 1} 次记录` : `Recent entry ${index + 1}`}</span><strong>{values[6 - index]}</strong></p>)}
      </div>
    </ModuleDetailView>
  );
}

function ExerciseDashboard({
  locale,
  steps,
  calories,
  exerciseMinutes,
  onOpenEditor,
  view,
  openView,
}: Pick<Props, "steps" | "calories" | "exerciseMinutes" | "onOpenEditor"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(locale === "zh" ? "3 分钟前" : "3 min ago");

  const sync = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      setSyncedAt(locale === "zh" ? "刚刚" : "Just now");
    }, 760);
  };

  if (view === "detail") {
    return (
      <div className="module-dashboard exercise-detail-dashboard" data-module-view="exercise-detail">
        <button className="module-inline-back" type="button" onClick={() => openView("overview")}>
          <ArrowLeft size={18} /> {locale === "zh" ? "今日运动" : "Today"}
        </button>
        <section className="figma-module-card energy-card">
          <div><span>{locale === "zh" ? "今日能量消耗" : "Energy burned"}</span><strong>{calories}<small>/1300 kcal</small></strong><p>{locale === "zh" ? "差一点点就达标了，继续保持。" : "Almost at the goal. Keep moving."}</p></div>
          <div className="progress-ring exercise-ring" style={{ "--progress": `${Math.min(100, Math.round(calories / 13))}%` } as CSSProperties}><span>{Math.round((calories / 1300) * 100)}%</span></div>
        </section>
        <section className="figma-module-card steps-card">
          <header><span>{locale === "zh" ? "今日步数" : "Steps today"}</span><strong>{steps.toLocaleString()}<small>{locale === "zh" ? "步" : "steps"}</small></strong></header>
          <div className="steps-bars" aria-label={locale === "zh" ? "每小时步数" : "Hourly steps"}>
            {stepBars.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
          </div>
        </section>
        <section className="figma-module-card activity-card">
          <header><strong>{locale === "zh" ? "运动" : "Activities"}</strong><button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "添加运动" : "Add activity"}><Plus size={18} /></button></header>
          <div className="activity-chips">
            <span>{locale === "zh" ? "中等强度" : "Moderate"}<strong>{exerciseMinutes} min</strong></span>
            <span>{locale === "zh" ? "跑步" : "Run"}<strong>40 min</strong></span>
            <span>{locale === "zh" ? "步行" : "Walk"}<strong>18 min</strong></span>
          </div>
          <div className="day-distribution">
            {["0-6", "6-12", "12-18", "18-24"].map((label, index) => <span key={label} className={index > 1 ? "active" : ""}><i style={{ height: `${28 + index * 13}px` }} />{label}</span>)}
          </div>
        </section>
      </div>
    );
  }

  if (view === "device") return <ModuleDetailView title={locale === "zh" ? "运动设备" : "Activity devices"} locale={locale} onBack={() => openView("overview")}><div className="device-picker"><button className="selected" type="button"><Watch />Apple Watch S11<Check /></button><button type="button"><Bluetooth />{locale === "zh" ? "连接其他设备" : "Connect another device"}<Plus /></button></div></ModuleDetailView>;
  if (view === "vitals") return <ModuleDetailView title={locale === "zh" ? "健康指标" : "Health metrics"} locale={locale} onBack={() => openView("overview")}><div className="metric-detail-grid"><span><HeartPulse /><small>{locale === "zh" ? "静息心率" : "Resting HR"}</small><strong>72 bpm</strong></span><span><Activity /><small>{locale === "zh" ? "血氧" : "SpO2"}</small><strong>98%</strong></span><span><Gauge /><small>{locale === "zh" ? "恢复度" : "Recovery"}</small><strong>84</strong></span></div></ModuleDetailView>;
  if (view === "heatmap") return <ModuleDetailView title={locale === "zh" ? "节律热力图" : "Rhythm heatmap"} locale={locale} onBack={() => openView("overview")}><div className="detail-heatmap">{Array.from({ length: 84 }, (_, index) => <i key={index} style={{ opacity: 0.18 + ((index * 17) % 8) * 0.1 }} />)}</div><p>{locale === "zh" ? "18:00-20:00 是今天最稳定的活动窗口。" : "18:00-20:00 is today's most stable activity window."}</p></ModuleDetailView>;
  if (view === "clock") return <ModuleDetailView title={locale === "zh" ? "生物钟同步" : "Clock alignment"} locale={locale} onBack={() => openView("overview")}><div className="clock-alignment"><Gauge /><strong>84%</strong><p>{locale === "zh" ? "活动、睡眠与日照节律保持一致。" : "Activity, sleep and daylight rhythms are aligned."}</p></div></ModuleDetailView>;
  if (view === "sports") return <ModuleDetailView title="NAVA Sports" locale={locale} onBack={() => openView("overview")}><div className="sports-plan"><Activity /><strong>{locale === "zh" ? "晚间轻运动计划" : "Evening light workout"}</strong><p>{locale === "zh" ? "8 分钟热身 · 18 分钟低强度有氧 · 5 分钟拉伸" : "8 min warm-up · 18 min light cardio · 5 min stretch"}</p><button type="button" onClick={onOpenEditor}>{locale === "zh" ? "记录本次运动" : "Log this workout"}</button></div></ModuleDetailView>;

  return (
    <div className="module-dashboard exercise-dashboard" data-module-view="exercise-overview">
      <div className="exercise-grid">
        <section className="figma-module-card exercise-device-card">
          <header><button type="button" onClick={() => openView("device")}><span>{locale === "zh" ? "设备" : "Device"}</span><ChevronRight size={18} /></button></header>
          <Watch size={48} strokeWidth={1.7} />
          <p>Apple Watch S11</p><small>{syncedAt}</small>
          <button type="button" onClick={sync} disabled={syncing}><RefreshCw className={syncing ? "spin" : ""} size={16} />{locale === "zh" ? "重新同步" : "Sync"}</button>
        </section>
        <button className="figma-module-card exercise-data-card" type="button" onClick={() => openView("detail")} aria-label={locale === "zh" ? "查看运动详情" : "View activity details"}>
          <header><span>{locale === "zh" ? "运动数据" : "Activity"}</span><ChevronRight size={18} /></header>
          <div className="mini-donut" />
          <strong>{calories}<small>/1300 kcal</small></strong>
          <p>{locale === "zh" ? "中等强度" : "Moderate"}<b>{steps.toLocaleString()} {locale === "zh" ? "步" : "steps"}</b></p>
        </button>
        <button className="figma-module-card health-card" type="button" onClick={() => openView("vitals")}>
          <header><span>{locale === "zh" ? "健康" : "Vitals"}</span><ChevronRight size={18} /></header>
          <HeartPulse size={43} />
          <p>{locale === "zh" ? "血氧 98% · 心率 72" : "SpO2 98% · HR 72"}</p>
        </button>
        <button className="figma-module-card heat-card" type="button" onClick={() => openView("heatmap")}>
          <header><span>{locale === "zh" ? "节律热力图" : "Rhythm map"}</span><ChevronRight size={18} /></header>
          <div className="heat-orbit"><span /><i /></div>
          <p>{locale === "zh" ? "活跃峰值 18:30" : "Peak 18:30"}</p>
        </button>
        <button className="figma-module-card clock-sync-card" type="button" onClick={() => openView("clock")}>
          <header><span>{locale === "zh" ? "生物钟同步" : "Clock sync"}</span><ChevronRight size={18} /></header>
          <Gauge size={37} /><strong>84%</strong>
        </button>
        <button className="figma-module-card assessment-card" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "填写运动自评" : "Edit self assessment"}>
          <header><span>{locale === "zh" ? "自我评估" : "Self check"}</span><ChevronRight size={18} /></header>
          <p>{locale === "zh" ? "今日待填写" : "Pending today"}</p><span>{locale === "zh" ? "编辑" : "Edit"}</span>
        </button>
      </div>
      <AssistantCard onClick={() => openView("sports")} text={locale === "zh" ? "下午的活动峰值稳定，晚间安排轻运动更适合今天的节律。" : "Your afternoon activity peak is steady. Keep the evening light."} />
    </div>
  );
}

function MoodDashboard(props: Props & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { locale, moodScore, setMoodScore, moodFactors, selectedFactors, toggleFactor, diary, setDiary, onSaveMood, busy, view, openView } = props;
  const [saved, setSaved] = useState(false);
  const selectedFace = moodFaces.reduce((best, face) => Math.abs(face.score - moodScore) < Math.abs(best.score - moodScore) ? face : best, moodFaces[0]);

  if (view === "trend") return <ModuleDetailView title={locale === "zh" ? "情绪趋势" : "Mood trend"} locale={locale} onBack={() => openView("overview")}><div className="expanded-line-chart"><TrendingUp />{[58, 70, 64, 82, 76, 88, moodScore].map((value, index) => <span key={index} style={{ height: `${value}%` }}><i />{value}</span>)}</div><p>{locale === "zh" ? "过去七天情绪波动收窄，晚间记录最完整。" : "Mood variability narrowed over seven days, with the best coverage in the evening."}</p></ModuleDetailView>;

  return (
    <form className="module-dashboard mood-dashboard" onSubmit={(event) => { onSaveMood(event); setSaved(true); openView("overview"); }} data-module-view="mood-overview">
      <section className="figma-module-card mood-entry-card">
        <header><strong>{locale === "zh" ? "情绪记录" : "Mood check-in"}</strong><button type="button" onClick={() => openView("journal")} aria-label={locale === "zh" ? "打开情绪日记" : "Open mood journal"}><ChevronRight size={18} /></button></header>
        <div className="mood-face-row">
          {moodFaces.map((face) => (
            <button className={Math.abs(face.score - moodScore) < 8 ? "selected" : ""} key={face.score} type="button" onClick={() => setMoodScore(face.score)}>
              <span><HeartPulse size={22} /></span><small>{locale === "zh" ? face.zh : face.en}</small>
            </button>
          ))}
        </div>
        <label className="mood-intensity"><span>{locale === "zh" ? "情绪强度" : "Intensity"}<strong>{moodScore}</strong></span><input type="range" min="0" max="100" value={moodScore} onChange={(event) => setMoodScore(Number(event.target.value))} /></label>
        <div className="mood-factor-row">
          <span>{locale === "zh" ? "主要原因" : "Main cause"}</span>
          <select value={selectedFactors[0] ?? ""} onChange={(event) => { if (event.target.value) toggleFactor(event.target.value); }}>
            <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
            {moodFactors.map((factor) => <option key={factor.value} value={factor.value}>{factor.label}</option>)}
          </select>
        </div>
        <button className="mood-diary-trigger" type="button" onClick={() => openView("journal")} aria-label={locale === "zh" ? "填写情绪日记" : "Write mood journal"}>{diary || (locale === "zh" ? "写下今天的情绪" : "Write a mood note")}</button>
        <p className="module-save-state">{saved ? <><Check size={14} />{locale === "zh" ? "已保存" : "Saved"}</> : `${locale === "zh" ? "当前" : "Current"} · ${locale === "zh" ? selectedFace.zh : selectedFace.en}`}</p>
      </section>
      <section className="figma-module-card mood-trend-card">
        <header><strong>{locale === "zh" ? "近 7 天情绪趋势" : "7-day mood"}</strong><button type="button" onClick={() => openView("trend")} aria-label={locale === "zh" ? "查看情绪趋势" : "View mood trend"}><ChevronRight size={18} /></button></header>
        <div className="mood-chart"><div className="mood-line" />{[58, 70, 64, 82, 76, 88, moodScore].map((value, index) => <i key={index} style={{ left: `${7 + index * 14.2}%`, bottom: `${18 + value * 0.48}%` }} />)}</div>
        <div className="mood-pie" />
      </section>
      <AssistantCard text={locale === "zh" ? "情绪强度整体平稳。记录触发原因后，我会帮你找到重复出现的节律线索。" : "Mood intensity is stable. Add a cause to reveal recurring rhythm patterns."} />
      {view === "journal" && (
        <div className="module-modal" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "情绪日记" : "Mood journal"}>
          <div className="module-modal-card">
            <header><strong>{locale === "zh" ? "情绪日记" : "Mood journal"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header>
            <textarea autoFocus value={diary} onChange={(event) => setDiary(event.target.value)} placeholder={locale === "zh" ? "写下此刻发生的事……" : "What happened just now?"} />
            <div><button type="button" onClick={() => openView("overview")}>{locale === "zh" ? "取消" : "Cancel"}</button><button type="submit" disabled={busy !== null}>{locale === "zh" ? "保存" : "Save"}</button></div>
          </div>
        </div>
      )}
    </form>
  );
}

function SleepDashboard(props: Pick<Props, "sleepStart" | "sleepEnd" | "deepSleep" | "lightSleep" | "remSleep" | "sleepRating" | "onOpenEditor"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { locale, sleepStart, sleepEnd, deepSleep, lightSleep, remSleep, sleepRating, onOpenEditor, view, openView } = props;
  const todayKey = `nava-sleep-alert-dismissed:${new Date().toISOString().slice(0, 10)}`;
  const [alertVisible, setAlertVisible] = useState(() => window.sessionStorage.getItem(todayKey) !== "1");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const total = Math.max(1, deepSleep + lightSleep + remSleep);
  const score = Math.round(58 + sleepRating * 5.5);

  const enableNotification = async () => {
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    setNotificationEnabled(true);
  };

  if (view === "trend") return <ModuleDetailView title={locale === "zh" ? "睡眠趋势" : "Sleep trend"} locale={locale} onBack={() => openView("overview")}><div className="expanded-sleep-chart">{[66, 74, 58, 83, 78, 90, 81].map((value, index) => <span key={index}><i style={{ height: `${value}%` }} /><small>{value}</small></span>)}</div><p>{locale === "zh" ? "入睡时间正在提前，深睡连续性较上周提升。" : "Bedtime is moving earlier and deep-sleep continuity improved."}</p></ModuleDetailView>;

  return (
    <div className="module-dashboard sleep-dashboard" data-module-view="sleep-overview">
      {alertVisible && <section className="sleep-alert"><MoonStar size={20} /><button className="sleep-alert-copy" type="button" onClick={() => openView("alert")}><strong>{locale === "zh" ? "作息异常提醒" : "Sleep rhythm alert"}</strong><p>{locale === "zh" ? "昨晚入睡时间偏晚，今天建议提前 30 分钟放松。" : "Bedtime was late. Start winding down 30 minutes earlier."}</p></button><button type="button" onClick={() => setAlertVisible(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={18} /></button></section>}
      <section className="figma-module-card sleep-summary-card">
        <header><strong>{locale === "zh" ? "睡眠摘要" : "Sleep summary"}</strong><button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "更新睡眠记录" : "Update sleep record"}>{locale === "zh" ? "设备导入 / 更新" : "Import / update"}</button><ChevronRight size={18} /></header>
        <div className="sleep-timeline"><span>{sleepStart}</span><div><i style={{ left: "14%", width: "61%" }} /></div><span>{sleepEnd}</span></div>
        <div className="sleep-stage-row">
          <div className="sleep-stage-shape"><i style={{ flex: deepSleep / total }} /><i style={{ flex: lightSleep / total }} /><i style={{ flex: remSleep / total }} /></div>
          <ul><li><i />{locale === "zh" ? "深睡" : "Deep"}</li><li><i />{locale === "zh" ? "浅睡" : "Light"}</li><li><i />REM</li></ul>
          <strong>{score}<small>{locale === "zh" ? "分" : "pts"}</small></strong>
        </div>
      </section>
      <section className="figma-module-card sleep-trend-card">
        <header><strong>{locale === "zh" ? "7 日趋势" : "7-day trend"}</strong><button type="button" onClick={() => openView("trend")} aria-label={locale === "zh" ? "查看睡眠趋势" : "View sleep trend"}><ChevronRight size={18} /></button></header>
        <div className="sleep-bars">{[66, 74, 58, 83, 78, 90, 81].map((height, index) => <span key={index}><i style={{ height: `${height}%` }} /><small>{locale === "zh" ? "一二三四五六日"[index] : "SMTWTFS"[index]}</small></span>)}</div>
      </section>
      <AssistantCard text={locale === "zh" ? "深睡阶段连续性不错。今晚保持固定的睡前时间，比补觉更有帮助。" : "Deep sleep continuity looks good. A consistent bedtime will help more than catching up."} />
      {view === "alert" && <div className="module-modal" role="dialog" aria-modal="true"><div className="module-modal-card sleep-alert-modal"><header><strong>{locale === "zh" ? "睡眠提醒" : "Sleep reminder"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header><div className="lock-screen-preview"><Bell size={24} /><strong>NAVA</strong><p>{locale === "zh" ? "该准备入睡了，给今天一个安静的收尾。" : "Time to wind down and close the day quietly."}</p></div><button type="button" onClick={() => void enableNotification()}>{notificationEnabled ? <BellOff size={18} /> : <Bell size={18} />}{notificationEnabled ? (locale === "zh" ? "提醒已开启" : "Reminder enabled") : (locale === "zh" ? "开启锁屏提醒" : "Enable lock-screen reminder")}</button><button type="button" onClick={() => { window.sessionStorage.setItem(todayKey, "1"); setAlertVisible(false); openView("overview"); }}>{locale === "zh" ? "今天不再提醒" : "Not again today"}</button></div></div>}
    </div>
  );
}

function FocusDashboard(props: Pick<Props, "focusTitle" | "focusMinutes" | "setFocusTitle" | "setFocusMinutes" | "onSaveFocusMinutes"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { locale, focusTitle, focusMinutes, setFocusTitle, setFocusMinutes, onSaveFocusMinutes, view, openView } = props;
  const immersive = view === "immersive" || view === "interruption";
  const [running, setRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!immersive || !running) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [immersive, running]);

  useEffect(() => {
    if (!immersive) setRemaining(focusMinutes * 60);
  }, [focusMinutes, immersive]);

  const progress = 100 - (remaining / Math.max(1, focusMinutes * 60)) * 100;

  const finish = async () => {
    setRunning(false);
    setSaving(true);
    const elapsed = Math.max(1, Math.ceil((focusMinutes * 60 - remaining) / 60));
    await onSaveFocusMinutes(elapsed);
    setSaving(false);
    setSaved(true);
    openView("overview");
  };

  if (immersive) {
    return (
      <div className="module-dashboard focus-immersive" data-module-view="focus-immersive">
        <button className="module-inline-back" type="button" onClick={() => { setRunning(false); openView("overview"); }}><ArrowLeft size={18} />{locale === "zh" ? "专注记录" : "Focus"}</button>
        <label className="focus-title-field"><input value={focusTitle} onChange={(event) => setFocusTitle(event.target.value)} /><span>{focusMinutes}{locale === "zh" ? " 分钟" : " min"}</span></label>
        <div className="focus-timer-ring" style={{ "--timer-progress": `${progress}%` } as CSSProperties}>
          <div><strong>{formatDuration(remaining)}</strong><span>{running ? (locale === "zh" ? "专注中" : "Focusing") : hasStarted ? (locale === "zh" ? "已暂停" : "Paused") : (locale === "zh" ? "准备开始" : "Ready")}</span></div>
        </div>
        <div className="focus-controls">
          <button type="button" onClick={() => { setRemaining(focusMinutes * 60); setRunning(false); }} aria-label={locale === "zh" ? "重置" : "Reset"}><TimerReset /></button>
          <button className="primary" type="button" onClick={() => { setHasStarted(true); setRunning((value) => !value); }} aria-label={running ? (locale === "zh" ? "暂停" : "Pause") : (locale === "zh" ? "开始" : "Start")}>{running ? <Pause /> : <Play />}</button>
          <button type="button" onClick={() => void finish()} disabled={saving} aria-label={locale === "zh" ? "结束" : "Finish"}><Square /></button>
        </div>
        <button className="focus-interruption-trigger" type="button" onClick={() => { setRunning(false); openView("interruption"); }}><PhoneIncoming size={17} />{locale === "zh" ? "模拟来电打断" : "Simulate interruption"}</button>
        <p className="focus-immersive-hint">{locale === "zh" ? "一次只做一件事。" : "One thing at a time."}</p>
        {view === "interruption" && <div className="focus-interruption" role="dialog" aria-modal="true"><PhoneIncoming size={38} /><strong>{locale === "zh" ? "来电打断" : "Incoming call"}</strong><p>{locale === "zh" ? "专注计时已自动暂停" : "Focus timer paused automatically"}</p><div><button type="button" onClick={() => { setRunning(true); setHasStarted(true); openView("immersive"); }}>{locale === "zh" ? "继续专注" : "Keep focusing"}</button><button type="button" onClick={() => openView("immersive")}>{locale === "zh" ? "接听并暂停" : "Answer and pause"}</button></div></div>}
      </div>
    );
  }

  return (
    <div className="module-dashboard focus-dashboard" data-module-view="focus-overview">
      <section className="figma-module-card focus-summary-card">
        <header><strong>{locale === "zh" ? "今日专注数据摘要" : "Today's focus"}</strong><button className={saved ? "success" : ""} type="button" onClick={() => { setSaved(false); setHasStarted(false); openView("immersive"); }} aria-label={saved ? (locale === "zh" ? "专注已记录" : "Focus saved") : (locale === "zh" ? "开始专注" : "Start focus")}>{saved ? <Check size={19} /> : <><CirclePlay size={18} />{locale === "zh" ? "开始" : "Start"}</>}</button></header>
        <p>{locale === "zh" ? "今日共计专注" : "Sessions"}<strong>9</strong>{locale === "zh" ? "次" : ""}<span>{locale === "zh" ? "总时长" : "Total"}<b>5</b>{locale === "zh" ? "小时" : "h"}<b>36</b>{locale === "zh" ? "分" : "m"}</span></p>
      </section>
      <div className="focus-grid">
        <section className="figma-module-card focus-period-card"><header>{locale === "zh" ? "专注时间分布" : "Time distribution"}</header><div>{focusBars.map((height, index) => <span key={index}><i style={{ height: `${height}%` }} /><small>{locale === "zh" ? ["凌晨", "上午", "下午", "晚间"][index] : ["Night", "AM", "PM", "Eve"][index]}</small></span>)}</div></section>
        <section className="figma-module-card focus-category-card"><header>{locale === "zh" ? "专注分类" : "Categories"}</header><div className="focus-pie"><span>{locale === "zh" ? "工作" : "Work"}</span></div></section>
        <section className="figma-module-card focus-week-card"><header>{locale === "zh" ? "近 7 天趋势" : "7-day trend"}</header><div className="focus-week-line" /></section>
        <section className="figma-module-card focus-history-card"><header>{locale === "zh" ? "完成记录" : "Completed"}</header>{["产品原型", "资料整理", "需求复盘"].map((label, index) => <p key={label}><Check size={13} />{locale === "zh" ? label : ["Prototype", "Research", "Review"][index]}</p>)}</section>
      </div>
      <section className="figma-module-card focus-quick-card"><div><Clock3 size={20} /><input value={focusTitle} onChange={(event) => setFocusTitle(event.target.value)} /></div><div><button type="button" onClick={() => setFocusMinutes(Math.max(5, focusMinutes - 5))}>-</button><strong>{focusMinutes} min</strong><button type="button" onClick={() => setFocusMinutes(Math.min(90, focusMinutes + 5))}>+</button></div><button type="button" onClick={() => { setHasStarted(false); openView("immersive"); }}>{locale === "zh" ? "进入专注" : "Start focus"}</button></section>
      <AssistantCard text={locale === "zh" ? "你的高效时段集中在晚间，下一次专注建议从 25 分钟开始。" : "Your strongest focus window is in the evening. Start with 25 minutes."} />
    </div>
  );
}

export default function RecordModuleDashboard(props: Props) {
  const { locale } = useLocale();
  const [view, setView] = useState(props.initialView ?? "overview");
  useEffect(() => setView(props.initialView ?? "overview"), [props.initialView, props.module]);
  const openView = (next: string) => {
    setView(next);
    props.onViewChange?.(next === "overview" ? null : next);
  };
  if (view === "history") return <HistoryView module={props.module} locale={locale} onBack={() => openView("overview")} />;
  const common = { ...props, locale };
  if (props.module === "exercise") return <ExerciseDashboard locale={locale} steps={props.steps} calories={props.calories} exerciseMinutes={props.exerciseMinutes} onOpenEditor={props.onOpenEditor} view={view} openView={openView} />;
  if (props.module === "mood") return <MoodDashboard {...common} view={view} openView={openView} />;
  if (props.module === "sleep") return <SleepDashboard locale={locale} sleepStart={props.sleepStart} sleepEnd={props.sleepEnd} deepSleep={props.deepSleep} lightSleep={props.lightSleep} remSleep={props.remSleep} sleepRating={props.sleepRating} onOpenEditor={props.onOpenEditor} view={view} openView={openView} />;
  if (props.module === "focus") return <FocusDashboard locale={locale} focusTitle={props.focusTitle} focusMinutes={props.focusMinutes} setFocusTitle={props.setFocusTitle} setFocusMinutes={props.setFocusMinutes} onSaveFocusMinutes={props.onSaveFocusMinutes} view={view} openView={openView} />;
  return null;
}
