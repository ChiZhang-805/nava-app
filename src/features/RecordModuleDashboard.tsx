import {
  Activity,
  Bell,
  BellOff,
  Bluetooth,
  Camera,
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
  ScanFace,
  Share2,
  ShieldCheck,
  Square,
  TimerReset,
  Watch,
  Utensils,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import LineTrendChart, { type LineTrendPoint } from "../components/LineTrendChart";
import { useLocale } from "../i18n";
import type { FocusRecord, MoodRecord, TodaySnapshot, TrendBundle } from "../types";
import { buildModuleFeedback } from "../services/personalizedFeedback";
import { enableNavaNotifications } from "../services/notifications";
import type { UserProfile } from "../services/profile";
import type { RecordModule } from "./RecordsScreen";

type MoodFactor = { value: string; label: string };

type Props = {
  userId: string;
  module: RecordModule;
  moodScore: number;
  setMoodScore: (value: number) => void;
  moodFactors: MoodFactor[];
  selectedFactors: string[];
  setPrimaryFactor: (value: string) => void;
  diary: string;
  setDiary: (value: string) => void;
  onSaveMood: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
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
  onSaveFocusMinutes: (minutes: number, details?: { interruptions?: number; startedAt?: string; endedAt?: string }) => Promise<void>;
  busy: string | null;
  recordDate: string;
  todaySnapshot: TodaySnapshot | null;
  trendBundle: TrendBundle | null;
  profile: UserProfile | null;
  initialView?: string | null;
  onViewChange?: (view: string | null, replace?: boolean) => void;
};

const moodFaces = [
  { score: 88, zh: "愉悦", en: "Bright" },
  { score: 76, zh: "平静", en: "Calm" },
  { score: 62, zh: "一般", en: "Neutral" },
  { score: 46, zh: "疲惫", en: "Tired" },
  { score: 30, zh: "低落", en: "Low" },
];

function shortDate(date: string, locale: "zh" | "en") {
  const [, month = "", day = ""] = date.split("-");
  return locale === "zh" ? `${Number(month)}/${Number(day)}` : `${Number(month)}/${Number(day)}`;
}

function mergeLiveMood(
  trendBundle: TrendBundle | null,
  recordDate: string,
  moodScore: number,
  factors: string[],
  diary: string,
) {
  const records = new Map((trendBundle?.moods ?? []).map((record) => [record.record_date, record]));
  const previous = records.get(recordDate);
  records.set(recordDate, {
    id: previous?.id ?? `live-mood-${recordDate}`,
    record_date: recordDate,
    mood_score: moodScore,
    factors,
    diary_content: diary || null,
    ai_feedback: previous?.ai_feedback ?? null,
    diary_sentiment: previous?.diary_sentiment ?? null,
  });
  return [...records.values()].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-7);
}

function moodTrendPoints(records: MoodRecord[], locale: "zh" | "en"): LineTrendPoint[] {
  return records.map((record) => ({
    id: record.id,
    label: shortDate(record.record_date, locale),
    value: record.mood_score,
  }));
}

function moodDistribution(records: MoodRecord[], locale: "zh" | "en") {
  const groups = [
    { key: "bright", label: locale === "zh" ? "愉悦" : "Bright", color: "#075f88", count: 0 },
    { key: "calm", label: locale === "zh" ? "平静" : "Calm", color: "#32a8d2", count: 0 },
    { key: "neutral", label: locale === "zh" ? "一般" : "Neutral", color: "#8bd7ee", count: 0 },
    { key: "low", label: locale === "zh" ? "低能量" : "Low", color: "#d8eef6", count: 0 },
  ];
  records.forEach((record) => {
    const index = record.mood_score >= 82 ? 0 : record.mood_score >= 68 ? 1 : record.mood_score >= 52 ? 2 : 3;
    groups[index].count += 1;
  });
  const total = Math.max(1, records.length);
  let cursor = 0;
  const stops = groups.map((group) => {
    const start = cursor;
    cursor += (group.count / total) * 100;
    return `${group.color} ${start}% ${cursor}%`;
  });
  const dominant = [...groups].sort((a, b) => b.count - a.count)[0];
  return {
    background: `conic-gradient(${stops.join(", ")})`,
    dominant,
    summary: groups.map((group) => `${group.label} ${group.count}`).join("，"),
  };
}

function aggregateFocusByDate(records: FocusRecord[]) {
  const daily = new Map<string, FocusRecord>();
  records.forEach((record) => {
    const current = daily.get(record.record_date);
    daily.set(record.record_date, {
      id: current?.id ?? `daily-focus-${record.record_date}`,
      task_id: current?.task_id ?? record.task_id,
      record_date: record.record_date,
      completed_sessions: (current?.completed_sessions ?? 0) + record.completed_sessions,
      total_minutes: (current?.total_minutes ?? 0) + record.total_minutes,
    });
  });
  return [...daily.values()].sort((a, b) => a.record_date.localeCompare(b.record_date));
}

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
  compact = false,
  children,
}: {
  title: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="module-dashboard module-subview" data-module-view="module-subview">
      <section className={["figma-module-card", "module-subview-card", compact ? "is-compact" : ""].filter(Boolean).join(" ")}>
        <header><strong>{title}</strong></header>
        {children}
      </section>
    </div>
  );
}

function HistoryView({ module, locale, trendBundle }: { module: RecordModule; locale: "zh" | "en"; trendBundle: TrendBundle | null }) {
  const moduleNames: Record<RecordModule, { zh: string; en: string }> = {
    mood: { zh: "情绪", en: "Mood" },
    sleep: { zh: "睡眠", en: "Sleep" },
    exercise: { zh: "运动", en: "Activity" },
    diet: { zh: "饮食", en: "Diet" },
    focus: { zh: "专注", en: "Focus" },
    face: { zh: "面部", en: "Face" },
  };
  const values = useMemo(() => {
    if (!trendBundle) return [];
    if (module === "mood") return trendBundle.moods.map((record) => record.mood_score);
    if (module === "sleep") return trendBundle.sleeps.map((record) => record.rhythm_score ?? Math.min(100, ((record.sleep_duration_minutes ?? 0) / 480) * 100));
    if (module === "exercise") return trendBundle.exercises.map((record) => Math.min(100, ((record.steps ?? 0) / 10000) * 100));
    if (module === "diet") return trendBundle.nutritions.map((record) => Math.min(100, (record.total_calories / 2000) * 100));
    if (module === "focus") return aggregateFocusByDate(trendBundle.focus).map((record) => Math.min(100, (record.total_minutes / 120) * 100));
    return trendBundle.faces.map((record) => record.overall_score ?? 0);
  }, [module, trendBundle]);
  const displayValues = values.length > 0 ? values.slice(-7) : [0];
  const shareSummary = async () => {
    const label = moduleNames[module][locale];
    const average = Math.round(displayValues.reduce((sum, value) => sum + value, 0) / Math.max(1, displayValues.length));
    const text = locale === "zh" ? `我的 NAVA ${label}近 7 日平均状态为 ${average}。每一次记录都在帮助我找到自己的节律。` : `My 7-day NAVA ${label} average is ${average}. Every check-in helps me find my rhythm.`;
    if (navigator.share) await navigator.share({ title: `NAVA · ${label}`, text });
    else await navigator.clipboard.writeText(text);
  };
  return (
    <ModuleDetailView title={`${moduleNames[module][locale]}${locale === "zh" ? "历史记录" : " history"}`}>
      <div className="module-history-chart" aria-label={locale === "zh" ? "近七天记录" : "Last seven days"}>
        {displayValues.map((value, index) => <span key={index}><i style={{ height: `${Math.max(4, value)}%` }} /><small>{locale === "zh" ? `第${index + 1}天` : `D${index + 1}`}</small></span>)}
      </div>
      <div className={`module-history-list module-history-list--${module}`}>
        {displayValues.slice(-3).reverse().map((value, index) => <p key={index}><CalendarDays size={16} /><span>{locale === "zh" ? `最近第 ${index + 1} 次记录` : `Recent entry ${index + 1}`}</span><strong>{Math.round(value)}</strong></p>)}
      </div>
      <button className="module-history-share" type="button" onClick={() => void shareSummary()}><Share2 size={16} />{locale === "zh" ? "分享近 7 日状态" : "Share 7-day state"}</button>
    </ModuleDetailView>
  );
}

function ExerciseDashboard({
  locale,
  steps,
  calories,
  exerciseMinutes,
  onOpenEditor,
  recordDate,
  trendBundle,
  todaySnapshot,
  profile,
  view,
  openView,
}: Pick<Props, "steps" | "calories" | "exerciseMinutes" | "onOpenEditor" | "recordDate" | "trendBundle" | "todaySnapshot" | "profile"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(locale === "zh" ? "3 分钟前" : "3 min ago");
  const stepValues = useMemo(() => {
    const records = new Map((trendBundle?.exercises ?? []).map((record) => [record.record_date, record.steps ?? 0]));
    records.set(recordDate, steps);
    return [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  }, [recordDate, steps, trendBundle]);
  const maxSteps = Math.max(1, ...stepValues.map(([, value]) => value));
  const feedback = buildModuleFeedback({ module: "exercise", locale, profile, snapshot: todaySnapshot, trends: trendBundle });

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
        <section className="figma-module-card energy-card">
          <div><span>{locale === "zh" ? "今日能量消耗" : "Energy burned"}</span><strong>{calories}<small>/1300 kcal</small></strong><p>{locale === "zh" ? "差一点点就达标了，继续保持。" : "Almost at the goal. Keep moving."}</p></div>
          <div className="progress-ring exercise-ring" style={{ "--progress": `${Math.min(100, Math.round(calories / 13))}%` } as CSSProperties}><span>{Math.round((calories / 1300) * 100)}%</span></div>
        </section>
        <section className="figma-module-card steps-card">
          <header><span>{locale === "zh" ? "今日步数" : "Steps today"}</span><strong>{steps.toLocaleString()}<small>{locale === "zh" ? "步" : "steps"}</small></strong></header>
          <div className="steps-bars" aria-label={locale === "zh" ? "近七日步数" : "Seven-day steps"}>
            {stepValues.map(([date, value]) => <span key={date} title={`${shortDate(date, locale)} · ${value.toLocaleString()}`} style={{ height: `${Math.max(8, (value / maxSteps) * 100)}%` }} />)}
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

  if (view === "device") return <ModuleDetailView compact title={locale === "zh" ? "运动设备" : "Activity devices"}><div className="device-picker"><button className="selected" type="button"><Watch />Apple Watch S11<Check /></button><button type="button"><Bluetooth />{locale === "zh" ? "连接其他设备" : "Connect another device"}<Plus /></button></div><div className="detail-status-strip"><RefreshCw size={17} /><span>{locale === "zh" ? "健康数据已自动同步" : "Health data synced automatically"}</span><strong>{syncedAt}</strong></div></ModuleDetailView>;
  if (view === "vitals") return <ModuleDetailView compact title={locale === "zh" ? "健康指标" : "Health metrics"}><div className="metric-detail-grid"><span><HeartPulse /><small>{locale === "zh" ? "静息心率" : "Resting HR"}</small><strong>72 bpm</strong></span><span><Activity /><small>{locale === "zh" ? "血氧" : "SpO2"}</small><strong>98%</strong></span><span><Gauge /><small>{locale === "zh" ? "恢复度" : "Recovery"}</small><strong>84</strong></span></div><div className="detail-status-strip"><ShieldCheck size={17} /><span>{locale === "zh" ? "三项指标均处于平稳区间" : "All three metrics are stable"}</span><strong>{locale === "zh" ? "刚刚更新" : "Updated now"}</strong></div></ModuleDetailView>;
  if (view === "heatmap") return <ModuleDetailView compact title={locale === "zh" ? "节律热力图" : "Rhythm heatmap"}><div className="detail-heatmap">{Array.from({ length: 84 }, (_, index) => <i key={index} style={{ opacity: 0.18 + ((index * 17) % 8) * 0.1 }} />)}</div><div className="heatmap-legend"><span>{locale === "zh" ? "低活跃" : "Low"}</span><i /><i /><i /><i /><span>{locale === "zh" ? "高活跃" : "High"}</span></div><p>{locale === "zh" ? "18:00-20:00 是今天最稳定的活动窗口。" : "18:00-20:00 is today's most stable activity window."}</p></ModuleDetailView>;
  if (view === "clock") return <ModuleDetailView compact title={locale === "zh" ? "生物钟同步" : "Clock alignment"}><div className="clock-alignment"><Gauge /><strong>84%</strong><p>{locale === "zh" ? "活动、睡眠与日照节律保持一致。" : "Activity, sleep and daylight rhythms are aligned."}</p></div></ModuleDetailView>;
  if (view === "sports") return <ModuleDetailView compact title="NAVA Sports"><div className="sports-plan"><Activity /><strong>{locale === "zh" ? "晚间轻运动计划" : "Evening light workout"}</strong><div className="sports-plan-steps"><span><b>1</b>{locale === "zh" ? "热身 8 分钟" : "Warm up · 8 min"}</span><span><b>2</b>{locale === "zh" ? "低强度有氧 18 分钟" : "Light cardio · 18 min"}</span><span><b>3</b>{locale === "zh" ? "拉伸 5 分钟" : "Stretch · 5 min"}</span></div><button type="button" onClick={onOpenEditor}>{locale === "zh" ? "记录本次运动" : "Log this workout"}</button></div></ModuleDetailView>;

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
          <div className="mini-donut" style={{ "--ring-progress": `${Math.min(100, Math.round((calories / 1300) * 100))}%` } as CSSProperties} />
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
      <AssistantCard onClick={() => openView("sports")} text={feedback} />
    </div>
  );
}

function MoodDashboard(props: Props & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const {
    locale,
    moodScore,
    setMoodScore,
    moodFactors,
    selectedFactors,
    setPrimaryFactor,
    diary,
    setDiary,
    onSaveMood,
    busy,
    recordDate,
    trendBundle,
    view,
    openView,
  } = props;
  const [saved, setSaved] = useState(false);
  const moodRecords = useMemo(
    () => mergeLiveMood(trendBundle, recordDate, moodScore, selectedFactors, diary),
    [diary, moodScore, recordDate, selectedFactors, trendBundle],
  );
  const trendPoints = useMemo(() => moodTrendPoints(moodRecords, locale), [locale, moodRecords]);
  const distribution = useMemo(() => moodDistribution(moodRecords, locale), [locale, moodRecords]);
  const average = moodRecords.reduce((sum, record) => sum + record.mood_score, 0) / Math.max(1, moodRecords.length);
  const firstScore = moodRecords[0]?.mood_score ?? moodScore;
  const latestDelta = moodScore - firstScore;
  const primaryFactor = moodFactors.find((factor) => factor.value === selectedFactors[0])?.label ?? selectedFactors[0];
  const assistantText = locale === "zh"
    ? `近七日平均情绪 ${Math.round(average)}，今日较首日${latestDelta >= 0 ? "上升" : "下降"} ${Math.abs(Math.round(latestDelta))} 分。${selectedFactors.length > 0 ? `“${selectedFactors[0]}”是当前主要影响因素。` : "补充主要原因后，我会继续识别重复出现的节律。"}`
    : `Your seven-day average is ${Math.round(average)}. Today is ${Math.abs(Math.round(latestDelta))} points ${latestDelta >= 0 ? "above" : "below"} day one. ${primaryFactor ? `${primaryFactor} is today's main factor.` : "Add a cause to reveal recurring patterns."}`;

  const submitMood = async (event: FormEvent<HTMLFormElement>) => {
    const didSave = await onSaveMood(event);
    if (!didSave) return;
    setSaved(true);
    openView("overview");
  };

  if (view === "trend") return <ModuleDetailView compact title={locale === "zh" ? "情绪趋势" : "Mood trend"}><LineTrendChart points={trendPoints} ariaLabel={locale === "zh" ? "近七日情绪趋势" : "Seven-day mood trend"} /><p>{assistantText}</p></ModuleDetailView>;

  return (
    <form className="module-dashboard mood-dashboard" onSubmit={(event) => void submitMood(event)} data-module-view="mood-overview" data-ui-revision="mood-curve-v2">
      <section className="figma-module-card mood-entry-card">
        <header>
          <strong>{locale === "zh" ? "情绪记录" : "Mood check-in"}</strong>
          <button
            className={["module-card-nav-button", saved ? "success" : ""].filter(Boolean).join(" ")}
            type="button"
            onClick={() => { setSaved(false); openView("journal"); }}
            aria-label={saved ? (locale === "zh" ? "情绪已保存" : "Mood saved") : (locale === "zh" ? "打开情绪日记" : "Open mood journal")}
          >
            {saved ? <Check size={18} /> : <ChevronRight size={18} />}
          </button>
        </header>
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
          <select value={selectedFactors[0] ?? ""} onChange={(event) => setPrimaryFactor(event.target.value)}>
            <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
            {moodFactors.map((factor) => <option key={factor.value} value={factor.value}>{factor.label}</option>)}
          </select>
        </div>
        <button className="mood-diary-trigger" type="button" onClick={() => openView("journal")} aria-label={locale === "zh" ? "填写情绪日记" : "Write mood journal"}>{diary || (locale === "zh" ? "写下今天的情绪" : "Write a mood note")}</button>
      </section>
      <section className="figma-module-card mood-trend-card">
        <header><strong>{locale === "zh" ? "近 7 天情绪趋势" : "7-day mood"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("trend")} aria-label={locale === "zh" ? "查看情绪趋势" : "View mood trend"}><ChevronRight size={18} /></button></header>
        <div className="mood-chart"><LineTrendChart points={trendPoints} compact ariaLabel={locale === "zh" ? "近七日情绪曲线" : "Seven-day mood curve"} /></div>
        <div className="mood-pie-wrap">
          <div className="mood-pie" style={{ background: distribution.background }} aria-label={distribution.summary}><span>{distribution.dominant.count}</span></div>
          <small>{distribution.dominant.label}</small>
        </div>
      </section>
      <AssistantCard text={assistantText} />
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

function SleepDashboard(props: Pick<Props, "userId" | "sleepStart" | "sleepEnd" | "deepSleep" | "lightSleep" | "remSleep" | "sleepRating" | "onOpenEditor" | "recordDate" | "trendBundle" | "todaySnapshot" | "profile"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { userId, locale, sleepStart, sleepEnd, deepSleep, lightSleep, remSleep, sleepRating, onOpenEditor, recordDate, trendBundle, todaySnapshot, profile, view, openView } = props;
  const todayKey = `nava-sleep-alert-dismissed:${new Date().toISOString().slice(0, 10)}`;
  const [alertVisible, setAlertVisible] = useState(() => window.sessionStorage.getItem(todayKey) !== "1");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const total = Math.max(1, deepSleep + lightSleep + remSleep);
  const score = Math.round(58 + sleepRating * 5.5);
  const sleepTrend = useMemo(() => {
    const records = new Map((trendBundle?.sleeps ?? []).map((record) => [record.record_date, record.rhythm_score ?? Math.min(100, ((record.sleep_duration_minutes ?? 0) / 480) * 100)]));
    records.set(recordDate, score);
    return [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  }, [recordDate, score, trendBundle]);
  const feedback = buildModuleFeedback({ module: "sleep", locale, profile, snapshot: todaySnapshot, trends: trendBundle });

  const enableNotification = async () => {
    await enableNavaNotifications(userId, "22:30");
    setNotificationEnabled(true);
  };

  if (view === "trend") return <ModuleDetailView compact title={locale === "zh" ? "睡眠趋势" : "Sleep trend"}><LineTrendChart points={sleepTrend.map(([date, value]) => ({ id: date, label: shortDate(date, locale), value }))} ariaLabel={locale === "zh" ? "近七日睡眠趋势" : "Seven-day sleep trend"} tone="rhythm" /><p>{locale === "zh" ? "曲线由近七日睡眠时长与节律评分生成，更新今日睡眠后会同步变化。" : "This curve is generated from seven days of sleep duration and rhythm scores."}</p></ModuleDetailView>;

  return (
    <div className="module-dashboard sleep-dashboard" data-module-view="sleep-overview">
      {alertVisible && <section className="sleep-alert"><MoonStar size={20} /><button className="sleep-alert-copy" type="button" onClick={() => openView("alert")}><strong>{locale === "zh" ? "作息异常提醒" : "Sleep rhythm alert"}</strong><p>{locale === "zh" ? "昨晚入睡时间偏晚，今天建议提前 30 分钟放松。" : "Bedtime was late. Start winding down 30 minutes earlier."}</p></button><button type="button" onClick={() => setAlertVisible(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={18} /></button></section>}
      <section className="figma-module-card sleep-summary-card">
        <header><strong>{locale === "zh" ? "睡眠摘要" : "Sleep summary"}</strong><button className="module-card-text-action" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "更新睡眠记录" : "Update sleep record"}><span>{locale === "zh" ? "设备导入 / 更新" : "Import / update"}</span><ChevronRight size={18} /></button></header>
        <div className="sleep-timeline"><span>{sleepStart}</span><div><i style={{ left: "14%", width: "61%" }} /></div><span>{sleepEnd}</span></div>
        <div className="sleep-stage-row">
          <div className="sleep-stage-shape"><i style={{ flex: deepSleep / total }} /><i style={{ flex: lightSleep / total }} /><i style={{ flex: remSleep / total }} /></div>
          <ul><li><i />{locale === "zh" ? "深睡" : "Deep"}</li><li><i />{locale === "zh" ? "浅睡" : "Light"}</li><li><i />REM</li></ul>
          <strong>{score}<small>{locale === "zh" ? "分" : "pts"}</small></strong>
        </div>
      </section>
      <section className="figma-module-card sleep-trend-card">
        <header><strong>{locale === "zh" ? "7 日趋势" : "7-day trend"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("trend")} aria-label={locale === "zh" ? "查看睡眠趋势" : "View sleep trend"}><ChevronRight size={18} /></button></header>
        <div className="sleep-bars">{sleepTrend.map(([date, height]) => <span key={date}><i style={{ height: `${Math.max(6, height)}%` }} /><small>{shortDate(date, locale)}</small></span>)}</div>
      </section>
      <AssistantCard text={feedback} />
      {view === "alert" && <div className="module-modal" role="dialog" aria-modal="true"><div className="module-modal-card sleep-alert-modal"><header><strong>{locale === "zh" ? "睡眠提醒" : "Sleep reminder"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header><div className="lock-screen-preview"><Bell size={24} /><strong>NAVA</strong><p>{locale === "zh" ? "该准备入睡了，给今天一个安静的收尾。" : "Time to wind down and close the day quietly."}</p></div><button type="button" onClick={() => void enableNotification()}>{notificationEnabled ? <BellOff size={18} /> : <Bell size={18} />}{notificationEnabled ? (locale === "zh" ? "提醒已开启" : "Reminder enabled") : (locale === "zh" ? "开启锁屏提醒" : "Enable lock-screen reminder")}</button><button type="button" onClick={() => { window.sessionStorage.setItem(todayKey, "1"); setAlertVisible(false); openView("overview"); }}>{locale === "zh" ? "今天不再提醒" : "Not again today"}</button></div></div>}
    </div>
  );
}

function DietDashboard(props: Pick<Props, "todaySnapshot" | "trendBundle" | "profile" | "onOpenEditor"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { locale, todaySnapshot, trendBundle, profile, onOpenEditor, openView } = props;
  const nutrition = todaySnapshot?.nutrition;
  const records = useMemo(() => {
    const byDate = new Map((trendBundle?.nutritions ?? []).map((record) => [record.record_date, record]));
    if (nutrition) byDate.set(nutrition.record_date, nutrition);
    return [...byDate.values()].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-7);
  }, [nutrition, trendBundle]);
  const trendPoints = records.map((record) => ({
    id: record.id,
    label: shortDate(record.record_date, locale),
    value: Math.min(100, Math.round((record.total_calories / 2400) * 100)),
  }));
  const meals = [
    { key: "breakfast", zh: "早餐", en: "Breakfast", items: nutrition?.breakfast_items ?? [] },
    { key: "lunch", zh: "午餐", en: "Lunch", items: nutrition?.lunch_items ?? [] },
    { key: "dinner", zh: "晚餐", en: "Dinner", items: nutrition?.dinner_items ?? [] },
    { key: "pantry", zh: "加餐", en: "Snack", items: nutrition?.pantry_items ?? [] },
  ];
  const completedMeals = meals.slice(0, 3).filter((meal) => meal.items.length > 0).length;
  const itemCount = meals.reduce((sum, meal) => sum + meal.items.length, 0);
  const feedback = buildModuleFeedback({ module: "diet", locale, profile, snapshot: todaySnapshot, trends: trendBundle });

  return (
    <div className="module-dashboard diet-dashboard" data-module-view="diet-overview">
      <section className="figma-module-card diet-summary-card">
        <header>
          <div><span>{locale === "zh" ? "今日饮食" : "Today's diet"}</span><strong>{nutrition?.total_calories ?? 0}<small> kcal</small></strong></div>
          <button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "记录饮食" : "Log a meal"}><Camera size={20} /></button>
        </header>
        <div className="diet-completion">
          <span><strong>{completedMeals}/3</strong><small>{locale === "zh" ? "正餐" : "meals"}</small></span>
          <span><strong>{itemCount}</strong><small>{locale === "zh" ? "食物项" : "items"}</small></span>
          <span><strong>{records.length}</strong><small>{locale === "zh" ? "近七日记录" : "logged days"}</small></span>
        </div>
        <div className="diet-macro-summary">
          <span>P {Math.round(nutrition?.protein_grams ?? 0)}g</span>
          <span>C {Math.round(nutrition?.carbohydrate_grams ?? 0)}g</span>
          <span>F {Math.round(nutrition?.fat_grams ?? 0)}g</span>
          <span>{Math.round(nutrition?.hydration_ml ?? 0)}ml</span>
        </div>
      </section>
      <section className="figma-module-card diet-meals-card">
        <header><strong>{locale === "zh" ? "餐次记录" : "Meals"}</strong><button type="button" onClick={onOpenEditor}><Utensils size={18} /><span>{locale === "zh" ? "添加" : "Add"}</span></button></header>
        <div className="diet-meal-grid">
          {meals.map((meal) => (
            <button type="button" key={meal.key} onClick={onOpenEditor}>
              <span>{meal.items.length > 0 ? <Check size={17} /> : <Plus size={17} />}</span>
              <strong>{locale === "zh" ? meal.zh : meal.en}</strong>
              <small>{meal.items.length > 0 ? `${meal.items.length}${locale === "zh" ? " 项" : " items"}` : (locale === "zh" ? "待记录" : "Pending")}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="figma-module-card diet-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日能量记录" : "7-day energy log"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看饮食历史" : "View diet history"}><ChevronRight size={18} /></button></header>
        {trendPoints.length > 0 ? <LineTrendChart points={trendPoints} compact ariaLabel={locale === "zh" ? "近七日饮食能量趋势" : "Seven-day dietary energy trend"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一餐记录后显示趋势" : "Log a meal to begin the trend"}</p>}
      </section>
      <AssistantCard text={feedback} />
    </div>
  );
}

function FaceDashboard(props: Pick<Props, "todaySnapshot" | "trendBundle" | "profile" | "onOpenEditor"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { locale, todaySnapshot, trendBundle, profile, onOpenEditor, openView } = props;
  const face = todaySnapshot?.face;
  const records = useMemo(() => {
    const byDate = new Map((trendBundle?.faces ?? []).map((record) => [record.record_date, record]));
    if (face) byDate.set(face.record_date, face);
    return [...byDate.values()].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-7);
  }, [face, trendBundle]);
  const points = records
    .filter((record) => record.overall_score != null)
    .map((record) => ({ id: record.id, label: shortDate(record.record_date, locale), value: record.overall_score ?? 0 }));
  const feedback = buildModuleFeedback({ module: "face", locale, profile, snapshot: todaySnapshot, trends: trendBundle });
  const annotations = face?.annotations?.slice(0, 3) ?? [];

  return (
    <div className="module-dashboard face-dashboard" data-module-view="face-overview">
      <section className="figma-module-card face-privacy-card">
        <ShieldCheck size={18} /><p>{locale === "zh" ? "照片经明确同意后进入账号隔离的私密存储；分析只使用短时签名链接，结果不构成医疗诊断。" : "With consent, photos use account-isolated private storage and short-lived signed links; results are not medical diagnoses."}</p>
      </section>
      <section className="figma-module-card face-summary-card">
        <header><strong>{locale === "zh" ? "今日面部状态" : "Today's face state"}</strong><button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "使用前置摄像头拍照" : "Take a front-camera photo"}><Camera size={20} /></button></header>
        <div className="face-score-row">
          <div className="face-score-ring" style={{ "--face-score": `${face?.overall_score ?? 0}%` } as CSSProperties}><ScanFace size={28} /><strong>{face?.overall_score ?? "--"}</strong></div>
          <div><span>{locale === "zh" ? "肤龄参考" : "Skin-age reference"}<strong>{face?.skin_age ?? "--"}</strong></span><span>{locale === "zh" ? "拍摄模式" : "Capture mode"}<strong>{face?.capture_mode === "makeup" ? (locale === "zh" ? "带妆" : "Makeup") : (locale === "zh" ? "素颜" : "Bare")}</strong></span><span>{locale === "zh" ? "分析置信度" : "Confidence"}<strong>{face?.analysis_confidence != null ? `${Math.round(face.analysis_confidence * 100)}%` : "--"}</strong></span></div>
        </div>
        <div className="face-annotation-list">
          {annotations.length > 0 ? annotations.map((annotation) => <span key={annotation.id}>{annotation.label}</span>) : <span>{locale === "zh" ? "拍照后显示状态标注" : "Annotations appear after capture"}</span>}
        </div>
      </section>
      <section className="figma-module-card face-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日状态" : "7-day state"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看面部历史" : "View face history"}><ChevronRight size={18} /></button></header>
        {points.length > 0 ? <LineTrendChart points={points} compact ariaLabel={locale === "zh" ? "近七日面部状态趋势" : "Seven-day face-state trend"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一次拍照后显示趋势" : "Take the first photo to begin the trend"}</p>}
      </section>
      <AssistantCard text={feedback} />
    </div>
  );
}

function FocusDashboard(props: Pick<Props, "focusTitle" | "focusMinutes" | "setFocusTitle" | "setFocusMinutes" | "onSaveFocusMinutes" | "todaySnapshot" | "trendBundle" | "profile"> & { locale: "zh" | "en"; view: string; openView: (view: string) => void }) {
  const { locale, focusTitle, focusMinutes, setFocusTitle, setFocusMinutes, onSaveFocusMinutes, todaySnapshot, trendBundle, profile, view, openView } = props;
  const displayedFocusTitle = focusTitle === "产品原型" || focusTitle === "Product prototype" || focusTitle === "Prototype"
    ? (locale === "zh" ? "产品原型" : "Prototype")
    : focusTitle;
  const immersive = view === "immersive" || view === "interruption";
  const [running, setRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerMode, setTimerMode] = useState<"countdown" | "countup">("countdown");
  const [interruptions, setInterruptions] = useState(0);
  const [startedAt, setStartedAt] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const focusRecords = useMemo(() => aggregateFocusByDate(trendBundle?.focus ?? []).slice(-7), [trendBundle]);
  const latestFocus = focusRecords[focusRecords.length - 1];
  const todayMinutes = todaySnapshot?.focusMinutes ?? latestFocus?.total_minutes ?? 0;
  const todaySessions = todaySnapshot?.focusSessions ?? latestFocus?.completed_sessions ?? 0;
  const recentFocus = focusRecords.slice(-4);
  const focusMax = Math.max(1, ...recentFocus.map((record) => record.total_minutes));
  const focusTrendPoints = focusRecords.map((record) => ({
    id: record.id,
    label: shortDate(record.record_date, locale),
    value: Math.min(100, (record.total_minutes / 120) * 100),
  }));
  const goalProgress = Math.min(100, Math.round((todayMinutes / 120) * 100));
  const feedback = buildModuleFeedback({ module: "focus", locale, profile, snapshot: todaySnapshot, trends: trendBundle });

  const updateDuration = (nextValue: number) => {
    const nextMinutes = Math.min(180, Math.max(1, Math.round(nextValue || 1)));
    setFocusMinutes(nextMinutes);
    setRemaining(nextMinutes * 60);
    setElapsedSeconds(0);
    setRunning(false);
    setHasStarted(false);
    setSaved(false);
  };

  useEffect(() => {
    if (!immersive || !running) return;
    const timer = window.setInterval(() => {
      if (timerMode === "countup") setElapsedSeconds((value) => value + 1);
      else setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [immersive, running, timerMode]);

  useEffect(() => {
    if (!immersive) {
      setRemaining(focusMinutes * 60);
      setRunning(false);
    }
  }, [focusMinutes, immersive]);

  useEffect(() => {
    if (timerMode === "countdown" && running && remaining === 0) setRunning(false);
  }, [remaining, running, timerMode]);

  useEffect(() => {
    let listener: { remove: () => Promise<void> } | undefined;
    if (!immersive) return;
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive || !running) return;
      setRunning(false);
      setInterruptions((value) => value + 1);
      openView("interruption");
    }).then((handle) => { listener = handle; });
    return () => { void listener?.remove(); };
  }, [immersive, openView, running]);

  const timerDisplay = timerMode === "countup" ? elapsedSeconds : remaining;
  const progress = timerMode === "countup"
    ? Math.min(100, (elapsedSeconds / Math.max(1, focusMinutes * 60)) * 100)
    : 100 - (remaining / Math.max(1, focusMinutes * 60)) * 100;

  const finish = useCallback(async () => {
    if (saving || !hasStarted) return;
    setRunning(false);
    setSaving(true);
    const seconds = timerMode === "countup" ? elapsedSeconds : focusMinutes * 60 - remaining;
    const elapsed = Math.max(1, Math.ceil(seconds / 60));
    try {
      await onSaveFocusMinutes(elapsed, { interruptions, startedAt, endedAt: new Date().toISOString() });
      setSaved(true);
      openView("overview");
    } finally {
      setSaving(false);
    }
  }, [elapsedSeconds, focusMinutes, hasStarted, interruptions, onSaveFocusMinutes, openView, remaining, saving, startedAt, timerMode]);

  useEffect(() => {
    if (!immersive || timerMode !== "countdown" || remaining !== 0 || !hasStarted || saving || saved) return;
    void finish();
  }, [finish, hasStarted, immersive, remaining, saved, saving, timerMode]);

  if (immersive) {
    return (
      <div
        className={["module-dashboard", "focus-immersive", running ? "is-running" : hasStarted ? "is-paused" : "is-ready"].join(" ")}
        data-module-view="focus-immersive"
        data-focus-state={running ? "running" : hasStarted ? "paused" : "ready"}
      >
        <div className="focus-title-field">
          <input aria-label={locale === "zh" ? "专注事项" : "Focus activity"} value={displayedFocusTitle} onChange={(event) => setFocusTitle(event.target.value)} />
          <div className="focus-mode-switch" role="group" aria-label={locale === "zh" ? "计时模式" : "Timer mode"}>
            <button type="button" className={timerMode === "countdown" ? "active" : ""} onClick={() => { setTimerMode("countdown"); setRunning(false); }}>{locale === "zh" ? "倒计时" : "Countdown"}</button>
            <button type="button" className={timerMode === "countup" ? "active" : ""} onClick={() => { setTimerMode("countup"); setRunning(false); }}>{locale === "zh" ? "正计时" : "Count up"}</button>
          </div>
          <div className="focus-presets" aria-label={locale === "zh" ? "快捷时长" : "Duration presets"}>
            {[25, 45, 60].map((minutes) => <button key={minutes} type="button" className={focusMinutes === minutes ? "active" : ""} onClick={() => updateDuration(minutes)}>{minutes} min</button>)}
          </div>
          <label className="focus-duration-field">
            <input
              aria-label={locale === "zh" ? "专注分钟数" : "Focus duration in minutes"}
              inputMode="numeric"
              min={1}
              max={180}
              type="number"
              value={focusMinutes}
              onChange={(event) => updateDuration(Number(event.target.value))}
            />
            <span>{locale === "zh" ? "分钟" : "min"}</span>
          </label>
        </div>
        <div className="focus-timer-ring" style={{ "--timer-progress": `${progress}%` } as CSSProperties}>
          <div><strong>{formatDuration(timerDisplay)}</strong><span>{running ? (locale === "zh" ? "专注中" : "Focusing") : hasStarted ? (locale === "zh" ? "已暂停" : "Paused") : (locale === "zh" ? "准备开始" : "Ready")}</span></div>
        </div>
        <div className="focus-controls">
          <button type="button" onClick={() => { setRemaining(focusMinutes * 60); setElapsedSeconds(0); setRunning(false); setHasStarted(false); setSaved(false); }} aria-label={locale === "zh" ? "重置" : "Reset"}><TimerReset /></button>
          <button className="primary" type="button" onClick={() => { setHasStarted(true); if (!startedAt) setStartedAt(new Date().toISOString()); setRunning((value) => !value); }} aria-label={running ? (locale === "zh" ? "暂停" : "Pause") : (locale === "zh" ? "开始" : "Start")}>{running ? <Pause /> : <Play />}</button>
          <button type="button" onClick={() => void finish()} disabled={saving} aria-label={locale === "zh" ? "结束" : "Finish"}><Square /></button>
        </div>
        <button className="focus-interruption-trigger" type="button" onClick={() => { setRunning(false); setInterruptions((value) => value + 1); openView("interruption"); }}><PhoneIncoming size={17} />{locale === "zh" ? "模拟来电打断" : "Simulate interruption"}</button>
        <p className="focus-immersive-hint">{locale === "zh" ? "一次只做一件事。" : "One thing at a time."}</p>
        {view === "interruption" && <div className="focus-interruption" role="dialog" aria-modal="true"><PhoneIncoming size={38} /><strong>{locale === "zh" ? "来电打断" : "Incoming call"}</strong><p>{locale === "zh" ? "专注计时已自动暂停" : "Focus timer paused automatically"}</p><div><button type="button" onClick={() => { setRunning(true); setHasStarted(true); openView("immersive"); }}>{locale === "zh" ? "继续专注" : "Keep focusing"}</button><button type="button" onClick={() => openView("immersive")}>{locale === "zh" ? "接听并暂停" : "Answer and pause"}</button></div></div>}
      </div>
    );
  }

  return (
    <div className="module-dashboard focus-dashboard" data-module-view="focus-overview">
      <section className="figma-module-card focus-summary-card">
        <header><strong>{locale === "zh" ? "今日专注数据摘要" : "Today's focus"}</strong><button className={saved ? "success" : ""} type="button" onClick={() => { setSaved(false); setHasStarted(false); openView("immersive"); }} aria-label={saved ? (locale === "zh" ? "专注已记录" : "Focus saved") : (locale === "zh" ? "开始专注" : "Start focus")}>{saved ? <Check size={19} /> : <><CirclePlay size={18} />{locale === "zh" ? "开始" : "Start"}</>}</button></header>
        <div className="focus-summary-metrics">
          <span><small>{locale === "zh" ? "今日共计专注" : "Sessions"}</small><strong>{todaySessions}</strong>{locale === "zh" && <small>次</small>}</span>
          <span><small>{locale === "zh" ? "总时长" : "Total"}</small><strong>{Math.floor(todayMinutes / 60)}</strong><small>{locale === "zh" ? "小时" : "h"}</small><strong>{todayMinutes % 60}</strong><small>{locale === "zh" ? "分" : "m"}</small></span>
        </div>
      </section>
      <div className="focus-grid">
        <section className="figma-module-card focus-period-card"><header>{locale === "zh" ? "近 4 日时长" : "Last 4 days"}</header><div>{recentFocus.map((record) => <span key={record.id}><i style={{ height: `${Math.max(8, (record.total_minutes / focusMax) * 100)}%` }} /><small>{shortDate(record.record_date, locale)}</small></span>)}</div></section>
        <section className="figma-module-card focus-category-card"><header>{locale === "zh" ? "今日目标" : "Daily goal"}</header><div className="focus-pie" style={{ "--ring-progress": `${goalProgress}%` } as CSSProperties}><span>{goalProgress}%</span></div></section>
        <section className="figma-module-card focus-week-card"><header>{locale === "zh" ? "近 7 日目标完成度" : "7-day goal"}</header><LineTrendChart points={focusTrendPoints} compact ariaLabel={locale === "zh" ? "近七日专注目标完成度" : "Seven-day focus goal completion"} /></section>
        <section className="figma-module-card focus-history-card"><header>{locale === "zh" ? "完成记录" : "Completed"}</header>{focusRecords.slice(-3).reverse().map((record) => <p key={record.id}><Check size={13} />{shortDate(record.record_date, locale)} · {record.completed_sessions}{locale === "zh" ? "次" : " sessions"} · {record.total_minutes} min</p>)}</section>
      </div>
      <section className="figma-module-card focus-quick-card"><div><Clock3 size={20} /><input value={displayedFocusTitle} onChange={(event) => setFocusTitle(event.target.value)} /></div><div><button type="button" onClick={() => updateDuration(focusMinutes - 5)} aria-label={locale === "zh" ? "减少五分钟" : "Decrease five minutes"}>-</button><label className="focus-duration-field compact"><input aria-label={locale === "zh" ? "专注分钟数" : "Focus duration in minutes"} inputMode="numeric" min={1} max={180} type="number" value={focusMinutes} onChange={(event) => updateDuration(Number(event.target.value))} /><span>{locale === "zh" ? "分钟" : "min"}</span></label><button type="button" onClick={() => updateDuration(focusMinutes + 5)} aria-label={locale === "zh" ? "增加五分钟" : "Increase five minutes"}>+</button></div><button type="button" onClick={() => { setHasStarted(false); setRemaining(focusMinutes * 60); setElapsedSeconds(0); setInterruptions(0); setStartedAt(undefined); openView("immersive"); }}>{locale === "zh" ? "进入专注" : "Start focus"}</button></section>
      <AssistantCard text={feedback} />
    </div>
  );
}

export default function RecordModuleDashboard(props: Props) {
  const { locale } = useLocale();
  const [view, setView] = useState(props.initialView ?? "overview");
  useEffect(() => setView(props.initialView ?? "overview"), [props.initialView, props.module]);
  const openView = (next: string) => {
    setView(next);
    props.onViewChange?.(next === "overview" ? null : next, next === "overview");
  };
  if (view === "history") return <HistoryView module={props.module} locale={locale} trendBundle={props.trendBundle} />;
  const common = { ...props, locale };
  if (props.module === "exercise") return <ExerciseDashboard locale={locale} steps={props.steps} calories={props.calories} exerciseMinutes={props.exerciseMinutes} onOpenEditor={props.onOpenEditor} recordDate={props.recordDate} trendBundle={props.trendBundle} todaySnapshot={props.todaySnapshot} profile={props.profile} view={view} openView={openView} />;
  if (props.module === "mood") return <MoodDashboard {...common} view={view} openView={openView} />;
  if (props.module === "sleep") return <SleepDashboard userId={props.userId} locale={locale} sleepStart={props.sleepStart} sleepEnd={props.sleepEnd} deepSleep={props.deepSleep} lightSleep={props.lightSleep} remSleep={props.remSleep} sleepRating={props.sleepRating} onOpenEditor={props.onOpenEditor} recordDate={props.recordDate} trendBundle={props.trendBundle} todaySnapshot={props.todaySnapshot} profile={props.profile} view={view} openView={openView} />;
  if (props.module === "diet") return <DietDashboard locale={locale} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} profile={props.profile} onOpenEditor={props.onOpenEditor} view={view} openView={openView} />;
  if (props.module === "face") return <FaceDashboard locale={locale} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} profile={props.profile} onOpenEditor={props.onOpenEditor} view={view} openView={openView} />;
  if (props.module === "focus") return <FocusDashboard locale={locale} focusTitle={props.focusTitle} focusMinutes={props.focusMinutes} setFocusTitle={props.setFocusTitle} setFocusMinutes={props.setFocusMinutes} onSaveFocusMinutes={props.onSaveFocusMinutes} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} profile={props.profile} view={view} openView={openView} />;
  return null;
}
