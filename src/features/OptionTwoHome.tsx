import type { User } from "@supabase/supabase-js";
import {
  CalendarDays,
  ChevronUp,
  HeartPulse,
  ScanFace,
  ShoppingCart,
  SmilePlus,
  TimerReset,
  Utensils,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import homeSceneBackground from "../assets/figma/home-option2/home-scene-v3.png";
import { useLocale } from "../i18n";
import AnimatedNumber from "../components/AnimatedNumber";
import ModuleProgressRing from "../components/ModuleProgressRing";
import { SkeletonBlock } from "../components/PageSkeleton";
import InteractiveMascot from "../components/InteractiveMascot";
import {
  EnergyStatusIcon,
  HeartMetricIcon,
  MenuReferenceIcon,
  PointsStatusIcon,
  RunMetricIcon,
  SleepMetricIcon,
  StepsMetricIcon,
  type HomeReferenceIconProps,
} from "../components/HomeReferenceIcons";
import { loadGrowthTotalPoints } from "../services/productivity";
import { getTodaySnapshot, getTrends } from "../services/records";
import { buildHealthModuleProgress, healthModuleEntryView, healthModuleProgressLabel } from "../services/healthReportPresentation";
import { buildHomeGuidance, homeDayPhase, isVerticalHomeSwipe } from "../services/homeExperience";
import { buildHomeWidgetPresentation, hydrateHomeWidgetIds, loadHomeWidgetIds, saveHomeWidgetIds, type HomeWidgetId } from "../services/homeWidgets";
import { syncContextualNotifications, type NavaNotificationItem, type NavaNotificationTarget } from "../services/notifications";
import type { TodaySnapshot, TrendBundle } from "../types";
import type { RecordModule } from "./RecordsScreen";
import HomeCalendarExperience from "./HomeCalendarExperience";
import AdvancedProfileScreen from "./AdvancedProfileScreen";
import NotificationCenter from "./NotificationCenter";
import HomeWidgetEditor from "./HomeWidgetEditor";

const healthEntries: Array<{
  id: RecordModule;
  labelKey: "records.exercise" | "records.diet" | "records.sleep" | "records.faceShort" | "records.focus" | "records.mood";
  className: string;
}> = [
  { id: "exercise", labelKey: "records.exercise", className: "exercise" },
  { id: "diet", labelKey: "records.diet", className: "diet" },
  { id: "sleep", labelKey: "records.sleep", className: "sleep" },
  { id: "face", labelKey: "records.faceShort", className: "face" },
  { id: "focus", labelKey: "records.focus", className: "focus" },
  { id: "mood", labelKey: "records.mood", className: "mood" },
];

const homeWidgetIcons: Record<HomeWidgetId, ComponentType<HomeReferenceIconProps>> = {
  heart: HeartMetricIcon,
  sleep: SleepMetricIcon,
  exercise: RunMetricIcon,
  steps: StepsMetricIcon,
  focus: TimerReset,
  mood: SmilePlus,
  diet: Utensils,
  face: ScanFace,
};

const homeWidgetLabels: Record<HomeWidgetId, { zh: string; en: string }> = {
  heart: { zh: "心率", en: "Heart rate" },
  sleep: { zh: "睡眠", en: "Sleep" },
  exercise: { zh: "运动", en: "Activity" },
  steps: { zh: "步数", en: "Steps" },
  focus: { zh: "专注", en: "Focus" },
  mood: { zh: "情绪", en: "Mood" },
  diet: { zh: "饮食", en: "Diet" },
  face: { zh: "面部", en: "Face" },
};

const homeWidgetTargets: Record<HomeWidgetId, RecordModule> = {
  heart: "exercise",
  sleep: "sleep",
  exercise: "exercise",
  steps: "exercise",
  focus: "focus",
  mood: "mood",
  diet: "diet",
  face: "face",
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
  showInitialGuidance,
  onInitialGuidanceShown,
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
  showInitialGuidance: boolean;
  onInitialGuidanceShown: () => void;
}) {
  const { locale, t } = useLocale();
  const forceHomeWidgetSkeleton = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "home-widgets-loading";
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [healthMenuOpen, setHealthMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [trends, setTrends] = useState<TrendBundle | null>(null);
  const [widgetIds, setWidgetIds] = useState<HomeWidgetId[]>(() => loadHomeWidgetIds(user.id));
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  const [guidanceEligible] = useState(showInitialGuidance);
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
    const loadedTrends = trendsResult.status === "fulfilled" ? trendsResult.value : null;
    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
      syncContextualNotifications(user.id, snapshotResult.value, locale, new Date(), {
        present: guidanceEligible,
      }, loadedTrends ?? undefined);
    } else {
      setSnapshot(null);
      console.warn("Unable to load the option-two home snapshot", snapshotResult.reason);
    }

    if (pointsResult.status === "fulfilled") {
      setTotalPoints(pointsResult.value);
    } else {
      setTotalPoints(null);
      console.warn("Unable to load the option-two points total", pointsResult.reason);
    }
    if (trendsResult.status === "fulfilled") setTrends(trendsResult.value);
    else {
      setTrends(null);
      console.warn("Unable to load home widget trends", trendsResult.reason);
    }
    setLoading(false);
  }, [deviceDate, guidanceEligible, locale, user.id]);

  useEffect(() => {
    let active = true;
    void hydrateHomeWidgetIds(user.id)
      .then((ids) => { if (active) setWidgetIds(ids); })
      .catch((error) => console.warn("Home widget restore deferred", error));
    return () => { active = false; };
  }, [user.id]);

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
    if (!guidanceEligible) return;
    onInitialGuidanceShown();
  }, [guidanceEligible, onInitialGuidanceShown]);

  useEffect(() => {
    if (!guidanceEligible || view !== null) {
      if (view !== null) setGuidanceDismissed(true);
      return;
    }
    const timer = window.setTimeout(() => setGuidanceDismissed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [deviceDate, guidanceEligible, view]);

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
      <img
        className="option-two-scene-background"
        src={homeSceneBackground}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
      />
      <div className="option-two-scores" aria-label={t("today.overview")} aria-live="polite" aria-busy={loading}>
        <div aria-label={`${t("today.rhythm")} ${rhythmScore}`}><EnergyStatusIcon className="option-two-score-icon option-two-score-icon--energy" size={17} /><strong>{loading && snapshot === null ? <SkeletonBlock className="option-two-score-skeleton" /> : <>{typeof rhythmScore === "number" ? <AnimatedNumber value={rhythmScore} /> : rhythmScore}<small>/100</small></>}</strong></div>
        <div aria-label={`${t("today.myPoints")} ${points}`}><PointsStatusIcon className="option-two-score-icon option-two-score-icon--points" size={18} /><strong>{loading && totalPoints === null ? <SkeletonBlock className="option-two-score-skeleton" /> : typeof points === "number" ? <AnimatedNumber value={points} duration={760} /> : points}</strong></div>
      </div>

      <div className={["option-two-side-actions", shortcutsOpen ? "is-open" : "is-collapsed"].join(" ")}>
        <button className="option-two-menu-toggle" type="button" onClick={() => { if (shortcutsOpen) onViewChange("notifications"); else setShortcutsOpen(true); }} aria-expanded={shortcutsOpen} aria-label={shortcutsOpen ? (locale === "zh" ? "打开通知中心" : "Open notifications") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")} title={shortcutsOpen ? (locale === "zh" ? "打开通知中心" : "Open notifications") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")}>
          <MenuReferenceIcon size={23} />
          {notifications.some((item) => !item.readAt) && <span className="option-two-menu-unread" aria-hidden="true" />}
        </button>
        <button className="option-two-side-shortcut" type="button" onClick={() => onViewChange("calendar")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "健康月历" : "Health calendar"} title={locale === "zh" ? "健康月历" : "Health calendar"}><CalendarDays size={23} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={() => onViewChange("profile-details")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "详细资料设置" : "Detailed profile"} title={locale === "zh" ? "详细资料设置" : "Detailed profile"}><UsersRound size={24} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={onOpenUtility} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "积分商城" : "Points store"} title={locale === "zh" ? "积分商城" : "Points store"}><ShoppingCart size={22} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={onOpenUtility} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "功能导航" : "Utilities"} title={locale === "zh" ? "功能导航" : "Utilities"}><Wrench size={22} /></button>
        <button className="option-two-side-shortcut option-two-side-collapse" type="button" onClick={() => setShortcutsOpen(false)} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "收起快捷入口" : "Collapse shortcuts"} title={locale === "zh" ? "收起快捷入口" : "Collapse shortcuts"}><ChevronUp size={23} /></button>
      </div>

      <section className={["home-widget-grid", widgetIds.length === 0 ? "is-empty" : ""].join(" ")} aria-label={locale === "zh" ? "我的健康小组件" : "My health widgets"} data-widget-count={widgetIds.length}>
        {(loading && snapshot === null) || forceHomeWidgetSkeleton
          ? Array.from({ length: widgetIds.length || 4 }, (_, index) => <SkeletonBlock className={`home-widget-skeleton home-widget-skeleton--position-${index + 1}`} key={index} />)
          : widgetIds.length === 0
            ? <button className="home-widget-empty" type="button" onClick={() => onViewChange("home-widgets")}><HeartPulse size={18} /><span><strong>{locale === "zh" ? "添加关注的小组件" : "Add widgets you care about"}</strong><small>{locale === "zh" ? "最多 6 个" : "Up to 6"}</small></span></button>
            : widgetIds.map((id, index) => {
              const presentation = snapshot ? buildHomeWidgetPresentation(id, snapshot, locale, trends) : null;
              const Icon = homeWidgetIcons[id];
              const label = homeWidgetLabels[id][locale];
              const target = homeWidgetTargets[id];
              return <button
                className={["home-health-widget", `home-health-widget--${id}`, `home-health-widget--position-${index + 1}`, presentation ? `is-${presentation.state}` : "is-missing"].join(" ")}
                type="button"
                key={id}
                data-home-widget={id}
                onClick={() => onOpenRecord(target, snapshot ? healthModuleEntryView(moduleProgress[target]) : "editor")}
                aria-label={`${label}${locale === "zh" ? "，" : ", "}${presentation?.core ?? "--"}${locale === "zh" ? "，" : ", "}${presentation?.support ?? (locale === "zh" ? "加载中" : "Loading")}`}
              >
                <span><Icon size={26} /><b>{label}</b></span>
                <div className="home-widget-value"><strong>{presentation?.core ?? "--"}</strong><small>{presentation?.support ?? (locale === "zh" ? "加载中" : "Loading")}</small></div>
              </button>;
            })}
      </section>

      {homeGuidance && guidanceEligible && !guidanceDismissed && (
        <button className="option-two-guidance" type="button" aria-live="polite" data-guidance-reason={homeGuidance.reason} onClick={() => homeGuidance.actions[0] && onOpenNotificationTarget(homeGuidance.actions[0].target)}>
          <p>{homeGuidance.message}</p>
        </button>
      )}

      <div className="option-two-life-stage">
        <span className="option-two-aura" aria-hidden="true" />
        <InteractiveMascot locale={locale} preferredMotion={homeGuidance?.motion} />
      </div>

      <div className="option-two-health-menu" aria-hidden={!healthMenuOpen}>
        <span className="option-two-health-disc" aria-hidden="true" />
        {healthEntries.map(({ id, labelKey, className }, index) => {
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
            <HeartMetricIcon className={`option-two-health-icon option-two-health-icon--${className}`} size={30} />
          </button>
          );
        })}
      </div>

    </section>
  );
}
