import type { User } from "@supabase/supabase-js";
import { Activity, BedDouble, Brain, Flame, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LineTrendChart from "../components/LineTrendChart";
import AnimatedNumber from "../components/AnimatedNumber";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { useLocale } from "../i18n";
import { minutesToText, rollingDateWindow } from "../services/date";
import { getTrends } from "../services/records";
import type { TrendBundle } from "../types";
import useDeviceDate from "../hooks/useDeviceDate";

function chartDate(date: string, locale: "zh" | "en") {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export default function TrendsScreen({ user, refreshKey }: { user: User; refreshKey: number }) {
  const { locale, t } = useLocale();
  const deviceDate = useDeviceDate();
  const [bundle, setBundle] = useState<TrendBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    getTrends(user.id, deviceDate)
      .then((data) => {
        if (alive) setBundle(data);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [deviceDate, refreshKey, user.id]);

  const recentMoodPoints = useMemo(() => {
    const byDate = new Map((bundle?.moods ?? []).map((item) => [item.record_date, item]));
    return rollingDateWindow(deviceDate).map((date) => {
      const item = byDate.get(date);
      return { id: item?.id ?? `missing-mood-${date}`, label: chartDate(date, locale), value: item?.mood_score ?? 0, missing: !item };
    });
  }, [bundle?.moods, deviceDate, locale]);
  const recentRhythmPoints = useMemo(() => {
    const byDate = new Map((bundle?.rhythms ?? []).map((item) => [item.record_date, item]));
    return rollingDateWindow(deviceDate).map((date) => {
      const item = byDate.get(date);
      return { id: item?.id ?? `missing-rhythm-${date}`, label: chartDate(date, locale), value: item?.score ?? 0, lower: item?.score_lower, upper: item?.score_upper, missing: !item };
    });
  }, [bundle?.rhythms, deviceDate, locale]);

  const totals = useMemo(() => {
    const avgMood = bundle?.moods.length
      ? Math.round(bundle.moods.reduce((sum, item) => sum + item.mood_score, 0) / bundle.moods.length)
      : 0;
    const validSleep = bundle?.sleeps.map((item) => item.sleep_duration_minutes).filter((value): value is number => value != null) ?? [];
    const validSteps = bundle?.exercises.map((item) => item.steps).filter((value): value is number => value != null) ?? [];
    const sleepMinutes = validSleep.length
      ? Math.round(validSleep.reduce((sum, value) => sum + value, 0) / validSleep.length)
      : 0;
    const steps = validSteps.length
      ? Math.round(validSteps.reduce((sum, value) => sum + value, 0) / validSteps.length)
      : 0;
    const focus = bundle?.focus.reduce((sum, item) => sum + item.total_minutes, 0) ?? 0;
    return { avgMood, sleepMinutes, steps, focus };
  }, [bundle]);

  return (
    <div className="trend-dashboard">
      <div className="metric-grid trend-metric-grid">
        <MetricCard label={t("trends.avgMood")} value={totals.avgMood ? <AnimatedNumber value={totals.avgMood} /> : "--"} icon={<SmilePlus size={18} />} />
        <MetricCard label={t("trends.avgSleep")} value={totals.sleepMinutes ? <AnimatedNumber value={totals.sleepMinutes} formatter={(value) => minutesToText(Math.round(value), locale)} /> : "--"} icon={<BedDouble size={18} />} />
        <MetricCard label={t("trends.avgSteps")} value={totals.steps ? <AnimatedNumber value={totals.steps} formatter={(value) => Math.round(value).toLocaleString(locale === "en" ? "en-US" : "zh-CN")} /> : "--"} icon={<Flame size={18} />} />
        <MetricCard label={t("trends.focusTotal")} value={totals.focus ? <AnimatedNumber value={totals.focus} formatter={(value) => minutesToText(Math.round(value), locale)} /> : "--"} icon={<Brain size={18} />} />
      </div>

      <div className="trend-chart-section">
        <SectionCard title={t("trends.title")}>
          <div className="trend-chart-block">
            {error && <p className="error-text">{error}</p>}
            {!bundle && !error && <p className="muted">正在加载趋势</p>}
            {bundle && recentMoodPoints.some((point) => !point.missing) && (
              <LineTrendChart
                ariaLabel={t("trends.moodChartLabel")}
                compact
                points={recentMoodPoints}
                showAllDates
              />
            )}
            {bundle && !recentMoodPoints.some((point) => !point.missing) && (
              <div className="empty-chat compact">
                <Activity size={24} />
                <span>{t("trends.empty")}</span>
              </div>
            )}
          </div>

          <div className="trend-chart-divider" />
          <h3 className="trend-subheading">{t("trends.rhythmState")}</h3>
          <div className="trend-chart-block">
            {bundle && recentRhythmPoints.some((point) => !point.missing) && (
              <LineTrendChart
                ariaLabel={t("trends.rhythmChartLabel")}
                compact
                tone="rhythm"
                points={recentRhythmPoints}
                showAllDates
              />
            )}
            {bundle && !recentRhythmPoints.some((point) => !point.missing) && <p className="muted">{t("trends.rhythmEmpty")}</p>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
