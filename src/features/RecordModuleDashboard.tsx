import {
  Activity,
  AudioLines,
  Bell,
  BellOff,
  Bluetooth,
  Bot,
  Camera,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Gauge,
  HeartPulse,
  Lightbulb,
  Maximize2,
  Minimize2,
  MoonStar,
  MousePointerClick,
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
  Volume2,
  Watch,
  Utensils,
  X,
} from "lucide-react";
import ReminderSettings from "../components/ReminderSettings";
import MoodBreathing from "../components/MoodBreathing";
import MonthlyWellbeing from "../components/MonthlyWellbeing";
import { exerciseStageAt } from "../services/exerciseStages";
import { exerciseMascotFeedback } from "../services/exerciseMascotFeedback";
import { getTrends } from "../services/records";
import { setTodoCompleted } from "../services/productivity";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { createPortal } from "react-dom";
import AnimatedNumber from "../components/AnimatedNumber";
import BarLineTrendChart, { type BarLineTrendPoint } from "../components/BarLineTrendChart";
import LineTrendChart from "../components/LineTrendChart";
import { SkeletonBars, SkeletonLines } from "../components/PageSkeleton";
import MascotImage from "../components/MascotImage";
import MorningPlanningRitual, { type MorningTaskPlan } from "../components/MorningPlanningRitual";
import { useLocale } from "../i18n";
import dietInsightMascot from "../assets/mascot/nava-eat-v5.webp";
import sleepInsightMascot from "../assets/mascot/nava-sleep-v1.webp";
import exerciseInsightMascot from "../assets/mascot/nava-lift-v1.webp";
import moodInsightMascot from "../assets/mascot/nava-journal-v1.webp";
import focusInsightMascot from "../assets/mascot/nava-read-v1.webp";
import faceInsightMascot from "../assets/mascot/nava-mirror-v1.webp";
import emptyTodayMascot from "../assets/mascot/nava-empty-cry-v1.webp";
import animatedDietMascot from "../assets/mascot/animated/module-diet.webp";
import animatedSleepMascot from "../assets/mascot/animated/module-sleep.webp";
import animatedExerciseMascot from "../assets/mascot/animated/module-exercise.webp";
import animatedMoodMascot from "../assets/mascot/animated/module-mood.webp";
import animatedFocusMascot from "../assets/mascot/animated/module-focus.webp";
import animatedFaceMascot from "../assets/mascot/animated/module-face.webp";
import animatedEmptyMascot from "../assets/mascot/animated/home-fluff-2.webp";
import type { FocusRecord, FoodItem, MoodRecord, TodaySnapshot, TrendBundle } from "../types";
import { enableNavaNotifications, loadNotificationPreference } from "../services/notifications";
import { loadDietAiReport, type DietAiReport } from "../services/dietReport";
import { healthReportSourceRevision, loadHealthAiReport, type HealthAiReport } from "../services/healthReport";
import {
  getHealthAuthorizationStatus,
  getLastHealthSyncAt,
  isNativeHealthAvailable,
  requestHealthAuthorization,
  syncNativeHealthNow,
} from "../services/health";
import { getWatchReachability } from "../services/watch";
import type { ReportCardOptions } from "../services/reportShareCard";
import ReportSharePreview from "../components/ReportSharePreview";
import { addTodo, saveTodoFocusPlan, saveTodoPriorityOrder, saveTodoQuadrant, subscribeProductivity, syncTodos, todoQuadrant, toggleTodo, type GrowthActivityKind, type TodoItem, type TodoQuadrant } from "../services/productivity";
import { isCompleteMoodRecord, moodBandForScore, moodBands, moodDateWindow } from "../services/mood";
import {
  activityHeatmap,
  activityPeriodDistribution,
  clockAlignmentScore,
  latestVitals,
  sleepStageHeights,
  sleepTimelineGeometry,
} from "../services/visualMetrics";
import type { UserProfile } from "../services/profile";
import type { FocusLaunchConfig, RecordModule } from "./RecordsScreen";
import { rollingDateWindow } from "../services/date";
import { knownFaceMode, latestKnownFaceMode, previousComparableFace, sameModeFaces } from "../services/faceComparison";
import { currentDayRequiredShareCopy, hasCurrentDayRecord, missingCurrentDayCopy } from "../services/historyReportState";
import { isDemoMode } from "../services/demo";
import { clearActiveUserSession, loadActiveUserSession, saveActiveUserSession } from "../services/userCloudState";
import { resolveTodoFocusPlan } from "../services/focusPlanning.ts";
import { formatFocusHealthEvidence, nextFocusEncouragementAt, type FocusHealthEvidence } from "../services/focusEncouragement";
import { generateFocusDifficulty, generateFocusInSessionEncouragement, generateFocusPriority, generateFocusStartingCue } from "../services/ai";
import { exitFocusFullscreen, focusFullscreenActive, focusFullscreenSupported, requestFocusFullscreen, requestScreenWakeLock, screenWakeLockSupported, type ScreenWakeLockSentinel } from "../services/focusImmersion.ts";
import { focusNoiseSupported, startFocusNoise, type FocusNoiseKind, type FocusNoiseSession } from "../services/focusAudio.ts";
import { abandonExerciseSession, exerciseSessionElapsedSeconds, finishExerciseSession, hydrateExerciseSession, pauseExerciseSession, resumeExerciseSession, startExerciseSession, type ExerciseSession } from "../services/exerciseSession.ts";
import { usePreviewActivity } from "../hooks/usePreviewActivity";
import PreviewInterruptionNotice from "../components/PreviewInterruptionNotice";
import type { PreviewReason } from "../services/previewEnvironment";

type MoodFactor = { value: string; label: string };

type FocusInterruptionReason = PreviewReason;
type FocusInterruptionReasons = Record<FocusInterruptionReason, number>;

const emptyFocusInterruptionReasons = (): FocusInterruptionReasons => ({ message: 0, call: 0, distraction: 0, other: 0 });

function normalizeFocusInterruptionReasons(value: Partial<FocusInterruptionReasons> | undefined): FocusInterruptionReasons {
  const normalized = emptyFocusInterruptionReasons();
  (Object.keys(normalized) as FocusInterruptionReason[]).forEach((reason) => {
    normalized[reason] = Math.max(0, Math.round(Number(value?.[reason]) || 0));
  });
  return normalized;
}

type FocusTimerDraft = {
  sessionId?: string;
  mode: "countdown" | "countup";
  countdownDurationSeconds: number;
  remaining: number;
  elapsedSeconds: number;
  interruptions: number;
  interruptionReasons: FocusInterruptionReasons;
  startedAt?: string;
  title?: string;
  note?: string;
  category: string;
  selectedTodoId?: string;
};

function normalizeFocusTimerDraft(parsed: Partial<FocusTimerDraft> | null): FocusTimerDraft | null {
    if (!parsed || (parsed.mode !== "countdown" && parsed.mode !== "countup")) return null;
    const duration = Number(parsed.countdownDurationSeconds);
    const remaining = Number(parsed.remaining);
    const elapsed = Number(parsed.elapsedSeconds);
    if (![duration, remaining, elapsed].every((value) => Number.isFinite(value) && value >= 0)) return null;
    return {
      mode: parsed.mode,
      sessionId: typeof parsed.sessionId === "string" && parsed.sessionId.length >= 8 ? parsed.sessionId : undefined,
      countdownDurationSeconds: Math.min(180 * 60, Math.max(1, Math.round(duration))),
      remaining: Math.min(180 * 60, Math.max(0, Math.round(remaining))),
      elapsedSeconds: Math.max(0, Math.round(elapsed)),
      interruptions: Math.max(0, Math.round(Number(parsed.interruptions) || 0)),
      interruptionReasons: normalizeFocusInterruptionReasons(parsed.interruptionReasons),
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      note: typeof parsed.note === "string" ? parsed.note : undefined,
      category: typeof parsed.category === "string" && parsed.category ? parsed.category : "work",
      selectedTodoId: typeof parsed.selectedTodoId === "string" ? parsed.selectedTodoId : undefined,
    };
}

function readFocusTimerDraft(userId: string): FocusTimerDraft | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`nava-focus-timer:${userId}`) ?? "null") as Partial<FocusTimerDraft> | null;
    return normalizeFocusTimerDraft(parsed);
  } catch {
    return null;
  }
}

type Props = {
  userId: string;
  module: RecordModule;
  moodScore: number;
  setMoodScore: (value: number, immediate?: boolean) => void;
  moodFactors: MoodFactor[];
  selectedFactors: string[];
  setPrimaryFactor: (value: string) => void;
  toggleMoodFactor: (value: string) => void;
  diary: string;
  setDiary: (value: string) => void;
  onSaveMood: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  sleepStart: string;
  sleepEnd: string;
  deepSleep: number;
  lightSleep: number;
  remSleep: number;
  sleepRating: number;
  steps: number | null;
  calories: number | null;
  exerciseMinutes: number | null;
  exerciseNote: string;
  setExerciseMinutes: (value: number) => void;
  setExerciseNote: (value: string) => void;
  focusTitle: string;
  focusMinutes: number;
  focusNote: string;
  setFocusTitle: (value: string) => void;
  setFocusMinutes: (value: number) => void;
  setFocusNote: (value: string) => void;
  focusLaunch: FocusLaunchConfig | null;
  onFocusLaunchConsumed: () => void;
  onOpenEditor: () => void;
  onOpenDietCamera: () => void;
  onOpenFaceCamera: () => void;
  onOpenDietMeal: (meal: "breakfast" | "lunch" | "dinner" | "pantry") => void;
  onSaveFocusMinutes: (minutes: number, details?: { taskId?: string; interruptions?: number; startedAt?: string; endedAt?: string; category?: string; note?: string; sourceActionId?: string }) => Promise<boolean>;
  busy: string | null;
  recordDate: string;
  deviceDate: string;
  todaySnapshot: TodaySnapshot | null;
  trendBundle: TrendBundle | null;
  profile: UserProfile | null;
  initialView?: string | null;
  onViewChange?: (view: string | null, replace?: boolean) => void;
  onGrowthActivity?: (activity: GrowthActivityKind) => void | Promise<unknown>;
  onOpenAi?: (prompt: string) => void;
  onOpenWeeklyReport?: () => void;
};

type OpenModuleView = (view: string, returnToPrevious?: boolean) => void;

const reportMascotByModule: Record<RecordModule, string> = {
  mood: moodInsightMascot,
  sleep: sleepInsightMascot,
  exercise: exerciseInsightMascot,
  diet: dietInsightMascot,
  focus: focusInsightMascot,
  face: faceInsightMascot,
};

const animatedReportMascotByModule: Record<RecordModule, string> = {
  mood: animatedMoodMascot,
  sleep: animatedSleepMascot,
  exercise: animatedExerciseMascot,
  diet: animatedDietMascot,
  focus: animatedFocusMascot,
  face: animatedFaceMascot,
};

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
  windowEndDate = recordDate,
) {
  const dateWindow = new Set(moodDateWindow(windowEndDate));
  const records = new Map((trendBundle?.moods ?? [])
    .filter((record) => dateWindow.has(record.record_date))
    .map((record) => [record.record_date, record]));
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
  return [...records.values()].sort((a, b) => a.record_date.localeCompare(b.record_date));
}

function moodTrendPoints(records: MoodRecord[], recordDate: string, locale: "zh" | "en"): BarLineTrendPoint[] {
  const byDate = new Map(records.map((record) => [record.record_date, record]));
  return moodDateWindow(recordDate).map((date) => {
    const record = byDate.get(date);
    const value = record?.mood_score ?? 0;
    return {
      id: date,
      label: shortDate(date, locale),
      barValue: value,
      lineValue: value,
      barText: record ? `${value}` : (locale === "zh" ? "暂无记录" : "No entry"),
      lineText: record ? `${value}` : (locale === "zh" ? "暂无记录" : "No entry"),
      missing: !record,
    };
  });
}

function moodDistribution(records: MoodRecord[], locale: "zh" | "en") {
  const colors = ["#075f88", "#238fb8", "#62bfdb", "#a3ddec", "#d8eef6"];
  const groups = moodBands.map((band, index) => ({
    key: band.key,
    label: locale === "zh" ? band.zh : band.en,
    color: colors[index],
    count: 0,
  }));
  records.forEach((record) => {
    const index = moodBands.findIndex((band) => band.key === moodBandForScore(record.mood_score).key);
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

function ModuleDetailView({
  title,
  compact = false,
  className,
  children,
}: {
  title: string;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="module-dashboard module-subview" data-module-view="module-subview">
      <section className={["figma-module-card", "module-subview-card", compact ? "is-compact" : "", className].filter(Boolean).join(" ")}>
        <header><strong>{title}</strong></header>
        {children}
      </section>
    </div>
  );
}

function HistoryView({
  module,
  locale,
  trendBundle: initialTrendBundle,
  userId,
  profile,
  deviceDate,
  onGrowthActivity,
}: {
  module: RecordModule;
  locale: "zh" | "en";
  trendBundle: TrendBundle | null;
  profile: UserProfile | null;
  deviceDate: string;
  userId: string;
  onGrowthActivity?: (activity: GrowthActivityKind) => void | Promise<unknown>;
}) {
  const [reportDate, setReportDate] = useState(deviceDate);
  const previousDeviceDate = useRef(deviceDate);
  const [loadedHistory, setLoadedHistory] = useState<{ date: string; userId: string; data: TrendBundle } | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const trendBundle = reportDate === deviceDate ? initialTrendBundle : loadedHistory?.date === reportDate && loadedHistory.userId === userId ? loadedHistory.data : null;
  useEffect(() => {
    const previous = previousDeviceDate.current;
    previousDeviceDate.current = deviceDate;
    setReportDate((date) => date === previous ? deviceDate : date);
  }, [deviceDate]);
  useEffect(() => {
    if (reportDate === deviceDate) return;
    let active = true;
    setHistoryError(false);
    void getTrends(userId, reportDate).then((data) => { if (active) setLoadedHistory({ date: reportDate, userId, data }); }).catch(() => { if (active) setHistoryError(true); });
    return () => { active = false; };
  }, [deviceDate, reportDate, userId, historyRetry, initialTrendBundle]);
  const moduleNames: Record<RecordModule, { zh: string; en: string }> = {
    mood: { zh: "情绪", en: "Mood" },
    sleep: { zh: "睡眠", en: "Sleep" },
    exercise: { zh: "运动", en: "Activity" },
    diet: { zh: "饮食", en: "Diet" },
    focus: { zh: "专注", en: "Focus" },
    face: { zh: "面部", en: "Face" },
  };
  const entries = useMemo(() => {
    if (!trendBundle) return [];
    const records = module === "mood"
      ? trendBundle.moods.map((record) => ({ id: record.id, date: record.record_date, value: record.mood_score }))
      : module === "sleep"
        ? trendBundle.sleeps.flatMap((record) => record.sleep_duration_minutes == null ? [] : [{ id: record.id, date: record.record_date, value: record.sleep_duration_minutes }])
        : module === "exercise"
          ? trendBundle.exercises.flatMap((record) => record.steps == null ? [] : [{ id: record.id, date: record.record_date, value: record.steps }])
          : module === "diet"
            ? trendBundle.nutritions.map((record) => ({ id: record.id, date: record.record_date, value: record.total_calories }))
            : module === "focus"
              ? aggregateFocusByDate(trendBundle.focus).map((record) => ({ id: record.id, date: record.record_date, value: record.total_minutes }))
              : sameModeFaces(trendBundle.faces, latestKnownFaceMode(trendBundle.faces, reportDate), reportDate).map((record) => ({ id: record.id, date: record.record_date, value: record.overall_score }));
    return records.sort((left, right) => left.date.localeCompare(right.date));
  }, [reportDate, module, trendBundle]);
  const displayEntries = useMemo(() => {
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));
    return rollingDateWindow(reportDate).map((date) => byDate.get(date) ?? ({ id: `missing-${module}-${date}`, date, value: null }));
  }, [reportDate, entries, module]);
  const recordedEntries = useMemo(
    () => displayEntries.filter((entry): entry is { id: string; date: string; value: number } => entry.value != null),
    [displayEntries],
  );
  const recordedToday = useMemo(() => hasCurrentDayRecord(displayEntries, reportDate), [reportDate, displayEntries]);
  // Development-only visual fixture for the missing-today report state.
  const forceMissingToday = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "today-missing";
  const hasTodayRecord = recordedToday && !forceMissingToday;
  const sortedNutrition = useMemo(() => trendBundle?.nutritions.filter((item) => item.record_date <= reportDate).slice().sort((a, b) => a.record_date.localeCompare(b.record_date)) ?? [], [reportDate, trendBundle]);
  const todayNutrition = sortedNutrition.find((item) => item.record_date === reportDate) ?? null;
  const [dietReport, setDietReport] = useState<DietAiReport | null>(null);
  const [healthReport, setHealthReport] = useState<HealthAiReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const reportKey = `${userId}:${module}:${reportDate}:${locale}`;
  const [reportResultKey, setReportResultKey] = useState("");
  const reportRefreshHandledRef = useRef(0);
  const [sharePreview, setSharePreview] = useState<ReportCardOptions | null>(null);
  const [shareComplete, setShareComplete] = useState(false);
  const shareCompleteTimerRef = useRef<number | null>(null);
  const healthSourceRevision = module === "diet" ? undefined : healthReportSourceRevision({ scope: module, endDate: reportDate, trendBundle, profile });
  useEffect(() => () => {
    if (shareCompleteTimerRef.current !== null) window.clearTimeout(shareCompleteTimerRef.current);
  }, []);
  useEffect(() => {
    if (module !== "diet") return;
    if (!hasTodayRecord || !todayNutrition) {
      setDietReport(null);
      setReportError(null);
      setReportLoading(false);
      return;
    }
    let active = true;
    const refresh = reportRefreshKey > reportRefreshHandledRef.current;
    reportRefreshHandledRef.current = reportRefreshKey;
    setDietReport(null);
    setReportLoading(true);
    setReportError(null);
    void loadDietAiReport({ date: todayNutrition.record_date, locale, refresh })
      .then((report) => {
        if (active) { setDietReport(report); setReportResultKey(reportKey); }
      })
      .catch((error) => {
        console.warn("AI diet report generation deferred", error);
        if (active) setReportError(error instanceof Error && error.message.trim()
          ? error.message
          : (locale === "zh" ? "AI 饮食洞察生成失败，请重新生成。" : "AI diet insights could not be generated. Please try again."));
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hasTodayRecord, locale, module, reportRefreshKey, todayNutrition, reportKey]);
  useEffect(() => {
    if (module === "diet") return;
    if (!hasTodayRecord) {
      setHealthReport(null);
      setReportError(null);
      setReportLoading(false);
      return;
    }
    let active = true;
    const refresh = reportRefreshKey > reportRefreshHandledRef.current;
    reportRefreshHandledRef.current = reportRefreshKey;
    setHealthReport(null);
    setReportLoading(true);
    setReportError(null);
    void loadHealthAiReport({ scope: module, endDate: reportDate, locale, refresh, sourceRevision: healthSourceRevision })
      .then((report) => {
        if (active) { setHealthReport(report); setReportResultKey(reportKey); }
      })
      .catch((error) => {
        console.warn("AI health report generation deferred", error);
        if (active) setReportError(error instanceof Error && error.message.trim()
          ? error.message
          : (locale === "zh" ? "AI 健康洞察生成失败，请重新生成。" : "AI health insights could not be generated. Please try again."));
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reportDate, hasTodayRecord, healthSourceRevision, locale, module, reportRefreshKey, reportKey]);
  const reportInsights = hasTodayRecord && reportResultKey === reportKey ? (module === "diet" ? (dietReport?.bullets ?? []) : (healthReport?.bullets ?? [])) : [];
  const reportIsDemo = module === "diet" ? dietReport?.modelVersion === "demo-only" : healthReport?.provider === "demo";
  const shareSummary = () => {
    if (!hasTodayRecord) return;
    setShareComplete(false);
    setSharePreview({
        module,
        moduleLabel: moduleNames[module][locale],
        entries: recordedEntries.map(({ date, value }) => ({ date, value })),
        insights: [...reportInsights],
        insightsAreDemo: reportIsDemo,
        mascotUrl: reportMascotByModule[module],
        locale,
        endDate: reportDate,
        valueFormatter: (value) => historyValueText(module, value, locale),
      });
  };
  const shareFinished = () => {
      setSharePreview(null);
      void Promise.resolve().then(() => onGrowthActivity?.("share")).catch(() => console.warn("Share reward not confirmed"));
      setShareComplete(true);
      if (shareCompleteTimerRef.current !== null) window.clearTimeout(shareCompleteTimerRef.current);
      shareCompleteTimerRef.current = window.setTimeout(() => {
        shareCompleteTimerRef.current = null;
        setShareComplete(false);
      }, 2400);
  };
  return (
    <ModuleDetailView
      className="module-history-report-card"
      title={`${moduleNames[module][locale]}${locale === "zh" ? "趋势报告" : " trend report"}`}
    >
      <div className="history-report-date"><label>{locale === "zh" ? "报告日期" : "Report date"}<input type="date" aria-label={locale === "zh" ? "报告日期" : "Report date"} value={reportDate} max={deviceDate} onChange={(event) => { const date = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= deviceDate && date !== reportDate) { setLoadedHistory(null); setReportDate(date); setDietReport(null); setHealthReport(null); setReportError(null); setSharePreview(null); } }} /></label><button type="button" onClick={() => { if (reportDate === deviceDate) return; setReportDate(deviceDate); setDietReport(null); setHealthReport(null); setReportError(null); setSharePreview(null); }}>{locale === "zh" ? "今天" : "Today"}</button></div>
      {historyError && reportDate !== deviceDate ? <div role="alert"><p>{locale === "zh" ? "历史记录加载失败，请重试。" : "History could not be loaded. Retry."}</p><button type="button" onClick={() => setHistoryRetry((value) => value + 1)}>{locale === "zh" ? "重试" : "Retry"}</button></div> : trendBundle ? <>
        {recordedEntries.length > 0
          ? <ReportTrendChart entries={displayEntries} module={module} locale={locale} />
          : <div className="module-history-chart-empty"><CalendarDays size={22} /><span>{locale === "zh" ? "近七日暂无记录" : "No entries in the last seven days"}</span></div>}
        <div className={`module-history-list module-history-list--${module}`}>
          {displayEntries.slice(-3).reverse().map((entry) => <p key={entry.id}><CalendarDays size={16} /><span>{shortDate(entry.date, locale)}</span><strong>{entry.value == null ? (locale === "zh" ? "暂无记录" : "No entry") : historyValueText(module, entry.value, locale)}</strong></p>)}
        </div>
        {hasTodayRecord
          ? <section className="diet-ai-report module-ai-report" aria-live="polite" data-report-today-state="ready" data-ai-state={reportLoading ? "loading" : reportError ? "error" : reportInsights.length ? "ready" : "idle"} data-report-date={reportDate}>
              <div className="diet-ai-report-copy">
                <header><span><Bot size={16} /></span><strong>{reportIsDemo
                  ? (locale === "zh" ? `演示${moduleNames[module].zh}洞察` : `Demo ${moduleNames[module].en.toLowerCase()} insights`)
                  : (locale === "zh" ? `AI ${moduleNames[module].zh}洞察` : `AI ${moduleNames[module].en.toLowerCase()} insights`)}</strong></header>
                {reportLoading
                  ? <SkeletonLines count={3} compact />
                  : <ul>{reportInsights.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}</ul>}
                {reportError && <div className="module-ai-error"><small className="module-ai-fallback-note">{reportError}</small></div>}<button className="ai-report-refresh" type="button" disabled={reportLoading} onClick={() => setReportRefreshKey((key) => key + 1)}><RefreshCw size={16} />{locale === "zh" ? "重新生成" : "Generate again"}</button>
              </div>
              <MascotImage
                className="diet-ai-mascot module-ai-mascot"
                animatedSrc={animatedReportMascotByModule[module]}
                staticSrc={reportMascotByModule[module]}
                alt={locale === "zh" ? `NAVA 小猫展示${moduleNames[module].zh}主题动作` : `NAVA cat illustrating the ${moduleNames[module].en.toLowerCase()} report`}
                loading="lazy"
              />
            </section>
          : <section className="module-today-empty-state" aria-live="polite" data-report-today-state="missing">
              <MascotImage className="module-today-empty-mascot" animatedSrc={animatedEmptyMascot} staticSrc={emptyTodayMascot} alt={locale === "zh" ? "NAVA 小猫等待今日记录" : "NAVA cat waiting for today's entry"} loading="lazy" />
              <p>{reportDate === deviceDate ? missingCurrentDayCopy(module, locale) : (locale === "zh" ? "所选日期没有该项记录，无法生成当天的 AI 洞察。" : "No entry for this date; AI insights cannot be generated.")}</p>
            </section>}
        <button
          className={`module-history-share${hasTodayRecord ? "" : " is-today-missing"}`}
          type="button"
          disabled={!hasTodayRecord}
          onClick={shareSummary}
        ><Share2 size={16} />{!hasTodayRecord ? (reportDate === deviceDate ? currentDayRequiredShareCopy(module, locale) : (locale === "zh" ? "所选日期未记录" : "No entry on this date")) : shareComplete ? (locale === "zh" ? "图片已生成" : "Image ready") : (locale === "zh" ? "预览并分享" : "Preview & share")}</button>
        {sharePreview?.module === module && sharePreview.endDate === reportDate && <ReportSharePreview options={sharePreview} onClose={() => setSharePreview(null)} onComplete={shareFinished} />}
      </> : <div className="module-history-loading"><SkeletonBars /><SkeletonLines count={3} compact /></div>}
    </ModuleDetailView>
  );
}

function ReportTrendChart({ entries, module, locale }: { entries: Array<{ id: string; date: string; value: number | null }>; module: RecordModule; locale: "zh" | "en" }) {
  const width = 700;
  const height = 440;
  const left = 48;
  const right = 652;
  // Reserve a label band so the maximum value uses the same gap as every
  // other bar instead of colliding with the chart's top edge.
  const top = 28;
  const bottom = 400;
  const valueLabelGap = 9;
  const values = entries.flatMap((entry) => entry.value == null ? [] : [entry.value]);
  if (values.length === 0) return null;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = Math.max(1, rawMax - rawMin);
  // Reports compare the current seven-day window rather than measuring from zero:
  // the lowest real value keeps a readable base height and the highest reaches the top.
  const minimumBarRatio = 0.34;
  const xAt = (index: number) => left + (entries.length <= 1 ? (right - left) / 2 : (index / (entries.length - 1)) * (right - left));
  const yAt = (value: number) => {
    const valueRatio = rawMax === rawMin ? 0.5 : (value - rawMin) / rawRange;
    const heightRatio = minimumBarRatio + valueRatio * (1 - minimumBarRatio);
    return bottom - heightRatio * (bottom - top);
  };
  const points = entries.map((entry, index) => {
    if (entry.value == null) return null;
    const barTop = yAt(entry.value);
    return { x: xAt(index), y: (barTop + bottom) / 2, index };
  });
  const lineSegments: Array<Array<NonNullable<(typeof points)[number]>>> = [];
  points.forEach((point, index) => {
    if (!point) return;
    if (index > 0 && points[index - 1] && lineSegments.length > 0) lineSegments[lineSegments.length - 1].push(point);
    else lineSegments.push([point]);
  });

  return <div className="diet-history-trend-chart report-history-trend-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={locale === "zh" ? "近七日柱状图与折线趋势，折线点位于每根柱子的几何中心" : "Seven-day bars and line trend with points at each bar's geometric center"}>
      {[0.25, 0.5, 0.75].map((ratio) => <line className="diet-history-grid" key={ratio} x1={left} x2={right} y1={top + ratio * (bottom - top)} y2={top + ratio * (bottom - top)} />)}
      {entries.map((entry, index) => {
        const x = xAt(index);
        const y = entry.value == null ? null : yAt(entry.value);
        return <g className="diet-history-bar" key={entry.id} transform={`translate(${x} 0)`} style={{ "--history-index": index } as CSSProperties}>
          {entry.value != null && y != null && <><rect x="-15" y={y} width="30" height={bottom - y} rx="8"><title>{`${shortDate(entry.date, locale)} · ${historyValueText(module, entry.value, locale)}`}</title></rect>
          <text className="diet-history-value" x="0" y={y - valueLabelGap} textAnchor="middle">{module === "sleep" ? (entry.value / 60).toFixed(1) : Math.round(entry.value)}</text></>}
          <text className="diet-history-date" x="0" y="430" textAnchor="middle">{shortDate(entry.date, locale)}</text>
        </g>;
      })}
      {lineSegments.filter((segment) => segment.length > 1).map((segment, segmentIndex) => <path className="diet-history-line" d={segment.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")} key={segmentIndex} pathLength="1" />)}
      {points.flatMap((point) => point ? [<circle className="diet-history-dot" key={entries[point.index].id} cx={point.x} cy={point.y} r="5" style={{ "--history-index": point.index } as CSSProperties} />] : [])}
    </svg>
  </div>;
}

function historyValueText(module: RecordModule, value: number, locale: "zh" | "en") {
  const rounded = Math.round(value);
  if (module === "sleep") {
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    return locale === "zh" ? `${hours}小时${minutes}分` : `${hours}h ${minutes}m`;
  }
  if (module === "exercise") return locale === "zh" ? `${rounded} 步` : `${rounded} steps`;
  if (module === "diet") return `${rounded} kcal`;
  if (module === "focus") return locale === "zh" ? `${rounded} 分钟` : `${rounded} min`;
  return locale === "zh" ? `${rounded} 分` : `${rounded}`;
}

function ExerciseDashboard({
  userId,
  locale,
  steps,
  onOpenEditor,
  recordDate,
  deviceDate,
  trendBundle,
  todaySnapshot,
  exerciseNote,
  setExerciseMinutes,
  setExerciseNote,
  view,
  openView,
}: Pick<Props, "userId" | "steps" | "calories" | "exerciseMinutes" | "exerciseNote" | "setExerciseMinutes" | "setExerciseNote" | "onOpenEditor" | "recordDate" | "deviceDate" | "trendBundle" | "todaySnapshot" | "profile"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<{ paired: boolean; reachable: boolean } | null>(null);
  const [healthAuthorization, setHealthAuthorization] = useState<Awaited<ReturnType<typeof getHealthAuthorizationStatus>> | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [sportsPresetId, setSportsPresetId] = useState<"recommended" | "mobility" | "walk" | "recovery">("recommended");
  const [exerciseSession, setExerciseSession] = useState<ExerciseSession | null>(null);
  const [exerciseSessionNow, setExerciseSessionNow] = useState(() => Date.now());
  const [exerciseSessionMessage, setExerciseSessionMessage] = useState<string | null>(null);
  const [exerciseSyncBusy, setExerciseSyncBusy] = useState(false);
  const [exerciseHydrating, setExerciseHydrating] = useState(true);
  const exerciseSyncLock = useRef(false);
  const [exerciseVisible, setExerciseVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setExerciseVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const [exerciseInterruption, setExerciseInterruption] = useState<PreviewReason | null>(null);
  const exerciseMutationRef = useRef(0);
  useEffect(() => () => { exerciseMutationRef.current++; }, []);
  const selectedExercise = todaySnapshot?.exercise ?? null;
  const displayedSteps = selectedExercise?.steps ?? null;
  const displayedCalories = selectedExercise?.calories ?? null;
  const displayedExerciseMinutes = selectedExercise?.exercise_minutes ?? null;
  const selectedDateText = selectedExercise ? shortDate(selectedExercise.record_date, locale) : null;
  const stepValues = useMemo(() => {
    const records = new Map((trendBundle?.exercises ?? []).map((record) => [record.record_date, record.steps ?? null]));
    if (todaySnapshot?.exercise) records.set(recordDate, todaySnapshot.exercise.steps ?? steps);
    return rollingDateWindow(deviceDate).map((date) => [date, records.get(date) ?? null] as const);
  }, [deviceDate, recordDate, steps, todaySnapshot?.exercise, trendBundle]);
  const maxSteps = Math.max(1, ...stepValues.flatMap(([, value]) => value == null ? [] : [value]));
  const recentData = useMemo(() => {
    const dateSet = new Set(rollingDateWindow(deviceDate));
    return {
      exercises: (trendBundle?.exercises ?? []).filter((record) => dateSet.has(record.record_date)),
      sleeps: (trendBundle?.sleeps ?? []).filter((record) => dateSet.has(record.record_date)),
      rhythms: (trendBundle?.rhythms ?? []).filter((record) => dateSet.has(record.record_date)),
      healthMetrics: (trendBundle?.healthMetrics ?? []).filter((record) => dateSet.has(record.record_date)),
    };
  }, [deviceDate, trendBundle]);
  const periods = useMemo(
    () => activityPeriodDistribution(recentData.healthMetrics, recentData.exercises),
    [recentData],
  );
  const heatmap = useMemo(
    () => activityHeatmap(recentData.healthMetrics, recentData.exercises),
    [recentData],
  );
  const alignment = useMemo(
    () => clockAlignmentScore(recentData.sleeps, recentData.rhythms),
    [recentData],
  );
  const vitals = useMemo(
    () => latestVitals(recentData.healthMetrics, recentData.exercises, recentData.rhythms),
    [recentData],
  );
  const peakWindow = `${String(heatmap.peakStartHour).padStart(2, "0")}:00–${String(heatmap.peakEndHour).padStart(2, "0")}:00`;
  const exerciseTrendPoints = useMemo(() => stepValues.map(([date, value]) => {
    const normalized = value == null ? 0 : (value / maxSteps) * 100;
    return {
      id: date,
      label: shortDate(date, locale),
      barValue: normalized,
      lineValue: normalized,
      barText: value == null ? (locale === "zh" ? "暂无记录" : "No entry") : (locale === "zh" ? `${value.toLocaleString()} 步` : `${value.toLocaleString()} steps`),
      lineText: value == null ? (locale === "zh" ? "暂无记录" : "No entry") : (locale === "zh" ? `${value.toLocaleString()} 步` : `${value.toLocaleString()} steps`),
      missing: value == null,
    };
  }), [locale, maxSteps, stepValues]);
  const hasExerciseTrend = stepValues.some(([, value]) => value != null);
  const recordedCalorieValues = useMemo(() => (trendBundle?.exercises ?? [])
    .filter((record) => record.record_date <= deviceDate && record.calories != null && record.calories >= 0)
    .map((record) => Number(record.calories)), [deviceDate, trendBundle]);
  const calorieReference = recordedCalorieValues.length > 0
    ? Math.round(recordedCalorieValues.reduce((sum, value) => sum + value, 0) / recordedCalorieValues.length)
    : null;
  const calorieProgress = displayedCalories != null && calorieReference
    ? Math.min(100, Math.round(displayedCalories / calorieReference * 100))
    : null;
  const sportsPlan = useMemo(() => {
    if (!selectedExercise || displayedSteps == null || displayedExerciseMinutes == null) return {
      minutes: 20,
      stepSeconds: [300, 600, 300],
      title: locale === "zh" ? "从轻量活动开始" : "Start with light movement",
      reason: locale === "zh" ? "所选日期的步数或时长未记录，以下是通用轻量活动建议。" : "Steps or duration are missing for this date; this is a general light-activity suggestion.",
      steps: locale === "zh" ? ["舒展与热身 5 分钟", "轻松步行 10 分钟", "放松拉伸 5 分钟"] : ["Mobility warm-up · 5 min", "Easy walk · 10 min", "Cool-down stretch · 5 min"],
    };
    if (displayedExerciseMinutes >= 30 || displayedSteps >= 8000) return {
      minutes: 15,
      stepSeconds: [180, 480, 240],
      title: locale === "zh" ? "恢复与放松计划" : "Recovery & mobility plan",
      reason: locale === "zh" ? `根据 ${selectedDateText} 已记录的 ${displayedSteps.toLocaleString()} 步和 ${displayedExerciseMinutes} 分钟活动生成。` : `Based on ${displayedSteps.toLocaleString()} steps and ${displayedExerciseMinutes} active minutes recorded ${selectedDateText}.`,
      steps: locale === "zh" ? ["关节活动 3 分钟", "低强度拉伸 8 分钟", "呼吸放松 4 分钟"] : ["Joint mobility · 3 min", "Easy stretching · 8 min", "Breathing reset · 4 min"],
    };
    return {
      minutes: 25,
      stepSeconds: [300, 900, 300],
      title: locale === "zh" ? "补充今日活动" : "Build today's activity",
      reason: locale === "zh" ? `根据 ${selectedDateText} 已记录的 ${displayedSteps.toLocaleString()} 步和 ${displayedExerciseMinutes} 分钟活动生成。` : `Based on ${displayedSteps.toLocaleString()} steps and ${displayedExerciseMinutes} active minutes recorded ${selectedDateText}.`,
      steps: locale === "zh" ? ["动态热身 5 分钟", "轻快步行 15 分钟", "小腿与髋部拉伸 5 分钟"] : ["Dynamic warm-up · 5 min", "Brisk walk · 15 min", "Calf and hip stretch · 5 min"],
    };
  }, [displayedExerciseMinutes, displayedSteps, locale, selectedDateText, selectedExercise]);
  const sportsPresets = useMemo(() => ([
    { id: "mobility" as const, minutes: 15, title: locale === "zh" ? "舒展恢复 · 15 分钟" : "Mobility reset · 15 min", reason: locale === "zh" ? "低冲击活动，适合久坐后的活动恢复。" : "Low-impact movement for a reset after sitting.", steps: locale === "zh" ? ["关节活动 3 分钟", "舒展 8 分钟", "呼吸放松 4 分钟"] : ["Joint mobility · 3 min", "Easy stretch · 8 min", "Breathing reset · 4 min"] },
    { id: "walk" as const, minutes: 25, title: locale === "zh" ? "轻快步行 · 25 分钟" : "Brisk walk · 25 min", reason: locale === "zh" ? "包含热身、连续步行和放松。" : "Includes warm-up, steady walking, and cool-down.", steps: locale === "zh" ? ["动态热身 5 分钟", "轻快步行 15 分钟", "放松拉伸 5 分钟"] : ["Dynamic warm-up · 5 min", "Brisk walk · 15 min", "Cool-down · 5 min"] },
    { id: "recovery" as const, minutes: 12, title: locale === "zh" ? "轻量恢复 · 12 分钟" : "Gentle recovery · 12 min", reason: locale === "zh" ? "当日活动已经较多时，优先放松而不是继续加量。" : "When today's load is already high, prioritize recovery over more volume.", steps: locale === "zh" ? ["慢走 4 分钟", "下肢放松 5 分钟", "缓慢呼吸 3 分钟"] : ["Easy walk · 4 min", "Lower-body release · 5 min", "Slow breathing · 3 min"] },
  ]), [locale]);
  const activeSportsPlan = sportsPresetId === "recommended" ? sportsPlan : sportsPresets.find((item) => item.id === sportsPresetId) ?? sportsPlan;
  const useSportsPlan = () => {
    setExerciseMinutes(activeSportsPlan.minutes);
    const planNote = locale === "zh" ? `NAVA Sports 计划：${activeSportsPlan.title}` : `NAVA Sports plan: ${activeSportsPlan.title}`;
    setExerciseNote([exerciseNote.trim(), planNote].filter(Boolean).join("\n"));
    onOpenEditor();
  };

  useEffect(() => {
    let active = true;
    setExerciseHydrating(true);
    void hydrateExerciseSession(userId)
      .then((session) => { if (active) setExerciseSession(session); })
      .catch((error) => { if (active) setExerciseSessionMessage(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setExerciseHydrating(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!exerciseSession?.runningSince) return;
    setExerciseSessionNow(Date.now());
    const timer = window.setInterval(() => setExerciseSessionNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [exerciseSession?.runningSince]);

  const exerciseElapsedSeconds = exerciseSession ? exerciseSessionElapsedSeconds(exerciseSession, new Date(exerciseSessionNow)) : 0;
  usePreviewActivity("exercise", view !== "sports" ? null : exerciseSession?.runningSince ? "running" : exerciseSession ? "paused" : "ready", (reason) => {
    if (!exerciseSession?.runningSince) return;
    const now = new Date();
    const mutation = ++exerciseMutationRef.current;
    // Stop the visible timer immediately, even while the active draft syncs.
    setExerciseSession({ ...exerciseSession, elapsedSeconds: exerciseSessionElapsedSeconds(exerciseSession, now), runningSince: null });
    setExerciseSessionNow(now.getTime());
    setExerciseInterruption(reason);
    setExerciseSessionMessage(null);
    void pauseExerciseSession(userId, exerciseSession, now).catch(() => {
      if (exerciseMutationRef.current !== mutation) return;
      setExerciseSessionMessage(locale === "zh" ? "计时已在本机暂停，云端同步失败，请联网后重试。" : "Paused on this device; cloud sync failed. Reconnect and retry.");
    });
  });
  const exerciseElapsedMinutes = Math.floor(exerciseElapsedSeconds / 60);
  const exerciseTimerText = `${String(Math.floor(exerciseElapsedSeconds / 60)).padStart(2, "0")}:${String(exerciseElapsedSeconds % 60).padStart(2, "0")}`;
  const exerciseProgress = exerciseSession ? Math.min(100, Math.round(exerciseElapsedSeconds / Math.max(60, exerciseSession.plannedMinutes * 60) * 100)) : 0;
  const exerciseStage = exerciseSession ? exerciseStageAt(exerciseSession, exerciseElapsedSeconds) : null;
  const exerciseFeedback = exerciseSession ? exerciseMascotFeedback(exerciseSession, exerciseElapsedSeconds, todaySnapshot, deviceDate, locale) : null;

  const beginExercise = () => {
    if (exerciseSyncLock.current || exerciseHydrating) return;
    if (recordDate !== deviceDate) {
      setExerciseSessionMessage(locale === "zh" ? "运动计时只能从今天开始；历史日期仍可手动补录。" : "A live workout can only start today; past dates can still be logged manually.");
      return;
    }
    exerciseMutationRef.current++;
    const session = startExerciseSession(userId, { title: activeSportsPlan.title, minutes: activeSportsPlan.minutes, steps: activeSportsPlan.steps, stepSeconds: "stepSeconds" in activeSportsPlan ? activeSportsPlan.stepSeconds : undefined });
    setExerciseSession(session);
    setExerciseSessionNow(Date.now());
    setExerciseSessionMessage(locale === "zh" ? "运动已开始，离开页面或换设备后仍可恢复。" : "Workout started and can resume after leaving or switching devices.");
  };

  const toggleExercisePause = async () => {
    if (!exerciseSession || exerciseSyncLock.current) return;
    exerciseSyncLock.current = true;
    const mutation = ++exerciseMutationRef.current;
    const now = new Date();
    setExerciseSyncBusy(true);
    if (exerciseSession.runningSince) {
      setExerciseSession({ ...exerciseSession, runningSince: null, elapsedSeconds: exerciseSessionElapsedSeconds(exerciseSession, now) });
      setExerciseSessionNow(now.getTime());
    }
    try {
      const next = exerciseSession.runningSince
        ? await pauseExerciseSession(userId, exerciseSession, now)
        : await resumeExerciseSession(userId, exerciseSession);
      if (exerciseMutationRef.current !== mutation) return;
      if (document.hidden && next.runningSince) { const paused = await pauseExerciseSession(userId, next); if (exerciseMutationRef.current === mutation) setExerciseSession(paused); return; }
      setExerciseSession(next);
      setExerciseSessionNow(Date.now());
      setExerciseInterruption(null);
      setExerciseSessionMessage(null);
    } catch (error) {
      if (exerciseMutationRef.current === mutation) setExerciseSessionMessage(locale === "zh" ? "计时保持暂停，云端同步失败。请联网后重试。" : "Timer remains paused. Cloud sync failed; reconnect and retry.");
      console.warn("Exercise pause/resume sync deferred", error);
    } finally { exerciseSyncLock.current = false; setExerciseSyncBusy(false); }
  };

  const completeExercise = async () => {
    if (!exerciseSession || exerciseSyncLock.current) return;
    exerciseSyncLock.current = true; setExerciseSyncBusy(true);
    const mutation = ++exerciseMutationRef.current;
    try {
      const completed = await finishExerciseSession(userId, exerciseSession);
      if (exerciseMutationRef.current !== mutation) return;
      setExerciseMinutes(completed.minutes);
      const sessionNote = locale === "zh"
        ? `NAVA Sports 完成：${exerciseSession.title}（实际 ${completed.minutes} 分钟）`
        : `NAVA Sports completed: ${exerciseSession.title} (${completed.minutes} actual minutes)`;
      setExerciseNote([exerciseNote.trim(), sessionNote].filter(Boolean).join("\n"));
      setExerciseSession(null);
      setExerciseSessionMessage(null);
      setExerciseInterruption(null);
      onOpenEditor();
    } catch (error) {
      setExerciseSessionMessage(error instanceof Error ? error.message : String(error));
    } finally { exerciseSyncLock.current = false; setExerciseSyncBusy(false); }
  };

  const discardExercise = () => {
    if (exerciseSyncLock.current) return;
    if (!exerciseSession || !window.confirm(locale === "zh" ? "放弃这次尚未保存的运动计时吗？" : "Discard this unsaved workout timer?")) return;
    exerciseMutationRef.current++;
    abandonExerciseSession(userId);
    setExerciseSession(null);
    setExerciseSessionMessage(null);
    setExerciseInterruption(null);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([getLastHealthSyncAt(userId), getWatchReachability(), getHealthAuthorizationStatus()]).then(([lastSync, reachability, authorization]) => {
      if (!active) return;
      setSyncedAt(lastSync);
      setWatchState(reachability);
      setHealthAuthorization(authorization);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const sync = async () => {
    setSyncing(true);
    setDeviceMessage(null);
    try {
      const status = await getHealthAuthorizationStatus();
      setHealthAuthorization(status);
      if (status.available && !status.requested) {
        await requestHealthAuthorization();
        setHealthAuthorization(await getHealthAuthorizationStatus());
      }
      const result = await syncNativeHealthNow(userId);
      if ("skipped" in result && result.skipped) {
        const consentDisabled = "reason" in result && result.reason === "health_sync_consent_disabled";
        setDeviceMessage(consentDisabled
          ? (locale === "zh" ? "健康数据同步已在隐私设置中关闭" : "Health data sync is disabled in Privacy settings")
          : (locale === "zh" ? "请在 iPhone App 中授权 Apple 健康后同步" : "Authorize Apple Health in the iPhone app to sync"));
      } else if (result.uploaded === 0) {
        setDeviceMessage(locale === "zh" ? "未读取到已授权的健康记录；既有数据未被零值覆盖" : "No authorized health records found; existing data was not overwritten");
      } else {
        setSyncedAt(result.lastSyncDate);
        setDeviceMessage(locale === "zh" ? `已同步 ${result.uploaded} 条真实健康记录` : `Synced ${result.uploaded} real health records`);
      }
      setWatchState(await getWatchReachability());
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  };
  const syncLabel = syncedAt
    ? new Date(syncedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : (locale === "zh" ? "尚未同步" : "Not synced");
  const deviceTitle = watchState?.paired ? "Apple Watch" : (isNativeHealthAvailable() ? "Apple 健康" : (locale === "zh" ? "Apple 健康（需 iPhone App）" : "Apple Health (iPhone app required)"));

  if (view === "detail") {
    return (
      <div className="module-dashboard exercise-detail-dashboard" data-module-view="exercise-detail">
        <section className="figma-module-card energy-card">
          <div><span>{locale === "zh" ? "所选日期能量消耗" : "Selected-day energy"}</span><strong>{displayedCalories != null ? <AnimatedNumber value={displayedCalories} /> : "--"}<small>{calorieReference != null ? (locale === "zh" ? ` / 有记录日均 ${calorieReference} kcal` : ` / recorded-day avg ${calorieReference} kcal`) : (locale === "zh" ? " / 暂无历史参考" : " / no history yet")}</small></strong><p>{selectedExercise ? (locale === "zh" ? `${selectedDateText} 的真实记录；圆环仅与个人有记录日均值比较` : `Recorded ${selectedDateText}; the ring compares only with your recorded-day average`) : (locale === "zh" ? "该日期尚无运动记录" : "No activity recorded for this date")}</p></div>
          <div className="progress-ring exercise-ring" style={{ "--progress": `${calorieProgress ?? 0}%` } as CSSProperties}><span>{calorieProgress == null ? "--" : <><AnimatedNumber value={calorieProgress} />%</>}</span></div>
        </section>
        <section className="figma-module-card steps-card">
          <header><span>{locale === "zh" ? "所选日期步数" : "Selected-day steps"}</span><strong>{displayedSteps == null ? "--" : <AnimatedNumber value={displayedSteps} formatter={(value) => Math.round(value).toLocaleString()} />}<small>{locale === "zh" ? "步" : "steps"}</small></strong></header>
          <div className="steps-bars" aria-label={locale === "zh" ? "近七日步数" : "Seven-day steps"}>
            {stepValues.map(([date, value]) => <span className={value == null ? "is-missing" : undefined} key={date} title={`${shortDate(date, locale)} · ${value == null ? (locale === "zh" ? "暂无记录" : "No entry") : value.toLocaleString()}`} style={{ height: `${value == null ? 0 : Math.max(8, (value / maxSteps) * 100)}%` }} />)}
          </div>
        </section>
        <section className="figma-module-card activity-card">
          <header><strong>{locale === "zh" ? "运动" : "Activities"}</strong><button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "添加运动" : "Add activity"}><Plus size={18} /></button></header>
          <div className="activity-chips">
            <span>{locale === "zh" ? "活动时长" : "Active time"}<strong>{displayedExerciseMinutes == null ? "--" : <AnimatedNumber value={displayedExerciseMinutes} />} min</strong></span>
            <span>{locale === "zh" ? "活动消耗" : "Active energy"}<strong>{displayedCalories == null ? "--" : <AnimatedNumber value={displayedCalories} />} kcal</strong></span>
            <span>{locale === "zh" ? "步行折算" : "Walking est."}<strong>{displayedSteps == null ? "--" : <AnimatedNumber value={Math.round(displayedSteps / 110)} />} min</strong></span>
          </div>
          <div className="day-distribution">
            {periods.map((period) => <span key={period.label} className={period.active ? "active" : ""}><i title={`${period.label} · ${period.value}`} style={{ height: `${period.heightPercent}%` }} />{period.label}</span>)}
          </div>
        </section>
      </div>
    );
  }

  if (view === "device") return <ModuleDetailView compact className="device-subview-card" title={locale === "zh" ? "运动设备" : "Activity devices"}>
    <div className="device-picker">
      <button className="selected" type="button" onClick={() => void sync()} disabled={syncing}><Watch />{deviceTitle}{watchState?.paired && <Check />}</button>
      <button type="button" onClick={() => void sync()} disabled={syncing}><Bluetooth />{locale === "zh" ? "授权并同步 Apple 健康" : "Authorize & sync Apple Health"}<Plus /></button>
    </div>
    <div className="device-facts" aria-label={locale === "zh" ? "设备连接状态" : "Device connection status"}>
      <span><small>{locale === "zh" ? "运行环境" : "Runtime"}</small><strong>{isNativeHealthAvailable() ? (locale === "zh" ? "iPhone App" : "iPhone app") : (locale === "zh" ? "网页预览" : "Web preview")}</strong></span>
      <span><small>Apple Watch</small><strong>{watchState?.paired ? (watchState.reachable ? (locale === "zh" ? "已连接" : "Reachable") : (locale === "zh" ? "已配对" : "Paired")) : (locale === "zh" ? "未配对" : "Not paired")}</strong></span>
      <span><small>{locale === "zh" ? "健康授权" : "Health access"}</small><strong>{healthAuthorization?.available ? (healthAuthorization.requested ? (locale === "zh" ? "已请求" : "Requested") : (locale === "zh" ? "待授权" : "Not requested")) : (locale === "zh" ? "当前不可用" : "Unavailable")}</strong></span>
    </div>
    <div className="detail-status-strip"><RefreshCw className={syncing ? "spin" : undefined} size={17} /><span>{deviceMessage ?? (isNativeHealthAvailable() ? (locale === "zh" ? "HealthKit 数据同步后保存到云端" : "HealthKit data is saved to the cloud after sync") : (locale === "zh" ? "网页预览无法直接读取 HealthKit" : "The web preview cannot read HealthKit directly"))}</span><strong>{syncLabel}</strong></div>
  </ModuleDetailView>;
  if (view === "vitals") return <ModuleDetailView compact className="vitals-subview-card" title={locale === "zh" ? "健康指标" : "Health metrics"}><div className="metric-detail-grid"><span><HeartPulse /><small>{locale === "zh" ? "静息心率" : "Resting HR"}</small><strong>{vitals.heartRate == null ? "--" : <><AnimatedNumber value={vitals.heartRate} /> bpm</>}</strong></span><span><Activity /><small>{locale === "zh" ? "血氧" : "SpO2"}</small><strong>{vitals.bloodOxygen == null ? "--" : <><AnimatedNumber value={vitals.bloodOxygen} formatter={(value) => value.toFixed(1)} />%</>}</strong></span><span><Gauge /><small>{locale === "zh" ? "恢复度" : "Recovery"}</small><strong>{vitals.recovery == null ? "--" : <AnimatedNumber value={vitals.recovery} />}</strong></span></div><div className="detail-status-strip"><ShieldCheck size={17} /><span>{locale === "zh" ? "指标来自最近一次健康快照与节律评分" : "Based on the latest health snapshot and rhythm score"}</span><strong>{vitals.date ? shortDate(vitals.date, locale) : "--"}</strong></div></ModuleDetailView>;
  if (view === "heatmap") return <ModuleDetailView compact className="heatmap-subview-card" title={locale === "zh" ? "节律热力图" : "Rhythm heatmap"}><div className="heatmap-detail-content"><div className="detail-heatmap">{heatmap.cells.map((cell, index) => <i key={cell.id} title={`${shortDate(cell.date, locale)} · ${String(cell.period * 2).padStart(2, "0")}:00 · ${Math.round(cell.value)}`} style={{ opacity: cell.intensity, "--heat-index": index } as CSSProperties} />)}</div><div className="heatmap-legend"><span>{locale === "zh" ? "低活跃" : "Low"}</span><i /><i /><i /><i /><span>{locale === "zh" ? "高活跃" : "High"}</span></div><div className="heatmap-summary-grid"><span><small>{locale === "zh" ? "数据格" : "Data bins"}</small><strong>{heatmap.cells.length}</strong></span><span><small>{locale === "zh" ? "高峰窗口" : "Peak window"}</small><strong>{heatmap.cells.length > 0 ? peakWindow : "--"}</strong></span></div><p>{heatmap.cells.length > 0 ? (locale === "zh" ? `${peakWindow} 是近七日真实活动记录中相对集中的窗口；这里只描述分布，不评价运动质量。` : `${peakWindow} is the most concentrated window in the recorded seven-day activity data; this describes distribution, not workout quality.`) : (locale === "zh" ? "同步活动数据后生成热力图。" : "Sync activity data to build the heatmap.")}</p></div></ModuleDetailView>;
  if (view === "clock") return <ModuleDetailView compact className="clock-subview-card" title={locale === "zh" ? "生物钟同步" : "Clock alignment"}><div className="clock-alignment"><div className="clock-alignment-gauge" style={{ "--progress": `${alignment ?? 0}%` } as CSSProperties}><Gauge /></div><strong>{alignment == null ? "--" : <><AnimatedNumber value={alignment} />%</>}</strong><p>{alignment == null ? (locale === "zh" ? "同步睡眠或节律数据后，才能计算近七日生物钟同步分。" : "Sync sleep or rhythm data to calculate the seven-day clock-alignment score.") : (locale === "zh" ? "该分数由近七日入睡时间、睡眠时长稳定性与节律评分共同计算。" : "Calculated from seven-day bedtime, sleep-duration regularity, and rhythm scores.")}</p></div></ModuleDetailView>;
  if (view === "sports") return <ModuleDetailView compact className="sports-subview-card" title="NAVA Sports">
    {exerciseInterruption && exerciseSession && <PreviewInterruptionNotice reason={exerciseInterruption} locale={locale}>
      <p>{locale === "zh" ? "运动计时已暂停，暂停期间不计入运动时长。准备好后点“继续”，或结束并核对记录。" : "Your workout is paused. Paused time is excluded. Resume when ready, or finish and review."}</p>
      <small>{locale === "zh" ? "模拟事件不会添加步数、热量或奖励。" : "No steps, calories or rewards are added by this simulation."}</small>
    </PreviewInterruptionNotice>}
    {exerciseSession ? <div className="exercise-live-session" data-exercise-session data-running={Boolean(exerciseSession.runningSince)}>
      <div className="exercise-live-progress" style={{ "--progress": `${exerciseProgress}%` } as CSSProperties}><Activity size={28} /><strong>{exerciseTimerText}</strong><small>{locale === "zh" ? `计划 ${exerciseSession.plannedMinutes} 分钟` : `${exerciseSession.plannedMinutes}-minute plan`}</small></div>
      <div className="exercise-live-copy"><strong>{exerciseSession.title}</strong><p data-exercise-stage>{exerciseStage?.complete ? (locale === "zh" ? "计划时长已到，可以结束并核对感受。" : "Planned time reached. Finish when ready and review how you feel.") : exerciseStage ? exerciseSession.steps[exerciseStage.index] : (locale === "zh" ? "按身体感受继续；旧计划没有可确认的分段时长。" : "Continue by feel; this older plan has no verified stage durations.")}</p><span>{locale === "zh" ? `已进行 ${exerciseElapsedMinutes} 分钟 · ${exerciseProgress}%` : `${exerciseElapsedMinutes} minutes · ${exerciseProgress}%`}</span>{exerciseStage && !exerciseStage.complete && <small>{locale === "zh" ? "本阶段剩余 " : "Stage remaining "}{Math.floor(exerciseStage.remaining / 60)}:{String(exerciseStage.remaining % 60).padStart(2, "0")}</small>}</div>
      {exerciseFeedback && <div className="exercise-mascot-feedback" data-exercise-feedback={exerciseFeedback.state}><MascotImage animatedSrc={exerciseSession.runningSince && exerciseVisible ? animatedExerciseMascot : exerciseInsightMascot} staticSrc={exerciseInsightMascot} alt="" aria-hidden="true" /><div><p aria-live={exerciseVisible ? "polite" : "off"}>{exerciseFeedback.message}</p><small>{exerciseFeedback.evidence}</small></div></div>}
<div className="exercise-live-actions"><button type="button" disabled={exerciseSyncBusy} onClick={() => void toggleExercisePause()}>{exerciseSession.runningSince ? <Pause size={18} /> : <Play size={18} />}{exerciseSession.runningSince ? (locale === "zh" ? "暂停" : "Pause") : (locale === "zh" ? "继续" : "Resume")}</button><button type="button" disabled={exerciseSyncBusy} className="primary" onClick={() => void completeExercise()}><Square size={17} />{locale === "zh" ? "结束并填写感受" : "Finish & check in"}</button></div>
      <button className="exercise-live-discard" type="button" disabled={exerciseSyncBusy} onClick={discardExercise}>{locale === "zh" ? "放弃本次计时" : "Discard timer"}</button>
    </div> : <div className="sports-plan"><Activity /><div className="sports-preset-picker" role="group" aria-label={locale === "zh" ? "选择运动计划" : "Choose a movement plan"}><button type="button" className={sportsPresetId === "recommended" ? "selected" : ""} onClick={() => setSportsPresetId("recommended")}>{locale === "zh" ? "今日建议" : "Suggested"}</button>{sportsPresets.map((preset) => <button type="button" className={sportsPresetId === preset.id ? "selected" : ""} key={preset.id} onClick={() => setSportsPresetId(preset.id)}>{preset.minutes} min</button>)}</div><strong>{activeSportsPlan.title}</strong><p>{activeSportsPlan.reason}</p><div className="sports-plan-steps">{activeSportsPlan.steps.map((step, index) => <span key={step}><b>{index + 1}</b>{step}</span>)}</div><small className="sports-plan-disclaimer">{locale === "zh" ? "规则建议，不是医疗或训练处方；如有不适请停止。" : "Rule-based guidance, not a medical or training prescription. Stop if you feel unwell."}</small><div className="sports-plan-actions"><button type="button" disabled={exerciseHydrating} onClick={beginExercise}><CirclePlay size={17} />{locale === "zh" ? "开始此计划" : "Start this plan"}</button><button type="button" onClick={useSportsPlan}>{locale === "zh" ? "直接填写记录" : "Log without timer"}</button></div></div>}
    {exerciseSessionMessage && <p className="module-device-message" role="status">{exerciseSessionMessage}</p>}
  </ModuleDetailView>;

  return (
    <div className="module-dashboard exercise-dashboard" data-module-view="exercise-overview">
      <section className="figma-module-card exercise-summary-card">
        <header><strong>{locale === "zh" ? "今日运动" : "Today's activity"}</strong><button className="module-card-icon-action" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "记录今日运动" : "Log today's activity"}><Activity size={18} /><span>{locale === "zh" ? "添加" : "Add"}</span></button></header>
        <div className="exercise-summary-metrics">
          <span><small>{locale === "zh" ? "步数" : "Steps"}</small><strong>{displayedSteps != null ? <AnimatedNumber value={displayedSteps} formatter={(value) => Math.round(value).toLocaleString()} /> : "--"}<em>STEP</em></strong></span>
          <span><small>{locale === "zh" ? "活动消耗" : "Energy"}</small><strong>{displayedCalories != null ? <AnimatedNumber value={displayedCalories} /> : "--"}<em>kcal</em></strong></span>
          <span><small>{locale === "zh" ? "运动时长" : "Duration"}</small><strong>{displayedExerciseMinutes != null ? <AnimatedNumber value={displayedExerciseMinutes} /> : "--"}<em>min</em></strong></span>
        </div>
      </section>
      <section className="figma-module-card exercise-health-card">
        <header><strong>{locale === "zh" ? "设备与身体状态" : "Device & body status"}</strong><button className="module-card-icon-action" type="button" onClick={() => openView("device")} aria-label={locale === "zh" ? "查看运动设备" : "View devices"}><Watch size={18} /><span>{locale === "zh" ? "设备" : "Devices"}</span></button></header>
        <div className="exercise-device-status">
          <span><Watch size={28} /><i><strong>{deviceTitle}</strong><small>{syncLabel}</small></i></span>
          <button type="button" onClick={() => void sync()} disabled={syncing}><RefreshCw className={syncing ? "spin" : ""} size={16} />{locale === "zh" ? "授权 / 同步" : "Authorize / sync"}</button>
        </div>
        {deviceMessage && <p className="module-device-message">{deviceMessage}</p>}
        <div className="exercise-health-links">
          <button type="button" onClick={() => openView("vitals")}><HeartPulse size={20} /><span>{locale === "zh" ? "健康指标" : "Vitals"}</span><small>{vitals.heartRate == null ? "--" : `${vitals.heartRate} bpm`}</small></button>
          <button type="button" onClick={() => openView("heatmap")}><Activity size={20} /><span>{locale === "zh" ? "活跃窗口" : "Active window"}</span><small>{heatmap.cells.length > 0 ? peakWindow : "--"}</small></button>
          <button type="button" onClick={() => openView("clock")}><Gauge size={20} /><span>{locale === "zh" ? "节律同步" : "Rhythm"}</span><small>{alignment == null ? "--" : `${alignment}%`}</small></button>
        </div>
        <button className="exercise-sports-entry" type="button" onClick={() => openView("sports")}><Activity size={18} /><span><strong>NAVA Sports</strong><small>{locale === "zh" ? "按所选日期真实活动记录生成规则建议" : "Rule guidance from the selected day's recorded activity"}</small></span><ChevronRight size={17} /></button>
      </section>
      <section className="figma-module-card exercise-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日活动趋势" : "7-day activity trend"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看运动趋势报告" : "View activity trend report"}><ChevronRight size={18} /></button></header>
        {hasExerciseTrend ? <BarLineTrendChart points={exerciseTrendPoints} scoreScale ariaLabel={locale === "zh" ? "按设备日期滚动的近七日步数趋势；未记录日期保留为空位" : "Device-date rolling seven-day step trend with empty slots for missing dates"} /> : <p className="module-empty-copy">{locale === "zh" ? "记录运动后显示趋势" : "Log activity to begin the trend"}</p>}
      </section>
    </div>
  );
}

function MoodDashboard(props: Props & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const {
    locale,
    moodScore,
    setMoodScore,
    moodFactors,
    selectedFactors,
    toggleMoodFactor,
    diary,
    setDiary,
    onSaveMood,
    busy,
    recordDate,
    deviceDate,
    trendBundle,
    todaySnapshot,
    view,
    openView,
  } = props;
  const [saved, setSaved] = useState(false);
  const [moodTouched, setMoodTouched] = useState(false);
  const hasCurrentMood = Boolean(todaySnapshot?.mood?.record_date === recordDate);
  const hasCompletedMood = hasCurrentMood && isCompleteMoodRecord(todaySnapshot?.mood);
  const hasVisibleMood = hasCurrentMood || moodTouched || saved;
  const hasDiary = diary.trim().length > 0;
  const selectedBand = moodBandForScore(moodScore);
  const canComplete = (moodTouched || hasCurrentMood) && selectedFactors.length > 0 && diary.trim().length > 0;
  useEffect(() => {
    setMoodTouched(false);
    setSaved(hasCompletedMood);
  }, [hasCompletedMood, recordDate]);
  const moodRecords = useMemo(
    () => mergeLiveMood(trendBundle, recordDate, moodScore, selectedFactors, diary, hasCurrentMood || moodTouched || saved, deviceDate),
    [deviceDate, diary, hasCurrentMood, moodScore, moodTouched, recordDate, saved, selectedFactors, trendBundle],
  );
  const trendPoints = useMemo(() => moodTrendPoints(moodRecords, deviceDate, locale), [deviceDate, locale, moodRecords]);
  const distribution = useMemo(() => moodDistribution(moodRecords, locale), [locale, moodRecords]);
  const recentLowMood = moodRecords.filter((record) => record.mood_score <= 40).slice(-3);
  const repeatedLowMood = recentLowMood.length >= 3 && moodRecords.slice(-3).every((record) => record.mood_score <= 40);

  const submitMood = async (event: FormEvent<HTMLFormElement>) => {
    const didSave = await onSaveMood(event);
    if (!didSave) return;
    setSaved(true);
    openView("overview");
  };

  if (view === "trend") return <HistoryView userId={props.userId} module="mood" locale={locale} trendBundle={trendBundle} profile={props.profile} deviceDate={deviceDate} />;

  return (
    <form className="module-dashboard mood-dashboard" onSubmit={(event) => void submitMood(event)} data-module-view="mood-overview" data-ui-revision="mood-summary-live-v4">
      <section
        className="figma-module-card mood-summary-card"
        style={{ "--mood-score": `${hasVisibleMood ? moodScore : 0}%` } as CSSProperties}
        data-record-date={recordDate}
      >
        <header>
          <strong>{locale === "zh" ? "今日情绪" : "Today's mood"}</strong>
          <span className="mood-summary-date"><CalendarDays size={14} />{shortDate(recordDate, locale)}</span>
        </header>
        <div className="mood-summary-content">
          <output className="mood-summary-score" aria-live="polite">{hasVisibleMood ? <AnimatedNumber value={moodScore} duration={360} /> : "--"}<small>{locale === "zh" ? "分" : "pts"}</small></output>
          <span className={`mood-summary-band ${hasVisibleMood ? `is-${selectedBand.key}` : "is-missing"}`}><HeartPulse size={15} />{hasVisibleMood ? (locale === "zh" ? selectedBand.zh : selectedBand.en) : (locale === "zh" ? "尚未记录" : "Not recorded")}</span>
        </div>
        <div className="mood-summary-progress" aria-hidden="true"><i /></div>
      </section>
      <section className="figma-module-card mood-entry-card">
        <header>
          <strong>{locale === "zh" ? "情绪记录" : "Mood check-in"}</strong>
        </header>
        <div className="mood-face-row">
          {moodBands.map((face) => (
            <button className={selectedBand.key === face.key ? "selected" : ""} key={face.key} type="button" onClick={() => { setMoodTouched(true); setMoodScore(face.score, true); }}>
              <span><HeartPulse size={22} /></span><small>{locale === "zh" ? face.zh : face.en}</small>
            </button>
          ))}
        </div>
        <label className="mood-intensity">
          <span><span>{locale === "zh" ? `情绪强度 · ${selectedBand.zh}` : `Intensity · ${selectedBand.en}`}</span><strong>{moodScore}</strong></span>
          <input
            type="range"
            min="0"
            max="100"
            value={moodScore}
            aria-valuetext={`${moodScore} · ${locale === "zh" ? selectedBand.zh : selectedBand.en}`}
            onChange={(event) => { setMoodTouched(true); setMoodScore(Number(event.target.value)); }}
            onPointerUp={(event) => setMoodScore(Number(event.currentTarget.value), true)}
            onKeyUp={(event) => setMoodScore(Number(event.currentTarget.value), true)}
            onBlur={(event) => setMoodScore(Number(event.currentTarget.value), true)}
          />
        </label>
        <div className="mood-factor-row mood-factor-chips">
          <span>{locale === "zh" ? "影响因素（可多选）" : "Factors (multiple)"}</span>
          <div>{moodFactors.map((factor) => <button type="button" aria-pressed={selectedFactors.includes(factor.value)} className={selectedFactors.includes(factor.value) ? "selected" : ""} key={factor.value} onClick={() => toggleMoodFactor(factor.value)}>{factor.label}</button>)}</div>
        </div>
        <button
          className="mood-diary-trigger"
          type="button"
          data-diary-state={hasDiary ? "written" : "empty"}
          onClick={() => openView("journal")}
          aria-label={hasDiary
            ? (locale === "zh" ? "查看或修改今天的情绪日志" : "View or edit today's mood journal")
            : (locale === "zh" ? "写下今天的情绪日志" : "Write today's mood journal")}
        >{hasDiary
          ? (locale === "zh" ? "查看 / 修改今天的情绪日志" : "View / edit today's mood journal")
          : (locale === "zh" ? "写下今天的情绪日志" : "Write today's mood journal")}</button>
      </section>
      {repeatedLowMood && <section className="mood-pattern-alert" role="status"><HeartPulse size={18} /><p>{locale === "zh" ? "最近 3 次记录都处于低位。可以先降低今天的任务负荷；如果这种状态持续或影响安全，请联系可信任的人或专业支持。" : "Your last 3 entries were low. Reduce today's load, and seek trusted or professional support if this persists or affects safety."}</p></section>}
      <MoodBreathing locale={locale} active={view === "overview"} savedScore={todaySnapshot?.mood?.record_date === deviceDate ? todaySnapshot.mood.mood_score : null} onOpenAi={props.onOpenAi} />
      <section className="figma-module-card mood-trend-card">
        <header><strong>{locale === "zh" ? "近 7 天情绪趋势" : "7-day mood"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看情绪趋势报告" : "View mood trend report"}><ChevronRight size={18} /></button></header>
        <div className="mood-chart"><BarLineTrendChart points={trendPoints} scoreScale interactive curve="monotone" lineAnchor="bar-center" ariaLabel={locale === "zh" ? `近七日情绪强度柱状图与平滑趋势曲线，日期从${trendPoints[0]?.label}至${trendPoints[trendPoints.length - 1]?.label}，当天为${trendPoints[trendPoints.length - 1]?.label}，纵轴范围零到一百` : `Seven-day mood intensity bars and smooth trend line, ${trendPoints[0]?.label} to ${trendPoints[trendPoints.length - 1]?.label}; the final point is today, on a zero to one hundred scale`} /></div>
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
      <MonthlyWellbeing userId={props.userId} module="mood" locale={locale} deviceDate={deviceDate} revision={trendBundle} factorLabels={Object.fromEntries(moodFactors.map((factor) => [factor.value, factor.label]))} />
      {view === "journal" && (
        <div className="module-modal" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "情绪日记" : "Mood journal"}>
          <div className="module-modal-card">
            <header><strong>{locale === "zh" ? "情绪日记" : "Mood journal"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header>
            <p className="wellbeing-reflection">{locale === "zh" ? "如果想复盘，可以写：今天什么帮助了我？下次想尝试什么？也可以只写此刻的感受。" : "If helpful, reflect: What supported me today? What might I try next time? Or simply write how you feel."}</p>
            <textarea autoFocus value={diary} onChange={(event) => setDiary(event.target.value)} placeholder={locale === "zh" ? "写下此刻发生的事……" : "What happened just now?"} />
            {!canComplete && <p className="mood-completion-hint">{locale === "zh" ? "请先调整情绪强度、选择主要原因，并写下今天的情绪。" : "Adjust the intensity, choose a cause, and write today's mood before saving."}</p>}
            <div><button type="button" onClick={() => openView("overview")}>{locale === "zh" ? "取消" : "Cancel"}</button><button type="submit" disabled={busy !== null || !canComplete}>{locale === "zh" ? "保存" : "Save"}</button></div>
          </div>
        </div>
      )}
    </form>
  );
}

function SleepDashboard(props: Pick<Props, "userId" | "sleepStart" | "sleepEnd" | "deepSleep" | "lightSleep" | "remSleep" | "sleepRating" | "onOpenEditor" | "recordDate" | "deviceDate" | "trendBundle" | "todaySnapshot" | "profile"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { userId, locale, onOpenEditor, recordDate, deviceDate, trendBundle, todaySnapshot, view, openView } = props;
  const todayKey = `nava-sleep-alert-dismissed:${deviceDate}`;
  const [alertVisible, setAlertVisible] = useState(() => window.sessionStorage.getItem(todayKey) !== "1");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const notificationTimeKey = `nava-sleep-reminder-time:${userId}`;
  const [reminderTime, setReminderTime] = useState(() => window.localStorage.getItem(notificationTimeKey) ?? "22:30");
  const [sleepChartMode, setSleepChartMode] = useState<"duration" | "rating">("duration");
  useEffect(() => {
    let active = true;
    void loadNotificationPreference(userId, "sleep")
      .then((preference) => {
        if (!active || !preference) return;
        setNotificationEnabled(preference.enabled);
        if (preference.localTime) {
          setReminderTime(preference.localTime);
          window.localStorage.setItem(notificationTimeKey, preference.localTime);
        }
      })
      .catch((error) => console.warn("Sleep reminder preference restore deferred", error));
    return () => { active = false; };
  }, [notificationTimeKey, userId]);
  const selectedSleep = todaySnapshot?.sleep ?? null;
  const latestRecordedSleep = useMemo(() => {
    if (selectedSleep) return selectedSleep;
    const records = [...(trendBundle?.sleeps ?? [])].sort((a, b) => a.record_date.localeCompare(b.record_date));
    return records[records.length - 1] ?? null;
  }, [selectedSleep, trendBundle]);
  const displayStart = selectedSleep?.sleep_start ?? "--:--";
  const displayEnd = selectedSleep?.sleep_end ?? "--:--";
  const deepMinutes = selectedSleep?.deep_sleep_minutes ?? 0;
  const lightMinutes = selectedSleep?.light_sleep_minutes ?? 0;
  const remMinutes = selectedSleep?.rem_minutes ?? 0;
  const hasSleepStages = deepMinutes + lightMinutes + remMinutes > 0;
  const total = Math.max(1, deepMinutes + lightMinutes + remMinutes);
  const score = Math.round(selectedSleep?.rhythm_score ?? 0);
  const timeline = sleepTimelineGeometry(displayStart, displayEnd, selectedSleep?.sleep_duration_minutes);
  const stageHeights = sleepStageHeights([deepMinutes, lightMinutes, remMinutes]);
  const sleepTrend = useMemo(() => {
    const records = new Map((trendBundle?.sleeps ?? []).map((record) => [record.record_date, record]));
    if (todaySnapshot?.sleep) records.set(recordDate, todaySnapshot.sleep);
    const recentRecords = rollingDateWindow(deviceDate).map((date) => ({ date, record: records.get(date) ?? null }));
    const maxMinutes = Math.max(1, ...recentRecords.flatMap(({ record }) => record ? [Math.max(0, record.sleep_duration_minutes ?? 0)] : []));
    return recentRecords.map(({ date, record }): BarLineTrendPoint => {
        const minutes = Math.max(0, record?.sleep_duration_minutes ?? 0);
        const hours = minutes / 60;
        const rating = Math.max(0, record?.self_rating ?? 0);
        const normalized = sleepChartMode === "duration" ? (minutes / maxMinutes) * 100 : rating * 20;
        const valueText = sleepChartMode === "duration"
          ? (locale === "zh" ? `${hours.toFixed(1)} 小时` : `${hours.toFixed(1)} h`)
          : (locale === "zh" ? `${rating}/5 分` : `${rating}/5`);
        return {
          id: record?.id ?? `missing-sleep-${date}`,
          label: shortDate(date, locale),
          barValue: normalized,
          lineValue: normalized,
          barText: record ? valueText : (locale === "zh" ? "暂无记录" : "No entry"),
          lineText: record ? valueText : (locale === "zh" ? "暂无记录" : "No entry"),
          missing: !record,
        };
      });
  }, [deviceDate, locale, recordDate, sleepChartMode, todaySnapshot?.sleep, trendBundle]);
  const hasSleepTrend = sleepTrend.some((point) => !point.missing);

  const enableNotification = async () => {
    await enableNavaNotifications(userId, reminderTime);
    window.localStorage.setItem(notificationTimeKey, reminderTime);
    setNotificationEnabled(true);
  };

  if (view === "trend") return <HistoryView userId={props.userId} module="sleep" locale={locale} trendBundle={trendBundle} profile={props.profile} deviceDate={deviceDate} />;

  return (
    <div className="module-dashboard sleep-dashboard" data-module-view="sleep-overview">
      {alertVisible && latestRecordedSleep && <section className="sleep-alert"><MoonStar size={20} /><button className="sleep-alert-copy" type="button" onClick={() => openView("alert")}><strong>{locale === "zh" ? "作息节律提醒" : "Sleep rhythm note"}</strong><p>{locale === "zh" ? `最近记录（${shortDate(latestRecordedSleep.record_date, locale)}）在 ${latestRecordedSleep.sleep_start ?? "--:--"} 入睡，可在这一时间前 30 分钟开始放松。` : `Your latest record (${shortDate(latestRecordedSleep.record_date, locale)}) started at ${latestRecordedSleep.sleep_start ?? "--:--"}; consider winding down 30 minutes beforehand.`}</p></button><button type="button" onClick={() => setAlertVisible(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={18} /></button></section>}
      <section className="figma-module-card sleep-summary-card">
        <header><strong>{locale === "zh" ? "睡眠摘要" : "Sleep summary"}</strong><button className="module-card-icon-action" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "更新睡眠记录" : "Update sleep record"}><MoonStar size={18} /><span>{locale === "zh" ? "更新" : "Update"}</span></button></header>
        <div className="sleep-timeline"><span>{displayStart}</span><div><i style={{ "--sleep-left": `${timeline.leftPercent}%`, "--sleep-width": `${timeline.widthPercent}%` } as CSSProperties} /></div><span>{displayEnd}</span></div>
        <div className="sleep-stage-row">
          <div className={`sleep-stage-shape${hasSleepStages ? "" : " is-empty"}`}>{hasSleepStages
            ? <><i style={{ flex: deepMinutes / total, "--stage-height": `${stageHeights[0]}%` } as CSSProperties} /><i style={{ flex: lightMinutes / total, "--stage-height": `${stageHeights[1]}%` } as CSSProperties} /><i style={{ flex: remMinutes / total, "--stage-height": `${stageHeights[2]}%` } as CSSProperties} /></>
            : <span>{locale === "zh" ? "暂无阶段数据" : "No stage data"}</span>}</div>
          <ul><li><i />{locale === "zh" ? "深睡" : "Deep"}</li><li><i />{locale === "zh" ? "浅睡" : "Light"}</li><li><i />REM</li></ul>
          <strong>{selectedSleep ? <AnimatedNumber value={score} /> : "--"}<small>{locale === "zh" ? "分" : "pts"}</small></strong>
        </div>
      </section>
      <section className="figma-module-card sleep-trend-card">
        <header><strong>{locale === "zh" ? "7 日睡眠趋势" : "7-day sleep trend"}</strong><div className="sleep-chart-actions"><div><button type="button" className={sleepChartMode === "duration" ? "active" : ""} onClick={() => setSleepChartMode("duration")}>{locale === "zh" ? "时长" : "Duration"}</button><button type="button" className={sleepChartMode === "rating" ? "active" : ""} onClick={() => setSleepChartMode("rating")}>{locale === "zh" ? "自评" : "Rating"}</button></div><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看睡眠趋势报告" : "View sleep trend report"}><ChevronRight size={18} /></button></div></header>
        {hasSleepTrend
          ? <BarLineTrendChart points={sleepTrend} scoreScale lineAnchor="bar-center" ariaLabel={locale === "zh" ? "近七日睡眠时长柱状图与同源趋势折线图，每个点对应同日柱子的几何中心" : "Seven-day sleep-duration bars with a linked line whose points match each bar's geometric center"} />
          : <p className="module-empty-copy">{locale === "zh" ? "完成睡眠记录后显示趋势" : "Log sleep to begin the trend"}</p>}
      </section>
      <MonthlyWellbeing userId={userId} module="sleep" locale={locale} deviceDate={deviceDate} revision={trendBundle} />
      {view === "alert" && <div className="module-modal" role="dialog" aria-modal="true"><div className="module-modal-card sleep-alert-modal"><header><strong>{locale === "zh" ? "睡眠提醒" : "Sleep reminder"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header><div className="lock-screen-preview"><Bell size={24} /><strong>NAVA</strong><p>{locale === "zh" ? "该准备入睡了，给今天一个安静的收尾。" : "Time to wind down and close the day quietly."}</p></div><label className="sleep-reminder-time"><span>{locale === "zh" ? "每天提醒时间" : "Daily reminder"}</span><input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></label><button type="button" onClick={() => void enableNotification()}>{notificationEnabled ? <BellOff size={18} /> : <Bell size={18} />}{notificationEnabled ? (locale === "zh" ? `已设为 ${reminderTime}` : `Set for ${reminderTime}`) : (locale === "zh" ? "开启锁屏提醒" : "Enable lock-screen reminder")}</button><button type="button" onClick={() => { window.sessionStorage.setItem(todayKey, "1"); setAlertVisible(false); openView("overview"); }}>{locale === "zh" ? "今天不再提醒" : "Not again today"}</button></div></div>}
    </div>
  );
}

function DietDashboard(props: Pick<Props, "todaySnapshot" | "trendBundle" | "deviceDate" | "onOpenEditor" | "onOpenDietCamera" | "onOpenDietMeal"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { locale, todaySnapshot, trendBundle, deviceDate, onOpenEditor, onOpenDietCamera, onOpenDietMeal, openView } = props;
  const nutrition = todaySnapshot?.nutrition;
  const records = useMemo(() => {
    const byDate = new Map((trendBundle?.nutritions ?? []).map((record) => [record.record_date, record]));
    if (nutrition) byDate.set(nutrition.record_date, nutrition);
    return rollingDateWindow(deviceDate).map((date) => ({ date, record: byDate.get(date) ?? null }));
  }, [deviceDate, nutrition, trendBundle]);
  const trendPoints = records.map(({ date, record }) => ({
    id: record?.id ?? `missing-diet-${date}`,
    label: shortDate(date, locale),
    value: Math.round(record?.total_calories ?? 0),
    missing: record?.total_calories == null,
  }));
  const hasTrend = records.some(({ record }) => record?.total_calories != null);
  const recordedCalories = records.flatMap(({ record }) => record?.total_calories != null ? [record.total_calories] : []);
  const calorieAverage = recordedCalories.length > 0 ? recordedCalories.reduce((sum, value) => sum + value, 0) / recordedCalories.length : null;
  const calorieRange = calorieAverage == null ? null : { low: Math.round(calorieAverage * .85), high: Math.round(calorieAverage * 1.15) };
  const macroEnergy = {
    protein: Math.max(0, nutrition?.protein_grams ?? 0) * 4,
    carbs: Math.max(0, nutrition?.carbohydrate_grams ?? 0) * 4,
    fat: Math.max(0, nutrition?.fat_grams ?? 0) * 9,
  };
  const hasMacroAmounts = nutrition?.protein_grams != null && nutrition.carbohydrate_grams != null && nutrition.fat_grams != null && macroEnergy.protein + macroEnergy.carbs + macroEnergy.fat > 0;
  const macroTotal = Math.max(1, macroEnergy.protein + macroEnergy.carbs + macroEnergy.fat);
  const proteinEnd = macroEnergy.protein / macroTotal * 100;
  const carbsEnd = proteinEnd + macroEnergy.carbs / macroTotal * 100;
  const calorieOutlier = calorieAverage != null && nutrition?.total_calories != null && recordedCalories.length >= 3 && (nutrition.total_calories > calorieAverage * 1.5 || nutrition.total_calories < calorieAverage * .5);
  const meals: Array<{ key: "breakfast" | "lunch" | "dinner" | "pantry"; zh: string; en: string; items: FoodItem[] }> = [
    { key: "breakfast", zh: "早餐", en: "Breakfast", items: nutrition?.breakfast_items ?? [] },
    { key: "lunch", zh: "午餐", en: "Lunch", items: nutrition?.lunch_items ?? [] },
    { key: "dinner", zh: "晚餐", en: "Dinner", items: nutrition?.dinner_items ?? [] },
    { key: "pantry", zh: "加餐", en: "Snack", items: nutrition?.pantry_items ?? [] },
  ];
  return (
    <div className="module-dashboard diet-dashboard" data-module-view="diet-overview">
      <section className="figma-module-card diet-summary-card">
        <header>
          <strong>{locale === "zh" ? "今日饮食" : "Today's diet"}</strong>
          <button type="button" onClick={onOpenDietCamera} aria-label={locale === "zh" ? "直接拍照识别饮食" : "Photograph a meal for AI recognition"}><Camera size={20} /></button>
        </header>
        <div className="diet-nutrition-summary">
          <span><small>{locale === "zh" ? "蛋白质" : "Protein"}</small><strong>{nutrition?.protein_grams != null ? <AnimatedNumber value={Math.round(nutrition.protein_grams)} /> : "--"}<em>g</em></strong></span>
          <span><small>{locale === "zh" ? "碳水化合物" : "Carbohydrates"}</small><strong>{nutrition?.carbohydrate_grams != null ? <AnimatedNumber value={Math.round(nutrition.carbohydrate_grams)} /> : "--"}<em>g</em></strong></span>
          <span><small>{locale === "zh" ? "脂肪" : "Fat"}</small><strong>{nutrition?.fat_grams != null ? <AnimatedNumber value={Math.round(nutrition.fat_grams)} /> : "--"}<em>g</em></strong></span>
          <span><small>{locale === "zh" ? "饮水量" : "Water"}</small><strong>{nutrition?.hydration_ml != null ? <AnimatedNumber value={Math.round(nutrition.hydration_ml)} /> : "--"}<em>ml</em></strong></span>
        </div>
        <div className="diet-energy-context">
          <div className={["diet-macro-ring", hasMacroAmounts ? "" : "is-missing"].filter(Boolean).join(" ")} style={hasMacroAmounts ? { background: `conic-gradient(#218fba 0 ${proteinEnd}%, #69c3d9 ${proteinEnd}% ${carbsEnd}%, #f3ba70 ${carbsEnd}% 100%)` } : undefined}><span>{nutrition?.total_calories != null ? Math.round(nutrition.total_calories) : "--"}<small>kcal</small></span></div>
          <p>{calorieRange ? (locale === "zh" ? `你近 7 日有记录日的日均参考范围为 ${calorieRange.low}–${calorieRange.high} kcal；缺失日未按 0 计算。` : `Your recorded-day 7-day reference range is ${calorieRange.low}–${calorieRange.high} kcal; missing days are excluded.`) : (locale === "zh" ? "累积更多真实记录后生成个人历史参考范围。" : "Log more days to build your recorded-history reference range.")}</p>
        </div>
      </section>
      {calorieOutlier && <section className="diet-pattern-alert"><Utensils size={18} /><p>{locale === "zh" ? "今天的能量记录与近期有记录日均值差异较大。请先检查是否漏记餐次或份量；这里仅做记录异常提示，不作营养诊断。" : "Today's logged energy differs notably from your recent recorded-day average. Check for missing meals or portions; this is a logging prompt, not a diagnosis."}</p></section>}
      <section className="figma-module-card diet-meals-card">
        <header><strong>{locale === "zh" ? "餐次记录" : "Meals"}</strong><button className="module-card-icon-action" type="button" onClick={onOpenEditor}><Utensils size={18} /><span>{locale === "zh" ? "添加" : "Add"}</span></button></header>
        <div className="diet-meal-grid">
          {meals.map((meal) => (
            <button type="button" key={meal.key} onClick={() => onOpenDietMeal(meal.key)}>
              <span>{meal.items.length > 0 ? <Check size={17} /> : <Plus size={17} />}</span>
              <strong>{locale === "zh" ? meal.zh : meal.en}</strong>
              <small>{meal.items.length > 0 ? `${meal.items.length}${locale === "zh" ? " 项" : " items"}` : (locale === "zh" ? "待记录" : "Pending")}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="figma-module-card diet-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日能量记录" : "7-day energy log"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看饮食历史" : "View diet history"}><ChevronRight size={18} /></button></header>
        {hasTrend ? <LineTrendChart points={trendPoints} compact scale="auto" verticalEmphasis showAllDates ariaLabel={locale === "zh" ? "近七日饮食能量趋势，单位千卡；未记录日期保留为空位" : "Seven-day dietary energy trend in kilocalories with empty slots for missing dates"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一餐记录后显示趋势" : "Log a meal to begin the trend"}</p>}
      </section>
    </div>
  );
}

function FaceDashboard(props: Pick<Props, "todaySnapshot" | "trendBundle" | "deviceDate" | "profile" | "onOpenFaceCamera"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { locale, todaySnapshot, trendBundle, deviceDate, onOpenFaceCamera, view, openView } = props;
  const face = todaySnapshot?.face;
  const records = useMemo(() => {
    const source = [...(trendBundle?.faces ?? []), ...(face ? [face] : [])];
    const mode = face ? face.capture_mode : latestKnownFaceMode(source, deviceDate);
    const byDate = new Map(sameModeFaces(source, mode, face?.record_date ?? deviceDate).map((record) => [record.record_date, record]));
    return rollingDateWindow(deviceDate).map((date) => ({ date, record: byDate.get(date) ?? null }));
  }, [deviceDate, face, trendBundle]);
  const points = records.map(({ date, record }) => {
      const value = record?.overall_score ?? 0;
      return {
        id: record?.id ?? `missing-face-${date}`,
        label: shortDate(date, locale),
        barValue: value,
        lineValue: value,
        barText: record?.overall_score == null ? (locale === "zh" ? "暂无记录" : "No entry") : (locale === "zh" ? `${value} 分` : `${value} pts`),
        lineText: record?.overall_score == null ? (locale === "zh" ? "暂无记录" : "No entry") : (locale === "zh" ? `${value} 分` : `${value} pts`),
        missing: record?.overall_score == null,
      };
    });
  const hasTrend = points.some((point) => !point.missing);
  const previousFace = previousComparableFace(trendBundle?.faces ?? [], face);
  const scoreDelta = face?.overall_score != null && previousFace?.overall_score != null ? Math.round(face.overall_score - previousFace.overall_score) : null;
  const feedbackSentence = face?.feedback?.split(/(?<=[。！？.!?])/)[0]?.trim() || (locale === "zh" ? "完成一次拍摄后，这里会显示基于真实分析结果的今日一句话。" : "Complete a capture to see today's result-based note.");
  const recentScoredFaces = records.flatMap(({ record }) => record?.overall_score == null ? [] : [record]).slice(-3);
  const repeatedLowFace = recentScoredFaces.length === 3 && recentScoredFaces.every((record) => (record.overall_score ?? 100) < 55);
  if (view === "compare") return <ModuleDetailView compact title={locale === "zh" ? "面部状态对比" : "Face-state comparison"}>
    {face && previousFace ? <div className="face-comparison">
      {[previousFace, face].map((record, index) => <section key={record.id}><small>{index === 0 ? (locale === "zh" ? "上次" : "Previous") : (locale === "zh" ? "本次" : "Current")} · {shortDate(record.record_date, locale)}</small><strong>{record.overall_score == null ? "--" : Math.round(record.overall_score)}<em>{locale === "zh" ? "分" : "pts"}</em></strong><span>{locale === "zh" ? "肤龄参考" : "Skin-age ref."} {record.skin_age == null ? "--" : Math.round(record.skin_age)}</span></section>)}
      <div className={scoreDelta != null && scoreDelta >= 0 ? "positive" : "negative"}><RefreshCw size={18} /><strong>{scoreDelta == null ? "--" : `${scoreDelta >= 0 ? "+" : ""}${scoreDelta}`}</strong><p>{locale === "zh" ? "仅比较两次真实分析结果；拍摄光线、角度与妆容可能影响分数。" : "Compares two real analyses only; lighting, angle, and makeup can affect scores."}</p></div>
    </div> : <p className="module-empty-copy">{locale === "zh" ? "暂无更早的同模式记录，暂不能对比。" : "No earlier same-mode record is available for comparison."}</p>}
  </ModuleDetailView>;
  return (
    <div className="module-dashboard face-dashboard" data-module-view="face-overview">
      <section className="figma-module-card face-privacy-card">
        <ShieldCheck size={18} /><p>{locale === "zh" ? "照片经明确同意后通过加密连接进入账号隔离的 Supabase 私有存储；受控服务端只使用短时签名链接分析，结果不构成医疗诊断。" : "With consent, photos are encrypted in transit to account-isolated private Supabase storage; the controlled server analyzes only through a short-lived signed link, and results are not medical diagnoses."}</p>
      </section>
      <section className="figma-module-card face-summary-card">
        <header><strong>{locale === "zh" ? "今日面部状态" : "Today's face state"}</strong><div className="face-summary-actions"><button type="button" onClick={() => openView("compare")} disabled={!previousFace}><RefreshCw size={16} /><span>{locale === "zh" ? "对比" : "Compare"}</span></button><button className="module-card-icon-action" type="button" onClick={onOpenFaceCamera} aria-label={locale === "zh" ? "使用前置摄像头拍照" : "Take a front-camera photo"}><Camera size={18} /><span>{locale === "zh" ? "拍照" : "Capture"}</span></button></div></header>
        <div className="face-score-row">
          <div className="face-score-ring" style={{ "--face-score": `${face?.overall_score ?? 0}%` } as CSSProperties}><ScanFace size={28} /><strong>{face?.overall_score == null ? "--" : <AnimatedNumber value={face.overall_score} />}</strong></div>
          <div><span>{locale === "zh" ? "肤龄参考" : "Skin-age reference"}<strong>{face?.skin_age == null ? "--" : <AnimatedNumber value={face.skin_age} />}</strong></span><span>{locale === "zh" ? "拍摄模式" : "Capture mode"}<strong>{!face || !knownFaceMode(face.capture_mode) ? "--" : face.capture_mode === "makeup" ? (locale === "zh" ? "带妆" : "Makeup") : (locale === "zh" ? "素颜" : "Bare")}</strong></span><span>{locale === "zh" ? "分析置信度" : "Confidence"}<strong>{face?.analysis_confidence != null ? <><AnimatedNumber value={face.analysis_confidence * 100} />%</> : "--"}</strong></span></div>
        </div>
        <div className="face-daily-note"><Bot size={17} /><p>{feedbackSentence}</p>{scoreDelta != null && <strong className={scoreDelta >= 0 ? "positive" : "negative"}>{scoreDelta >= 0 ? "+" : ""}{scoreDelta}</strong>}</div>
      </section>
      {repeatedLowFace && <section className="face-pattern-alert" role="status"><ScanFace size={18} /><p>{locale === "zh" ? "最近 3 次面部状态评分都偏低。拍摄条件也会影响结果；可以结合睡眠、情绪和运动记录问 NAVA 查看可能关联，本提示不构成医疗诊断。" : "Your last 3 face-state scores were low. Capture conditions can affect results; ask NAVA to review possible links with sleep, mood, and activity. This is not a diagnosis."}</p></section>}
      <section className="figma-module-card face-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日同模式状态" : "7-day same-mode state"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看面部趋势报告" : "View face trend report"}><ChevronRight size={18} /></button></header>
        {hasTrend ? <BarLineTrendChart points={points} scoreScale curve="monotone" ariaLabel={locale === "zh" ? "按设备日期滚动的近七日面部状态趋势；未记录日期保留为空位" : "Device-date rolling seven-day face-state trend with empty slots for missing dates"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一次拍照后显示趋势" : "Take the first photo to begin the trend"}</p>}
      </section>
    </div>
  );
}

function FocusDashboard(props: Pick<Props, "userId" | "focusTitle" | "focusMinutes" | "focusNote" | "setFocusTitle" | "setFocusMinutes" | "setFocusNote" | "focusLaunch" | "onFocusLaunchConsumed" | "onSaveFocusMinutes" | "todaySnapshot" | "trendBundle" | "deviceDate" | "profile" | "onOpenAi"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { userId, locale, focusTitle, focusMinutes, focusNote, setFocusTitle, setFocusMinutes, setFocusNote, focusLaunch, onFocusLaunchConsumed, onSaveFocusMinutes, todaySnapshot, trendBundle, deviceDate, view, openView, onOpenAi } = props;
  const restoredTimer = useMemo(() => readFocusTimerDraft(userId), [userId]);
  const launchedFromEditorRef = useRef(Boolean(focusLaunch));
  const displayedFocusTitle = focusTitle === "产品原型" || focusTitle === "Product prototype" || focusTitle === "Prototype"
    ? ""
    : focusTitle;
  const immersive = view === "immersive" || view === "interruption";
  const wakePreferenceKey = `nava-focus-keep-awake:${userId}`;
  const breakPreferenceKey = `nava-focus-break-interval:${userId}`;
  const wakeLockAvailable = screenWakeLockSupported();
  const fullscreenAvailable = focusFullscreenSupported();
  const focusSoundAvailable = focusNoiseSupported();
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const wakeRequestIdRef = useRef(0);
  const wakeRequestPendingRef = useRef(false);
  const noiseSessionRef = useRef<FocusNoiseSession | null>(null);
  const noiseRequestRef = useRef(0);
  const interruptionGuardRef = useRef(0);
  const breakCueSlotRef = useRef(0);
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(() => window.sessionStorage.getItem(wakePreferenceKey) !== "false");
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockPending, setWakeLockPending] = useState(false);
  const [wakeLockFailed, setWakeLockFailed] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(focusFullscreenActive);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const [noiseKind, setNoiseKind] = useState<FocusNoiseKind>("off");
  const [noiseVolume, setNoiseVolume] = useState(0.16);
  const [noisePanelOpen, setNoisePanelOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideAiAbortRef = useRef<AbortController | null>(null);
  const [guideAiCue, setGuideAiCue] = useState<string | null>(null);
  const [guideAiError, setGuideAiError] = useState<string | null>(null);
  const [guideAiLoading, setGuideAiLoading] = useState(false);
  const encouragementAbortRef = useRef<AbortController | null>(null);
  const [encouragementOpen, setEncouragementOpen] = useState(false);
  const [encouragementLoading, setEncouragementLoading] = useState(false);
  const [encouragementText, setEncouragementText] = useState<string | null>(null);
  const [encouragementError, setEncouragementError] = useState<string | null>(null);
  const [encouragementSources, setEncouragementSources] = useState<FocusHealthEvidence[]>([]);
  const [autoEncouragement, setAutoEncouragement] = useState(false);
  const nextAutoEncouragementAtRef = useRef(0);
  const autoEncouragementCountRef = useRef(0);
  const priorityAbortRef = useRef<AbortController | null>(null);
  const [priorityAdvice, setPriorityAdvice] = useState<{ key: string; orderIds: string[]; basis: string; question: string } | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityNotice, setPriorityNotice] = useState<string | null>(null);
  const [quadrantSavingId, setQuadrantSavingId] = useState<string | null>(null);
  const [quadrantError, setQuadrantError] = useState<string | null>(null);
  const [quadrantsOpen, setQuadrantsOpen] = useState(false);
  const difficultyAbortRef = useRef<AbortController | null>(null);
  const [difficultyAssessment, setDifficultyAssessment] = useState<string | null>(null);
  const [difficultyError, setDifficultyError] = useState<string | null>(null);
  const [difficultyLoading, setDifficultyLoading] = useState(false);
  const [breakCue, setBreakCue] = useState(false);
  const [breakIntervalMinutes, setBreakIntervalMinutes] = useState(() => {
    const stored = Number(window.sessionStorage.getItem(breakPreferenceKey));
    return [0, 25, 45, 60].includes(stored) ? stored : 25;
  });
  const [running, setRunning] = useState(Boolean(focusLaunch));
  const [hasStarted, setHasStarted] = useState(Boolean(restoredTimer || focusLaunch));
  const [countdownDurationSeconds, setCountdownDurationSeconds] = useState(focusLaunch ? focusMinutes * 60 : restoredTimer?.countdownDurationSeconds ?? focusMinutes * 60);
  const [remaining, setRemaining] = useState(focusLaunch ? focusMinutes * 60 : restoredTimer?.remaining ?? focusMinutes * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(focusLaunch ? 0 : restoredTimer?.elapsedSeconds ?? 0);
  const [timerMode, setTimerMode] = useState<"countdown" | "countup">(focusLaunch?.mode ?? restoredTimer?.mode ?? "countdown");
  const [interruptions, setInterruptions] = useState(focusLaunch ? 0 : restoredTimer?.interruptions ?? 0);
  const [interruptionReasons, setInterruptionReasons] = useState<FocusInterruptionReasons>(() => focusLaunch ? emptyFocusInterruptionReasons() : restoredTimer?.interruptionReasons ?? emptyFocusInterruptionReasons());
  const [currentInterruptionReason, setCurrentInterruptionReason] = useState<FocusInterruptionReason | null>(null);
  const [previewInterruption, setPreviewInterruption] = useState(false);
  const [startedAt, setStartedAt] = useState<string | undefined>(focusLaunch?.startedAt ?? restoredTimer?.startedAt);
  const [sessionId, setSessionId] = useState(focusLaunch?.id ?? restoredTimer?.sessionId ?? crypto.randomUUID());
  const currentFocusSessionRef = useRef(sessionId);
  currentFocusSessionRef.current = sessionId;
  const [saving, setSaving] = useState(false);
  const [focusSaveError, setFocusSaveError] = useState<string | null>(null);
  useEffect(() => setFocusSaveError(null), [sessionId]);
  const [saved, setSaved] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [morningPlanOpen, setMorningPlanOpen] = useState(false);
  const [morningPlanNotice, setMorningPlanNotice] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoTime, setTodoTime] = useState("");
  const [todoMinutes, setTodoMinutes] = useState(Math.max(1, focusMinutes));
  const [todoSessions, setTodoSessions] = useState(1);
  const [todoView, setTodoView] = useState<"list" | "calendar">("list");
  const [calendarDate, setCalendarDate] = useState(deviceDate);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(restoredTimer?.selectedTodoId ?? null);
  const [focusCategory, setFocusCategory] = useState(restoredTimer?.category ?? "work");
  const [chartMode, setChartMode] = useState<"trend" | "period" | "category">("trend");
  const [cloudTimerReady, setCloudTimerReady] = useState(() => isDemoMode());
  const lastCloudTimerWriteRef = useRef(0);
  const cloudTimerExistsRef = useRef(false);
  const lastTimerTickRef = useRef<number | null>(null);
  const releaseWakeLock = useCallback(async () => {
    wakeRequestIdRef.current += 1;
    wakeRequestPendingRef.current = false;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    setWakeLockPending(false);
    setWakeLockFailed(false);
    if (sentinel && sentinel.released !== true) await sentinel.release().catch(() => undefined);
  }, []);
  const acquireWakeLock = useCallback(async () => {
    if (!immersive || view === "interruption" || !keepAwakeEnabled || document.visibilityState !== "visible" || wakeLockRef.current || wakeRequestPendingRef.current) return;
    if (!wakeLockAvailable) {
      setWakeLockFailed(true);
      setCapabilityMessage(locale === "zh" ? "当前浏览器不支持系统级屏幕常亮；计时仍会继续。" : "This browser does not support system wake lock; the timer will keep running.");
      return;
    }
    const requestId = ++wakeRequestIdRef.current;
    wakeRequestPendingRef.current = true;
    setWakeLockPending(true);
    setWakeLockFailed(false);
    try {
      const sentinel = await requestScreenWakeLock();
      if (requestId !== wakeRequestIdRef.current || document.visibilityState !== "visible") {
        if (sentinel && sentinel.released !== true) await sentinel.release().catch(() => undefined);
        return;
      }
      if (!sentinel) {
        setWakeLockFailed(true);
        setCapabilityMessage(locale === "zh" ? "系统没有授予屏幕常亮；请检查浏览器权限。" : "Screen wake lock was not granted. Check browser permissions.");
        return;
      }
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      setWakeLockFailed(false);
      setCapabilityMessage(null);
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) {
          wakeLockRef.current = null;
          setWakeLockActive(false);
          setWakeLockFailed(true);
          setCapabilityMessage(locale === "zh" ? "屏幕常亮已中断，请点按重试。" : "Screen wake lock was interrupted. Tap to retry.");
        }
      }, { once: true });
    } catch {
      if (requestId === wakeRequestIdRef.current) {
        setWakeLockActive(false);
        setWakeLockFailed(true);
        setCapabilityMessage(locale === "zh" ? "屏幕常亮申请失败；请保持页面在前台或检查省电设置。" : "Wake lock failed. Keep this page visible or check battery-saving settings.");
      }
    } finally {
      if (requestId === wakeRequestIdRef.current) {
        wakeRequestPendingRef.current = false;
        setWakeLockPending(false);
      }
    }
  }, [immersive, view, keepAwakeEnabled, locale, wakeLockAvailable]);
  const stopFocusNoise = useCallback(async () => {
    noiseRequestRef.current += 1;
    const activeNoise = noiseSessionRef.current;
    noiseSessionRef.current = null;
    setNoiseKind("off");
    if (activeNoise) await activeNoise.stop();
  }, []);
  const selectFocusNoise = useCallback(async (kind: FocusNoiseKind) => {
    setNoisePanelOpen(true);
    if (kind === "off") {
      await stopFocusNoise();
      return;
    }
    if (!focusSoundAvailable) {
      setCapabilityMessage(locale === "zh" ? "当前浏览器不支持背景声音播放。" : "Background sound is unavailable in this browser.");
      return;
    }
    const requestId = noiseRequestRef.current + 1;
    noiseRequestRef.current = requestId;
    const previous = noiseSessionRef.current;
    noiseSessionRef.current = null;
    if (previous) await previous.stop();
    try {
      const session = await startFocusNoise(kind, noiseVolume);
      if (noiseRequestRef.current !== requestId) {
        await session.stop();
        return;
      }
      noiseSessionRef.current = session;
      setNoiseKind(kind);
      setCapabilityMessage(null);
    } catch {
      setNoiseKind("off");
      setCapabilityMessage(locale === "zh" ? "背景声音启动失败；请先确认浏览器允许播放声音。" : "Background sound could not start. Check browser audio permission.");
    }
  }, [focusSoundAvailable, locale, noiseVolume, stopFocusNoise]);
  useEffect(() => {
    window.sessionStorage.setItem(wakePreferenceKey, String(keepAwakeEnabled));
  }, [keepAwakeEnabled, wakePreferenceKey]);
  useEffect(() => {
    window.sessionStorage.setItem(breakPreferenceKey, String(breakIntervalMinutes));
    breakCueSlotRef.current = 0;
    setBreakCue(false);
  }, [breakIntervalMinutes, breakPreferenceKey]);
  useEffect(() => {
    noiseSessionRef.current?.setVolume(noiseVolume);
  }, [noiseVolume]);
  useEffect(() => {
    if (immersive) return;
    setNoisePanelOpen(false);
    setGuideOpen(false);
    void stopFocusNoise();
  }, [immersive, stopFocusNoise]);
  // Closing the guide aborts explicitly; changing guideOpen must not abort the
  // request started by the same click before the overlay has rendered.
  useEffect(() => () => { guideAiAbortRef.current?.abort(); }, []);
  useEffect(() => () => { encouragementAbortRef.current?.abort(); }, []);
  useEffect(() => {
    setAutoEncouragement(false);
    nextAutoEncouragementAtRef.current = 0;
    autoEncouragementCountRef.current = 0;
  }, [sessionId]);
  useEffect(() => {
    if (hasStarted) return;
    setAutoEncouragement(false);
    nextAutoEncouragementAtRef.current = 0;
    autoEncouragementCountRef.current = 0;
  }, [hasStarted]);
  useEffect(() => {
    if (immersive && running) return;
    encouragementAbortRef.current?.abort();
    setEncouragementOpen(false);
    setEncouragementLoading(false);
  }, [immersive, running]);
  useEffect(() => {
    if (!immersive || !keepAwakeEnabled) {
      void releaseWakeLock();
      return;
    }
    void acquireWakeLock();
    const restoreAfterVisibility = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", restoreAfterVisibility);
    return () => document.removeEventListener("visibilitychange", restoreAfterVisibility);
  }, [acquireWakeLock, immersive, keepAwakeEnabled, releaseWakeLock]);
  useEffect(() => {
    const syncFullscreenState = () => setFullscreenActive(focusFullscreenActive());
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);
  useEffect(() => {
    if (immersive) return;
    void releaseWakeLock();
    void exitFocusFullscreen().then(() => setFullscreenActive(false));
  }, [immersive, releaseWakeLock]);
  useEffect(() => () => {
    wakeRequestIdRef.current += 1;
    wakeRequestPendingRef.current = false;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel && sentinel.released !== true) void sentinel.release().catch(() => undefined);
    void exitFocusFullscreen();
    const activeNoise = noiseSessionRef.current;
    noiseSessionRef.current = null;
    if (activeNoise) void activeNoise.stop();
  }, []);
  const refreshTodos = useCallback(() => {
    void syncTodos(userId).then(setTodos).catch((error) => console.warn("Todo sync deferred", error));
  }, [userId]);
  useEffect(() => {
    refreshTodos();
    return subscribeProductivity(refreshTodos);
  }, [refreshTodos]);
  useEffect(() => {
    if (focusLaunch) {
      launchedFromEditorRef.current = true;
      const nextDuration = focusMinutes * 60;
      setTimerMode(focusLaunch.mode);
      setFocusNote(focusLaunch.note);
      setCountdownDurationSeconds(nextDuration);
      setRemaining(nextDuration);
      setElapsedSeconds(0);
      setInterruptions(0);
      setInterruptionReasons(emptyFocusInterruptionReasons());
      setCurrentInterruptionReason(null);
      setPreviewInterruption(false);
      breakCueSlotRef.current = 0;
      setBreakCue(false);
      setStartedAt(focusLaunch.startedAt);
      setSessionId(focusLaunch.id);
      setSelectedTodoId(focusLaunch.selectedTodoId ?? null);
      setSaved(false);
      setHasStarted(true);
      setRunning(true);
      onFocusLaunchConsumed();
      return;
    }
    if (launchedFromEditorRef.current) return;
    if (!restoredTimer) return;
    if (restoredTimer.title) setFocusTitle(restoredTimer.title);
    if (restoredTimer.note) setFocusNote(restoredTimer.note);
    setFocusMinutes(Math.max(1, Math.ceil(restoredTimer.countdownDurationSeconds / 60)));
  }, [focusLaunch, focusMinutes, onFocusLaunchConsumed, restoredTimer, setFocusMinutes, setFocusNote, setFocusTitle]);
  useEffect(() => {
    let active = true;
    if (isDemoMode()) {
      setCloudTimerReady(true);
      return () => { active = false; };
    }
    setCloudTimerReady(false);
    void loadActiveUserSession<Partial<FocusTimerDraft> & { clearedAt?: string }>(userId, "focus")
      .then((payload) => {
        if (!active) return;
        if (typeof payload?.clearedAt === "string") {
          window.sessionStorage.removeItem(`nava-focus-timer:${userId}`);
          cloudTimerExistsRef.current = false;
          if (!launchedFromEditorRef.current) {
            setRunning(false);
            setHasStarted(false);
          }
          return;
        }
        const remote = normalizeFocusTimerDraft(payload);
        cloudTimerExistsRef.current = Boolean(remote);
        if (remote && !launchedFromEditorRef.current) {
          setTimerMode(remote.mode);
          setCountdownDurationSeconds(remote.countdownDurationSeconds);
          setRemaining(remote.remaining);
          setElapsedSeconds(remote.elapsedSeconds);
          setInterruptions(remote.interruptions);
          setInterruptionReasons(remote.interruptionReasons);
          setStartedAt(remote.startedAt);
          setSessionId(remote.sessionId ?? crypto.randomUUID());
          setFocusTitle(remote.title ?? "");
          setFocusNote(remote.note ?? "");
          setFocusCategory(remote.category);
          setSelectedTodoId(remote.selectedTodoId ?? null);
          setFocusMinutes(Math.max(1, Math.ceil(remote.countdownDurationSeconds / 60)));
          setHasStarted(true);
          setRunning(false);
          setSaved(false);
        }
      })
      .catch((error) => console.warn("Focus session restore deferred", error))
      .finally(() => { if (active) setCloudTimerReady(true); });
    return () => { active = false; };
  }, [setFocusMinutes, setFocusNote, setFocusTitle, userId]);
  useEffect(() => {
    if (!cloudTimerReady) return;
    const key = `nava-focus-timer:${userId}`;
    if (!hasStarted || saved) {
      window.sessionStorage.removeItem(key);
      if (cloudTimerExistsRef.current) {
        void clearActiveUserSession(userId, "focus")
          .then(() => { cloudTimerExistsRef.current = false; })
          .catch((error) => console.warn("Focus session cloud cleanup deferred", error));
      }
      return;
    }
    const draft: FocusTimerDraft = {
      mode: timerMode,
      sessionId,
      countdownDurationSeconds,
      remaining,
      elapsedSeconds,
      interruptions,
      interruptionReasons,
      startedAt,
      title: displayedFocusTitle,
      note: focusNote,
      category: focusCategory,
      selectedTodoId: selectedTodoId ?? undefined,
    };
    window.sessionStorage.setItem(key, JSON.stringify(draft));
    const now = Date.now();
    if (!running || now - lastCloudTimerWriteRef.current >= 15_000) {
      lastCloudTimerWriteRef.current = now;
      cloudTimerExistsRef.current = true;
      void saveActiveUserSession(userId, "focus", { ...draft })
        .catch((error) => console.warn("Focus session cloud sync deferred", error));
    }
  }, [cloudTimerReady, countdownDurationSeconds, displayedFocusTitle, elapsedSeconds, focusCategory, focusNote, hasStarted, interruptionReasons, interruptions, remaining, running, saved, selectedTodoId, sessionId, startedAt, timerMode, userId]);
  const rankTasks = (items: TodoItem[]) => [...items].sort((left, right) => {
    const leftRank = left.priorityRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.priorityRank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
  const todayTodos = rankTasks(todos.filter((item) => item.scheduledDate === deviceDate));
  const incompleteTodayTodos = todayTodos.filter((item) => !item.completed);
  const priorityKey = JSON.stringify(incompleteTodayTodos.map((item) => [item.id, item.title, item.scheduledTime, item.focusMinutes, item.important, item.urgent]));
  const calendarDays = rollingDateWindow(deviceDate);
  const visibleTodos = todoView === "list" ? todayTodos : todos.filter((item) => item.scheduledDate === calendarDate);
  const selectedTodo = todos.find((item) => item.id === selectedTodoId) ?? null;
  const clearDifficultyAssessment = () => {
    difficultyAbortRef.current?.abort();
    difficultyAbortRef.current = null;
    setDifficultyAssessment(null);
    setDifficultyError(null);
    setDifficultyLoading(false);
  };
  useEffect(() => () => difficultyAbortRef.current?.abort(), []);
  useEffect(() => () => priorityAbortRef.current?.abort(), []);
  const todoSessionProgress = useMemo(() => {
    const totals = new Map<string, number>();
    (trendBundle?.focus ?? []).forEach((record) => {
      if (!record.task_id) return;
      totals.set(record.task_id, (totals.get(record.task_id) ?? 0) + Math.max(0, Number(record.completed_sessions) || 0));
    });
    return totals;
  }, [trendBundle]);
  const selectedTodoCompletedSessions = selectedTodo ? (todoSessionProgress.get(selectedTodo.id) ?? 0) : 0;
  const focusRecords = useMemo(() => {
    const byDate = new Map(aggregateFocusByDate(trendBundle?.focus ?? []).map((record) => [record.record_date, record]));
    return rollingDateWindow(deviceDate).map((date) => ({ date, record: byDate.get(date) ?? null }));
  }, [deviceDate, trendBundle]);
  const todayMinutes = todaySnapshot?.focusMinutes ?? 0;
  const todaySessions = todaySnapshot?.focusSessions ?? 0;
  const focusTrendPoints: BarLineTrendPoint[] = focusRecords.map(({ date, record }) => ({
    id: record?.id ?? `missing-focus-${date}`,
    label: shortDate(date, locale),
    barValue: record?.total_minutes ?? 0,
    lineValue: record?.total_minutes ?? 0,
    barText: record ? (locale === "zh" ? `${record.total_minutes} 分钟` : `${record.total_minutes} min`) : (locale === "zh" ? "暂无记录" : "No entry"),
    lineText: record ? (locale === "zh" ? `${record.total_minutes} 分钟` : `${record.total_minutes} min`) : (locale === "zh" ? "暂无记录" : "No entry"),
    missing: !record,
  }));
  const hasFocusTrend = focusTrendPoints.some((point) => !point.missing);
  const recentFocus = focusRecords.flatMap(({ record }) => record ? [record] : []).slice(-3).reverse();
  const periodDistribution = useMemo(() => {
    const allowedDates = new Set(rollingDateWindow(deviceDate));
    const totals = (trendBundle?.focusDistributions ?? []).filter((item) => allowedDates.has(item.record_date)).reduce((sum, item) => ({
      dawn: sum.dawn + item.period_0_6,
      morning: sum.morning + item.period_6_12,
      afternoon: sum.afternoon + item.period_12_18,
      evening: sum.evening + item.period_18_24,
    }), { dawn: 0, morning: 0, afternoon: 0, evening: 0 });
    return [
      { key: "dawn", label: locale === "zh" ? "凌晨" : "Night", value: totals.dawn },
      { key: "morning", label: locale === "zh" ? "上午" : "Morning", value: totals.morning },
      { key: "afternoon", label: locale === "zh" ? "下午" : "Afternoon", value: totals.afternoon },
      { key: "evening", label: locale === "zh" ? "晚间" : "Evening", value: totals.evening },
    ];
  }, [deviceDate, locale, trendBundle]);
  const categoryDistribution = useMemo(() => {
    const allowedDates = new Set(rollingDateWindow(deviceDate));
    const totals = new Map<string, number>();
    (trendBundle?.focus ?? []).filter((item) => allowedDates.has(item.record_date)).forEach((item) => {
      const key = item.category?.trim() || "other";
      totals.set(key, (totals.get(key) ?? 0) + item.total_minutes);
    });
    const labels: Record<string, string> = locale === "zh" ? { work: "工作", study: "学习", life: "生活", other: "其他" } : { work: "Work", study: "Study", life: "Life", other: "Other" };
    return [...totals.entries()].map(([key, value]) => ({ key, label: labels[key] ?? key, value })).sort((a, b) => b.value - a.value);
  }, [deviceDate, locale, trendBundle]);

  const createTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = todoTitle.trim();
    if (!title) return;
    const created = await addTodo(userId, title, "manual", deviceDate, todoTime || undefined, { focusMinutes: todoMinutes, focusSessions: todoSessions });
    setTodoTitle("");
    setTodos((items) => [created, ...items.filter((item) => item.id !== created.id)]);
  };

  const chooseTodo = (item: TodoItem) => {
    clearDifficultyAssessment();
    const plan = resolveTodoFocusPlan(item);
    setSelectedTodoId(item.id);
    setFocusTitle(item.title);
    updateDuration(plan.focusMinutes);
    if (plan.suggested) {
      void saveTodoFocusPlan(userId, item.id, plan)
        .then(setTodos)
        .catch((error) => console.warn("Todo focus estimate sync deferred", error));
    }
  };

  const createMorningTask = async (title: string) => {
    const created = await addTodo(userId, title, "manual", deviceDate, undefined, { focusMinutes: 25, focusSessions: 1 });
    setTodos((items) => [created, ...items.filter((item) => item.id !== created.id)]);
    return created;
  };
  const saveMorningTaskPlan = async (task: TodoItem, plan: MorningTaskPlan) => {
    setTodos(await saveTodoFocusPlan(userId, task.id, plan));
  };
  const finishMorningPlan = (task: TodoItem, plan: MorningTaskPlan, count: number) => {
    chooseTodo({ ...task, ...plan });
    setMorningPlanNotice(locale === "zh" ? `已更新 ${count} 项待办的专注计划，第一项已选中。` : `Updated ${count} task plans and selected the first priority.`);
    setMorningPlanOpen(false);
  };

  const enterImmersive = (replace = false) => {
    openView("immersive", replace);
    // Desktop device preview keeps its external QA controls beside the phone.
    // The viewport layer is still immersive; system fullscreen remains opt-in.
    if (window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 700px) and (min-height: 700px)").matches) {
      setFullscreenActive(false);
      setCapabilityMessage(null);
      return;
    }
    if (!fullscreenAvailable) {
      setFullscreenActive(false);
      setCapabilityMessage(locale === "zh" ? "已进入沉浸界面；当前浏览器不支持系统全屏。" : "Immersive view is active; system full screen is unavailable in this browser.");
      return;
    }
    void requestFocusFullscreen()
      .then((active) => {
        setFullscreenActive(active);
        if (!active) setCapabilityMessage(locale === "zh" ? "已进入沉浸界面，但系统全屏未获授权。" : "Immersive view is active, but system full screen was not granted.");
      })
      .catch(() => setCapabilityMessage(locale === "zh" ? "系统全屏申请失败，已保留沉浸界面。" : "System full screen failed; immersive view remains active."));
  };

  const closeGuide = () => {
    guideAiAbortRef.current?.abort();
    setGuideAiLoading(false);
    setGuideOpen(false);
  };

  const requestGuideAiCue = async () => {
    if (!displayedFocusTitle.trim() || isDemoMode()) return;
    guideAiAbortRef.current?.abort();
    const controller = new AbortController();
    guideAiAbortRef.current = controller;
    setGuideAiCue(null);
    setGuideAiError(null);
    setGuideAiLoading(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 70_000);
    try {
      const cue = await generateFocusStartingCue(displayedFocusTitle, focusMinutes, locale, controller.signal);
      if (!controller.signal.aborted) setGuideAiCue(cue);
    } catch (error) {
      if (guideAiAbortRef.current === controller && (timedOut || !controller.signal.aborted)) {
        setGuideAiError(timedOut ? (locale === "zh" ? "AI 响应超时，请重试。" : "The AI response timed out. Please retry.") : error instanceof Error ? error.message : (locale === "zh" ? "AI 暂不可用，请重试。" : "AI is unavailable. Please retry."));
      }
    } finally {
      window.clearTimeout(timeout);
      if (guideAiAbortRef.current === controller) {
        guideAiAbortRef.current = null;
        setGuideAiLoading(false);
      }
    }
  };

  const requestDifficultyAssessment = async () => {
    if (!displayedFocusTitle.trim() || isDemoMode()) return;
    difficultyAbortRef.current?.abort();
    const controller = new AbortController();
    difficultyAbortRef.current = controller;
    setDifficultyAssessment(null);
    setDifficultyError(null);
    setDifficultyLoading(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 70_000);
    try {
      const assessment = await generateFocusDifficulty(displayedFocusTitle, focusMinutes, selectedTodo?.focusSessions, locale, controller.signal);
      if (!controller.signal.aborted) setDifficultyAssessment(assessment);
    } catch (error) {
      if (difficultyAbortRef.current === controller && (timedOut || !controller.signal.aborted)) {
        setDifficultyError(timedOut ? (locale === "zh" ? "AI 响应超时，请重试。" : "The AI response timed out. Please retry.") : error instanceof Error ? error.message : (locale === "zh" ? "AI 暂不可用，请重试。" : "AI is unavailable. Please retry."));
      }
    } finally {
      window.clearTimeout(timeout);
      if (difficultyAbortRef.current === controller) {
        difficultyAbortRef.current = null;
        setDifficultyLoading(false);
      }
    }
  };

  const requestPriorityAdvice = async () => {
    if (incompleteTodayTodos.length < 2 || incompleteTodayTodos.length > 12 || isDemoMode()) return;
    priorityAbortRef.current?.abort();
    const controller = new AbortController();
    const tasks = incompleteTodayTodos;
    const key = priorityKey;
    priorityAbortRef.current = controller;
    setPriorityAdvice(null);
    setPriorityError(null);
    setPriorityLoading(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 70_000);
    try {
      const advice = await generateFocusPriority(tasks, locale, controller.signal);
      if (!controller.signal.aborted) setPriorityAdvice({ key, orderIds: advice.order.map((number) => tasks[number - 1].id), basis: advice.basis, question: advice.question });
    } catch (error) {
      if (priorityAbortRef.current === controller && (timedOut || !controller.signal.aborted)) {
        setPriorityError(timedOut ? (locale === "zh" ? "AI 排序超时，请重试。" : "AI prioritization timed out. Please retry.") : error instanceof Error ? error.message : (locale === "zh" ? "AI 暂不可用，请重试。" : "AI is unavailable. Please retry."));
      }
    } finally {
      window.clearTimeout(timeout);
      if (priorityAbortRef.current === controller) {
        priorityAbortRef.current = null;
        setPriorityLoading(false);
      }
    }
  };

  const requestInSessionEncouragement = useCallback(async () => {
    if (!running || !displayedFocusTitle.trim() || isDemoMode()) return;
    encouragementAbortRef.current?.abort();
    const controller = new AbortController();
    encouragementAbortRef.current = controller;
    setEncouragementOpen(true);
    setEncouragementText(null);
    setEncouragementError(null);
    setEncouragementSources([]);
    setEncouragementLoading(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 70_000);
    try {
      const actualFocusedSeconds = timerMode === "countup" ? elapsedSeconds : Math.max(0, countdownDurationSeconds - remaining);
      const result = await generateFocusInSessionEncouragement(displayedFocusTitle, Math.floor(actualFocusedSeconds / 60), locale, controller.signal);
      if (!controller.signal.aborted) { setEncouragementText(result.reply); setEncouragementSources(result.evidence); }
    } catch (error) {
      if (encouragementAbortRef.current === controller && (timedOut || !controller.signal.aborted)) {
        setEncouragementError(timedOut ? (locale === "zh" ? "AI 提示超时，请重试。" : "The AI cue timed out. Please retry.") : error instanceof Error ? error.message : (locale === "zh" ? "AI 暂不可用，请重试。" : "AI is unavailable. Please retry."));
      }
    } finally {
      window.clearTimeout(timeout);
      if (encouragementAbortRef.current === controller) {
        encouragementAbortRef.current = null;
        setEncouragementLoading(false);
      }
    }
  }, [countdownDurationSeconds, displayedFocusTitle, elapsedSeconds, locale, remaining, running, timerMode]);

  const closeEncouragement = () => {
    encouragementAbortRef.current?.abort();
    encouragementAbortRef.current = null;
    setEncouragementOpen(false);
    setEncouragementLoading(false);
  };

  const changeQuadrant = async (id: string, quadrant: TodoQuadrant) => {
    setQuadrantSavingId(id);
    setQuadrantError(null);
    setPriorityNotice(null);
    try { setTodos(await saveTodoQuadrant(userId, id, quadrant)); }
    catch (error) { setQuadrantError(error instanceof Error ? error.message : (locale === "zh" ? "分类保存失败，请重试。" : "Could not save the quadrant. Please retry.")); }
    finally { setQuadrantSavingId(null); }
  };

  const acceptPriorityAdvice = async () => {
    if (!priorityAdvice || priorityAdvice.key !== priorityKey) return;
    setPrioritySaving(true);
    setPriorityError(null);
    try {
      setTodos(await saveTodoPriorityOrder(userId, priorityAdvice.orderIds));
      setPriorityNotice(locale === "zh" ? "已按你确认的顺序保存到账号。" : "Your confirmed order was saved to your account.");
      setPriorityAdvice(null);
    } catch (error) {
      setPriorityError(error instanceof Error ? error.message : (locale === "zh" ? "排序保存失败，请重试。" : "Could not save the order. Please retry."));
    } finally { setPrioritySaving(false); }
  };

  const leaveImmersive = () => {
    setRunning(false);
    closeGuide();
    closeEncouragement();
    void releaseWakeLock();
    void exitFocusFullscreen().then(() => setFullscreenActive(false));
    openView("overview");
  };

  const toggleFullscreen = () => {
    if (focusFullscreenActive()) {
      void exitFocusFullscreen().then(() => setFullscreenActive(false));
      return;
    }
    if (!fullscreenAvailable) {
      setCapabilityMessage(locale === "zh" ? "当前浏览器不支持系统全屏；沉浸界面仍然有效。" : "System full screen is unavailable; immersive view remains active.");
      return;
    }
    void requestFocusFullscreen()
      .then((active) => {
        setFullscreenActive(active);
        setCapabilityMessage(active ? null : (locale === "zh" ? "浏览器没有授予系统全屏。" : "The browser did not grant system full screen."));
      })
      .catch(() => setCapabilityMessage(locale === "zh" ? "系统全屏申请失败。" : "System full screen request failed."));
  };

  const resetForNewFocus = (duration = countdownDurationSeconds) => {
    if (saving) return;
    setSessionId(crypto.randomUUID());
    setStartedAt(undefined);
    setRemaining(duration);
    setElapsedSeconds(0);
    setRunning(false);
    setHasStarted(false);
    setInterruptions(0);
    setInterruptionReasons(emptyFocusInterruptionReasons());
    setCurrentInterruptionReason(null);
    setPreviewInterruption(false);
    breakCueSlotRef.current = 0;
    setBreakCue(false);
    setSaved(false);
    setFocusSaveError(null);
  };

  const updateDuration = (nextValue: number) => {
    if (saving) return;
    clearDifficultyAssessment();
    const nextMinutes = Math.min(180, Math.max(1, Math.round(nextValue || 1)));
    const nextSeconds = nextMinutes * 60;
    setFocusMinutes(nextMinutes);
    setCountdownDurationSeconds(nextSeconds);
    resetForNewFocus(nextSeconds);
  };

  const updateTimerPart = (part: "minutes" | "seconds", rawValue: string) => {
    if (saving) return;
    const parsed = Number.parseInt(rawValue.replace(/\D/g, ""), 10);
    const value = Number.isFinite(parsed) ? parsed : 0;
    const currentTotal = timerMode === "countup" ? elapsedSeconds : countdownDurationSeconds;
    const currentMinutes = Math.floor(currentTotal / 60);
    const currentSeconds = currentTotal % 60;
    const nextMinutes = part === "minutes" ? Math.min(180, Math.max(0, value)) : currentMinutes;
    const nextSeconds = part === "seconds" ? Math.min(59, Math.max(0, value)) : currentSeconds;
    const maxSeconds = 180 * 60;
    const requestedTotal = Math.min(maxSeconds, nextMinutes * 60 + nextSeconds);
    const nextTotal = timerMode === "countdown" ? Math.max(1, requestedTotal) : requestedTotal;

    setRunning(false);
    setHasStarted(false);
    setSaved(false);
    setStartedAt(undefined);
    setSessionId(crypto.randomUUID());
    if (timerMode === "countup") {
      setElapsedSeconds(nextTotal);
      return;
    }
    setCountdownDurationSeconds(nextTotal);
    setRemaining(nextTotal);
    setFocusMinutes(Math.max(1, Math.ceil(nextTotal / 60)));
  };

  useEffect(() => {
    if (!immersive || !running) return;
    lastTimerTickRef.current = Date.now();
    const applyElapsedWallTime = () => {
      const now = Date.now();
      const previous = lastTimerTickRef.current ?? now;
      const elapsed = Math.floor((now - previous) / 1000);
      if (elapsed <= 0) return;
      lastTimerTickRef.current = previous + elapsed * 1000;
      if (timerMode === "countup") setElapsedSeconds((value) => value + elapsed);
      else setRemaining((value) => Math.max(0, value - elapsed));
    };
    const timer = window.setInterval(applyElapsedWallTime, 250);
    return () => {
      applyElapsedWallTime();
      lastTimerTickRef.current = null;
      window.clearInterval(timer);
    };
  }, [immersive, running, timerMode]);

  useEffect(() => {
    if (!immersive && !hasStarted) {
      const nextSeconds = focusMinutes * 60;
      setCountdownDurationSeconds(nextSeconds);
      setRemaining(nextSeconds);
      setRunning(false);
    }
  }, [focusMinutes, hasStarted, immersive]);

  useEffect(() => {
    if (timerMode === "countdown" && running && remaining === 0) setRunning(false);
  }, [remaining, running, timerMode]);

  const recordInterruption = useCallback((reason?: FocusInterruptionReason, simulated = false) => {
    if (!running) return;
    const now = Date.now();
    if (!simulated && now - interruptionGuardRef.current < 1_500) return;
    interruptionGuardRef.current = now;
    setRunning(false);
    if (!simulated) setInterruptions((value) => value + 1);
    setCurrentInterruptionReason(simulated ? reason ?? null : null);
    setPreviewInterruption(simulated);
    setGuideOpen(false);
    setNoisePanelOpen(false);
    void stopFocusNoise();
    void releaseWakeLock();
    openView("interruption");
  }, [openView, running, stopFocusNoise, releaseWakeLock]);

  const chooseInterruptionReason = (reason: FocusInterruptionReason) => {
    if (previewInterruption) {
      setCurrentInterruptionReason(reason);
      return;
    }
    setInterruptionReasons((current) => {
      const next = { ...current };
      if (currentInterruptionReason) next[currentInterruptionReason] = Math.max(0, next[currentInterruptionReason] - 1);
      next[reason] += 1;
      return next;
    });
    setCurrentInterruptionReason(reason);
  };

  usePreviewActivity("focus", !immersive ? null : running ? "running" : hasStarted ? "paused" : "ready", (reason) => recordInterruption(reason, true));

  useEffect(() => {
    let listener: { remove: () => Promise<void> } | undefined;
    let active = true;
    if (!immersive) return;
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) recordInterruption();
    }).then((handle) => {
      if (active) listener = handle;
      else void handle.remove();
    });
    return () => {
      active = false;
      void listener?.remove();
    };
  }, [immersive, recordInterruption]);

  useEffect(() => {
    if (!immersive) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") recordInterruption();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [immersive, recordInterruption]);

  const timerDisplay = timerMode === "countup" ? elapsedSeconds : remaining;
  const timerMinutes = Math.floor(timerDisplay / 60);
  const timerSeconds = timerDisplay % 60;
  const progress = timerMode === "countup"
    ? Math.min(100, (elapsedSeconds / Math.max(1, countdownDurationSeconds)) * 100)
    : 100 - (remaining / Math.max(1, countdownDurationSeconds)) * 100;
  const focusedSeconds = timerMode === "countup" ? elapsedSeconds : Math.max(0, countdownDurationSeconds - remaining);

  useEffect(() => {
    if (!immersive || !running || !autoEncouragement || document.visibilityState !== "visible" || !displayedFocusTitle.trim() || isDemoMode()) return;
    if (focusedSeconds < nextAutoEncouragementAtRef.current) return;
    nextAutoEncouragementAtRef.current = nextFocusEncouragementAt(focusedSeconds);
    autoEncouragementCountRef.current += 1;
    if (autoEncouragementCountRef.current >= 4) setAutoEncouragement(false);
    void requestInSessionEncouragement();
  }, [autoEncouragement, displayedFocusTitle, focusedSeconds, immersive, requestInSessionEncouragement, running]);

  useEffect(() => {
    if (!immersive || !running || breakIntervalMinutes <= 0) return;
    const slot = Math.floor(focusedSeconds / (breakIntervalMinutes * 60));
    if (slot <= 0 || slot <= breakCueSlotRef.current) return;
    breakCueSlotRef.current = slot;
    setBreakCue(true);
    const timer = window.setTimeout(() => setBreakCue(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [breakIntervalMinutes, focusedSeconds, immersive, running]);

  const finish = useCallback(async () => {
    if (saving || !hasStarted) return;
    setRunning(false);
    setSaving(true);
    setFocusSaveError(null);
    const seconds = timerMode === "countup" ? elapsedSeconds : countdownDurationSeconds - remaining;
    const elapsed = Math.max(1, Math.ceil(seconds / 60));
    const reasonLabels: Record<FocusInterruptionReason, string> = locale === "zh"
      ? { message: "消息", call: "来电", distraction: "分心", other: "其他" }
      : { message: "message", call: "call", distraction: "distraction", other: "other" };
    const reasonSummary = (Object.entries(interruptionReasons) as Array<[FocusInterruptionReason, number]>)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reasonLabels[reason]} ${count}`)
      .join(locale === "zh" ? "、" : ", ");
    const savedNote = [focusNote.trim(), reasonSummary ? (locale === "zh" ? `中断原因：${reasonSummary}` : `Interruption reasons: ${reasonSummary}`) : ""].filter(Boolean).join("\n");
    try {
      const didSave = await onSaveFocusMinutes(elapsed, { taskId: selectedTodoId ?? undefined, interruptions, startedAt, endedAt: new Date().toISOString(), category: focusCategory, note: savedNote, sourceActionId: sessionId });
      if (currentFocusSessionRef.current !== sessionId) return;
      if (!didSave) {
        setFocusSaveError(locale === "zh" ? "保存尚未确认，计时已保留。请检查网络和所选待办，再点击结束重试。" : "Save is unconfirmed; your timer is preserved. Check the connection and selected task, then tap Finish to retry.");
        return;
      }
      if (selectedTodo && !selectedTodo.completed && selectedTodoCompletedSessions + 1 >= (selectedTodo.focusSessions ?? 1)) await setTodoCompleted(userId, selectedTodo.id, true);
      if (currentFocusSessionRef.current !== sessionId) return;
      refreshTodos();
      setSaved(true);
      openView("overview");
    } catch {
      setFocusSaveError(locale === "zh" ? "保存或待办更新尚未确认，计时已保留，请重试。" : "Save or task update is unconfirmed. Your timer is preserved; please retry.");
    } finally {
      setSaving(false);
    }
  }, [countdownDurationSeconds, elapsedSeconds, focusCategory, focusNote, hasStarted, interruptionReasons, interruptions, locale, onSaveFocusMinutes, openView, refreshTodos, remaining, saving, selectedTodo, selectedTodoId, selectedTodoCompletedSessions, sessionId, startedAt, timerMode, userId]);

  useEffect(() => {
    if (!immersive || timerMode !== "countdown" || remaining !== 0 || !hasStarted || saving || saved || focusSaveError) return;
    void finish();
  }, [finish, focusSaveError, hasStarted, immersive, remaining, saved, saving, timerMode]);

  if (immersive) {
    return createPortal((
      <fieldset disabled={saving} aria-busy={saving}
        className={["module-dashboard", "focus-immersive", running ? "is-running" : hasStarted ? "is-paused" : "is-ready"].join(" ")}
        data-module-view="focus-immersive"
        data-focus-state={running ? "running" : hasStarted ? "paused" : "ready"}
        data-wake-lock={!wakeLockAvailable ? "unsupported" : wakeLockActive ? "active" : !keepAwakeEnabled ? "off" : wakeLockPending ? "requesting" : wakeLockFailed ? "failed" : "off"}
        data-fullscreen={fullscreenActive ? "active" : "viewport"}
      >
        <button className="focus-immersive-exit" type="button" onClick={leaveImmersive} aria-label={locale === "zh" ? "退出并暂停沉浸专注" : "Exit and pause immersive focus"}><X size={19} /></button>
        <div className="focus-immersive-tools">
          <button
            type="button"
            className={keepAwakeEnabled ? "active" : ""}
            aria-pressed={keepAwakeEnabled}
            aria-label={wakeLockFailed && keepAwakeEnabled ? (locale === "zh" ? "重试屏幕常亮" : "Retry screen wake lock") : (locale === "zh" ? "切换屏幕常亮" : "Toggle screen wake lock")}
            onClick={() => {
              if (!wakeLockAvailable) {
                setCapabilityMessage(locale === "zh" ? "当前浏览器不支持系统级屏幕常亮；计时仍会继续。" : "System wake lock is unavailable; the timer will keep running.");
                return;
              }
              if (wakeLockFailed && keepAwakeEnabled) void acquireWakeLock();
              else setKeepAwakeEnabled((value) => !value);
            }}
          ><Lightbulb size={15} /><span>{locale === "zh" ? (wakeLockActive ? "已常亮" : wakeLockFailed ? "重试常亮" : "常亮") : (wakeLockActive ? "Awake" : wakeLockFailed ? "Retry" : "Stay awake")}</span></button>
          <button
            type="button"
            className={fullscreenActive ? "active" : ""}
            aria-pressed={fullscreenActive}
            aria-label={fullscreenActive ? (locale === "zh" ? "退出全屏" : "Exit full screen") : (locale === "zh" ? "进入全屏" : "Enter full screen")}
            onClick={toggleFullscreen}
          >{fullscreenActive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{locale === "zh" ? (fullscreenActive ? "退出全屏" : "全屏") : (fullscreenActive ? "Exit" : "Full screen")}</span></button>
          <button
            type="button"
            className={noiseKind !== "off" ? "active" : ""}
            aria-pressed={noiseKind !== "off"}
            aria-expanded={noisePanelOpen}
            onClick={() => setNoisePanelOpen((value) => !value)}
          ><AudioLines size={15} /><span>{locale === "zh" ? "背景音" : "Sound"}</span></button>
          <button
            type="button"
            className={guideOpen ? "active" : ""}
            aria-pressed={guideOpen}
            onClick={() => { setNoisePanelOpen(false); if (guideOpen) closeGuide(); else { setGuideAiCue(null); setGuideAiError(null); setGuideOpen(true); if (displayedFocusTitle.trim() && !isDemoMode()) void requestGuideAiCue(); } }}
          ><MousePointerClick size={15} /><span>{locale === "zh" ? (displayedFocusTitle.trim() && !isDemoMode() ? "AI 进入状态" : "进入状态") : (displayedFocusTitle.trim() && !isDemoMode() ? "AI settle in" : "Settle in")}</span></button>
          <button type="button" className={encouragementOpen ? "active" : ""} disabled={!running || !displayedFocusTitle.trim() || isDemoMode()}
            aria-label={locale === "zh" ? "获取计时中的 AI 鼓励" : "Get an AI cue while focusing"}
            onClick={() => { setNoisePanelOpen(false); closeGuide(); void requestInSessionEncouragement(); }}
          ><Bot size={15} /><span>{locale === "zh" ? "AI 鼓励" : "AI cue"}</span></button>
        </div>
        {encouragementOpen && <section className="focus-encouragement-panel" aria-label={locale === "zh" ? "计时中的 AI 鼓励" : "In-session AI encouragement"}>
          <header><strong><Bot size={16} />{locale === "zh" ? "NAVA 陪你专注" : "NAVA focus cue"}</strong><button type="button" onClick={closeEncouragement} aria-label={locale === "zh" ? "关闭 AI 鼓励" : "Close AI cue"}><X size={16} /></button></header>
          {encouragementLoading && <p role="status">{locale === "zh" ? "正在请求 NAVA…" : "Asking NAVA…"}</p>}
          {encouragementText && <p role="status">{encouragementText}</p>}
          {encouragementError && <p className="is-error" role="alert">{encouragementError}</p>}
          {encouragementSources.length > 0 && <div className="focus-encouragement-sources"><small>{locale === "zh" ? "已保存记录依据（仅同期，不代表因果）" : "Saved records (same period, not causality)"}</small>{encouragementSources.map((item) => <span key={item.domain}>{formatFocusHealthEvidence(item, locale)}</span>)}</div>}
          <button className="focus-encouragement-auto" type="button" role="switch" aria-checked={autoEncouragement} onClick={() => {
            setAutoEncouragement((current) => {
              if (!current) { nextAutoEncouragementAtRef.current = nextFocusEncouragementAt(timerMode === "countup" ? elapsedSeconds : Math.max(0, countdownDurationSeconds - remaining)); autoEncouragementCountRef.current = 0; }
              return !current;
            });
          }}>{locale === "zh" ? `每 15 分钟自动鼓励：${autoEncouragement ? "开" : "关"}` : `Every 15 min: ${autoEncouragement ? "on" : "off"}`}</button>
          {(encouragementText || encouragementError) && <button className="focus-encouragement-retry" type="button" onClick={() => void requestInSessionEncouragement()}>{locale === "zh" ? "再给一句" : "Another cue"}</button>}
        </section>}
        {noisePanelOpen && <section className="focus-noise-panel" aria-label={locale === "zh" ? "背景声音" : "Background sound"}>
          <header><span><Volume2 size={15} />{locale === "zh" ? "背景声音" : "Background sound"}</span><button type="button" onClick={() => setNoisePanelOpen(false)} aria-label={locale === "zh" ? "关闭背景声音面板" : "Close background sound panel"}><X size={15} /></button></header>
          <div className="focus-noise-options" role="group" aria-label={locale === "zh" ? "选择声音" : "Choose sound"}>
            {(["off", "white", "pink", "brown"] as FocusNoiseKind[]).map((kind) => <button type="button" key={kind} className={noiseKind === kind ? "active" : ""} onClick={() => void selectFocusNoise(kind)}>{locale === "zh" ? ({ off: "关闭", white: "白噪音", pink: "粉噪音", brown: "棕噪音" } as const)[kind] : ({ off: "Off", white: "White", pink: "Pink", brown: "Brown" } as const)[kind]}</button>)}
          </div>
          <label><span>{locale === "zh" ? "音量" : "Volume"}</span><input type="range" min="0" max="0.45" step="0.01" value={noiseVolume} onChange={(event) => setNoiseVolume(Number(event.target.value))} /></label>
        </section>}
        {capabilityMessage && <button className="focus-capability-message" type="button" onClick={() => setCapabilityMessage(null)} aria-label={locale === "zh" ? "关闭功能状态提示" : "Dismiss capability status"}>{capabilityMessage}</button>}
        <div className="focus-title-field">
          <input
            aria-label={locale === "zh" ? "专注事项" : "Focus activity"}
            value={displayedFocusTitle}
            onChange={(event) => setFocusTitle(event.target.value)}
            placeholder={locale === "zh" ? "请填写今日要完成的任务" : "Enter today's task"}
          />
          {!hasStarted && <div className="focus-mode-switch" role="group" aria-label={locale === "zh" ? "计时模式" : "Timer mode"}>
            <button type="button" className={timerMode === "countdown" ? "active" : ""} onClick={() => { setTimerMode("countdown"); setRemaining(countdownDurationSeconds); setRunning(false); setHasStarted(false); }}>{locale === "zh" ? "倒计时" : "Countdown"}</button>
            <button type="button" className={timerMode === "countup" ? "active" : ""} onClick={() => { setTimerMode("countup"); setElapsedSeconds(0); setRunning(false); setHasStarted(false); }}>{locale === "zh" ? "正计时" : "Count up"}</button>
          </div>}
        </div>
        {focusNote && <p className="focus-immersive-note">{focusNote}</p>}
        <MascotImage className="focus-immersive-mascot" animatedSrc={animatedFocusMascot} staticSrc={focusInsightMascot} alt="" aria-hidden="true" />
        <div className="focus-timer-ring" style={{ "--timer-progress": `${progress}%` } as CSSProperties}>
          <div>
            <div className="focus-timer-edit" role="group" aria-label={locale === "zh" ? "触摸修改计时时间" : "Tap to edit timer"}>
              <input
                aria-label={locale === "zh" ? "分钟" : "Minutes"}
                inputMode="numeric"
                maxLength={3}
                value={String(timerMinutes).padStart(2, "0")}
                onFocus={(event) => { setRunning(false); event.currentTarget.select(); }}
                onChange={(event) => updateTimerPart("minutes", event.target.value)}
              />
              <b aria-hidden="true">:</b>
              <input
                aria-label={locale === "zh" ? "秒钟" : "Seconds"}
                inputMode="numeric"
                maxLength={2}
                value={String(timerSeconds).padStart(2, "0")}
                onFocus={(event) => { setRunning(false); event.currentTarget.select(); }}
                onChange={(event) => updateTimerPart("seconds", event.target.value)}
              />
            </div>
            <span className="focus-timer-status">{running ? (locale === "zh" ? "专注中" : "Focusing") : hasStarted ? (locale === "zh" ? "已暂停" : "Paused") : (locale === "zh" ? "轻触数字可修改" : "Tap the time to edit")}</span>
          </div>
        </div>
        {saving && <p className="focus-guide-ai-error" role="status">{locale === "zh" ? "正在确认保存，请稍候…" : "Confirming save, please wait…"}</p>}
        {focusSaveError && <p className="focus-guide-ai-error" role="alert" data-focus-save-error>{focusSaveError}</p>}
        <div className="focus-controls">
          <button type="button" onClick={() => resetForNewFocus()} aria-label={locale === "zh" ? "重置" : "Reset"}><TimerReset /></button>
          <button className="primary" type="button" onClick={() => { setHasStarted(true); if (!startedAt) setStartedAt(new Date().toISOString()); setRunning((value) => !value); }} aria-label={running ? (locale === "zh" ? "暂停" : "Pause") : (locale === "zh" ? "开始" : "Start")}>{running ? <Pause /> : <Play />}</button>
          <button type="button" onClick={() => void finish()} disabled={saving} aria-label={locale === "zh" ? "结束" : "Finish"}><Square /></button>
        </div>
        {breakCue && <section className="focus-break-cue" role="status"><span aria-hidden="true" /><div><strong>{locale === "zh" ? "轻轻活动一下" : "Take a brief reset"}</strong><p>{locale === "zh" ? "放松肩颈，眨眨眼，再决定是否继续。" : "Relax your shoulders, blink, then decide whether to continue."}</p></div><button type="button" onClick={() => setBreakCue(false)} aria-label={locale === "zh" ? "关闭休息提示" : "Dismiss break cue"}><X size={16} /></button></section>}
        {guideOpen && <div className="focus-guide-overlay" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "进入专注状态" : "Settle into focus"}>
          <button className="focus-guide-close" type="button" onClick={closeGuide} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={18} /></button>
          <span className="focus-guide-orb" aria-hidden="true"><i /><i /><i /></span>
          <strong>{locale === "zh" ? "用十秒进入状态" : "Settle in for ten seconds"}</strong>
          <ol><li>{locale === "zh" ? "坐稳，放松肩膀" : "Settle your posture"}</li><li>{locale === "zh" ? "缓慢呼吸两次" : "Take two slow breaths"}</li><li>{locale === "zh" ? "只看眼前这一件事" : "Keep only this task in view"}</li></ol>
          <div className="focus-guide-ai-zone">
            <button className="focus-guide-ai-button" type="button" disabled={!displayedFocusTitle.trim() || isDemoMode() || guideAiLoading} onClick={() => void requestGuideAiCue()}><Bot size={16} />{guideAiLoading ? (locale === "zh" ? "正在获取 AI 提示" : "Getting an AI cue") : guideAiCue || guideAiError ? (locale === "zh" ? "重新生成 AI 提示" : "Regenerate AI cue") : (locale === "zh" ? "AI 给一句开始提示" : "Get one AI starting cue")}</button>
            {isDemoMode() && <small>{locale === "zh" ? "演示模式不调用真实 AI" : "Demo mode does not call a real AI model"}</small>}
            {!isDemoMode() && !displayedFocusTitle.trim() && <small>{locale === "zh" ? "先填写专注事项" : "Enter a focus task first"}</small>}
            {guideAiCue && <p className="focus-guide-ai-cue" role="status">{guideAiCue}</p>}
            {guideAiError && <p className="focus-guide-ai-error" role="alert">{guideAiError}</p>}
          </div>
          <button className="focus-guide-start" type="button" onClick={() => { closeGuide(); setHasStarted(true); if (!startedAt) setStartedAt(new Date().toISOString()); setRunning(true); }}>{locale === "zh" ? "开始专注" : "Start focusing"}</button>
        </div>}
        {import.meta.env.DEV && <button className="focus-interruption-trigger" type="button" onClick={() => recordInterruption()}><PhoneIncoming size={17} />{locale === "zh" ? "模拟中断" : "Simulate interruption"}</button>}
        {view === "interruption" && <div className="focus-interruption" role="dialog" aria-modal="true" data-preview-interruption={previewInterruption ? "true" : "false"}>
          {currentInterruptionReason === "message" ? <Bell size={38} /> : currentInterruptionReason === "distraction" ? <MousePointerClick size={38} /> : currentInterruptionReason === "other" ? <Pause size={38} /> : <PhoneIncoming size={38} />}
          <strong>{previewInterruption ? (locale === "zh" ? ({ call: "模拟来电", message: "模拟消息通知", distraction: "模拟主动分心", other: "模拟其他事件" } as const)[currentInterruptionReason ?? "other"] : ({ call: "Simulated call", message: "Simulated message", distraction: "Simulated distraction", other: "Simulated event" } as const)[currentInterruptionReason ?? "other"]) : (locale === "zh" ? "专注被打断" : "Focus interrupted")}</strong>
          <p>{previewInterruption ? (locale === "zh" ? "计时已暂停。这是网页预览事件，不会真实拨号、发送通知或写入账号中断统计。" : "The timer is paused. This preview neither places a call nor sends a notification or saves an interruption to your account.") : (locale === "zh" ? "计时已暂停。可以记录原因，再决定继续或结束。" : "The timer is paused. Record a reason, then continue or finish.")}</p>
          <div className="focus-interruption-reasons" role="group" aria-label={locale === "zh" ? "中断原因" : "Interruption reason"}>{(["message", "call", "distraction", "other"] as FocusInterruptionReason[]).map((reason) => <button type="button" className={currentInterruptionReason === reason ? "selected" : ""} key={reason} onClick={() => chooseInterruptionReason(reason)}>{locale === "zh" ? ({ message: "消息", call: "来电", distraction: "分心", other: "其他" } as const)[reason] : ({ message: "Message", call: "Call", distraction: "Distraction", other: "Other" } as const)[reason]}</button>)}</div>
          <div className="focus-interruption-actions"><button type="button" onClick={() => { setPreviewInterruption(false); setRunning(true); setHasStarted(true); enterImmersive(true); }}>{locale === "zh" ? "继续专注" : "Keep focusing"}</button><button type="button" onClick={() => void finish()}>{locale === "zh" ? "结束并保存" : "Finish & save"}</button></div>
        </div>}
      </fieldset>
    ), document.body);
  }

  return (
    <div className="module-dashboard focus-dashboard" data-module-view="focus-overview">
      {morningPlanOpen && <MorningPlanningRitual date={deviceDate} locale={locale} todos={todos} onCreateTask={createMorningTask} onSavePlan={saveMorningTaskPlan} onFinish={finishMorningPlan} onClose={() => setMorningPlanOpen(false)} />}
      <section className="figma-module-card focus-summary-card">
        <div className="focus-summary-content">
          <div className="focus-summary-copy">
            <strong>{locale === "zh" ? "今日专注数据摘要" : "Today's focus"}</strong>
            <p className="focus-summary-sentence">
              {locale === "zh" ? <>
                今日共专注 <strong><AnimatedNumber value={todaySessions} /></strong> 次，总时长 <strong><AnimatedNumber value={Math.floor(todayMinutes / 60)} /></strong> 小时 <strong><AnimatedNumber value={todayMinutes % 60} /></strong> 分
              </> : <>
                <strong><AnimatedNumber value={todaySessions} /></strong> sessions today, <strong><AnimatedNumber value={Math.floor(todayMinutes / 60)} /></strong> h <strong><AnimatedNumber value={todayMinutes % 60} /></strong> min total
              </>}
            </p>
          </div>
          <button className={["focus-summary-start", saved ? "success" : ""].filter(Boolean).join(" ")} type="button" disabled={saving} onClick={() => { if (saved) resetForNewFocus(); enterImmersive(); }} aria-label={saved ? (locale === "zh" ? "专注已记录" : "Focus saved") : hasStarted ? (locale === "zh" ? "恢复已暂停的专注" : "Resume paused focus") : (locale === "zh" ? "开始专注" : "Start focus")}>{saved ? <Check size={23} /> : <><CirclePlay size={23} /><span>{hasStarted ? (locale === "zh" ? "恢复" : "Resume") : (locale === "zh" ? "开始" : "Start")}</span></>}</button>
        </div>
      </section>
      <button className="morning-plan-entry" type="button" aria-haspopup="dialog" onClick={() => { setMorningPlanNotice(null); setMorningPlanOpen(true); }}><span><Clock3 size={20} /></span><span><strong>{locale === "zh" ? "开始晨间规划" : "Plan your morning"}</strong><small>{locale === "zh" ? "收集待办 · 选重点 · 安排专注" : "Gather · Prioritize · Timebox"}</small></span><ChevronRight size={20} /></button>
      {morningPlanNotice && <p className="morning-plan-notice" role="status">{morningPlanNotice}</p>}
      <div className="focus-capability-row" aria-label={locale === "zh" ? "专注维持功能" : "Focus support features"}>
        <span><Maximize2 size={14} />{locale === "zh" ? "沉浸全屏" : "Immersive"}</span>
        <span className={wakeLockAvailable ? "" : "limited"}><Lightbulb size={14} />{locale === "zh" ? "屏幕常亮" : "Wake lock"}</span>
        <span className={focusSoundAvailable ? "" : "limited"}><AudioLines size={14} />{locale === "zh" ? "背景噪音" : "Noise"}</span>
      </div>
      <section className="figma-module-card focus-trend-card">
        <header><strong>{locale === "zh" ? "专注统计" : "Focus insights"}</strong><div className="focus-chart-tabs">{(["trend", "period", "category"] as const).map((mode) => <button type="button" className={chartMode === mode ? "active" : ""} key={mode} onClick={() => setChartMode(mode)}>{locale === "zh" ? ({ trend: "趋势", period: "时段", category: "分类" }[mode]) : ({ trend: "Trend", period: "Time", category: "Type" }[mode])}</button>)}</div></header>
        {chartMode === "trend" && (hasFocusTrend ? <BarLineTrendChart
          points={focusTrendPoints}
          scoreScale
          lineAnchor="bar-center"
          curve="monotone"
          ariaLabel={locale === "zh" ? "近七日专注时长柱状图与平滑趋势曲线，曲线节点位于每根柱子的几何中心" : "Seven-day focus duration bars with a smooth trend line anchored at each bar's geometric center"}
        /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一次专注后显示近七日趋势" : "Complete your first focus session to begin the trend"}</p>)}
        {chartMode === "period" && <FocusDistributionBars items={periodDistribution} locale={locale} />}
        {chartMode === "category" && <FocusDistributionBars items={categoryDistribution} locale={locale} />}
      </section>
      <section className="figma-module-card focus-todo-card">
        <header><strong>{locale === "zh" ? "今日待办" : "Today's tasks"}</strong><div className="focus-todo-tabs"><button type="button" className={todoView === "list" ? "active" : ""} onClick={() => setTodoView("list")}>{locale === "zh" ? "列表" : "List"}</button><button type="button" className={todoView === "calendar" ? "active" : ""} onClick={() => setTodoView("calendar")}><CalendarDays size={14} />{locale === "zh" ? "日历" : "Calendar"}</button></div></header>
        <form className="focus-todo-add focus-todo-plan-form" onSubmit={(event) => void createTodo(event)}>
          <input className="focus-todo-title-input" value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder={locale === "zh" ? "添加一项待办" : "Add a task"} />
          <label><span>{locale === "zh" ? "时间" : "Time"}</span><input aria-label={locale === "zh" ? "待办时间" : "Task time"} type="time" value={todoTime} onChange={(event) => setTodoTime(event.target.value)} /></label>
          <label><span>{locale === "zh" ? "每次" : "Minutes"}</span><input aria-label={locale === "zh" ? "每次专注分钟数" : "Minutes per session"} type="number" inputMode="numeric" min={1} max={180} value={todoMinutes} onChange={(event) => setTodoMinutes(Math.min(180, Math.max(1, Number(event.target.value) || 1)))} /><b>{locale === "zh" ? "分" : "m"}</b></label>
          <label><span>{locale === "zh" ? "次数" : "Sessions"}</span><input aria-label={locale === "zh" ? "计划专注次数" : "Planned sessions"} type="number" inputMode="numeric" min={1} max={12} value={todoSessions} onChange={(event) => setTodoSessions(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} /><b>{locale === "zh" ? "次" : "x"}</b></label>
          <button type="submit" aria-label={locale === "zh" ? "添加待办" : "Add task"}><Plus size={17} /></button>
        </form>
        {incompleteTodayTodos.length >= 2 && <>
          <button className="focus-ai-priority-button" type="button" disabled={isDemoMode() || priorityLoading || incompleteTodayTodos.length > 12} onClick={() => void requestPriorityAdvice()}><Bot size={15} />{priorityLoading ? (locale === "zh" ? "AI 排序中" : "Prioritizing") : (locale === "zh" ? `AI 排优先级 · ${incompleteTodayTodos.length} 项` : `AI prioritize · ${incompleteTodayTodos.length}`)}</button>
          {incompleteTodayTodos.length > 12 && <p className="focus-ai-priority-note" role="status">{locale === "zh" ? "一次可排序 2–12 项。请先调整今日待办；不会遗漏后面的任务。" : "Sort 2–12 tasks at a time. Adjust today’s list first; later tasks will not be silently skipped."}</p>}
          {isDemoMode() && <p className="focus-ai-priority-note">{locale === "zh" ? "演示模式不调用真实 AI。" : "Demo mode does not call a real AI model."}</p>}
          {priorityAdvice?.key === priorityKey && <div className="focus-ai-priority-result" role="status"><strong><Bot size={15} />{locale === "zh" ? "AI 排序草稿 · 请核对" : "AI order draft · please review"}</strong><ol>{priorityAdvice.orderIds.map((id) => <li key={id}>{incompleteTodayTodos.find((item) => item.id === id)?.title ?? "?"}</li>)}</ol><p>{priorityAdvice.basis}</p>{priorityAdvice.question && <p>{locale === "zh" ? "待确认：" : "Clarify: "}{priorityAdvice.question}</p>}<button type="button" disabled={prioritySaving} onClick={() => void acceptPriorityAdvice()}>{prioritySaving ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "确认并保存顺序" : "Confirm and save order")}</button></div>}
          {priorityError && <p className="focus-ai-priority-error" role="alert">{priorityError}</p>}
        </>}
        {priorityNotice && <p className="focus-ai-priority-note" role="status">{priorityNotice}</p>}
        <button className="focus-quadrant-toggle" type="button" aria-expanded={quadrantsOpen} onClick={() => setQuadrantsOpen((open) => !open)}>{locale === "zh" ? "四象限分类" : "Four quadrants"}<ChevronRight size={16} /></button>
        {quadrantsOpen && <section className="focus-quadrant-section" aria-label={locale === "zh" ? "今日待办四象限" : "Today's task quadrants"}>
          <p>{locale === "zh" ? "重要和紧急由你判断；AI 不会替你猜测。" : "You decide importance and urgency; AI will not guess."}</p>
          <div className="focus-quadrant-edit-list">{incompleteTodayTodos.map((item) => <label key={item.id}><span>{item.title}</span><select aria-label={`${item.title}${locale === "zh" ? "的四象限" : " quadrant"}`} value={todoQuadrant(item)} disabled={quadrantSavingId === item.id} onChange={(event) => void changeQuadrant(item.id, event.target.value as TodoQuadrant)}><option value="unclassified">{locale === "zh" ? "未分类" : "Unclassified"}</option><option value="do">{locale === "zh" ? "重要且紧急" : "Important + urgent"}</option><option value="plan">{locale === "zh" ? "重要不紧急" : "Important, not urgent"}</option><option value="delegate">{locale === "zh" ? "不重要但紧急" : "Urgent, not important"}</option><option value="later">{locale === "zh" ? "不重要不紧急" : "Neither"}</option></select></label>)}</div>
          {quadrantError && <p className="focus-ai-priority-error" role="alert">{quadrantError}</p>}
          <div className="focus-quadrant-grid">{(["do", "plan", "delegate", "later"] as const).map((quadrant) => <div className={`focus-quadrant-cell is-${quadrant}`} key={quadrant}><strong>{locale === "zh" ? ({ do: "① 先处理", plan: "② 安排时间", delegate: "③ 尽快处理", later: "④ 稍后处理" }[quadrant]) : ({ do: "① Do first", plan: "② Schedule", delegate: "③ Handle soon", later: "④ Later" }[quadrant])}</strong><small>{incompleteTodayTodos.filter((item) => todoQuadrant(item) === quadrant).length} {locale === "zh" ? "项" : "tasks"}</small><ul>{incompleteTodayTodos.filter((item) => todoQuadrant(item) === quadrant).map((item) => <li key={item.id}>{item.title}</li>)}</ul></div>)}</div>
          {incompleteTodayTodos.some((item) => todoQuadrant(item) === "unclassified") && <small>{locale === "zh" ? `另有 ${incompleteTodayTodos.filter((item) => todoQuadrant(item) === "unclassified").length} 项待分类。` : `${incompleteTodayTodos.filter((item) => todoQuadrant(item) === "unclassified").length} tasks unclassified.`}</small>}
        </section>}
        {todoView === "calendar" && <div className="focus-todo-calendar">{calendarDays.map((date) => {
          const dayTodos = todos.filter((item) => item.scheduledDate === date);
          const completed = dayTodos.filter((item) => item.completed).length;
          return <button type="button" className={calendarDate === date ? "selected" : ""} key={date} onClick={() => setCalendarDate(date)}><small>{new Date(`${date}T12:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { weekday: "narrow" })}</small><strong>{Number(date.slice(-2))}</strong><i style={{ "--completion": dayTodos.length > 0 ? `${completed / dayTodos.length * 100}%` : "0%" } as CSSProperties} /></button>;
        })}</div>}
        <div className={["focus-todo-list", `is-${todoView}`].join(" ")}>
          {visibleTodos.map((item) => <div className={[item.completed ? "completed" : "", selectedTodoId === item.id ? "selected" : ""].filter(Boolean).join(" ")} key={item.id}>
            <button className="focus-todo-check" type="button" onClick={() => void toggleTodo(userId, item.id)} aria-label={item.completed ? (locale === "zh" ? "标记未完成" : "Mark incomplete") : (locale === "zh" ? "标记完成" : "Mark complete")}>{item.completed && <Check size={14} />}</button>
            <button className="focus-todo-copy" type="button" onClick={() => chooseTodo(item)}><strong>{item.priorityRank ? `${item.priorityRank}. ` : ""}{item.title}</strong><small>{todoView === "calendar" ? `${shortDate(item.scheduledDate, locale)} · ` : ""}{item.scheduledTime ? `${item.scheduledTime} · ` : ""}{item.focusMinutes ? `${item.focusMinutes} ${locale === "zh" ? "分钟" : "min"}` : (locale === "zh" ? "未设置时长" : "No duration")}{item.focusSessions ? ` × ${item.focusSessions} · ${Math.min(item.focusSessions, todoSessionProgress.get(item.id) ?? 0)}/${item.focusSessions}` : ""}</small></button>
            <button className="focus-todo-start" type="button" onClick={() => { chooseTodo(item); setHasStarted(false); enterImmersive(); }} disabled={item.completed}><Play size={14} /></button>
          </div>)}
          {visibleTodos.length === 0 && <p>{locale === "zh" ? "这一天还没有待办。" : "No tasks on this day."}</p>}
        </div>
      </section>
      <section className="figma-module-card focus-quick-card">
        <header><strong>{locale === "zh" ? "开启专注时刻" : "Start a focus moment"}</strong></header>
        <div className="focus-quick-controls">
          <label className="focus-task-field"><Clock3 size={19} /><input aria-label={locale === "zh" ? "专注事项" : "Focus activity"} placeholder={locale === "zh" ? "请填写要专注的事项" : "What do you want to focus on?"} value={displayedFocusTitle} onChange={(event) => { clearDifficultyAssessment(); setFocusTitle(event.target.value); }} /></label>
          <div className="focus-duration-controls"><button type="button" onClick={() => updateDuration(focusMinutes - 1)} aria-label={locale === "zh" ? "减少一分钟" : "Decrease one minute"}>-</button><label className="focus-duration-field compact"><input aria-label={locale === "zh" ? "专注分钟数" : "Focus duration in minutes"} inputMode="numeric" min={1} max={180} type="number" value={focusMinutes} onChange={(event) => updateDuration(Number(event.target.value))} /><span>{locale === "zh" ? "分钟" : "min"}</span></label><button type="button" onClick={() => updateDuration(focusMinutes + 1)} aria-label={locale === "zh" ? "增加一分钟" : "Increase one minute"}>+</button></div>
        </div>
        <div className="focus-settings-row">
          <label className="focus-category-field"><span>{locale === "zh" ? "专注分类" : "Category"}</span><select value={focusCategory} onChange={(event) => setFocusCategory(event.target.value)}><option value="work">{locale === "zh" ? "工作" : "Work"}</option><option value="study">{locale === "zh" ? "学习" : "Study"}</option><option value="life">{locale === "zh" ? "生活" : "Life"}</option><option value="other">{locale === "zh" ? "其他" : "Other"}</option></select></label>
          <label className="focus-category-field"><span>{locale === "zh" ? "休息提示" : "Break cue"}</span><select value={breakIntervalMinutes} onChange={(event) => setBreakIntervalMinutes(Number(event.target.value))}><option value={25}>{locale === "zh" ? "每 25 分钟" : "Every 25 min"}</option><option value={45}>{locale === "zh" ? "每 45 分钟" : "Every 45 min"}</option><option value={60}>{locale === "zh" ? "每 60 分钟" : "Every 60 min"}</option><option value={0}>{locale === "zh" ? "关闭" : "Off"}</option></select></label>
        </div>
        <div className="focus-ai-actions">
          <button className="focus-ai-plan-button" type="button" disabled={!displayedFocusTitle.trim() || isDemoMode() || difficultyLoading} onClick={() => void requestDifficultyAssessment()}><Gauge size={16} />{difficultyLoading ? (locale === "zh" ? "AI 评估中" : "Assessing") : (locale === "zh" ? "询问 AI 难度" : "Ask AI difficulty")}</button>
          <button className="focus-ai-plan-button" type="button" onClick={() => onOpenAi?.(locale === "zh" ? `我准备专注“${displayedFocusTitle || "尚未命名的任务"}”${focusMinutes}分钟。请先用一句话帮我进入状态，再把任务拆成3个明确小步骤；如果目标太模糊，请先问我一个澄清问题。` : `I plan to focus on “${displayedFocusTitle || "an unnamed task"}” for ${focusMinutes} minutes. Give me one short starting cue and split it into 3 concrete steps; ask one clarifying question first if the goal is vague.`)}><Bot size={16} />{locale === "zh" ? "AI 进入状态与任务拆解" : "AI starting cue & task plan"}</button>
        </div>
        {isDemoMode() && displayedFocusTitle.trim() && <p className="focus-ai-assessment-note">{locale === "zh" ? "演示模式不调用真实 AI。" : "The demo does not call a real AI model."}</p>}
        {difficultyAssessment && <div className="focus-ai-assessment" role="status"><strong><Gauge size={15} />{locale === "zh" ? "AI 难度建议" : "AI difficulty advice"}</strong><p>{difficultyAssessment}</p></div>}
        {difficultyError && <p className="focus-ai-assessment-error" role="alert">{difficultyError}</p>}
        <div className="focus-recent-list">
          <strong>{locale === "zh" ? "最近完成" : "Recently completed"}</strong>
          {recentFocus.length > 0 ? recentFocus.map((record) => <div key={record.id}><span><Clock3 size={14} /></span><p><b>{shortDate(record.record_date, locale)}</b><i aria-hidden="true">·</i>{record.completed_sessions}{locale === "zh" ? " 次" : " sessions"}<i aria-hidden="true">·</i>{record.total_minutes}{locale === "zh" ? " 分钟" : " min"}</p></div>) : <p className="focus-empty-history">{locale === "zh" ? "还没有完成记录" : "No completed sessions yet"}</p>}
        </div>
        <button className="focus-enter-button" type="button" onClick={() => { setHasStarted(false); setRemaining(focusMinutes * 60); setElapsedSeconds(0); setInterruptions(0); setInterruptionReasons(emptyFocusInterruptionReasons()); setCurrentInterruptionReason(null); breakCueSlotRef.current = 0; setBreakCue(false); setStartedAt(undefined); setSessionId(crypto.randomUUID()); enterImmersive(); }}>{locale === "zh" ? "进入专注" : "Start focus"}</button>
      </section>
    </div>
  );
}

function FocusDistributionBars({ items, locale }: { items: Array<{ key: string; label: string; value: number }>; locale: "zh" | "en" }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0 || items.every((item) => item.value === 0)) return <p className="module-empty-copy">{locale === "zh" ? "完成专注后生成分布统计" : "Complete focus sessions to build this distribution"}</p>;
  return <div className="focus-distribution-bars">{items.map((item) => <div key={item.key}><span>{item.label}</span><i><b style={{ width: `${Math.max(4, item.value / max * 100)}%` }} /></i><strong>{item.value}{locale === "zh" ? " 分钟" : " min"}</strong></div>)}</div>;
}

export default function RecordModuleDashboard(props: Props) {
  const { locale } = useLocale();
  const [view, setView] = useState(props.initialView ?? "overview");
  const [overviewInsight, setOverviewInsight] = useState<string | null>(null);
  const [overviewInsightLoading, setOverviewInsightLoading] = useState(false);
  const [overviewInsightError, setOverviewInsightError] = useState<string | null>(null);
  const overviewInsightRequestRef = useRef(0);
  useEffect(() => setView(props.initialView ?? "overview"), [props.initialView, props.module]);
  const openView = (next: string, returnToPrevious = next === "overview") => {
    setView(next);
    props.onViewChange?.(next === "overview" ? null : next, returnToPrevious);
  };
  const hasCurrentRecord = props.module === "focus"
    ? (props.todaySnapshot?.focusMinutes ?? 0) > 0 || (props.todaySnapshot?.focusSessions ?? 0) > 0
    : Boolean(props.todaySnapshot?.[props.module === "diet" ? "nutrition" : props.module]);
  const loadOverviewInsight = useCallback(async (refresh = false) => {
    if (!hasCurrentRecord) return;
    const requestId = ++overviewInsightRequestRef.current;
    setOverviewInsightLoading(true);
    setOverviewInsight(null);
    setOverviewInsightError(null);
    try {
      if (props.module === "diet") {
        const report = await loadDietAiReport({ date: props.recordDate, locale, refresh });
        if (requestId === overviewInsightRequestRef.current) setOverviewInsight(report.bullets[0] ?? null);
      } else {
        const report = await loadHealthAiReport({
          scope: props.module,
          endDate: props.recordDate,
          locale,
          refresh,
          sourceRevision: healthReportSourceRevision({
            scope: props.module,
            endDate: props.recordDate,
            trendBundle: props.trendBundle,
            profile: props.profile,
          }),
        });
        const association = report.sections.find((section) => section.id === "association");
        const associationIsUseful = association
          && association.confidence !== "low"
          && !/(记录不足|无法判断|insufficient|cannot determine)/i.test(`${association.headline} ${association.explanation}`);
        if (requestId === overviewInsightRequestRef.current) {
          setOverviewInsight((associationIsUseful ? association.headline : report.sections[0]?.headline) ?? report.bullets[0] ?? null);
        }
      }
    } catch (error) {
      console.warn("Module overview AI insight unavailable", error);
      if (requestId === overviewInsightRequestRef.current) {
        setOverviewInsight(null);
        setOverviewInsightError(error instanceof Error && error.message.trim()
          ? error.message
          : (locale === "zh" ? "AI 反馈生成失败，请稍后重试。" : "AI feedback could not be generated. Please retry."));
      }
    } finally {
      if (requestId === overviewInsightRequestRef.current) setOverviewInsightLoading(false);
    }
  }, [hasCurrentRecord, locale, props.module, props.profile, props.recordDate, props.trendBundle]);
  useEffect(() => {
    setOverviewInsight(null);
    setOverviewInsightError(null);
    if (view === "overview" && hasCurrentRecord) void loadOverviewInsight();
    return () => {
      overviewInsightRequestRef.current += 1;
    };
  }, [hasCurrentRecord, loadOverviewInsight, view]);
  if (view === "history") return <HistoryView userId={props.userId} module={props.module} locale={locale} trendBundle={props.trendBundle} profile={props.profile} deviceDate={props.deviceDate} onGrowthActivity={props.onGrowthActivity} />;
  const common = { ...props, locale };
  let dashboard: ReactNode = null;
  if (props.module === "exercise") dashboard = <ExerciseDashboard userId={props.userId} locale={locale} steps={props.steps} calories={props.calories} exerciseMinutes={props.exerciseMinutes} exerciseNote={props.exerciseNote} setExerciseMinutes={props.setExerciseMinutes} setExerciseNote={props.setExerciseNote} onOpenEditor={props.onOpenEditor} recordDate={props.recordDate} deviceDate={props.deviceDate} trendBundle={props.trendBundle} todaySnapshot={props.todaySnapshot} profile={props.profile} view={view} openView={openView} />;
  if (props.module === "mood") dashboard = <MoodDashboard {...common} view={view} openView={openView} />;
  if (props.module === "sleep") dashboard = <SleepDashboard userId={props.userId} locale={locale} sleepStart={props.sleepStart} sleepEnd={props.sleepEnd} deepSleep={props.deepSleep} lightSleep={props.lightSleep} remSleep={props.remSleep} sleepRating={props.sleepRating} onOpenEditor={props.onOpenEditor} recordDate={props.recordDate} deviceDate={props.deviceDate} trendBundle={props.trendBundle} todaySnapshot={props.todaySnapshot} profile={props.profile} view={view} openView={openView} />;
  if (props.module === "diet") dashboard = <DietDashboard locale={locale} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} deviceDate={props.deviceDate} onOpenEditor={props.onOpenEditor} onOpenDietCamera={props.onOpenDietCamera} onOpenDietMeal={props.onOpenDietMeal} view={view} openView={openView} />;
  if (props.module === "face") dashboard = <FaceDashboard locale={locale} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} deviceDate={props.deviceDate} profile={props.profile} onOpenFaceCamera={props.onOpenFaceCamera} view={view} openView={openView} />;
  if (props.module === "focus") dashboard = <FocusDashboard userId={props.userId} locale={locale} focusTitle={props.focusTitle} focusMinutes={props.focusMinutes} focusNote={props.focusNote} setFocusTitle={props.setFocusTitle} setFocusMinutes={props.setFocusMinutes} setFocusNote={props.setFocusNote} focusLaunch={props.focusLaunch} onFocusLaunchConsumed={props.onFocusLaunchConsumed} onSaveFocusMinutes={props.onSaveFocusMinutes} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} deviceDate={props.deviceDate} profile={props.profile} onOpenAi={props.onOpenAi} view={view} openView={openView} />;
  const focusImmersive = props.module === "focus" && (view === "immersive" || view === "interruption");
  const moduleLabels: Record<RecordModule, { zh: string; en: string }> = {
    mood: { zh: "情绪", en: "mood" }, sleep: { zh: "睡眠", en: "sleep" }, exercise: { zh: "运动", en: "activity" },
    diet: { zh: "饮食", en: "diet" }, focus: { zh: "专注", en: "focus" }, face: { zh: "面部状态", en: "face state" },
  };
  const moduleLabel = locale === "zh" ? moduleLabels[props.module].zh : moduleLabels[props.module].en;
  return <div className={["record-module-dashboard-shell", focusImmersive ? "record-module-dashboard-shell--focus-immersive" : ""].filter(Boolean).join(" ")}>
    {view === "overview" && (props.module === "mood" || props.module === "diet") && <ReminderSettings userId={props.userId} locale={locale} scope={props.module} />}
    {dashboard}
    {!focusImmersive && view === "overview" && hasCurrentRecord && <section className="figma-module-card module-assistant-card module-overview-ai" aria-live="polite" data-ai-state={overviewInsightLoading ? "loading" : overviewInsight ? "ready" : overviewInsightError ? "error" : "idle"}>
      <span className="module-assistant-icon"><Bot size={18} /></span>
      <div><strong>{isDemoMode() ? (locale === "zh" ? "演示 AI 即时反馈" : "Demo AI feedback") : (locale === "zh" ? "基于真实记录的 AI 即时反馈" : "AI feedback from your real records")}</strong>{overviewInsightLoading
        ? <SkeletonLines count={2} compact />
        : <p>{overviewInsight ?? overviewInsightError ?? (locale === "zh" ? "正在准备基于真实记录的反馈。" : "Preparing feedback from your real records.")}</p>}{<button className="ai-report-refresh" type="button" disabled={overviewInsightLoading} onClick={() => void loadOverviewInsight(true)}><RefreshCw size={16} />{locale === "zh" ? "重新生成" : "Generate again"}</button>}</div>
    </section>}
    {!focusImmersive && view === "overview" && <nav className="module-cross-actions" aria-label={locale === "zh" ? "模块快捷入口" : "Module shortcuts"}>
      <button type="button" onClick={() => props.onOpenAi?.(locale === "zh" ? `请结合我已授权的真实${moduleLabel}记录，分析近期变化，并给出一条今天可执行的建议。` : `Analyze my consent-authorized ${moduleLabel} records and suggest one practical action for today.`)}><Bot size={16} /><span>{locale === "zh" ? "问 NAVA" : "Ask NAVA"}</span></button>
      <button type="button" onClick={props.onOpenWeeklyReport}><Gauge size={16} /><span>{locale === "zh" ? "DNB 周报" : "DNB weekly"}</span></button>
    </nav>}
  </div>;
}
