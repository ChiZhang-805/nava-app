import {
  Activity,
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
import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import AnimatedNumber from "../components/AnimatedNumber";
import BarLineTrendChart, { type BarLineTrendPoint } from "../components/BarLineTrendChart";
import LineTrendChart from "../components/LineTrendChart";
import { useLocale } from "../i18n";
import dietInsightMascot from "../assets/mascot/nava-eat-v5.webp";
import sleepInsightMascot from "../assets/mascot/nava-sleep-v1.png";
import exerciseInsightMascot from "../assets/mascot/nava-lift-v1.png";
import moodInsightMascot from "../assets/mascot/nava-journal-v1.png";
import focusInsightMascot from "../assets/mascot/nava-read-v1.png";
import faceInsightMascot from "../assets/mascot/nava-mirror-v1.png";
import emptyTodayMascot from "../assets/mascot/nava-empty-cry-v1.png";
import type { FocusRecord, MoodRecord, TodaySnapshot, TrendBundle } from "../types";
import { enableNavaNotifications } from "../services/notifications";
import { loadDietAiReport, parseDietAiReport, type DietAiReport } from "../services/dietReport";
import { loadHealthAiReport, type HealthAiReport } from "../services/healthReport";
import {
  getHealthAuthorizationStatus,
  getLastHealthSyncAt,
  isNativeHealthAvailable,
  requestHealthAuthorization,
  syncNativeHealthNow,
} from "../services/health";
import { getWatchReachability } from "../services/watch";
import { shareReportImage } from "../services/reportShareCard";
import type { GrowthActivityKind } from "../services/productivity";
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
import type { RecordModule } from "./RecordsScreen";
import { rollingDateWindow } from "../services/date";
import { currentDayRequiredShareCopy, hasCurrentDayRecord, missingCurrentDayCopy } from "../services/historyReportState";

type MoodFactor = { value: string; label: string };

type Props = {
  userId: string;
  module: RecordModule;
  moodScore: number;
  setMoodScore: (value: number, immediate?: boolean) => void;
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
  onOpenDietCamera: () => void;
  onSaveFocusMinutes: (minutes: number, details?: { interruptions?: number; startedAt?: string; endedAt?: string }) => Promise<void>;
  busy: string | null;
  recordDate: string;
  deviceDate: string;
  todaySnapshot: TodaySnapshot | null;
  trendBundle: TrendBundle | null;
  profile: UserProfile | null;
  initialView?: string | null;
  onViewChange?: (view: string | null, replace?: boolean) => void;
  onGrowthActivity?: (activity: GrowthActivityKind) => void | Promise<unknown>;
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
  trendBundle,
  deviceDate,
  onGrowthActivity,
}: {
  module: RecordModule;
  locale: "zh" | "en";
  trendBundle: TrendBundle | null;
  deviceDate: string;
  onGrowthActivity?: (activity: GrowthActivityKind) => void | Promise<unknown>;
}) {
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
              : trendBundle.faces.flatMap((record) => record.overall_score == null ? [] : [{ id: record.id, date: record.record_date, value: record.overall_score }]);
    return records.sort((left, right) => left.date.localeCompare(right.date));
  }, [module, trendBundle]);
  const displayEntries = useMemo(() => {
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));
    return rollingDateWindow(deviceDate).map((date) => byDate.get(date) ?? ({ id: `missing-${module}-${date}`, date, value: null }));
  }, [deviceDate, entries, module]);
  const recordedEntries = useMemo(
    () => displayEntries.filter((entry): entry is { id: string; date: string; value: number } => entry.value != null),
    [displayEntries],
  );
  const recordedToday = useMemo(() => hasCurrentDayRecord(displayEntries, deviceDate), [deviceDate, displayEntries]);
  // Development-only visual fixture for the missing-today report state.
  const forceMissingToday = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "today-missing";
  const hasTodayRecord = recordedToday && !forceMissingToday;
  const sortedNutrition = useMemo(() => trendBundle?.nutritions.filter((item) => item.record_date <= deviceDate).slice().sort((a, b) => a.record_date.localeCompare(b.record_date)) ?? [], [deviceDate, trendBundle]);
  const todayNutrition = sortedNutrition.find((item) => item.record_date === deviceDate) ?? null;
  const [dietReport, setDietReport] = useState<DietAiReport | null>(() => parseDietAiReport(todayNutrition?.ai_feedback));
  const [healthReport, setHealthReport] = useState<HealthAiReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportUnavailable, setReportUnavailable] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareComplete, setShareComplete] = useState(false);
  useEffect(() => {
    if (module !== "diet") return;
    if (!hasTodayRecord || !todayNutrition) {
      setDietReport(null);
      setReportUnavailable(false);
      setReportLoading(false);
      return;
    }
    const stored = parseDietAiReport(todayNutrition.ai_feedback);
    if (stored) {
      setDietReport(stored);
      setReportUnavailable(false);
      setReportLoading(false);
      return;
    }
    let active = true;
    setReportLoading(true);
    setReportUnavailable(false);
    void loadDietAiReport({ date: todayNutrition.record_date, locale })
      .then((report) => {
        if (active) setDietReport(report);
      })
      .catch((error) => {
        console.warn("AI diet report generation deferred", error);
        if (active) setReportUnavailable(true);
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hasTodayRecord, locale, module, todayNutrition]);
  useEffect(() => {
    if (module === "diet") return;
    if (!hasTodayRecord) {
      setHealthReport(null);
      setReportUnavailable(false);
      setReportLoading(false);
      return;
    }
    let active = true;
    setHealthReport(null);
    setReportLoading(true);
    setReportUnavailable(false);
    void loadHealthAiReport({ scope: module, endDate: deviceDate, locale })
      .then((report) => {
        if (active) setHealthReport(report);
      })
      .catch((error) => {
        console.warn("AI health report generation deferred", error);
        if (active) setReportUnavailable(true);
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deviceDate, hasTodayRecord, locale, module]);
  const reportInsights = hasTodayRecord ? (module === "diet" ? (dietReport?.bullets ?? []) : (healthReport?.bullets ?? [])) : [];
  const reportIsDemo = module === "diet" ? dietReport?.modelVersion === "demo-only" : healthReport?.provider === "demo";
  const shareSummary = async () => {
    if (!hasTodayRecord) return;
    const label = moduleNames[module][locale];
    setSharing(true);
    setShareComplete(false);
    try {
      await shareReportImage({
        module,
        moduleLabel: label,
        entries: recordedEntries,
        insights: reportInsights,
        mascotUrl: reportMascotByModule[module],
        locale,
        valueFormatter: (value) => historyValueText(module, value, locale),
      });
      await onGrowthActivity?.("share");
      setShareComplete(true);
      window.setTimeout(() => setShareComplete(false), 2400);
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") console.warn("report image share failed", error);
    } finally {
      setSharing(false);
    }
  };
  return (
    <ModuleDetailView
      className="module-history-report-card"
      title={`${moduleNames[module][locale]}${locale === "zh" ? "趋势报告" : " trend report"}`}
    >
      {trendBundle ? <>
        {recordedEntries.length > 0
          ? <ReportTrendChart entries={displayEntries} module={module} locale={locale} />
          : <div className="module-history-chart-empty"><CalendarDays size={22} /><span>{locale === "zh" ? "近七日暂无记录" : "No entries in the last seven days"}</span></div>}
        <div className={`module-history-list module-history-list--${module}`}>
          {displayEntries.slice(-3).reverse().map((entry) => <p key={entry.id}><CalendarDays size={16} /><span>{shortDate(entry.date, locale)}</span><strong>{entry.value == null ? (locale === "zh" ? "暂无记录" : "No entry") : historyValueText(module, entry.value, locale)}</strong></p>)}
        </div>
        {hasTodayRecord
          ? <section className="diet-ai-report module-ai-report" aria-live="polite" data-report-today-state="ready">
              <div className="diet-ai-report-copy">
                <header><span><Bot size={16} /></span><strong>{reportIsDemo
                  ? (locale === "zh" ? `演示${moduleNames[module].zh}洞察` : `Demo ${moduleNames[module].en.toLowerCase()} insights`)
                  : (locale === "zh" ? `AI ${moduleNames[module].zh}洞察` : `AI ${moduleNames[module].en.toLowerCase()} insights`)}</strong></header>
                {reportLoading
                  ? <div className="diet-ai-report-loading">{locale === "zh" ? "正在结合你的画像与近七日数据生成…" : "Reviewing your profile and seven-day data…"}</div>
                  : <ul>{reportInsights.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}</ul>}
                {reportUnavailable && <small className="module-ai-fallback-note">{locale === "zh" ? "真实 AI 洞察暂不可用，请稍后重试。" : "Real AI insights are temporarily unavailable. Please retry."}</small>}
              </div>
              <img
                className="diet-ai-mascot module-ai-mascot"
                src={reportMascotByModule[module]}
                alt={locale === "zh" ? `NAVA 小猫展示${moduleNames[module].zh}主题动作` : `NAVA cat illustrating the ${moduleNames[module].en.toLowerCase()} report`}
              />
            </section>
          : <section className="module-today-empty-state" aria-live="polite" data-report-today-state="missing">
              <img className="module-today-empty-mascot" src={emptyTodayMascot} alt={locale === "zh" ? "NAVA 小猫趴着哭泣" : "NAVA cat lying down with two little tears"} />
              <p>{missingCurrentDayCopy(module, locale)}</p>
            </section>}
        <button
          className={`module-history-share${hasTodayRecord ? "" : " is-today-missing"}`}
          type="button"
          disabled={sharing || !hasTodayRecord}
          onClick={() => void shareSummary()}
        ><Share2 size={16} />{!hasTodayRecord ? currentDayRequiredShareCopy(module, locale) : sharing ? (locale === "zh" ? "正在生成图片…" : "Creating image…") : shareComplete ? (locale === "zh" ? "图片已生成" : "Image ready") : (locale === "zh" ? "生成图片并分享" : "Create image & share")}</button>
      </> : <p className="module-empty-copy module-history-empty">{locale === "zh" ? "正在读取历史记录…" : "Loading history…"}</p>}
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
  view,
  openView,
}: Pick<Props, "userId" | "steps" | "calories" | "exerciseMinutes" | "onOpenEditor" | "recordDate" | "deviceDate" | "trendBundle" | "todaySnapshot" | "profile"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<{ paired: boolean; reachable: boolean } | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const selectedExercise = todaySnapshot?.exercise ?? null;
  const displayedSteps = selectedExercise?.steps ?? 0;
  const displayedCalories = selectedExercise?.calories ?? 0;
  const displayedExerciseMinutes = selectedExercise?.exercise_minutes ?? 0;
  const selectedDateText = selectedExercise ? shortDate(selectedExercise.record_date, locale) : null;
  const stepValues = useMemo(() => {
    const records = new Map((trendBundle?.exercises ?? []).map((record) => [record.record_date, record.steps ?? 0]));
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

  useEffect(() => {
    let active = true;
    void Promise.all([getLastHealthSyncAt(userId), getWatchReachability()]).then(([lastSync, reachability]) => {
      if (!active) return;
      setSyncedAt(lastSync);
      setWatchState(reachability);
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
      if (status.available && !status.requested) await requestHealthAuthorization();
      const result = await syncNativeHealthNow(userId);
      if ("skipped" in result && result.skipped) {
        setDeviceMessage(locale === "zh" ? "请在 iPhone App 中授权 Apple 健康后同步" : "Authorize Apple Health in the iPhone app to sync");
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
          <div><span>{locale === "zh" ? "所选日期能量消耗" : "Selected-day energy"}</span><strong><AnimatedNumber value={displayedCalories} /><small>/1300 kcal</small></strong><p>{selectedExercise ? (locale === "zh" ? `${selectedDateText} 的真实记录` : `Recorded ${selectedDateText}`) : (locale === "zh" ? "该日期尚无运动记录" : "No activity recorded for this date")}</p></div>
          <div className="progress-ring exercise-ring" style={{ "--progress": `${Math.min(100, Math.round(displayedCalories / 13))}%` } as CSSProperties}><span><AnimatedNumber value={Math.round((displayedCalories / 1300) * 100)} />%</span></div>
        </section>
        <section className="figma-module-card steps-card">
          <header><span>{locale === "zh" ? "所选日期步数" : "Selected-day steps"}</span><strong><AnimatedNumber value={displayedSteps} formatter={(value) => Math.round(value).toLocaleString()} /><small>{locale === "zh" ? "步" : "steps"}</small></strong></header>
          <div className="steps-bars" aria-label={locale === "zh" ? "近七日步数" : "Seven-day steps"}>
            {stepValues.map(([date, value]) => <span className={value == null ? "is-missing" : undefined} key={date} title={`${shortDate(date, locale)} · ${value == null ? (locale === "zh" ? "暂无记录" : "No entry") : value.toLocaleString()}`} style={{ height: `${value == null ? 0 : Math.max(8, (value / maxSteps) * 100)}%` }} />)}
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

  if (view === "device") return <ModuleDetailView compact title={locale === "zh" ? "运动设备" : "Activity devices"}><div className="device-picker"><button className="selected" type="button" onClick={() => void sync()} disabled={syncing}><Watch />{deviceTitle}{watchState?.paired && <Check />}</button><button type="button" onClick={() => void sync()} disabled={syncing}><Bluetooth />{locale === "zh" ? "授权并同步 Apple 健康" : "Authorize & sync Apple Health"}<Plus /></button></div><div className="detail-status-strip"><RefreshCw className={syncing ? "spin" : undefined} size={17} /><span>{deviceMessage ?? (locale === "zh" ? "数据由 HealthKit 读取并保存到云端" : "HealthKit data is saved to the cloud")}</span><strong>{syncLabel}</strong></div></ModuleDetailView>;
  if (view === "vitals") return <ModuleDetailView compact title={locale === "zh" ? "健康指标" : "Health metrics"}><div className="metric-detail-grid"><span><HeartPulse /><small>{locale === "zh" ? "静息心率" : "Resting HR"}</small><strong>{vitals.heartRate == null ? "--" : <><AnimatedNumber value={vitals.heartRate} /> bpm</>}</strong></span><span><Activity /><small>{locale === "zh" ? "血氧" : "SpO2"}</small><strong>{vitals.bloodOxygen == null ? "--" : <><AnimatedNumber value={vitals.bloodOxygen} formatter={(value) => value.toFixed(1)} />%</>}</strong></span><span><Gauge /><small>{locale === "zh" ? "恢复度" : "Recovery"}</small><strong>{vitals.recovery == null ? "--" : <AnimatedNumber value={vitals.recovery} />}</strong></span></div><div className="detail-status-strip"><ShieldCheck size={17} /><span>{locale === "zh" ? "指标来自最近一次健康快照与节律评分" : "Based on the latest health snapshot and rhythm score"}</span><strong>{vitals.date ? shortDate(vitals.date, locale) : "--"}</strong></div></ModuleDetailView>;
  if (view === "heatmap") return <ModuleDetailView compact title={locale === "zh" ? "节律热力图" : "Rhythm heatmap"}><div className="detail-heatmap">{heatmap.cells.map((cell, index) => <i key={cell.id} title={`${shortDate(cell.date, locale)} · ${String(cell.period * 2).padStart(2, "0")}:00 · ${Math.round(cell.value)}`} style={{ opacity: cell.intensity, "--heat-index": index } as CSSProperties} />)}</div><div className="heatmap-legend"><span>{locale === "zh" ? "低活跃" : "Low"}</span><i /><i /><i /><i /><span>{locale === "zh" ? "高活跃" : "High"}</span></div><p>{heatmap.cells.length > 0 ? (locale === "zh" ? `${peakWindow} 是近七日最稳定的活动窗口。` : `${peakWindow} is the most stable activity window across the last seven days.`) : (locale === "zh" ? "同步活动数据后生成热力图。" : "Sync activity data to build the heatmap.")}</p></ModuleDetailView>;
  if (view === "clock") return <ModuleDetailView compact title={locale === "zh" ? "生物钟同步" : "Clock alignment"}><div className="clock-alignment"><div className="clock-alignment-gauge" style={{ "--progress": `${alignment}%` } as CSSProperties}><Gauge /></div><strong><AnimatedNumber value={alignment} />%</strong><p>{locale === "zh" ? "该分数由近七日入睡时间、睡眠时长稳定性与节律评分共同计算。" : "Calculated from seven-day bedtime, sleep-duration regularity, and rhythm scores."}</p></div></ModuleDetailView>;
  if (view === "sports") return <ModuleDetailView compact title="NAVA Sports"><div className="sports-plan"><Activity /><strong>{locale === "zh" ? "晚间轻运动计划" : "Evening light workout"}</strong><div className="sports-plan-steps"><span><b>1</b>{locale === "zh" ? "热身 8 分钟" : "Warm up · 8 min"}</span><span><b>2</b>{locale === "zh" ? "低强度有氧 18 分钟" : "Light cardio · 18 min"}</span><span><b>3</b>{locale === "zh" ? "拉伸 5 分钟" : "Stretch · 5 min"}</span></div><button type="button" onClick={onOpenEditor}>{locale === "zh" ? "记录本次运动" : "Log this workout"}</button></div></ModuleDetailView>;

  return (
    <div className="module-dashboard exercise-dashboard" data-module-view="exercise-overview">
      <section className="figma-module-card exercise-summary-card">
        <header><strong>{locale === "zh" ? "今日运动" : "Today's activity"}</strong><button type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "记录今日运动" : "Log today's activity"}><Plus size={20} /></button></header>
        <div className="exercise-summary-metrics">
          <span><small>{locale === "zh" ? "步数" : "Steps"}</small><strong><AnimatedNumber value={displayedSteps} formatter={(value) => Math.round(value).toLocaleString()} /><em>STEP</em></strong></span>
          <span><small>{locale === "zh" ? "活动消耗" : "Energy"}</small><strong><AnimatedNumber value={displayedCalories} /><em>kcal</em></strong></span>
          <span><small>{locale === "zh" ? "运动时长" : "Duration"}</small><strong><AnimatedNumber value={displayedExerciseMinutes} /><em>min</em></strong></span>
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
          <button type="button" onClick={() => openView("clock")}><Gauge size={20} /><span>{locale === "zh" ? "节律同步" : "Rhythm"}</span><small>{alignment}%</small></button>
        </div>
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
    setPrimaryFactor,
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

  const submitMood = async (event: FormEvent<HTMLFormElement>) => {
    const didSave = await onSaveMood(event);
    if (!didSave) return;
    setSaved(true);
    openView("overview");
  };

  if (view === "trend") return <HistoryView module="mood" locale={locale} trendBundle={trendBundle} deviceDate={deviceDate} />;

  return (
    <form className="module-dashboard mood-dashboard" onSubmit={(event) => void submitMood(event)} data-module-view="mood-overview" data-ui-revision="mood-summary-live-v4">
      <section
        className="figma-module-card mood-summary-card"
        style={{ "--mood-score": `${moodScore}%` } as CSSProperties}
        data-record-date={recordDate}
      >
        <header>
          <strong>{locale === "zh" ? "今日情绪摘要" : "Today's mood"}</strong>
          <span className="mood-summary-date"><CalendarDays size={14} />{shortDate(recordDate, locale)}</span>
        </header>
        <div className="mood-summary-content">
          <output className="mood-summary-score" aria-live="polite"><AnimatedNumber value={moodScore} duration={360} /><small>{locale === "zh" ? "分" : "pts"}</small></output>
          <span className={`mood-summary-band is-${selectedBand.key}`}><HeartPulse size={15} />{locale === "zh" ? selectedBand.zh : selectedBand.en}</span>
          <span className="mood-summary-sync">{locale === "zh" ? "下方强度将同步今天" : "The slider updates today"}</span>
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
      {view === "journal" && (
        <div className="module-modal" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "情绪日记" : "Mood journal"}>
          <div className="module-modal-card">
            <header><strong>{locale === "zh" ? "情绪日记" : "Mood journal"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header>
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
    const recentRecords = rollingDateWindow(deviceDate).map((date) => ({ date, record: records.get(date) ?? null }));
    const maxMinutes = Math.max(1, ...recentRecords.flatMap(({ record }) => record ? [Math.max(0, record.sleep_duration_minutes ?? 0)] : []));
    return recentRecords.map(({ date, record }): BarLineTrendPoint => {
        const minutes = Math.max(0, record?.sleep_duration_minutes ?? 0);
        const hours = minutes / 60;
        const normalized = (minutes / maxMinutes) * 100;
        return {
          id: record?.id ?? `missing-sleep-${date}`,
          label: shortDate(date, locale),
          barValue: normalized,
          lineValue: normalized,
          barText: record ? (locale === "zh" ? `${hours.toFixed(1)} 小时` : `${hours.toFixed(1)} h`) : (locale === "zh" ? "暂无记录" : "No entry"),
          lineText: record ? (locale === "zh" ? `${hours.toFixed(1)} 小时` : `${hours.toFixed(1)} h`) : (locale === "zh" ? "暂无记录" : "No entry"),
          missing: !record,
        };
      });
  }, [deviceDate, locale, recordDate, todaySnapshot?.sleep, trendBundle]);
  const hasSleepTrend = sleepTrend.some((point) => !point.missing);

  const enableNotification = async () => {
    await enableNavaNotifications(userId, "22:30");
    setNotificationEnabled(true);
  };

  if (view === "trend") return <HistoryView module="sleep" locale={locale} trendBundle={trendBundle} deviceDate={deviceDate} />;

  return (
    <div className="module-dashboard sleep-dashboard" data-module-view="sleep-overview">
      {alertVisible && latestSleep && <section className="sleep-alert"><MoonStar size={20} /><button className="sleep-alert-copy" type="button" onClick={() => openView("alert")}><strong>{locale === "zh" ? "作息节律提醒" : "Sleep rhythm note"}</strong><p>{locale === "zh" ? `最近一次在 ${displayStart} 入睡，建议围绕这一时间提前 30 分钟放松。` : `Your latest bedtime was ${displayStart}. Start winding down 30 minutes beforehand.`}</p></button><button type="button" onClick={() => setAlertVisible(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={18} /></button></section>}
      <section className="figma-module-card sleep-summary-card">
        <header><strong>{locale === "zh" ? "睡眠摘要" : "Sleep summary"}</strong><button className="module-card-icon-action" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "更新睡眠记录" : "Update sleep record"}><MoonStar size={18} /><span>{locale === "zh" ? "更新" : "Update"}</span></button></header>
        <div className="sleep-timeline"><span>{displayStart}</span><div><i style={{ "--sleep-left": `${timeline.leftPercent}%`, "--sleep-width": `${timeline.widthPercent}%` } as CSSProperties} /></div><span>{displayEnd}</span></div>
        <div className="sleep-stage-row">
          <div className="sleep-stage-shape"><i style={{ flex: deepMinutes / total, "--stage-height": `${stageHeights[0]}%` } as CSSProperties} /><i style={{ flex: lightMinutes / total, "--stage-height": `${stageHeights[1]}%` } as CSSProperties} /><i style={{ flex: remMinutes / total, "--stage-height": `${stageHeights[2]}%` } as CSSProperties} /></div>
          <ul><li><i />{locale === "zh" ? "深睡" : "Deep"}</li><li><i />{locale === "zh" ? "浅睡" : "Light"}</li><li><i />REM</li></ul>
          <strong>{latestSleep ? <AnimatedNumber value={score} /> : "--"}<small>{locale === "zh" ? "分" : "pts"}</small></strong>
        </div>
      </section>
      <section className="figma-module-card sleep-trend-card">
        <header><strong>{locale === "zh" ? "7 日睡眠趋势" : "7-day sleep trend"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看睡眠趋势报告" : "View sleep trend report"}><ChevronRight size={18} /></button></header>
        {hasSleepTrend
          ? <BarLineTrendChart points={sleepTrend} scoreScale lineAnchor="bar-center" ariaLabel={locale === "zh" ? "近七日睡眠时长柱状图与同源趋势折线图，每个点对应同日柱子的几何中心" : "Seven-day sleep-duration bars with a linked line whose points match each bar's geometric center"} />
          : <p className="module-empty-copy">{locale === "zh" ? "完成睡眠记录后显示趋势" : "Log sleep to begin the trend"}</p>}
      </section>
      {view === "alert" && <div className="module-modal" role="dialog" aria-modal="true"><div className="module-modal-card sleep-alert-modal"><header><strong>{locale === "zh" ? "睡眠提醒" : "Sleep reminder"}</strong><button type="button" onClick={() => openView("overview")}><X size={20} /></button></header><div className="lock-screen-preview"><Bell size={24} /><strong>NAVA</strong><p>{locale === "zh" ? "该准备入睡了，给今天一个安静的收尾。" : "Time to wind down and close the day quietly."}</p></div><button type="button" onClick={() => void enableNotification()}>{notificationEnabled ? <BellOff size={18} /> : <Bell size={18} />}{notificationEnabled ? (locale === "zh" ? "提醒已开启" : "Reminder enabled") : (locale === "zh" ? "开启锁屏提醒" : "Enable lock-screen reminder")}</button><button type="button" onClick={() => { window.sessionStorage.setItem(todayKey, "1"); setAlertVisible(false); openView("overview"); }}>{locale === "zh" ? "今天不再提醒" : "Not again today"}</button></div></div>}
    </div>
  );
}

function DietDashboard(props: Pick<Props, "todaySnapshot" | "trendBundle" | "deviceDate" | "onOpenEditor" | "onOpenDietCamera"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { locale, todaySnapshot, trendBundle, deviceDate, onOpenEditor, onOpenDietCamera, openView } = props;
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
    missing: !record,
  }));
  const hasTrend = records.some(({ record }) => Boolean(record));
  const meals = [
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
          <span><small>{locale === "zh" ? "蛋白质" : "Protein"}</small><strong><AnimatedNumber value={Math.round(nutrition?.protein_grams ?? 0)} /><em>g</em></strong></span>
          <span><small>{locale === "zh" ? "碳水化合物" : "Carbohydrates"}</small><strong><AnimatedNumber value={Math.round(nutrition?.carbohydrate_grams ?? 0)} /><em>g</em></strong></span>
          <span><small>{locale === "zh" ? "脂肪" : "Fat"}</small><strong><AnimatedNumber value={Math.round(nutrition?.fat_grams ?? 0)} /><em>g</em></strong></span>
          <span><small>{locale === "zh" ? "饮水量" : "Water"}</small><strong><AnimatedNumber value={Math.round(nutrition?.hydration_ml ?? 0)} /><em>ml</em></strong></span>
        </div>
      </section>
      <section className="figma-module-card diet-meals-card">
        <header><strong>{locale === "zh" ? "餐次记录" : "Meals"}</strong><button className="module-card-icon-action" type="button" onClick={onOpenEditor}><Utensils size={18} /><span>{locale === "zh" ? "添加" : "Add"}</span></button></header>
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
        {hasTrend ? <LineTrendChart points={trendPoints} compact scale="auto" verticalEmphasis showAllDates ariaLabel={locale === "zh" ? "近七日饮食能量趋势，单位千卡；未记录日期保留为空位" : "Seven-day dietary energy trend in kilocalories with empty slots for missing dates"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一餐记录后显示趋势" : "Log a meal to begin the trend"}</p>}
      </section>
    </div>
  );
}

function FaceDashboard(props: Pick<Props, "todaySnapshot" | "trendBundle" | "deviceDate" | "profile" | "onOpenEditor"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { locale, todaySnapshot, trendBundle, deviceDate, onOpenEditor, openView } = props;
  const face = todaySnapshot?.face;
  const records = useMemo(() => {
    const byDate = new Map((trendBundle?.faces ?? []).map((record) => [record.record_date, record]));
    if (face) byDate.set(face.record_date, face);
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
  return (
    <div className="module-dashboard face-dashboard" data-module-view="face-overview">
      <section className="figma-module-card face-privacy-card">
        <ShieldCheck size={18} /><p>{locale === "zh" ? "照片经明确同意后进入账号隔离的私密存储；分析只使用短时签名链接，结果不构成医疗诊断。" : "With consent, photos use account-isolated private storage and short-lived signed links; results are not medical diagnoses."}</p>
      </section>
      <section className="figma-module-card face-summary-card">
        <header><strong>{locale === "zh" ? "今日面部状态" : "Today's face state"}</strong><button className="module-card-icon-action" type="button" onClick={onOpenEditor} aria-label={locale === "zh" ? "使用前置摄像头拍照" : "Take a front-camera photo"}><Camera size={18} /><span>{locale === "zh" ? "拍照" : "Capture"}</span></button></header>
        <div className="face-score-row">
          <div className="face-score-ring" style={{ "--face-score": `${face?.overall_score ?? 0}%` } as CSSProperties}><ScanFace size={28} /><strong>{face?.overall_score == null ? "--" : <AnimatedNumber value={face.overall_score} />}</strong></div>
          <div><span>{locale === "zh" ? "肤龄参考" : "Skin-age reference"}<strong>{face?.skin_age == null ? "--" : <AnimatedNumber value={face.skin_age} />}</strong></span><span>{locale === "zh" ? "拍摄模式" : "Capture mode"}<strong>{face?.capture_mode === "makeup" ? (locale === "zh" ? "带妆" : "Makeup") : (locale === "zh" ? "素颜" : "Bare")}</strong></span><span>{locale === "zh" ? "分析置信度" : "Confidence"}<strong>{face?.analysis_confidence != null ? <><AnimatedNumber value={face.analysis_confidence * 100} />%</> : "--"}</strong></span></div>
        </div>
      </section>
      <section className="figma-module-card face-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日状态" : "7-day state"}</strong><button className="module-card-nav-button" type="button" onClick={() => openView("history")} aria-label={locale === "zh" ? "查看面部趋势报告" : "View face trend report"}><ChevronRight size={18} /></button></header>
        {hasTrend ? <BarLineTrendChart points={points} scoreScale curve="monotone" ariaLabel={locale === "zh" ? "按设备日期滚动的近七日面部状态趋势；未记录日期保留为空位" : "Device-date rolling seven-day face-state trend with empty slots for missing dates"} /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一次拍照后显示趋势" : "Take the first photo to begin the trend"}</p>}
      </section>
    </div>
  );
}

function FocusDashboard(props: Pick<Props, "focusTitle" | "focusMinutes" | "setFocusTitle" | "setFocusMinutes" | "onSaveFocusMinutes" | "todaySnapshot" | "trendBundle" | "deviceDate" | "profile"> & { locale: "zh" | "en"; view: string; openView: OpenModuleView }) {
  const { locale, focusTitle, focusMinutes, setFocusTitle, setFocusMinutes, onSaveFocusMinutes, todaySnapshot, trendBundle, deviceDate, view, openView } = props;
  const displayedFocusTitle = focusTitle === "产品原型" || focusTitle === "Product prototype" || focusTitle === "Prototype"
    ? ""
    : focusTitle;
  const immersive = view === "immersive" || view === "interruption";
  const [running, setRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [countdownDurationSeconds, setCountdownDurationSeconds] = useState(focusMinutes * 60);
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerMode, setTimerMode] = useState<"countdown" | "countup">("countdown");
  const [interruptions, setInterruptions] = useState(0);
  const [startedAt, setStartedAt] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

  const updateDuration = (nextValue: number) => {
    const nextMinutes = Math.min(180, Math.max(1, Math.round(nextValue || 1)));
    const nextSeconds = nextMinutes * 60;
    setFocusMinutes(nextMinutes);
    setCountdownDurationSeconds(nextSeconds);
    setRemaining(nextSeconds);
    setElapsedSeconds(0);
    setRunning(false);
    setHasStarted(false);
    setSaved(false);
  };

  const updateTimerPart = (part: "minutes" | "seconds", rawValue: string) => {
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
    const timer = window.setInterval(() => {
      if (timerMode === "countup") setElapsedSeconds((value) => value + 1);
      else setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [immersive, running, timerMode]);

  useEffect(() => {
    if (!immersive) {
      const nextSeconds = focusMinutes * 60;
      setCountdownDurationSeconds(nextSeconds);
      setRemaining(nextSeconds);
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
  const timerMinutes = Math.floor(timerDisplay / 60);
  const timerSeconds = timerDisplay % 60;
  const progress = timerMode === "countup"
    ? Math.min(100, (elapsedSeconds / Math.max(1, countdownDurationSeconds)) * 100)
    : 100 - (remaining / Math.max(1, countdownDurationSeconds)) * 100;

  const finish = useCallback(async () => {
    if (saving || !hasStarted) return;
    setRunning(false);
    setSaving(true);
    const seconds = timerMode === "countup" ? elapsedSeconds : countdownDurationSeconds - remaining;
    const elapsed = Math.max(1, Math.ceil(seconds / 60));
    try {
      await onSaveFocusMinutes(elapsed, { interruptions, startedAt, endedAt: new Date().toISOString() });
      setSaved(true);
      openView("overview");
    } finally {
      setSaving(false);
    }
  }, [countdownDurationSeconds, elapsedSeconds, hasStarted, interruptions, onSaveFocusMinutes, openView, remaining, saving, startedAt, timerMode]);

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
          <input
            aria-label={locale === "zh" ? "专注事项" : "Focus activity"}
            value={displayedFocusTitle}
            onChange={(event) => setFocusTitle(event.target.value)}
            placeholder={locale === "zh" ? "请填写今日要完成的任务" : "Enter today's task"}
          />
          <div className="focus-mode-switch" role="group" aria-label={locale === "zh" ? "计时模式" : "Timer mode"}>
            <button type="button" className={timerMode === "countdown" ? "active" : ""} onClick={() => { setTimerMode("countdown"); setRemaining(countdownDurationSeconds); setRunning(false); setHasStarted(false); }}>{locale === "zh" ? "倒计时" : "Countdown"}</button>
            <button type="button" className={timerMode === "countup" ? "active" : ""} onClick={() => { setTimerMode("countup"); setElapsedSeconds(0); setRunning(false); setHasStarted(false); }}>{locale === "zh" ? "正计时" : "Count up"}</button>
          </div>
        </div>
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
        <div className="focus-controls">
          <button type="button" onClick={() => { setRemaining(countdownDurationSeconds); setElapsedSeconds(0); setRunning(false); setHasStarted(false); setSaved(false); }} aria-label={locale === "zh" ? "重置" : "Reset"}><TimerReset /></button>
          <button className="primary" type="button" onClick={() => { setHasStarted(true); if (!startedAt) setStartedAt(new Date().toISOString()); setRunning((value) => !value); }} aria-label={running ? (locale === "zh" ? "暂停" : "Pause") : (locale === "zh" ? "开始" : "Start")}>{running ? <Pause /> : <Play />}</button>
          <button type="button" onClick={() => void finish()} disabled={saving} aria-label={locale === "zh" ? "结束" : "Finish"}><Square /></button>
        </div>
        <button className="focus-interruption-trigger" type="button" onClick={() => { setRunning(false); setInterruptions((value) => value + 1); openView("interruption"); }}><PhoneIncoming size={17} />{locale === "zh" ? "模拟来电打断" : "Simulate interruption"}</button>
        {view === "interruption" && <div className="focus-interruption" role="dialog" aria-modal="true"><PhoneIncoming size={38} /><strong>{locale === "zh" ? "来电打断" : "Incoming call"}</strong><p>{locale === "zh" ? "专注计时已自动暂停" : "Focus timer paused automatically"}</p><div><button type="button" onClick={() => { setRunning(true); setHasStarted(true); openView("immersive", true); }}>{locale === "zh" ? "继续专注" : "Keep focusing"}</button><button type="button" onClick={() => openView("immersive", true)}>{locale === "zh" ? "接听并暂停" : "Answer and pause"}</button></div></div>}
      </div>
    );
  }

  return (
    <div className="module-dashboard focus-dashboard" data-module-view="focus-overview">
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
          <button className={["focus-summary-start", saved ? "success" : ""].filter(Boolean).join(" ")} type="button" onClick={() => { setSaved(false); setHasStarted(false); openView("immersive"); }} aria-label={saved ? (locale === "zh" ? "专注已记录" : "Focus saved") : (locale === "zh" ? "开始专注" : "Start focus")}>{saved ? <Check size={23} /> : <><CirclePlay size={23} /><span>{locale === "zh" ? "开始" : "Start"}</span></>}</button>
        </div>
      </section>
      <section className="figma-module-card focus-trend-card">
        <header><strong>{locale === "zh" ? "近 7 日专注时长" : "7-day focus duration"}</strong></header>
        {hasFocusTrend ? <BarLineTrendChart
          points={focusTrendPoints}
          scoreScale
          lineAnchor="bar-center"
          curve="monotone"
          ariaLabel={locale === "zh" ? "近七日专注时长柱状图与平滑趋势曲线，曲线节点位于每根柱子的几何中心" : "Seven-day focus duration bars with a smooth trend line anchored at each bar's geometric center"}
        /> : <p className="module-empty-copy">{locale === "zh" ? "完成第一次专注后显示近七日趋势" : "Complete your first focus session to begin the trend"}</p>}
      </section>
      <section className="figma-module-card focus-quick-card">
        <header><strong>{locale === "zh" ? "开启专注时刻" : "Start a focus moment"}</strong></header>
        <div className="focus-quick-controls">
          <label className="focus-task-field"><Clock3 size={19} /><input aria-label={locale === "zh" ? "专注事项" : "Focus activity"} placeholder={locale === "zh" ? "请填写要专注的事项" : "What do you want to focus on?"} value={displayedFocusTitle} onChange={(event) => setFocusTitle(event.target.value)} /></label>
          <div className="focus-duration-controls"><button type="button" onClick={() => updateDuration(focusMinutes - 1)} aria-label={locale === "zh" ? "减少一分钟" : "Decrease one minute"}>-</button><label className="focus-duration-field compact"><input aria-label={locale === "zh" ? "专注分钟数" : "Focus duration in minutes"} inputMode="numeric" min={1} max={180} type="number" value={focusMinutes} onChange={(event) => updateDuration(Number(event.target.value))} /><span>{locale === "zh" ? "分钟" : "min"}</span></label><button type="button" onClick={() => updateDuration(focusMinutes + 1)} aria-label={locale === "zh" ? "增加一分钟" : "Increase one minute"}>+</button></div>
        </div>
        <div className="focus-recent-list">
          <strong>{locale === "zh" ? "最近完成" : "Recently completed"}</strong>
          {recentFocus.length > 0 ? recentFocus.map((record) => <div key={record.id}><span><Clock3 size={14} /></span><p><b>{shortDate(record.record_date, locale)}</b><i aria-hidden="true">·</i>{record.completed_sessions}{locale === "zh" ? " 次" : " sessions"}<i aria-hidden="true">·</i>{record.total_minutes}{locale === "zh" ? " 分钟" : " min"}</p></div>) : <p className="focus-empty-history">{locale === "zh" ? "还没有完成记录" : "No completed sessions yet"}</p>}
        </div>
        <button className="focus-enter-button" type="button" onClick={() => { setHasStarted(false); setRemaining(focusMinutes * 60); setElapsedSeconds(0); setInterruptions(0); setStartedAt(undefined); openView("immersive"); }}>{locale === "zh" ? "进入专注" : "Start focus"}</button>
      </section>
    </div>
  );
}

export default function RecordModuleDashboard(props: Props) {
  const { locale } = useLocale();
  const [view, setView] = useState(props.initialView ?? "overview");
  useEffect(() => setView(props.initialView ?? "overview"), [props.initialView, props.module]);
  const openView = (next: string, returnToPrevious = next === "overview") => {
    setView(next);
    props.onViewChange?.(next === "overview" ? null : next, returnToPrevious);
  };
  if (view === "history") return <HistoryView module={props.module} locale={locale} trendBundle={props.trendBundle} deviceDate={props.deviceDate} onGrowthActivity={props.onGrowthActivity} />;
  const common = { ...props, locale };
  if (props.module === "exercise") return <ExerciseDashboard userId={props.userId} locale={locale} steps={props.steps} calories={props.calories} exerciseMinutes={props.exerciseMinutes} onOpenEditor={props.onOpenEditor} recordDate={props.recordDate} deviceDate={props.deviceDate} trendBundle={props.trendBundle} todaySnapshot={props.todaySnapshot} profile={props.profile} view={view} openView={openView} />;
  if (props.module === "mood") return <MoodDashboard {...common} view={view} openView={openView} />;
  if (props.module === "sleep") return <SleepDashboard userId={props.userId} locale={locale} sleepStart={props.sleepStart} sleepEnd={props.sleepEnd} deepSleep={props.deepSleep} lightSleep={props.lightSleep} remSleep={props.remSleep} sleepRating={props.sleepRating} onOpenEditor={props.onOpenEditor} recordDate={props.recordDate} deviceDate={props.deviceDate} trendBundle={props.trendBundle} todaySnapshot={props.todaySnapshot} profile={props.profile} view={view} openView={openView} />;
  if (props.module === "diet") return <DietDashboard locale={locale} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} deviceDate={props.deviceDate} onOpenEditor={props.onOpenEditor} onOpenDietCamera={props.onOpenDietCamera} view={view} openView={openView} />;
  if (props.module === "face") return <FaceDashboard locale={locale} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} deviceDate={props.deviceDate} profile={props.profile} onOpenEditor={props.onOpenEditor} view={view} openView={openView} />;
  if (props.module === "focus") return <FocusDashboard locale={locale} focusTitle={props.focusTitle} focusMinutes={props.focusMinutes} setFocusTitle={props.setFocusTitle} setFocusMinutes={props.setFocusMinutes} onSaveFocusMinutes={props.onSaveFocusMinutes} todaySnapshot={props.todaySnapshot} trendBundle={props.trendBundle} deviceDate={props.deviceDate} profile={props.profile} view={view} openView={openView} />;
  return null;
}
