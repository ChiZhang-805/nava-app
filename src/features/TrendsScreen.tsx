import type { User } from "@supabase/supabase-js";
import { Activity, BedDouble, Brain, Flame, SmilePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { minutesToText, shortDate } from "../services/date";
import { getTrends } from "../services/records";
import type { TrendBundle } from "../types";

export default function TrendsScreen({ user, refreshKey }: { user: User; refreshKey: number }) {
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
        <MetricCard label="平均情绪" value={totals.avgMood || "--"} detail="近 14 天" icon={<SmilePlus size={18} />} />
        <MetricCard label="平均睡眠" value={minutesToText(totals.sleepMinutes)} detail="近 14 天" icon={<BedDouble size={18} />} />
        <MetricCard label="平均步数" value={totals.steps ? totals.steps.toLocaleString("zh-CN") : "--"} detail="近 14 天" icon={<Flame size={18} />} />
        <MetricCard label="专注总量" value={minutesToText(totals.focus)} detail="近 14 天" icon={<Brain size={18} />} />
      </div>

      <SectionCard title="趋势" subtitle="先用轻量竖屏图，后续接正式节律算法">
        {error && <p className="error-text">{error}</p>}
        {!bundle && !error && <p className="muted">正在加载趋势</p>}
        {bundle && (
          <div className="trend-list">
            {bundle.moods.slice(-7).map((item) => (
              <div className="trend-row" key={item.id}>
                <span>{shortDate(item.record_date)}</span>
                <div className="bar-track">
                  <div className="bar-fill mood" style={{ width: `${item.mood_score}%` }} />
                </div>
                <strong>{item.mood_score}</strong>
              </div>
            ))}
            {bundle.moods.length === 0 && (
              <div className="empty-chat compact">
                <Activity size={24} />
                <span>暂无趋势数据。先在记录页保存几条数据。</span>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

