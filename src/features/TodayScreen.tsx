import type { User } from "@supabase/supabase-js";
import { Activity, Apple, BedDouble, Brain, Flame, Moon, RefreshCw, SmilePlus, Watch } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { useLocale, type TranslationKey } from "../i18n";
import { minutesToText } from "../services/date";
import { getTodaySnapshot } from "../services/records";
import { getNativeTodaySummary, isNativeHealthAvailable, syncNativeHealthNow } from "../services/health";
import { publishWatchSnapshot } from "../services/watch";
import type { TodaySnapshot } from "../types";

function rhythmModelLabel(modelVersion?: string | null) {
  const match = modelVersion?.match(/v(\d+(?:\.\d+)?)/i);
  return match ? `ChronoState V${match[1]}` : "离线估算";
}

const factorLabelKeys: Record<string, TranslationKey> = {
  压力: "records.factor.pressure",
  睡眠: "records.factor.sleep",
  运动: "records.factor.exercise",
  饮食: "records.factor.diet",
  工作: "records.factor.work",
  社交: "records.factor.social",
  身体不适: "records.factor.body",
  天气: "records.factor.weather",
};

const demoNextActionZh = "今天基础节律稳定，晚间减少屏幕刺激，保持 23:30 前入睡。";

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
  const nextAction = snapshot?.nextAction === demoNextActionZh ? t("today.demoNextAction") : snapshot?.nextAction;
  const moodDetail = snapshot?.mood?.factors?.length
    ? snapshot.mood.factors.map((factor) => (factorLabelKeys[factor] ? t(factorLabelKeys[factor]) : factor)).join(" / ")
    : t("today.notRecorded");

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
          rhythmScore: today.rhythmScore,
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

  return (
    <div className="stack">
      <section className="today-hero">
        <div className="hero-copy">
          <p className="eyebrow">{t("today.rhythm")}</p>
          <div>
            <strong>{snapshot?.rhythmScore ?? "--"}</strong>
            <span>/ 100</span>
          </div>
          <p className="algorithm-meta">
            {snapshot?.rhythmScoreLower != null && snapshot.rhythmScoreUpper != null
              ? t("today.range", { lower: snapshot.rhythmScoreLower, upper: snapshot.rhythmScoreUpper })
              : t("today.waitRange")}
            {snapshot?.rhythmConfidence != null ? ` · ${t("today.confidence", { value: Math.round(snapshot.rhythmConfidence * 100) })}` : ""}
          </p>
        </div>
        <div className="ring" style={{ "--score": `${snapshot?.rhythmScore ?? 0}%` } as CSSProperties}>
          <Activity size={28} />
        </div>
      </section>

      <div className="algorithm-strip" aria-label="算法状态">
        <div><span>{t("today.model")}</span><strong>{rhythmModelLabel(snapshot?.rhythmModelVersion)}</strong></div>
        <div><span>{t("today.dataQuality")}</span><strong>{snapshot?.rhythmDataQuality ?? "--"}</strong></div>
        <div><span>{t("today.sevenDayTrend")}</span><strong>{snapshot?.rhythmTrendSlope == null ? "--" : `${snapshot.rhythmTrendSlope >= 0 ? "+" : ""}${snapshot.rhythmTrendSlope.toFixed(1)}`}</strong></div>
      </div>

      <SectionCard
        title={t("today.next")}
        subtitle={snapshot?.date}
        action={<StatusPill tone={isNativeHealthAvailable() ? "good" : "warn"}>{isNativeHealthAvailable() ? t("today.realDevice") : t("today.preview")}</StatusPill>}
      >
        <p className="recommendation">{nextAction}</p>
        <div className="button-row">
          <ActionButton icon={<RefreshCw size={18} />} variant="secondary" onClick={refresh} disabled={loading}>
            {t("today.refresh")}
          </ActionButton>
          <ActionButton icon={<Apple size={18} />} onClick={syncHealth} disabled={syncing}>
            {syncing ? t("today.syncing") : t("today.syncHealth")}
          </ActionButton>
        </div>
        {error && <p className="error-text">{error}</p>}
      </SectionCard>

      <div className="metric-grid">
        <MetricCard
          label={t("today.sleep")}
          value={minutesToText(snapshot?.sleep?.sleep_duration_minutes, locale)}
          detail={snapshot?.sleep?.rhythm_score != null ? `${t("today.rhythm")} ${snapshot.sleep.rhythm_score}` : t("today.notRecorded")}
          icon={<BedDouble size={18} />}
        />
        <MetricCard
          label={t("today.exercise")}
          value={(snapshot?.exercise?.steps ?? nativeSteps ?? 0).toLocaleString(locale === "en" ? "en-US" : "zh-CN")}
          detail={`${snapshot?.exercise?.calories ?? 0} kcal · ${minutesToText(snapshot?.exercise?.exercise_minutes, locale)}`}
          icon={<Flame size={18} />}
        />
        <MetricCard
          label={t("today.mood")}
          value={snapshot?.mood?.mood_score ?? "--"}
          detail={moodDetail}
          icon={<SmilePlus size={18} />}
        />
        <MetricCard
          label={t("today.focus")}
          value={minutesToText(snapshot?.focusMinutes, locale)}
          detail={t("today.session", { count: snapshot?.focusSessions ?? 0 })}
          icon={<Brain size={18} />}
        />
      </div>

      <SectionCard title={t("today.data")}>
        <div className="timeline-list">
          <div>
            <Moon size={18} />
            <span>{snapshot?.sleep ? t("today.sleepDone") : t("today.sleepMissing")}</span>
          </div>
          <div>
            <SmilePlus size={18} />
            <span>{snapshot?.mood ? t("today.moodDone") : t("today.moodMissing")}</span>
          </div>
          <div>
            <Watch size={18} />
            <span>{t("today.watchReady")}</span>
          </div>
        </div>
        <ActionButton icon={<SmilePlus size={18} />} variant="secondary" onClick={onOpenRecord}>
          {t("today.writeRecord")}
        </ActionButton>
      </SectionCard>
    </div>
  );
}
