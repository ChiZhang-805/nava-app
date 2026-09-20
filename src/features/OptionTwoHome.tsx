import type { User } from "@supabase/supabase-js";
import {
  Bell,
  CalendarDays,
  Check,
  HeartPulse,
  ScanFace,
  ShoppingCart,
  SmilePlus,
  TimerReset,
  Utensils,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import homeSceneBackground from "../assets/figma/home-option2/home-scene-v3.png";
import homeMascotStill from "../assets/figma/home-option2/home-mascot-v5.png";
import pullRefreshMascot from "../assets/mascot/animated/loading-pull-refresh.webp";
import healthDietIcon from "../assets/figma/option-two-icons/diet.svg";
import healthExerciseIcon from "../assets/figma/option-two-icons/exercise.svg";
import healthFaceIcon from "../assets/figma/option-two-icons/face.svg";
import healthFocusIcon from "../assets/figma/option-two-icons/focus.svg";
import healthMoodIcon from "../assets/figma/option-two-icons/mood.svg";
import healthSleepIcon from "../assets/figma/option-two-icons/sleep.svg";
import { useLocale } from "../i18n";
import AnimatedNumber from "../components/AnimatedNumber";
import ModuleProgressRing from "../components/ModuleProgressRing";
import { SkeletonBlock } from "../components/PageSkeleton";
import InteractiveMascot from "../components/InteractiveMascot";
import MascotImage from "../components/MascotImage";
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
import {
  HOME_WIDGET_SLOT_COUNT,
  buildHomeWidgetPresentation,
  defaultHomeWidgetLayout,
  homeWidgetIdsFromLayout,
  homeWidgetLayoutFromIds,
  hydrateHomeWidgetLayout,
  loadHomeWidgetLayout,
  moveHomeWidgetByDirection,
  placeHomeWidgetInSlot,
  saveHomeWidgetLayout,
  type HomeWidgetDirection,
  type HomeWidgetId,
  type HomeWidgetSlot,
} from "../services/homeWidgets";
import { syncContextualNotifications, type NavaNotificationItem, type NavaNotificationTarget } from "../services/notifications";
import type { TodaySnapshot, TrendBundle } from "../types";
import type { RecordModule } from "./RecordsScreen";
import HomeCalendarExperience from "./HomeCalendarExperience";
import AdvancedProfileScreen from "./AdvancedProfileScreen";
import NotificationCenter from "./NotificationCenter";
import ReminderSettingsPage from "./ReminderSettingsPage";
import HomeWidgetEditor from "./HomeWidgetEditor";
import PointsShopExperience from "./PointsShopExperience";

const healthEntries: Array<{
  id: RecordModule;
  labelKey: "records.exercise" | "records.diet" | "records.sleep" | "records.faceShort" | "records.focus" | "records.mood";
  className: string;
  icon: string;
}> = [
  { id: "exercise", labelKey: "records.exercise", className: "exercise", icon: healthExerciseIcon },
  { id: "diet", labelKey: "records.diet", className: "diet", icon: healthDietIcon },
  { id: "sleep", labelKey: "records.sleep", className: "sleep", icon: healthSleepIcon },
  { id: "face", labelKey: "records.faceShort", className: "face", icon: healthFaceIcon },
  { id: "focus", labelKey: "records.focus", className: "focus", icon: healthFocusIcon },
  { id: "mood", labelKey: "records.mood", className: "mood", icon: healthMoodIcon },
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

const HOME_WIDGET_LONG_PRESS_MS = 440;
const HOME_WIDGET_PRESS_SLOP = 10;

type HomeWidgetPress = {
  id: HomeWidgetId;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  targetSlot: number;
  active: boolean;
};

type HomeWidgetDragVisual = {
  id: HomeWidgetId;
  deltaX: number;
  deltaY: number;
  targetSlot: number;
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
  const [widgetLayout, setWidgetLayout] = useState<HomeWidgetSlot[]>(() => loadHomeWidgetLayout(user.id));
  const [widgetArrangeMode, setWidgetArrangeMode] = useState(false);
  const [widgetDrag, setWidgetDrag] = useState<HomeWidgetDragVisual | null>(null);
  const [widgetAnnouncement, setWidgetAnnouncement] = useState("");
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [guidanceVariantSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  const [guidanceEligible] = useState(showInitialGuidance);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const widgetPressRef = useRef<HomeWidgetPress | null>(null);
  const widgetLongPressTimerRef = useRef<number | null>(null);
  const widgetIgnoreClickUntilRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const widgetIds = homeWidgetIdsFromLayout(widgetLayout);

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

  const refreshFromPull = async () => {
    if (loading || pullRefreshing) return;
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      setPullRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void hydrateHomeWidgetLayout(user.id)
      .then((layout) => { if (active) setWidgetLayout(layout); })
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

  useEffect(() => () => {
    if (widgetLongPressTimerRef.current !== null) window.clearTimeout(widgetLongPressTimerRef.current);
  }, []);

  useEffect(() => {
    if (!widgetArrangeMode) return;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setWidgetArrangeMode(false);
      setWidgetDrag(null);
      widgetPressRef.current = null;
      setWidgetAnnouncement(locale === "zh" ? "已退出首页编辑" : "Home editing ended");
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [locale, widgetArrangeMode]);

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
  const homeGuidance = snapshot ? buildHomeGuidance(snapshot, localHour, locale, guidanceVariantSeed) : null;
  const phase = homeGuidance?.phase ?? homeDayPhase(localHour);

  if (view === "calendar" || view?.startsWith("day-")) {
    return <HomeCalendarExperience user={user} deviceDate={deviceDate} view={view} onOpenDate={(date) => onViewChange(`day-${date}`)} onBack={onBack} />;
  }

  if (view === "profile-details") {
    return <AdvancedProfileScreen user={user} onBack={() => onBack(null)} onChanged={onChanged} />;
  }

  if (view === "notifications") {
    return <NotificationCenter userId={user.id} items={notifications} locale={locale} onBack={() => onBack(null)} onOpenSettings={() => onViewChange("reminder-settings")} onOpenTarget={onOpenNotificationTarget} />;
  }
  if (view === "reminder-settings") return <ReminderSettingsPage userId={user.id} locale={locale} onBack={() => onBack("notifications")} />;

  if (view === "home-widgets") {
    return <HomeWidgetEditor
      locale={locale}
      initialIds={widgetIds}
      onCancel={() => onBack(null)}
      onSave={(ids) => {
        setWidgetLayout(saveHomeWidgetLayout(user.id, homeWidgetLayoutFromIds(ids)));
        onBack(null);
      }}
    />;
  }

  if (view === "points-shop" || view === "points-shop-cart" || view?.startsWith("points-shop-product-")) {
    return <PointsShopExperience user={user} view={view} onViewChange={(nextView) => onViewChange(nextView)} onBack={() => onBack(null)} />;
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

  const clearWidgetLongPress = () => {
    if (widgetLongPressTimerRef.current === null) return;
    window.clearTimeout(widgetLongPressTimerRef.current);
    widgetLongPressTimerRef.current = null;
  };

  const nearestWidgetSlot = (clientX: number, clientY: number) => {
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    document.querySelectorAll<HTMLElement>("[data-home-widget-slot]").forEach((slot) => {
      const box = slot.getBoundingClientRect();
      const distance = Math.hypot(clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2));
      if (distance >= nearestDistance) return;
      nearestDistance = distance;
      nearest = Number(slot.dataset.homeWidgetSlot);
    });
    return nearest;
  };

  const activateWidgetDrag = (press: HomeWidgetPress) => {
    if (widgetPressRef.current !== press) return;
    press.active = true;
    clearWidgetLongPress();
    setHealthMenuOpen(false);
    setShortcutsOpen(false);
    setWidgetArrangeMode(true);
    setWidgetDrag({ id: press.id, deltaX: 0, deltaY: 0, targetSlot: press.targetSlot });
    widgetIgnoreClickUntilRef.current = Date.now() + 600;
    setWidgetAnnouncement(locale === "zh" ? `正在移动${homeWidgetLabels[press.id].zh}，拖到高亮位置后松手` : `Moving ${homeWidgetLabels[press.id].en}. Drag to a highlighted position and release.`);
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);
  };

  const beginWidgetPress = (event: ReactPointerEvent<HTMLButtonElement>, id: HomeWidgetId, slot: number) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    clearWidgetLongPress();
    const press: HomeWidgetPress = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      targetSlot: slot,
      active: false,
    };
    widgetPressRef.current = press;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (widgetArrangeMode) activateWidgetDrag(press);
    else widgetLongPressTimerRef.current = window.setTimeout(() => activateWidgetDrag(press), HOME_WIDGET_LONG_PRESS_MS);
  };

  const moveWidgetPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = widgetPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    const deltaX = event.clientX - press.startX;
    const deltaY = event.clientY - press.startY;
    if (!press.active) {
      if (Math.hypot(deltaX, deltaY) > HOME_WIDGET_PRESS_SLOP) clearWidgetLongPress();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const targetSlot = nearestWidgetSlot(event.clientX, event.clientY);
    if (targetSlot >= 0) press.targetSlot = targetSlot;
    setWidgetDrag({ id: press.id, deltaX, deltaY, targetSlot: press.targetSlot });
  };

  const finishWidgetPress = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const press = widgetPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    clearWidgetLongPress();
    widgetPressRef.current = null;
    if (!press.active) return;
    event.preventDefault();
    event.stopPropagation();
    widgetIgnoreClickUntilRef.current = Date.now() + 500;
    setWidgetDrag(null);
    if (cancelled) {
      setWidgetAnnouncement(locale === "zh" ? "已取消本次移动" : "Move cancelled");
      return;
    }
    const next = placeHomeWidgetInSlot(widgetLayout, press.id, press.targetSlot);
    setWidgetLayout(saveHomeWidgetLayout(user.id, next));
    const label = homeWidgetLabels[press.id][locale];
    setWidgetAnnouncement(locale === "zh" ? `${label}已放到第 ${press.targetSlot + 1} 个位置` : `${label} moved to position ${press.targetSlot + 1}`);
  };

  const finishWidgetArrange = () => {
    clearWidgetLongPress();
    widgetPressRef.current = null;
    setWidgetDrag(null);
    setWidgetArrangeMode(false);
    widgetIgnoreClickUntilRef.current = Date.now() + 250;
    setWidgetAnnouncement(locale === "zh" ? "首页组件位置已保存" : "Home widget positions saved");
  };

  const handleWidgetKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: HomeWidgetId) => {
    if (!widgetArrangeMode && event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      setHealthMenuOpen(false);
      setShortcutsOpen(false);
      setWidgetArrangeMode(true);
      setWidgetAnnouncement(locale === "zh" ? "已进入首页编辑，使用方向键移动组件" : "Home editing started. Use arrow keys to move widgets.");
      return;
    }
    if (!widgetArrangeMode) return;
    const directions: Partial<Record<string, HomeWidgetDirection>> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = moveHomeWidgetByDirection(widgetLayout, id, direction);
    setWidgetLayout(saveHomeWidgetLayout(user.id, next));
    const slot = next.indexOf(id);
    setWidgetAnnouncement(locale === "zh" ? `${homeWidgetLabels[id].zh}已移动到第 ${slot + 1} 个位置` : `${homeWidgetLabels[id].en} moved to position ${slot + 1}`);
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
    if (isVerticalHomeSwipe(gesture.startX, gesture.startY, endX, endY, window.innerHeight, "down")) {
      if (healthMenuOpen) setHealthMenuOpen(false);
      else if (!widgetArrangeMode && gesture.startY < Math.max(140, window.innerHeight * .25)) {
        ignoreClickUntilRef.current = Date.now() + 450;
        void refreshFromPull();
      }
    }
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

  const handleHomeClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (widgetArrangeMode) {
      const functionalTarget = target.closest("button, a, input, select, textarea, [role='button'], [role='link']");
      if (!functionalTarget) {
        event.preventDefault();
        finishWidgetArrange();
        return;
      }
    }
    dismissHealthMenuOutside(event);
  };

  return (
    <section
      className={["option-two-home", `home-phase-${phase}`, healthMenuOpen ? "is-health-menu-open" : "", widgetArrangeMode ? "is-widget-arranging" : "", shortcutsOpen ? "shortcuts-open" : "shortcuts-collapsed", snapshot ? "is-loaded" : ""].filter(Boolean).join(" ")}
      onPointerDown={beginHomeGesture}
      onPointerMove={moveHomeGesture}
      onPointerUp={endHomeGesture}
      onPointerCancel={() => { gestureRef.current = null; }}
      onClickCapture={handleHomeClickCapture}
      data-health-menu-open={healthMenuOpen}
      data-home-phase={phase}
      data-home-guidance={homeGuidance?.reason ?? "loading"}
      data-home-widget-arranging={widgetArrangeMode}
    >
      <img
        className="option-two-scene-background"
        src={homeSceneBackground}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
      />
      {pullRefreshing && <div className="option-two-pull-refresh" role="status" aria-label={locale === "zh" ? "正在刷新今日状态" : "Refreshing today's status"}>
        <MascotImage animatedSrc={pullRefreshMascot} staticSrc={homeMascotStill} alt="" aria-hidden="true" />
      </div>}
      <div className="option-two-scores" aria-label={t("today.overview")} aria-live="polite" aria-busy={loading}>
        <div aria-label={`${t("today.rhythm")} ${rhythmScore}`}><EnergyStatusIcon className="option-two-score-icon option-two-score-icon--energy" size={17} /><strong>{loading && snapshot === null ? <SkeletonBlock className="option-two-score-skeleton" /> : <>{typeof rhythmScore === "number" ? <AnimatedNumber value={rhythmScore} /> : rhythmScore}<small>/100</small></>}</strong></div>
        <div aria-label={`${t("today.myPoints")} ${points}`}><PointsStatusIcon className="option-two-score-icon option-two-score-icon--points" size={18} /><strong>{loading && totalPoints === null ? <SkeletonBlock className="option-two-score-skeleton" /> : typeof points === "number" ? <AnimatedNumber value={points} duration={760} /> : points}</strong></div>
      </div>

      <div className={["option-two-side-actions", shortcutsOpen ? "is-open" : "is-collapsed"].join(" ")}>
        <button className="option-two-menu-toggle" type="button" onClick={() => setShortcutsOpen((open) => !open)} aria-expanded={shortcutsOpen} aria-label={shortcutsOpen ? (locale === "zh" ? "收起快捷入口" : "Collapse shortcuts") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")} title={shortcutsOpen ? (locale === "zh" ? "收起快捷入口" : "Collapse shortcuts") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")}>
          <MenuReferenceIcon size={23} />
        </button>
        <button className="option-two-side-shortcut" type="button" onClick={() => { setShortcutsOpen(false); onViewChange("calendar"); }} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "健康月历" : "Health calendar"} title={locale === "zh" ? "健康月历" : "Health calendar"}><CalendarDays size={23} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={() => { setShortcutsOpen(false); onViewChange("profile-details"); }} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "详细资料设置" : "Detailed profile"} title={locale === "zh" ? "详细资料设置" : "Detailed profile"}><UsersRound size={24} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={() => { setShortcutsOpen(false); onViewChange("points-shop"); }} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "积分商城" : "Points store"} title={locale === "zh" ? "积分商城" : "Points store"}><ShoppingCart size={22} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={() => { setShortcutsOpen(false); onOpenUtility(); }} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "功能导航" : "Utilities"} title={locale === "zh" ? "功能导航" : "Utilities"}><Wrench size={22} /></button>
        <button className="option-two-side-shortcut option-two-side-notifications" type="button" onClick={() => { setShortcutsOpen(false); onViewChange("notifications"); }} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "消息通知" : "Notifications"} title={locale === "zh" ? "消息通知" : "Notifications"}>
          <Bell size={22} />
          {notifications.some((item) => !item.readAt) && <span className="option-two-menu-unread" aria-hidden="true" />}
        </button>
      </div>

      <section className={["home-widget-grid", widgetIds.length === 0 ? "is-empty" : "", widgetArrangeMode ? "is-arranging" : ""].join(" ")} aria-label={locale === "zh" ? "我的健康小组件" : "My health widgets"} aria-describedby="home-widget-arrange-help" data-widget-count={widgetIds.length}>
        {Array.from({ length: HOME_WIDGET_SLOT_COUNT }, (_, slot) => <span
          className={["home-widget-slot", `home-widget-slot--position-${slot + 1}`, widgetDrag?.targetSlot === slot ? "is-target" : ""].filter(Boolean).join(" ")}
          data-home-widget-slot={slot}
          aria-hidden="true"
          key={`slot-${slot}`}
        />)}
        {(loading && snapshot === null) || forceHomeWidgetSkeleton
          ? (widgetIds.length ? widgetLayout : defaultHomeWidgetLayout()).map((id, slot) => id ? <SkeletonBlock className={`home-widget-skeleton home-widget-skeleton--position-${slot + 1}`} key={`${id}-${slot}`} /> : null)
          : widgetIds.length === 0
            ? <button className="home-widget-empty" type="button" onClick={() => onViewChange("home-widgets")}><HeartPulse size={18} /><span><strong>{locale === "zh" ? "添加关注的小组件" : "Add widgets you care about"}</strong><small>{locale === "zh" ? "最多 6 个" : "Up to 6"}</small></span></button>
            : widgetLayout.map((id, slot) => {
              if (!id) return null;
              const presentation = snapshot ? buildHomeWidgetPresentation(id, snapshot, locale, trends) : null;
              const Icon = homeWidgetIcons[id];
              const label = homeWidgetLabels[id][locale];
              const target = homeWidgetTargets[id];
              return <button
                className={["home-health-widget", `home-health-widget--${id}`, `home-health-widget--position-${slot + 1}`, presentation ? `is-${presentation.state}` : "is-missing", widgetDrag?.id === id ? "is-dragging" : ""].filter(Boolean).join(" ")}
                type="button"
                key={id}
                data-home-widget={id}
                data-home-widget-position={slot + 1}
                data-home-widget-dragging={widgetDrag?.id === id}
                onPointerDown={(event) => beginWidgetPress(event, id, slot)}
                onPointerMove={moveWidgetPress}
                onPointerUp={(event) => finishWidgetPress(event)}
                onPointerCancel={(event) => finishWidgetPress(event, true)}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => handleWidgetKeyDown(event, id)}
                onClick={(event) => {
                  if (widgetArrangeMode || Date.now() < widgetIgnoreClickUntilRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  onOpenRecord(target, snapshot ? healthModuleEntryView(moduleProgress[target]) : "editor");
                }}
                aria-keyshortcuts="Shift+Enter"
                aria-label={`${label}${locale === "zh" ? "，" : ", "}${presentation?.core ?? "--"}${locale === "zh" ? "，" : ", "}${presentation?.support ?? (locale === "zh" ? "加载中" : "Loading")}${widgetArrangeMode ? (locale === "zh" ? "，使用方向键移动" : ", use arrow keys to move") : (locale === "zh" ? "，长按可调整位置" : ", touch and hold to arrange")}`}
                style={widgetDrag?.id === id ? { "--home-widget-drag-x": `${widgetDrag.deltaX}px`, "--home-widget-drag-y": `${widgetDrag.deltaY}px` } as CSSProperties : undefined}
              >
                <span><Icon size={26} /><b>{label}</b></span>
                <div className="home-widget-value"><strong>{presentation?.core ?? "--"}</strong><small>{presentation?.support ?? (locale === "zh" ? "加载中" : "Loading")}</small></div>
              </button>;
            })}
        <span className="sr-only" id="home-widget-arrange-help">{locale === "zh" ? "长按组件进入编辑；拖动到六个高亮槽位之一并松手；轻触任意非功能空白区域即可保存并结束编辑。键盘可按 Shift 加回车进入编辑，再用方向键移动，按 Escape 完成。" : "Touch and hold a widget to edit, then drag it to one of six highlighted slots and release. Tap any non-interactive empty area to save and finish editing. With a keyboard, press Shift+Enter, use the arrow keys to move, and press Escape to finish."}</span>
        <span className="sr-only" aria-live="polite">{widgetAnnouncement}</span>
      </section>

      {homeGuidance && guidanceEligible && !guidanceDismissed && (
        <button className="option-two-guidance" type="button" aria-live="polite" data-guidance-reason={homeGuidance.reason} data-guidance-phase={homeGuidance.phase} onClick={() => homeGuidance.actions[0] && onOpenNotificationTarget(homeGuidance.actions[0].target)}>
          <p>{homeGuidance.message}</p>
        </button>
      )}

      <div className="option-two-life-stage">
        <span className="option-two-aura" aria-hidden="true" />
        <InteractiveMascot locale={locale} preferredMotion={homeGuidance?.motion} positiveMood={(snapshot?.mood?.mood_score ?? 0) >= 75} />
      </div>

      <div className="option-two-health-menu" aria-hidden={!healthMenuOpen}>
        <span className="option-two-health-disc" aria-hidden="true" />
        {healthEntries.map(({ id, labelKey, className, icon }, index) => {
          const progress = moduleProgress[id];
          const progressLabel = healthModuleProgressLabel(progress, locale);
          const accessibleLabel = `${t(labelKey)}${locale === "zh" ? "，" : ". "}${progressLabel}`;
          return (
          <button
            className={[`option-two-health-entry option-two-health-entry--${className}`, progress.completed ? "is-complete" : progress.recorded ? "is-partial" : "is-empty"].join(" ")}
            key={id}
            type="button"
            onClick={() => onOpenRecord(id, healthModuleEntryView(progress))}
            data-health-module={id}
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
              data-health-icon={id}
            />
            <Check className="option-two-health-complete-icon" size={30} strokeWidth={3.2} aria-hidden="true" />
          </button>
          );
        })}
      </div>

    </section>
  );
}
