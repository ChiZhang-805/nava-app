import type { User } from "@supabase/supabase-js";
import {
  Bell,
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  Footprints,
  ListTodo,
  MessageCircle,
  Menu,
  MoonStar,
  ScanFace,
  SmilePlus,
  Sparkles,
  TimerReset,
  Utensils,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import dietIcon from "../assets/figma/option-two-icons/diet.svg";
import exerciseIcon from "../assets/figma/option-two-icons/exercise.svg";
import faceIcon from "../assets/figma/option-two-icons/face.svg";
import focusIcon from "../assets/figma/option-two-icons/focus.svg";
import moodIcon from "../assets/figma/option-two-icons/mood.svg";
import sleepIcon from "../assets/figma/option-two-icons/sleep.svg";
import { useLocale } from "../i18n";
import AnimatedNumber from "../components/AnimatedNumber";
import ModuleProgressRing from "../components/ModuleProgressRing";
import { SkeletonBlock } from "../components/PageSkeleton";
import InteractiveMascot from "../components/InteractiveMascot";
import { loadGrowthTotalPoints } from "../services/productivity";
import { getTodaySnapshot, getTrends } from "../services/records";
import { buildHealthModuleProgress, healthModuleEntryView, healthModuleProgressLabel } from "../services/healthReportPresentation";
import { buildHomeGuidance, homeDayPhase, isVerticalHomeSwipe, type HomeGuidanceAction } from "../services/homeExperience";
import { buildHomeWidgetPresentation, loadHomeWidgetIds, saveHomeWidgetIds, type HomeWidgetId } from "../services/homeWidgets";
import { syncContextualNotifications, type NavaNotificationItem, type NavaNotificationTarget } from "../services/notifications";
import type { TodaySnapshot, TrendBundle } from "../types";
import type { RecordModule } from "./RecordsScreen";
import HomeCalendarExperience from "./HomeCalendarExperience";
import AdvancedProfileScreen from "./AdvancedProfileScreen";
import NotificationCenter from "./NotificationCenter";
import HomeWidgetEditor from "./HomeWidgetEditor";

const healthEntries: Array<{
  id: RecordModule;
  icon: string;
  labelKey: "records.exercise" | "records.diet" | "records.sleep" | "records.faceShort" | "records.focus" | "records.mood";
  className: string;
}> = [
  { id: "exercise", icon: exerciseIcon, labelKey: "records.exercise", className: "exercise" },
  { id: "diet", icon: dietIcon, labelKey: "records.diet", className: "diet" },
  { id: "sleep", icon: sleepIcon, labelKey: "records.sleep", className: "sleep" },
  { id: "face", icon: faceIcon, labelKey: "records.faceShort", className: "face" },
  { id: "focus", icon: focusIcon, labelKey: "records.focus", className: "focus" },
  { id: "mood", icon: moodIcon, labelKey: "records.mood", className: "mood" },
];

const homeGuidanceIcons: Record<HomeGuidanceAction["id"], LucideIcon> = {
  sleep: MoonStar,
  diet: Utensils,
  focus: TimerReset,
  exercise: Footprints,
  mood: SmilePlus,
  face: ScanFace,
  report: ChartNoAxesCombined,
  ai: MessageCircle,
};

const homeWidgetIcons: Record<HomeWidgetId, LucideIcon> = {
  sleep: MoonStar,
  focus: TimerReset,
  exercise: Footprints,
  mood: SmilePlus,
  diet: Utensils,
  face: ScanFace,
};

const homeWidgetLabelKeys: Record<HomeWidgetId, "records.sleep" | "records.focus" | "records.exercise" | "records.mood" | "records.diet" | "records.faceShort"> = {
  sleep: "records.sleep",
  focus: "records.focus",
  exercise: "records.exercise",
  mood: "records.mood",
  diet: "records.diet",
  face: "records.faceShort",
};

export default function OptionTwoHome({
  user,
  refreshKey,
  deviceDate,
  view,
  onOpenRecord,
  onOpenUtility,
  onViewChange,
  onBack,
  onChanged,
  notifications,
  onOpenNotificationTarget,
}: {
  user: User;
  refreshKey: number;
  deviceDate: string;
  view: string | null;
  onOpenRecord: (module?: RecordModule, view?: "editor" | null) => void;
  onOpenUtility: () => void;
  onViewChange: (view: string | null, replace?: boolean) => void;
  onBack: (fallbackView: string | null) => void;
  onChanged: () => void;
  notifications: NavaNotificationItem[];
  onOpenNotificationTarget: (target?: NavaNotificationTarget) => void;
}) {
  const { locale, t } = useLocale();
  const [shortcutsOpen, setShortcutsOpen] = useState(true);
  const [healthMenuOpen, setHealthMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [trends, setTrends] = useState<TrendBundle | null>(null);
  const [widgetIds, setWidgetIds] = useState<HomeWidgetId[]>(() => loadHomeWidgetIds(user.id));
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const refreshRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    setLoading(true);
    const [snapshotResult, pointsResult, trendsResult] = await Promise.allSettled([
      getTodaySnapshot(user.id, deviceDate),
      loadGrowthTotalPoints(user.id),
      getTrends(user.id, deviceDate),
    ]);

    if (requestId !== refreshRequestRef.current) return;
    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
      syncContextualNotifications(user.id, snapshotResult.value, locale, new Date());
    } else {
      console.warn("Unable to load the option-two home snapshot", snapshotResult.reason);
    }

    if (pointsResult.status === "fulfilled") {
      setTotalPoints(pointsResult.value);
    } else {
      console.warn("Unable to load the option-two points total", pointsResult.reason);
    }
    if (trendsResult.status === "fulfilled") setTrends(trendsResult.value);
    else console.warn("Unable to load home widget trends", trendsResult.reason);
    setLoading(false);
  }, [deviceDate, locale, user.id]);

  useEffect(() => {
    void refresh();
    return () => {
      refreshRequestRef.current += 1;
    };
  }, [refresh, refreshKey]);

  useEffect(() => {
    const updateHour = () => setLocalHour(new Date().getHours());
    const timer = window.setInterval(updateHour, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view !== null) return;
    setGuidanceDismissed(false);
    const timer = window.setTimeout(() => setGuidanceDismissed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [deviceDate, view]);

  const rhythmScore = snapshot?.rhythmScore ?? "--";
  const points = totalPoints ?? "--";
  const moduleProgress = buildHealthModuleProgress(snapshot);
  const homeGuidance = snapshot ? buildHomeGuidance(snapshot, localHour, locale) : null;
  const phase = homeGuidance?.phase ?? homeDayPhase(localHour);

  if (view === "calendar" || view?.startsWith("day-")) {
    return <HomeCalendarExperience user={user} deviceDate={deviceDate} view={view} onOpenDate={(date) => onViewChange(`day-${date}`)} onBack={onBack} />;
  }

  if (view === "profile-details") {
    return <AdvancedProfileScreen user={user} onBack={() => onBack(null)} onChanged={onChanged} />;
  }

  if (view === "notifications") {
    return <NotificationCenter userId={user.id} items={notifications} locale={locale} onBack={() => onBack(null)} onOpenTarget={onOpenNotificationTarget} />;
  }

  if (view === "home-widgets") {
    return <HomeWidgetEditor
      locale={locale}
      initialIds={widgetIds}
      onCancel={() => onBack(null)}
      onSave={(ids) => {
        setWidgetIds(saveHomeWidgetIds(user.id, ids));
        onBack(null);
      }}
    />;
  }

  const beginHomeGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const target = event.target as HTMLElement;
    const interactiveTarget = target.closest<HTMLElement>("button, a, input, select, textarea, [role='button']");
    if (interactiveTarget && !interactiveTarget.classList.contains("nava-mascot")) {
      gestureRef.current = null;
      return;
    }
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
  };

  const moveHomeGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  };

  const endHomeGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    const endX = event.clientX || gesture.lastX;
    const endY = event.clientY || gesture.lastY;
    if (isVerticalHomeSwipe(gesture.startX, gesture.startY, endX, endY, window.innerHeight, "up")) {
      ignoreClickUntilRef.current = Date.now() + 450;
      setHealthMenuOpen(true);
      return;
    }
    if (isVerticalHomeSwipe(gesture.startX, gesture.startY, endX, endY, window.innerHeight, "down")) setHealthMenuOpen(false);
  };

  const dismissHealthMenuOutside = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (Date.now() < ignoreClickUntilRef.current) {
      if (target.closest(".nava-mascot")) {
        event.preventDefault();
        event.stopPropagation();
        ignoreClickUntilRef.current = 0;
      }
      return;
    }
    if (!healthMenuOpen) return;
    if (target.closest(".option-two-health-disc, .option-two-health-entry")) return;
    setHealthMenuOpen(false);
  };

  return (
    <section
      className={["option-two-home", `home-phase-${phase}`, healthMenuOpen ? "is-health-menu-open" : "", shortcutsOpen ? "shortcuts-open" : "shortcuts-collapsed", snapshot ? "is-loaded" : ""].filter(Boolean).join(" ")}
      onPointerDown={beginHomeGesture}
      onPointerMove={moveHomeGesture}
      onPointerUp={endHomeGesture}
      onPointerCancel={() => { gestureRef.current = null; }}
      onClickCapture={dismissHealthMenuOutside}
      data-health-menu-open={healthMenuOpen}
      data-home-phase={phase}
      data-home-guidance={homeGuidance?.reason ?? "loading"}
    >
      <div className="option-two-scores" aria-label={t("today.overview")} aria-live="polite" aria-busy={loading}>
        <div><span>{t("today.rhythm")}</span><strong>{loading && snapshot === null ? <SkeletonBlock className="option-two-score-skeleton" /> : typeof rhythmScore === "number" ? <AnimatedNumber value={rhythmScore} /> : rhythmScore}</strong></div>
        <div><span>{t("today.myPoints")}</span><strong>{loading && totalPoints === null ? <SkeletonBlock className="option-two-score-skeleton" /> : typeof points === "number" ? <AnimatedNumber value={points} duration={760} /> : points}</strong></div>
      </div>

      <div className={["option-two-side-actions", shortcutsOpen ? "is-open" : "is-collapsed"].join(" ")}>
        <button className="option-two-menu-toggle" type="button" onClick={() => setShortcutsOpen((value) => !value)} aria-expanded={shortcutsOpen} aria-label={shortcutsOpen ? (locale === "zh" ? "收起快捷入口" : "Collapse shortcuts") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")} title={shortcutsOpen ? (locale === "zh" ? "收起快捷入口" : "Collapse shortcuts") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")}>
          <Menu size={23} />
        </button>
        <button className="option-two-side-shortcut option-two-notification-button" type="button" onClick={() => onViewChange("notifications")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "通知中心" : "Notifications"} title={locale === "zh" ? "通知中心" : "Notifications"}>
          <Bell size={22} />
          {notifications.some((item) => !item.readAt) && <span className="option-two-notification-badge" aria-label={locale === "zh" ? `${notifications.filter((item) => !item.readAt).length} 条未读` : `${notifications.filter((item) => !item.readAt).length} unread`}>{Math.min(99, notifications.filter((item) => !item.readAt).length)}</span>}
        </button>
        <button className="option-two-side-shortcut" type="button" onClick={() => onViewChange("calendar")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "健康月历" : "Health calendar"} title={locale === "zh" ? "健康月历" : "Health calendar"}><CalendarDays size={23} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={() => onViewChange("profile-details")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "详细资料设置" : "Detailed profile"} title={locale === "zh" ? "详细资料设置" : "Detailed profile"}><UsersRound size={24} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={onOpenUtility} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "功能导航" : "Utilities"} title={locale === "zh" ? "功能导航" : "Utilities"}><ListTodo size={23} /></button>
      </div>

      <section className={["home-widget-grid", widgetIds.length === 0 ? "is-empty" : ""].join(" ")} aria-label={locale === "zh" ? "我的健康小组件" : "My health widgets"} data-widget-count={widgetIds.length}>
        {loading && snapshot === null
          ? [0, 1, 2, 3, 4].map((index) => <SkeletonBlock className="home-widget-skeleton" key={index} />)
          : widgetIds.length === 0
            ? <button className="home-widget-empty" type="button" onClick={() => onViewChange("home-widgets")}><Sparkles size={18} /><span><strong>{locale === "zh" ? "添加关注的小组件" : "Add widgets you care about"}</strong><small>{locale === "zh" ? "最多 6 个，每行 3 个" : "Up to 6, three per row"}</small></span></button>
            : widgetIds.map((id) => {
              const presentation = snapshot ? buildHomeWidgetPresentation(id, snapshot, locale, trends) : null;
              const Icon = homeWidgetIcons[id];
              return <button
                className={["home-health-widget", presentation ? `is-${presentation.state}` : "is-missing"].join(" ")}
                type="button"
                key={id}
                data-home-widget={id}
                onClick={() => onOpenRecord(id, snapshot ? healthModuleEntryView(moduleProgress[id]) : "editor")}
                aria-label={`${t(homeWidgetLabelKeys[id])}${locale === "zh" ? "，" : ", "}${presentation?.core ?? "--"}${locale === "zh" ? "，" : ", "}${presentation?.support ?? (locale === "zh" ? "加载中" : "Loading")}`}
              >
                <span><Icon size={15} /><b>{t(homeWidgetLabelKeys[id])}</b></span>
                <strong>{presentation?.core ?? "--"}</strong>
                <small>{presentation?.support ?? (locale === "zh" ? "加载中" : "Loading")}</small>
              </button>;
            })}
      </section>

      {homeGuidance && !guidanceDismissed && (
        <aside className="option-two-guidance" aria-live="polite" data-guidance-reason={homeGuidance.reason}>
          <button className="option-two-guidance-close" type="button" onClick={() => setGuidanceDismissed(true)} aria-label={locale === "zh" ? "关闭今日提示" : "Dismiss today's guidance"} title={locale === "zh" ? "关闭今日提示" : "Dismiss today's guidance"}><X size={16} /></button>
          <div className="option-two-guidance-copy">
            <span><Sparkles size={14} />{homeGuidance.eyebrow}</span>
            <p>{homeGuidance.message}</p>
          </div>
          <div className="option-two-guidance-actions" aria-label={locale === "zh" ? "根据今日状态推荐的快捷操作" : "Recommended actions for today"}>
            {homeGuidance.actions.map((action) => {
              const Icon = homeGuidanceIcons[action.id] ?? BrainCircuit;
              return <button key={action.id} type="button" onClick={() => onOpenNotificationTarget(action.target)}><Icon size={15} /><span>{action.label}</span></button>;
            })}
          </div>
        </aside>
      )}

      <div className="option-two-life-stage">
        <span className="option-two-aura" aria-hidden="true" />
        <InteractiveMascot locale={locale} preferredMotion={homeGuidance?.motion} />
      </div>

      <div className="option-two-health-menu" aria-hidden={!healthMenuOpen}>
        <span className="option-two-health-disc" aria-hidden="true" />
        {healthEntries.map(({ id, icon, labelKey, className }, index) => {
          const progress = moduleProgress[id];
          const progressLabel = healthModuleProgressLabel(progress, locale);
          const accessibleLabel = `${t(labelKey)}${locale === "zh" ? "，" : ". "}${progressLabel}`;
          return (
          <button
            className={[`option-two-health-entry option-two-health-entry--${className}`, progress.completed ? "is-complete" : progress.recorded ? "is-partial" : "is-empty"].join(" ")}
            key={id}
            type="button"
            onClick={() => onOpenRecord(id, healthModuleEntryView(progress))}
            tabIndex={healthMenuOpen ? 0 : -1}
            aria-label={accessibleLabel}
            title={`${t(labelKey)} · ${progressLabel}`}
            data-module-progress={loading && snapshot === null ? undefined : progress.progress}
            data-module-state={loading && snapshot === null ? "loading" : progress.completed ? "complete" : progress.recorded ? "partial" : "empty"}
            style={{ "--option-entry-index": index } as CSSProperties}
          >
            <ModuleProgressRing progress={progress.progress} loading={loading && snapshot === null} />
            <img
              className={`option-two-health-icon option-two-health-icon--${className}`}
              src={icon}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </button>
          );
        })}
      </div>

    </section>
  );
}
