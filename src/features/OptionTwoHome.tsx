import type { User } from "@supabase/supabase-js";
import {
  AlarmClock,
  CalendarDays,
  ChevronUp,
  Dumbbell,
  HeartPulse,
  Menu,
  ScanFace,
  ShoppingCart,
  Soup,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import lifeFigure from "../assets/figma/home-option2/raw-01.png";
import { useT } from "../i18n";
import { getTodaySnapshot } from "../services/records";
import type { TodaySnapshot } from "../types";
import type { RecordModule } from "./RecordsScreen";

type HealthEntryIcon = ComponentType<{ size?: string | number }>;

const healthEntries: Array<{
  id: RecordModule;
  icon: HealthEntryIcon;
  labelKey: "records.exercise" | "records.diet" | "records.sleep" | "records.faceShort" | "records.focus" | "records.mood";
  className: string;
}> = [
  { id: "exercise", icon: Dumbbell, labelKey: "records.exercise", className: "exercise" },
  { id: "diet", icon: Soup, labelKey: "records.diet", className: "diet" },
  { id: "sleep", icon: MoonIcon, labelKey: "records.sleep", className: "sleep" },
  { id: "face", icon: ScanFace, labelKey: "records.faceShort", className: "face" },
  { id: "focus", icon: AlarmClock, labelKey: "records.focus", className: "focus" },
  { id: "mood", icon: HeartPulse, labelKey: "records.mood", className: "mood" },
];

function MoonIcon({ size = 26 }: { size?: string | number }) {
  return <span className="option-two-moon" style={{ width: size, height: size }} aria-hidden="true" />;
}

export default function OptionTwoHome({
  user,
  refreshKey,
  onOpenRecord,
  onOpenAi,
  onOpenProfile,
}: {
  user: User;
  refreshKey: number;
  onOpenRecord: (module?: RecordModule) => void;
  onOpenAi: () => void;
  onOpenProfile: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getTodaySnapshot(user.id));
    } catch (error) {
      console.warn("Unable to load the option-two home snapshot", error);
    }
  }, [user.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const rhythmScore = snapshot?.rhythmScore ?? "--";
  const completeness = snapshot?.rhythmDataQuality ?? "--";

  return (
    <section className={["option-two-home", expanded ? "is-expanded" : ""].filter(Boolean).join(" ")}>
      <div className="option-two-scores" aria-label={t("today.overview")}>
        <div><span>{t("today.rhythm")}</span><strong>{rhythmScore}</strong></div>
        <div><span>{t("today.dataQuality")}</span><strong>{completeness}</strong></div>
      </div>

      <div className="option-two-side-actions">
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? t("common.close") : t("today.overview")} title={expanded ? t("common.close") : t("today.overview")}>
          {expanded ? <ChevronUp size={23} /> : <Menu size={23} />}
        </button>
        <button type="button" onClick={() => onOpenRecord()} aria-label={t("tabs.record")} title={t("tabs.record")}><CalendarDays size={23} /></button>
        <button type="button" onClick={onOpenAi} aria-label={t("tabs.ai")} title={t("tabs.ai")}><UsersRound size={24} /></button>
        <button type="button" onClick={onOpenProfile} aria-label={t("tabs.profile")} title={t("tabs.profile")}><ShoppingCart size={23} /></button>
      </div>

      <div className="option-two-life-stage" aria-hidden="true">
        <span className="option-two-aura" />
        <img src={lifeFigure} alt="" />
      </div>

      <div className="option-two-health-menu" aria-hidden={!expanded}>
        {healthEntries.map(({ id, icon: Icon, labelKey, className }) => (
          <button
            className={`option-two-health-entry option-two-health-entry--${className}`}
            key={id}
            type="button"
            onClick={() => onOpenRecord(id)}
            tabIndex={expanded ? 0 : -1}
            aria-label={t(labelKey)}
            title={t(labelKey)}
          >
            <Icon size={27} />
          </button>
        ))}
      </div>

      <button
        className="option-two-collapse-trigger"
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-label={expanded ? t("common.close") : t("today.overview")}
      >
        <ChevronUp size={20} />
      </button>
    </section>
  );
}
