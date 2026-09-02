import type { User } from "@supabase/supabase-js";
import {
  CalendarDays,
  ListTodo,
  Menu,
  UsersRound,
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
import InteractiveMascot from "../components/InteractiveMascot";
import { loadGrowthTotalPoints } from "../services/productivity";
import { getTodaySnapshot } from "../services/records";
import { isVerticalHomeSwipe } from "../services/homeExperience";
import type { TodaySnapshot } from "../types";
import type { RecordModule } from "./RecordsScreen";
import HomeCalendarExperience from "./HomeCalendarExperience";
import AdvancedProfileScreen from "./AdvancedProfileScreen";

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
}: {
  user: User;
  refreshKey: number;
  deviceDate: string;
  view: string | null;
  onOpenRecord: (module?: RecordModule) => void;
  onOpenUtility: () => void;
  onViewChange: (view: string | null, replace?: boolean) => void;
  onBack: (fallbackView: string | null) => void;
  onChanged: () => void;
}) {
  const { locale, t } = useLocale();
  const [shortcutsOpen, setShortcutsOpen] = useState(true);
  const [healthMenuOpen, setHealthMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const refreshRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    const [snapshotResult, pointsResult] = await Promise.allSettled([
      getTodaySnapshot(user.id),
      loadGrowthTotalPoints(user.id),
    ]);

    if (requestId !== refreshRequestRef.current) return;
    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
    } else {
      console.warn("Unable to load the option-two home snapshot", snapshotResult.reason);
    }

    if (pointsResult.status === "fulfilled") {
      setTotalPoints(pointsResult.value);
    } else {
      console.warn("Unable to load the option-two points total", pointsResult.reason);
    }
  }, [user.id]);

  useEffect(() => {
    void refresh();
    return () => {
      refreshRequestRef.current += 1;
    };
  }, [refresh, refreshKey]);

  const rhythmScore = snapshot?.rhythmScore ?? "--";
  const points = totalPoints ?? "--";

  if (view === "calendar" || view?.startsWith("day-")) {
    return <HomeCalendarExperience user={user} deviceDate={deviceDate} view={view} onOpenDate={(date) => onViewChange(`day-${date}`)} onBack={onBack} />;
  }

  if (view === "profile-details") {
    return <AdvancedProfileScreen user={user} onBack={() => onBack(null)} onChanged={onChanged} />;
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
      className={["option-two-home", healthMenuOpen ? "is-health-menu-open" : "", shortcutsOpen ? "shortcuts-open" : "shortcuts-collapsed", snapshot ? "is-loaded" : ""].filter(Boolean).join(" ")}
      onPointerDown={beginHomeGesture}
      onPointerMove={moveHomeGesture}
      onPointerUp={endHomeGesture}
      onPointerCancel={() => { gestureRef.current = null; }}
      onClickCapture={dismissHealthMenuOutside}
      data-health-menu-open={healthMenuOpen}
    >
      <div className="option-two-scores" aria-label={t("today.overview")} aria-live="polite">
        <div><span>{t("today.rhythm")}</span><strong>{typeof rhythmScore === "number" ? <AnimatedNumber value={rhythmScore} /> : rhythmScore}</strong></div>
        <div><span>{t("today.myPoints")}</span><strong>{typeof points === "number" ? <AnimatedNumber value={points} duration={760} /> : points}</strong></div>
      </div>

      <div className={["option-two-side-actions", shortcutsOpen ? "is-open" : "is-collapsed"].join(" ")}>
        <button className="option-two-menu-toggle" type="button" onClick={() => setShortcutsOpen((value) => !value)} aria-expanded={shortcutsOpen} aria-label={shortcutsOpen ? (locale === "zh" ? "收起快捷入口" : "Collapse shortcuts") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")} title={shortcutsOpen ? (locale === "zh" ? "收起快捷入口" : "Collapse shortcuts") : (locale === "zh" ? "展开快捷入口" : "Expand shortcuts")}>
          <Menu size={23} />
        </button>
        <button className="option-two-side-shortcut" type="button" onClick={() => onViewChange("calendar")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "健康月历" : "Health calendar"} title={locale === "zh" ? "健康月历" : "Health calendar"}><CalendarDays size={23} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={() => onViewChange("profile-details")} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "详细资料设置" : "Detailed profile"} title={locale === "zh" ? "详细资料设置" : "Detailed profile"}><UsersRound size={24} /></button>
        <button className="option-two-side-shortcut" type="button" onClick={onOpenUtility} tabIndex={shortcutsOpen ? 0 : -1} aria-hidden={!shortcutsOpen} aria-label={locale === "zh" ? "功能导航" : "Utilities"} title={locale === "zh" ? "功能导航" : "Utilities"}><ListTodo size={23} /></button>
      </div>

      <div className="option-two-life-stage">
        <span className="option-two-aura" aria-hidden="true" />
        <InteractiveMascot locale={locale} />
      </div>

      <div className="option-two-health-menu" aria-hidden={!healthMenuOpen}>
        <span className="option-two-health-disc" aria-hidden="true" />
        {healthEntries.map(({ id, icon, labelKey, className }, index) => (
          <button
            className={`option-two-health-entry option-two-health-entry--${className}`}
            key={id}
            type="button"
            onClick={() => onOpenRecord(id)}
            tabIndex={healthMenuOpen ? 0 : -1}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            style={{ "--option-entry-index": index } as CSSProperties}
          >
            <img
              className={`option-two-health-icon option-two-health-icon--${className}`}
              src={icon}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </button>
        ))}
      </div>

    </section>
  );
}
