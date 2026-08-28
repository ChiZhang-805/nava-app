import type { User } from "@supabase/supabase-js";
import { Activity, BedDouble, Brain, Flame, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LineTrendChart from "../components/LineTrendChart";
import AnimatedNumber from "../components/AnimatedNumber";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { useLocale } from "../i18n";
import { minutesToText } from "../services/date";
import { getTrends } from "../services/records";
import type { TrendBundle } from "../types";

export default function TrendsScreen({ user, refreshKey }: { user: User; refreshKey: number }) {
  const { locale, t } = useLocale();
  const [bundle, setBundle] = useState<TrendBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    getTrends(user.id)
      .then((data) => {
        if (alive) setBundle(data);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, user.id]);

  const totals = useMemo(() => {
    const avgMood = bundle?.moods.length
      ? Math.round(bundle.moods.reduce((sum, item) => sum + item.mood_score, 0) / bundle.moods.length)
      : 0;
    const sleepMinutes = bundle?.sleeps.length
      ? Math.round(bundle.sleeps.reduce((sum, item) => sum + (item.sleep_duration_minutes ?? 0), 0) / bundle.sleeps.length)
      : 0;
    const steps = bundle?.exercises.length
      ? Math.round(bundle.exercises.reduce((sum, item) => sum + (item.steps ?? 0), 0) / bundle.exercises.length)
      : 0;
    const focus = bundle?.focus.reduce((sum, item) => sum + item.total_minutes, 0) ?? 0;
    return { avgMood, sleepMinutes, steps, focus };
  }, [bundle]);

  const chartDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    month: "numeric",
    day: "numeric",
  });

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
            {bundle && bundle.moods.length > 0 && (
              <LineTrendChart
                ariaLabel={t("trends.moodChartLabel")}
                compact
                points={bundle.moods.slice(-7).map((item) => ({
                  id: item.id,
                  label: chartDate(item.record_date),
                  value: item.mood_score,
                }))}
              />
            )}
            {bundle && bundle.moods.length === 0 && (
              <div className="empty-chat compact">
                <Activity size={24} />
                <span>{t("trends.empty")}</span>
              </div>
            )}
          </div>

          <div className="trend-chart-divider" />
          <h3 className="trend-subheading">{t("trends.rhythmState")}</h3>
          <div className="trend-chart-block">
            {bundle && bundle.rhythms.length > 0 && (
              <LineTrendChart
                ariaLabel={t("trends.rhythmChartLabel")}
                compact
                tone="rhythm"
                points={bundle.rhythms.slice(-7).map((item) => ({
                  id: item.id,
                  label: chartDate(item.record_date),
                  value: item.score,
                  lower: item.score_lower,
                  upper: item.score_upper,
                }))}
              />
            )}
            {bundle && bundle.rhythms.length === 0 && <p className="muted">{t("trends.rhythmEmpty")}</p>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
