import type { User } from "@supabase/supabase-js";
import { Activity, BedDouble, Brain, Check, CircleDashed, Flame, HeartPulse, Moon, RefreshCw, ScanFace, SmilePlus, Utensils, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import AnimatedNumber from "../components/AnimatedNumber";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { useLocale, type TranslationKey } from "../i18n";
import { minutesToText } from "../services/date";
import { getTodaySnapshot } from "../services/records";
import { getNativeTodaySummary, syncNativeHealthNow } from "../services/health";
import { publishWatchSnapshot } from "../services/watch";
import type { TodaySnapshot } from "../types";

function rhythmStateKey(score?: number | null): TranslationKey {
  if (score == null) return "today.stateWaiting";
  if (score >= 80) return "today.stateSteady";
  if (score >= 65) return "today.stateBalancing";
  return "today.stateRecovery";
}

const demoNextActionZh = "今日节律保持稳定，晚间减少连续屏幕刺激，睡前留出安静的放松时间，并尽量在 23:30 前入睡。";

export default function TodayScreen({
  user,
  refreshKey,
  onOpenRecord,
}: {
  user: User;
  refreshKey: number;
  onOpenRecord: () => void;
}) {
  const { locale, t } = useLocale();
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [nativeSteps, setNativeSteps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rhythmDetailsOpen, setRhythmDetailsOpen] = useState(false);
  const nextAction = snapshot?.nextAction === demoNextActionZh ? t("today.demoNextAction") : snapshot?.nextAction;
  const recommendation = t("today.adviceCompact", { action: nextAction ?? t("today.adviceWaiting") });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [today, native] = await Promise.all([getTodaySnapshot(user.id), getNativeTodaySummary()]);
      setSnapshot(today);
      setNativeSteps(native?.steps ?? null);
      await publishWatchSnapshot({
        userId: user.id,
        displayName: user.email ?? undefined,
        today: {
          rhythmScore: today.rhythmScore ?? undefined,
          sleepScore: today.sleep?.rhythm_score ?? undefined,
          steps: today.exercise?.steps ?? native?.steps ?? undefined,
          activeCalories: today.exercise?.calories ?? native?.activeEnergyKcal ?? undefined,
          mood: today.mood?.mood_score ?? undefined,
          focusMinutes: today.focusMinutes,
        },
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user.email, user.id]);

  async function syncHealth() {
    setSyncing(true);
    setError(null);
    try {
      await syncNativeHealthNow(user.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  if (loading && !snapshot) {
    return (
      <div className="stack">
        <div className="skeleton hero-skeleton" />
        <div className="metric-grid">
          <div className="skeleton metric-skeleton" />
          <div className="skeleton metric-skeleton" />
        </div>
      </div>
    );
  }

  const todayDataStates = [
    {
      id: "sleep",
      label: t("today.sleep"),
      ready: Boolean(snapshot?.sleep),
      icon: <Moon size={17} />,
    },
    {
      id: "exercise",
      label: t("today.exercise"),
      ready: Boolean(snapshot?.exercise) || nativeSteps != null,
      icon: <Flame size={17} />,
    },
    {
      id: "mood",
      label: t("today.mood"),
      ready: Boolean(snapshot?.mood),
      icon: <SmilePlus size={17} />,
    },
    {
      id: "diet",
      label: t("records.diet"),
      ready: Boolean(snapshot?.nutrition),
      icon: <Utensils size={17} />,
    },
    {
      id: "focus",
      label: t("records.focus"),
      ready: Boolean(snapshot?.focusSessions || snapshot?.focusMinutes),
      icon: <Brain size={17} />,
    },
    {
      id: "face",
      label: t("records.face"),
      ready: Boolean(snapshot?.face),
      icon: <ScanFace size={17} />,
    },
  ];
  const readyDataCount = todayDataStates.filter((item) => item.ready).length;

  return (
    <div className="stack today-stack">
      <section className="today-hero">
        <div className="hero-copy">
          <p className="eyebrow">{t("today.rhythm")}</p>
          <div>
            <strong>{snapshot?.rhythmScore == null ? "--" : <AnimatedNumber value={snapshot.rhythmScore} />}</strong>
            <span>/ 100</span>
          </div>
        </div>
        <button
          className="ring rhythm-detail-trigger"
          type="button"
          aria-label={t("today.rhythmDetails")}
          title={t("today.rhythmDetails")}
          onClick={() => setRhythmDetailsOpen(true)}
          style={{ "--score": `${snapshot?.rhythmScore ?? 0}%` } as CSSProperties}
        >
          <Activity size={28} />
        </button>
      </section>

      <div className="today-advice">
        <SectionCard
          title={t("today.next")}
          action={(
            <div className="section-icon-actions">
              <button
                className="section-icon-action"
                type="button"
                aria-label={t("today.refresh")}
                title={t("today.refresh")}
                onClick={refresh}
                disabled={loading}
              >
                <RefreshCw className={loading ? "spin" : undefined} size={20} />
              </button>
              <button
                className="section-icon-action"
                type="button"
                aria-label={t("today.syncHealth")}
                title={t("today.syncHealth")}
                onClick={syncHealth}
                disabled={syncing}
              >
                <HeartPulse className={syncing ? "spin" : undefined} size={21} />
              </button>
            </div>
          )}
        >
          <p className="recommendation">{recommendation}</p>
          {error && <p className="error-text">{error}</p>}
        </SectionCard>
      </div>

      <div className="metric-grid today-metric-grid">
        <MetricCard
          className="today-compact-metric"
          label={t("today.sleep")}
          value={snapshot?.sleep?.sleep_duration_minutes ? <AnimatedNumber value={snapshot.sleep.sleep_duration_minutes} formatter={(value) => minutesToText(Math.round(value), locale)} /> : "--"}
          icon={<BedDouble size={18} />}
        />
        <MetricCard
          className="today-compact-metric"
          label={t("today.exercise")}
          value={(snapshot?.exercise?.steps ?? nativeSteps) == null ? "--" : <AnimatedNumber value={snapshot?.exercise?.steps ?? nativeSteps ?? 0} formatter={(value) => Math.round(value).toLocaleString(locale === "en" ? "en-US" : "zh-CN")} />}
          icon={<Flame size={18} />}
        />
        <MetricCard
          className="today-compact-metric"
          label={t("today.mood")}
          value={snapshot?.mood?.mood_score == null ? "--" : <AnimatedNumber value={snapshot.mood.mood_score} />}
          icon={<SmilePlus size={18} />}
        />
        <MetricCard
          className="today-compact-metric"
          label={t("today.focus")}
          value={snapshot?.focusMinutes ? <AnimatedNumber value={snapshot.focusMinutes} formatter={(value) => minutesToText(Math.round(value), locale)} /> : "--"}
          icon={<Brain size={18} />}
        />
      </div>

      <div className="today-data-section">
        <SectionCard
          title={t("today.data")}
          action={<StatusPill tone={readyDataCount === todayDataStates.length ? "good" : "warn"}>{t("today.dataProgress", { ready: readyDataCount, total: todayDataStates.length })}</StatusPill>}
        >
          <div className="today-data-grid">
            {todayDataStates.map((item) => (
              <div className={["today-data-item", item.ready ? "ready" : "pending"].join(" ")} key={item.id}>
                <span className="today-data-icon" aria-hidden="true">{item.icon}</span>
                <span className="today-data-copy">
                  <strong>{item.label}</strong>
                  <small>{item.ready ? t("today.recorded") : t("today.missing")}</small>
                </span>
                <span className="today-data-check" aria-hidden="true">
                  {item.ready ? <Check size={15} /> : <CircleDashed size={15} />}
                </span>
              </div>
            ))}
          </div>
          <div className="today-data-action">
            <ActionButton icon={<SmilePlus size={18} />} variant="secondary" onClick={onOpenRecord}>
              {t("today.writeRecord")}
            </ActionButton>
          </div>
        </SectionCard>
      </div>

      {rhythmDetailsOpen && (
        <div className="rhythm-detail-overlay" role="presentation" onClick={() => setRhythmDetailsOpen(false)}>
          <section
            className="rhythm-detail-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("today.rhythmDetails")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <h2>{t("today.rhythmDetails")}</h2>
              </div>
              <button
                className="section-icon-action"
                type="button"
                aria-label={t("common.close")}
                title={t("common.close")}
                onClick={() => setRhythmDetailsOpen(false)}
              >
                <X size={21} />
              </button>
            </div>
            <div className="algorithm-strip rhythm-detail-grid" aria-label={t("today.overview")}>
              <div><span>{t("today.state")}</span><strong>{t(rhythmStateKey(snapshot?.rhythmScore))}</strong></div>
              <div><span>{t("today.dataQuality")}</span><strong>{snapshot?.rhythmDataQuality == null ? "--" : `${snapshot.rhythmDataQuality}%`}</strong></div>
              <div><span>{t("today.sevenDayTrend")}</span><strong>{snapshot?.rhythmTrendSlope == null ? "--" : `${snapshot.rhythmTrendSlope >= 0 ? "+" : ""}${snapshot.rhythmTrendSlope.toFixed(1)}`}</strong></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
