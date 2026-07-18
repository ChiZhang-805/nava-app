import type { User } from "@supabase/supabase-js";
import { Activity, BedDouble, Brain, Flame, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { useLocale } from "../i18n";
import { minutesToText, shortDate } from "../services/date";
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

  return (
    <div className="stack">
      <div className="metric-grid">
        <MetricCard label={t("trends.avgMood")} value={totals.avgMood || "--"} detail={t("trends.last14")} icon={<SmilePlus size={18} />} />
        <MetricCard label={t("trends.avgSleep")} value={minutesToText(totals.sleepMinutes, locale)} detail={t("trends.last14")} icon={<BedDouble size={18} />} />
        <MetricCard label={t("trends.avgSteps")} value={totals.steps ? totals.steps.toLocaleString(locale === "en" ? "en-US" : "zh-CN") : "--"} detail={t("trends.last14")} icon={<Flame size={18} />} />
        <MetricCard label={t("trends.focusTotal")} value={minutesToText(totals.focus, locale)} detail={t("trends.last14")} icon={<Brain size={18} />} />
      </div>

      <SectionCard title={t("trends.title")} subtitle={t("trends.last14")}>
        {error && <p className="error-text">{error}</p>}
        {!bundle && !error && <p className="muted">正在加载趋势</p>}
        {bundle && (
          <div className="trend-list">
            {bundle.moods.slice(-7).map((item) => (
              <div className="trend-row" key={item.id}>
                <span>{shortDate(item.record_date, locale)}</span>
                <div className="bar-track">
                  <div className="bar-fill mood" style={{ width: `${item.mood_score}%` }} />
                </div>
                <strong>{item.mood_score}</strong>
              </div>
            ))}
            {bundle.moods.length === 0 && (
              <div className="empty-chat compact">
                <Activity size={24} />
                <span>{t("trends.empty")}</span>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("trends.rhythmState")} subtitle={t("trends.rhythmSubtitle")}>
        <div className="trend-list">
          {bundle?.rhythms.slice(-7).map((item) => (
            <div className="trend-row" key={item.id}>
              <span>{shortDate(item.record_date, locale)}</span>
              <div className="bar-track interval-track">
                {item.score_lower != null && item.score_upper != null && (
                  <div className="interval-band" style={{ left: `${item.score_lower}%`, width: `${Math.max(2, item.score_upper - item.score_lower)}%` }} />
                )}
                <div className="bar-fill rhythm" style={{ width: `${item.score}%` }} />
              </div>
              <strong>{Math.round(item.score)}</strong>
            </div>
          ))}
          {bundle && bundle.rhythms.length === 0 && <p className="muted">{t("trends.rhythmEmpty")}</p>}
        </div>
      </SectionCard>
    </div>
  );
}
