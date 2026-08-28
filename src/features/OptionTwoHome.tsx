import type { User } from "@supabase/supabase-js";
import {
  CalendarDays,
  ChevronUp,
  ListTodo,
  Menu,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
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
import type { TodaySnapshot } from "../types";
import type { RecordModule } from "./RecordsScreen";

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
  onOpenRecord,
  onOpenAi,
  onOpenUtility,
}: {
  user: User;
  refreshKey: number;
  onOpenRecord: (module?: RecordModule) => void;
  onOpenAi: () => void;
  onOpenUtility: () => void;
}) {
  const { locale, t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [snapshotResult, pointsResult] = await Promise.allSettled([
      getTodaySnapshot(user.id),
      loadGrowthTotalPoints(user.id),
    ]);

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
  }, [refresh, refreshKey]);

  const rhythmScore = snapshot?.rhythmScore ?? "--";
  const points = totalPoints ?? "--";

  return (
    <section className={["option-two-home", expanded ? "is-expanded" : "", snapshot ? "is-loaded" : ""].filter(Boolean).join(" ")}>
      <div className="option-two-scores" aria-label={t("today.overview")} aria-live="polite">
        <div><span>{t("today.rhythm")}</span><strong>{typeof rhythmScore === "number" ? <AnimatedNumber value={rhythmScore} /> : rhythmScore}</strong></div>
        <div><span>{t("today.myPoints")}</span><strong>{typeof points === "number" ? <AnimatedNumber value={points} duration={760} /> : points}</strong></div>
      </div>

      <div className="option-two-side-actions">
        <button className="option-two-menu-toggle" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? t("common.close") : t("today.overview")} title={expanded ? t("common.close") : t("today.overview")}>
          {expanded ? <ChevronUp size={23} /> : <Menu size={23} />}
        </button>
        <button type="button" onClick={() => onOpenRecord()} aria-label={t("tabs.record")} title={t("tabs.record")}><CalendarDays size={23} /></button>
        <button type="button" onClick={onOpenAi} aria-label={t("tabs.ai")} title={t("tabs.ai")}><UsersRound size={24} /></button>
        <button type="button" onClick={onOpenUtility} aria-label={locale === "zh" ? "功能导航" : "Utilities"} title={locale === "zh" ? "功能导航" : "Utilities"}><ListTodo size={23} /></button>
      </div>

      <div className="option-two-life-stage">
        <span className="option-two-aura" aria-hidden="true" />
        <InteractiveMascot locale={locale} />
      </div>

      <div className="option-two-health-menu" aria-hidden={!expanded}>
        {healthEntries.map(({ id, icon, labelKey, className }, index) => (
          <button
            className={`option-two-health-entry option-two-health-entry--${className}`}
            key={id}
            type="button"
            onClick={() => onOpenRecord(id)}
            tabIndex={expanded ? 0 : -1}
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
