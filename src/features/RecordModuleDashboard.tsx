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
import AnimatedNumber from "../components/AnimatedNumber";
import BarLineTrendChart, { type BarLineTrendPoint } from "../components/BarLineTrendChart";
import LineTrendChart, { type LineTrendPoint } from "../components/LineTrendChart";
import { useLocale } from "../i18n";
import type { FocusRecord, MoodRecord, TodaySnapshot, TrendBundle } from "../types";
import { buildModuleFeedback } from "../services/personalizedFeedback";
import { enableNavaNotifications } from "../services/notifications";
import {
  activityHeatmap,
  activityPeriodDistribution,
  clockAlignmentScore,
  latestVitals,
  sleepStageHeights,
  sleepTimelineGeometry,
} from "../services/visualMetrics";
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
  includeCurrent: boolean,
) {
  const records = new Map((trendBundle?.moods ?? []).map((record) => [record.record_date, record]));
  if (includeCurrent) {
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
  }
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
  const dominant = [...groups].sort((a, b) => b.count - a.count)[0];
  let segmentCursor = 0;
  const segments = groups.map((group) => {
    const percentage = (group.count / total) * 100;
    const segment = { ...group, percentage, offset: segmentCursor };
    segmentCursor += percentage;
    return segment;
  });
  return {
    dominant,
    groups: segments,
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
  const latestExercise = useMemo(() => {
    if (todaySnapshot?.exercise) return todaySnapshot.exercise;
    const records = [...(trendBundle?.exercises ?? [])].sort((a, b) => a.record_date.localeCompare(b.record_date));
    return records[records.length - 1] ?? null;
  }, [todaySnapshot?.exercise, trendBundle]);
  const displayedSteps = latestExercise?.steps ?? 0;
  const displayedCalories = latestExercise?.calories ?? 0;
  const displayedExerciseMinutes = latestExercise?.exercise_minutes ?? 0;
  const latestIsSelectedDate = latestExercise?.record_date === recordDate;
  const stepValues = useMemo(() => {
    const records = new Map((trendBundle?.exercises ?? []).map((record) => [record.record_date, record.steps ?? 0]));
    if (todaySnapshot?.exercise) records.set(recordDate, todaySnapshot.exercise.steps ?? steps);
    return [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  }, [recordDate, steps, todaySnapshot?.exercise, trendBundle]);
  const maxSteps = Math.max(1, ...stepValues.map(([, value]) => value));
  const periods = useMemo(
    () => activityPeriodDistribution(trendBundle?.healthMetrics ?? [], trendBundle?.exercises ?? []),
    [trendBundle],
  );
  const heatmap = useMemo(
    () => activityHeatmap(trendBundle?.healthMetrics ?? [], trendBundle?.exercises ?? []),
    [trendBundle],
  );
  const alignment = useMemo(
    () => clockAlignmentScore(trendBundle?.sleeps ?? [], trendBundle?.rhythms ?? []),
    [trendBundle],
  );
  const vitals = useMemo(
    () => latestVitals(trendBundle?.healthMetrics ?? [], trendBundle?.exercises ?? [], trendBundle?.rhythms ?? []),
    [trendBundle],
  );
  const peakWindow = `${String(heatmap.peakStartHour).padStart(2, "0")}:00–${String(heatmap.peakEndHour).padStart(2, "0")}:00`;
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
          <div><span>{latestIsSelectedDate ? (locale === "zh" ? "所选日期能量消耗" : "Selected-day energy") : (locale === "zh" ? "最近一次能量消耗" : "Latest energy")}</span><strong><AnimatedNumber value={displayedCalories} /><small>/1300 kcal</small></strong><p>{latestExercise ? (locale === "zh" ? `${shortDate(latestExercise.record_date, locale)} 的真实记录` : `Recorded ${shortDate(latestExercise.record_date, locale)}`) : (locale === "zh" ? "记录运动后生成进度" : "Log activity to build progress")}</p></div>
          <div className="progress-ring exercise-ring" style={{ "--progress": `${Math.min(100, Math.round(displayedCalories / 13))}%` } as CSSProperties}><span><AnimatedNumber value={Math.round((displayedCalories / 1300) * 100)} />%</span></div>
        </section>
        <section className="figma-module-card steps-card">
          <header><span>{latestIsSelectedDate ? (locale === "zh" ? "所选日期步数" : "Selected-day steps") : (locale === "zh" ? "最近一次步数" : "Latest steps")}</span><strong><AnimatedNumber value={displayedSteps} formatter={(value) => Math.round(value).toLocaleString()} /><small>{locale === "zh" ? "步" : "steps"}</small></strong></header>
          <div className="steps-bars" aria-label={locale === "zh" ? "近七日步数" : "Seven-day steps"}>
            {stepValues.map(([date, value]) => <span key={date} title={`${shortDate(date, locale)} · ${value.toLocaleString()}`} style={{ height: `${Math.max(8, (value / maxSteps) * 100)}%` }} />)}
          </div>
        </section>
        <section className="figma-module-card activity-card">
          <header><strong>{locale === "zh" ? "运动" : "Activities"}</strong><button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "添加运动" : "Add activity"}><Plus size={18} /></button></header>
          <div className="activity-chips">
            <span>{locale === "zh" ? "活动时长" : "Active time"}<strong><AnimatedNumber value={displayedExerciseMinutes} /> min</strong></span>
            <span>{locale === "zh" ? "活动消耗" : "Active energy"}<strong><AnimatedNumber value={displayedCalories} /> kcal</strong></span>
            <span>{locale === "zh" ? "步行折算" : "Walking est."}<strong><AnimatedNumber value={Math.round(displayedSteps / 110)} /> min</strong></span>
          </div>
          <div className="day-distribution">
            {periods.map((period) => <span key={period.label} className={period.active ? "active" : ""}><i title={`${period.label} · ${period.value}`} style={{ height: `${period.heightPercent}%` }} />{period.label}</span>)}
          </div>
        </section>
      </div>
    );
  }

  if (view === "device") return <ModuleDetailView compact title={locale === "zh" ? "运动设备" : "Activity devices"}><div className="device-picker"><button className="selected" type="button"><Watch />Apple Watch S11<Check /></button><button type="button"><Bluetooth />{locale === "zh" ? "连接其他设备" : "Connect another device"}<Plus /></button></div><div className="detail-status-strip"><RefreshCw size={17} /><span>{locale === "zh" ? "健康数据已自动同步" : "Health data synced automatically"}</span><strong>{syncedAt}</strong></div></ModuleDetailView>;
  if (view === "vitals") return <ModuleDetailView compact title={locale === "zh" ? "健康指标" : "Health metrics"}><div className="metric-detail-grid"><span><HeartPulse /><small>{locale === "zh" ? "静息心率" : "Resting HR"}</small><strong>{vitals.heartRate == null ? "--" : <><AnimatedNumber value={vitals.heartRate} /> bpm</>}</strong></span><span><Activity /><small>{locale === "zh" ? "血氧" : "SpO2"}</small><strong>{vitals.bloodOxygen == null ? "--" : <><AnimatedNumber value={vitals.bloodOxygen} formatter={(value) => value.toFixed(1)} />%</>}</strong></span><span><Gauge /><small>{locale === "zh" ? "恢复度" : "Recovery"}</small><strong>{vitals.recovery == null ? "--" : <AnimatedNumber value={vitals.recovery} />}</strong></span></div><div className="detail-status-strip"><ShieldCheck size={17} /><span>{locale === "zh" ? "指标来自最近一次健康快照与节律评分" : "Based on the latest health snapshot and rhythm score"}</span><strong>{vitals.date ? shortDate(vitals.date, locale) : "--"}</strong></div></ModuleDetailView>;
  if (view === "heatmap") return <ModuleDetailView compact title={locale === "zh" ? "节律热力图" : "Rhythm heatmap"}><div className="detail-heatmap">{heatmap.cells.map((cell, index) => <i key={cell.id} title={`${shortDate(cell.date, locale)} · ${String(cell.period * 2).padStart(2, "0")}:00 · ${Math.round(cell.value)}`} style={{ opacity: cell.intensity, "--heat-index": index } as CSSProperties} />)}</div><div className="heatmap-legend"><span>{locale === "zh" ? "低活跃" : "Low"}</span><i /><i /><i /><i /><span>{locale === "zh" ? "高活跃" : "High"}</span></div><p>{heatmap.cells.length > 0 ? (locale === "zh" ? `${peakWindow} 是近七日最稳定的活动窗口。` : `${peakWindow} is the most stable activity window across the last seven days.`) : (locale === "zh" ? "同步活动数据后生成热力图。" : "Sync activity data to build the heatmap.")}</p></ModuleDetailView>;
  if (view === "clock") return <ModuleDetailView compact title={locale === "zh" ? "生物钟同步" : "Clock alignment"}><div className="clock-alignment"><div className="clock-alignment-gauge" style={{ "--progress": `${alignment}%` } as CSSProperties}><Gauge /></div><strong><AnimatedNumber value={alignment} />%</strong><p>{locale === "zh" ? "该分数由近七日入睡时间、睡眠时长稳定性与节律评分共同计算。" : "Calculated from seven-day bedtime, sleep-duration regularity, and rhythm scores."}</p></div></ModuleDetailView>;
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
          <div className="mini-donut" style={{ "--ring-progress": `${Math.min(100, Math.round((displayedCalories / 1300) * 100))}%` } as CSSProperties} />
          <strong><AnimatedNumber value={displayedCalories} /><small>/1300 kcal</small></strong>
          <p>{latestExercise ? shortDate(latestExercise.record_date, locale) : (locale === "zh" ? "待记录" : "Pending")}<b><AnimatedNumber value={displayedSteps} formatter={(value) => Math.round(value).toLocaleString()} /> {locale === "zh" ? "步" : "steps"}</b></p>
        </button>
        <button className="figma-module-card health-card" type="button" onClick={() => openView("vitals")}>
          <header><span>{locale === "zh" ? "健康" : "Vitals"}</span><ChevronRight size={18} /></header>
          <HeartPulse size={43} />
          <p>{vitals.bloodOxygen == null || vitals.heartRate == null ? (locale === "zh" ? "同步后显示指标" : "Sync to show metrics") : (locale === "zh" ? `血氧 ${vitals.bloodOxygen}% · 心率 ${vitals.heartRate}` : `SpO2 ${vitals.bloodOxygen}% · HR ${vitals.heartRate}`)}</p>
        </button>
        <button className="figma-module-card heat-card" type="button" onClick={() => openView("heatmap")}>
          <header><span>{locale === "zh" ? "节律热力图" : "Rhythm map"}</span><ChevronRight size={18} /></header>
          <div className="heat-orbit"><span /><i /></div>
          <p>{heatmap.cells.length > 0 ? (locale === "zh" ? `活跃峰值 ${peakWindow}` : `Peak ${peakWindow}`) : (locale === "zh" ? "等待活动数据" : "Waiting for activity")}</p>
        </button>
        <button className="figma-module-card clock-sync-card" type="button" onClick={() => openView("clock")}>
          <header><span>{locale === "zh" ? "生物钟同步" : "Clock sync"}</span><ChevronRight size={18} /></header>
          <Gauge size={37} /><strong><AnimatedNumber value={alignment} />%</strong>
        </button>
        <button className="figma-module-card assessment-card" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "填写运动自评" : "Edit self assessment"}>
          <header><span>{locale === "zh" ? "自我评估" : "Self check"}</span><ChevronRight size={18} /></header>
          <p>{todaySnapshot?.exercise ? (locale === "zh" ? "所选日期已填写" : "Recorded") : (locale === "zh" ? "所选日期待填写" : "Pending")}</p><span>{locale === "zh" ? "编辑" : "Edit"}</span>
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
    todaySnapshot,
    view,
    openView,
  } = props;
  const [saved, setSaved] = useState(false);
  const hasCurrentMood = Boolean(todaySnapshot?.mood?.record_date === recordDate);
  const moodRecords = useMemo(
    () => mergeLiveMood(trendBundle, recordDate, moodScore, selectedFactors, diary, hasCurrentMood || saved),
    [diary, hasCurrentMood, moodScore, recordDate, saved, selectedFactors, trendBundle],
  );
  const trendPoints = useMemo(() => moodTrendPoints(moodRecords, locale), [locale, moodRecords]);
  const distribution = useMemo(() => moodDistribution(moodRecords, locale), [locale, moodRecords]);
  const average = moodRecords.reduce((sum, record) => sum + record.mood_score, 0) / Math.max(1, moodRecords.length);
  const firstScore = moodRecords[0]?.mood_score ?? 0;
  const latestRecord = moodRecords[moodRecords.length - 1];
  const latestScore = latestRecord?.mood_score ?? 0;
  const latestDelta = latestScore - firstScore;
  const latestFactor = hasCurrentMood || saved ? selectedFactors[0] : latestRecord?.factors?.[0];
  const primaryFactor = moodFactors.find((factor) => factor.value === latestFactor)?.label ?? latestFactor;
  const assistantText = locale === "zh"
    ? moodRecords.length > 0
      ? `近七日平均情绪 ${Math.round(average)}，最近一次较首日${latestDelta >= 0 ? "上升" : "下降"} ${Math.abs(Math.round(latestDelta))} 分。${latestFactor ? `“${latestFactor}”是最近记录的主要影响因素。` : "补充主要原因后，我会继续识别重复出现的节律。"}`
      : "完成第一条情绪记录后，我会从真实记录中生成趋势。"
    : moodRecords.length > 0
      ? `Your seven-day average is ${Math.round(average)}. The latest entry is ${Math.abs(Math.round(latestDelta))} points ${latestDelta >= 0 ? "above" : "below"} day one. ${primaryFactor ? `${primaryFactor} is the latest recorded factor.` : "Add a cause to reveal recurring patterns."}`
      : "Complete the first mood check-in to build a trend from real entries.";

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
          <div className="mood-pie" aria-label={distribution.summary}>
            <svg viewBox="0 0 40 40" aria-hidden="true">
              {distribution.groups.map((group, index) => group.percentage > 0 && (
                <circle
                  key={group.key}
                  cx="20"
                  cy="20"
                  r="16"
                  pathLength="100"
                  fill="none"
                  stroke={group.color}
                  strokeWidth="8"
                  strokeDasharray={`${group.percentage} ${100 - group.percentage}`}
                  strokeDashoffset={-group.offset}
                  style={{ "--donut-index": index } as CSSProperties}
                />
              ))}
            </svg>
            <span><AnimatedNumber value={distribution.dominant.count} duration={560} /></span>
          </div>
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
  const { userId, locale, onOpenEditor, recordDate, trendBundle, todaySnapshot, profile, view, openView } = props;
  const todayKey = `nava-sleep-alert-dismissed:${new Date().toISOString().slice(0, 10)}`;
  const [alertVisible, setAlertVisible] = useState(() => window.sessionStorage.getItem(todayKey) !== "1");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const latestSleep = useMemo(() => {
    if (todaySnapshot?.sleep) return todaySnapshot.sleep;
    const records = [...(trendBundle?.sleeps ?? [])].sort((a, b) => a.record_date.localeCompare(b.record_date));
    return records[records.length - 1] ?? null;
  }, [todaySnapshot?.sleep, trendBundle]);
  const displayStart = latestSleep?.sleep_start ?? "--:--";
  const displayEnd = latestSleep?.sleep_end ?? "--:--";
  const deepMinutes = latestSleep?.deep_sleep_minutes ?? 0;
  const lightMinutes = latestSleep?.light_sleep_minutes ?? 0;
  const remMinutes = latestSleep?.rem_minutes ?? 0;
  const total = Math.max(1, deepMinutes + lightMinutes + remMinutes);
  const score = Math.round(latestSleep?.rhythm_score ?? 0);
  const timeline = sleepTimelineGeometry(displayStart, displayEnd, latestSleep?.sleep_duration_minutes);
  const stageHeights = sleepStageHeights([deepMinutes, lightMinutes, remMinutes]);
  const sleepTrend = useMemo(() => {
    const records = new Map((trendBundle?.sleeps ?? []).map((record) => [record.record_date, record]));
    if (todaySnapshot?.sleep) records.set(recordDate, todaySnapshot.sleep);
    return [...records.values()]
      .sort((a, b) => a.record_date.localeCompare(b.record_date))
      .slice(-7)
      .map((record): BarLineTrendPoint => {
        const minutes = Math.max(0, record.sleep_duration_minutes ?? 0);
        const rhythmScore = Math.round(record.rhythm_score ?? Math.min(100, (minutes / 480) * 100));
        const hours = minutes / 60;
        return {
          id: record.id,
          label: shortDate(record.record_date, locale),
          barValue: minutes,
          lineValue: rhythmScore,
          barText: locale === "zh" ? `${hours.toFixed(1)} 小时` : `${hours.toFixed(1)} h`,
          lineText: locale === "zh" ? `${rhythmScore} 分` : `${rhythmScore} pts`,
        };
      });
  }, [locale, recordDate, todaySnapshot?.sleep, trendBundle]);
  const feedback = buildModuleFeedback({ module: "sleep", locale, profile, snapshot: todaySnapshot, trends: trendBundle });

  const enableNotification = async () => {
    await enableNavaNotifications(userId, "22:30");
    setNotificationEnabled(true);
  };

  if (view === "trend") return <ModuleDetailView compact title={locale === "zh" ? "睡眠趋势" : "Sleep trend"}>{sleepTrend.length > 0 ? <BarLineTrendChart points={sleepTrend} ariaLabel={locale === "zh" ? "近七日睡眠时长柱状图与节律评分折线图" : "Seven-day sleep duration bars and rhythm score line"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成睡眠记录后显示趋势" : "Log sleep to begin the trend"}</p>}<p>{locale === "zh" ? "柱形代表真实睡眠时长，折线代表对应日期的节律评分；柱形生长完成后折线才开始绘制。" : "Bars show actual sleep duration and the line shows the corresponding rhythm score. The line draws after the bars finish."}</p></ModuleDetailView>;

  return (
    <div className="module-dashboard sleep-dashboard" data-module-view="sleep-overview">
      {alertVisible && latestSleep && <section className="sleep-alert"><MoonStar size={20} /><button className="sleep-alert-copy" type="button" onClick={() => openView("alert")}><strong>{locale === "zh" ? "作息节律提醒" : "Sleep rhythm note"}</strong><p>{locale === "zh" ? `最近一次在 ${displayStart} 入睡，建议围绕这一时间提前 30 分钟放松。` : `Your latest bedtime was ${displayStart}. Start winding down 30 minutes beforehand.`}</p></button><button type="button" onClick={() => setAlertVisible(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={18} /></button></section>}
      <section className="figma-module-card sleep-summary-card">
        <header><strong>{locale === "zh" ? "睡眠摘要" : "Sleep summary"}</strong><button className="module-card-text-action" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "更新睡眠记录" : "Update sleep record"}><span>{locale === "zh" ? "设备导入 / 更新" : "Import / update"}</span><ChevronRight size={18} /></button></header>
        <div className="sleep-timeline"><span>{displayStart}</span><div><i style={{ "--sleep-left": `${timeline.leftPercent}%`, "--sleep-width": `${timeline.widthPercent}%` } as CSSProperties} /></div><span>{displayEnd}</span></div>
        <div className="sleep-stage-row">
          <div className="sleep-stage-shape"><i style={{ flex: deepMinutes / total, "--stage-height": `${stageHeights[0]}%` } as CSSProperties} /><i style={{ flex: lightMinutes / total, "--stage-height": `${stageHeights[1]}%` } as CSSProperties} /><i style={{ flex: remMinutes / total, "--stage-height": `${stageHeights[2]}%` } as CSSProperties} /></div>
          <ul><li><i />{locale === "zh" ? "深睡" : "Deep"}</li><li><i />{locale === "zh" ? "浅睡" : "Light"}</li><li><i />REM</li></ul>
          <strong>{latestSleep ? <AnimatedNumber value={score} /> : "--"}<small>{locale === "zh" ? "分" : "pts"}</small></strong>
        </div>
      </section>
      <section className="figma-module-card sleep-trend-card">
        <header><strong>{locale === "zh" ? "7 日趋势" : "7-day trend"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("trend")} aria-label={locale === "zh" ? "查看睡眠趋势" : "View sleep trend"}><ChevronRight size={18} /></button></header>
        {sleepTrend.length > 0
          ? <BarLineTrendChart points={sleepTrend} ariaLabel={locale === "zh" ? "近七日睡眠时长柱状图与节律评分折线图" : "Seven-day sleep duration bars and rhythm score line"} />
          : <p className="module-empty-copy">{locale === "zh" ? "完成睡眠记录后显示趋势" : "Log sleep to begin the trend"}</p>}
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
    value: Math.round(record.total_calories),
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
          <div><span>{locale === "zh" ? "今日饮食" : "Today's diet"}</span><strong><AnimatedNumber value={nutrition?.total_calories ?? 0} /><small> kcal</small></strong></div>
          <button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "记录饮食" : "Log a meal"}><Camera size={20} /></button>
        </header>
        <div className="diet-completion">
          <span><strong><AnimatedNumber value={completedMeals} duration={520} />/3</strong><small>{locale === "zh" ? "正餐" : "meals"}</small></span>
          <span><strong><AnimatedNumber value={itemCount} duration={600} /></strong><small>{locale === "zh" ? "食物项" : "items"}</small></span>
          <span><strong><AnimatedNumber value={records.length} duration={680} /></strong><small>{locale === "zh" ? "近七日记录" : "logged days"}</small></span>
        </div>
        <div className="diet-macro-summary">
          <span>P <AnimatedNumber value={Math.round(nutrition?.protein_grams ?? 0)} />g</span>
          <span>C <AnimatedNumber value={Math.round(nutrition?.carbohydrate_grams ?? 0)} />g</span>
          <span>F <AnimatedNumber value={Math.round(nutrition?.fat_grams ?? 0)} />g</span>
          <span><AnimatedNumber value={Math.round(nutrition?.hydration_ml ?? 0)} />ml</span>
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
        {trendPoints.length > 0 ? <LineTrendChart points={trendPoints} compact scale="auto" ariaLabel={locale === "zh" ? "近七日饮食能量趋势，单位千卡" : "Seven-day dietary energy trend in kilocalories"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一餐记录后显示趋势" : "Log a meal to begin the trend"}</p>}
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
          <div className="face-score-ring" style={{ "--face-score": `${face?.overall_score ?? 0}%` } as CSSProperties}><ScanFace size={28} /><strong>{face?.overall_score == null ? "--" : <AnimatedNumber value={face.overall_score} />}</strong></div>
          <div><span>{locale === "zh" ? "肤龄参考" : "Skin-age reference"}<strong>{face?.skin_age == null ? "--" : <AnimatedNumber value={face.skin_age} />}</strong></span><span>{locale === "zh" ? "拍摄模式" : "Capture mode"}<strong>{face?.capture_mode === "makeup" ? (locale === "zh" ? "带妆" : "Makeup") : (locale === "zh" ? "素颜" : "Bare")}</strong></span><span>{locale === "zh" ? "分析置信度" : "Confidence"}<strong>{face?.analysis_confidence != null ? <><AnimatedNumber value={face.analysis_confidence * 100} />%</> : "--"}</strong></span></div>
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
  const todayMinutes = todaySnapshot?.focusMinutes ?? 0;
  const todaySessions = todaySnapshot?.focusSessions ?? 0;
  const recentFocus = focusRecords.slice(-4);
  const sortedFocusDistributions = [...(trendBundle?.focusDistributions ?? [])]
    .sort((a, b) => a.record_date.localeCompare(b.record_date));
  const latestFocusDistribution = sortedFocusDistributions[sortedFocusDistributions.length - 1];
  const focusPeriodValues = latestFocusDistribution
    ? [
        { id: "night", label: locale === "zh" ? "深夜" : "Night", value: latestFocusDistribution.period_0_6 },
        { id: "morning", label: locale === "zh" ? "上午" : "AM", value: latestFocusDistribution.period_6_12 },
        { id: "afternoon", label: locale === "zh" ? "下午" : "PM", value: latestFocusDistribution.period_12_18 },
        { id: "evening", label: locale === "zh" ? "晚间" : "Eve", value: latestFocusDistribution.period_18_24 },
      ]
    : recentFocus.map((record) => ({ id: record.id, label: shortDate(record.record_date, locale), value: record.total_minutes }));
  const focusPeriodMax = Math.max(1, ...focusPeriodValues.map((period) => period.value));
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
          <span><small>{locale === "zh" ? "今日共计专注" : "Sessions"}</small><strong><AnimatedNumber value={todaySessions} /></strong>{locale === "zh" && <small>次</small>}</span>
          <span><small>{locale === "zh" ? "总时长" : "Total"}</small><strong><AnimatedNumber value={Math.floor(todayMinutes / 60)} /></strong><small>{locale === "zh" ? "小时" : "h"}</small><strong><AnimatedNumber value={todayMinutes % 60} /></strong><small>{locale === "zh" ? "分" : "m"}</small></span>
        </div>
      </section>
      <div className="focus-grid">
        <section className="figma-module-card focus-period-card"><header>{latestFocusDistribution ? (locale === "zh" ? "最近一次时段分布" : "Latest time-of-day") : (locale === "zh" ? "近 4 日时长" : "Last 4 days")}</header><div>{focusPeriodValues.map((period) => <span key={period.id}><i title={`${period.label} · ${period.value} min`} style={{ height: `${Math.max(8, (period.value / focusPeriodMax) * 100)}%` }} /><small>{period.label}</small></span>)}</div></section>
        <section className="figma-module-card focus-category-card"><header>{locale === "zh" ? "今日目标" : "Daily goal"}</header><div className="focus-pie" style={{ "--ring-progress": `${goalProgress}%` } as CSSProperties}><span><AnimatedNumber value={goalProgress} />%</span></div></section>
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
