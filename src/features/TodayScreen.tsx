import type { User } from "@supabase/supabase-js";
import { Activity, Apple, BedDouble, Brain, Flame, Moon, RefreshCw, SmilePlus, Watch } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import { minutesToText } from "../services/date";
import { getTodaySnapshot } from "../services/records";
import { getNativeTodaySummary, isNativeHealthAvailable, syncNativeHealthNow } from "../services/health";
import { publishWatchSnapshot } from "../services/watch";
import type { TodaySnapshot } from "../types";

export default function TodayScreen({
  user,
  refreshKey,
  onOpenRecord,
}: {
  user: User;
  refreshKey: number;
  onOpenRecord: () => void;
}) {
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [nativeSteps, setNativeSteps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <p className="eyebrow">今日节律</p>
          <div>
            <strong>{snapshot?.rhythmScore ?? "--"}</strong>
            <span>/ 100</span>
          </div>
          <p className="algorithm-meta">
            {snapshot?.rhythmScoreLower != null && snapshot.rhythmScoreUpper != null
              ? `区间 ${snapshot.rhythmScoreLower}-${snapshot.rhythmScoreUpper}`
              : "等待后端区间"}
            {snapshot?.rhythmConfidence != null ? ` · 可信 ${Math.round(snapshot.rhythmConfidence * 100)}%` : ""}
          </p>
        </div>
        <div className="ring" style={{ "--score": `${snapshot?.rhythmScore ?? 0}%` } as CSSProperties}>
          <Activity size={28} />
        </div>
      </section>

      <div className="algorithm-strip" aria-label="算法状态">
        <div><span>模型</span><strong>{snapshot?.rhythmModelVersion?.includes("v4.7") ? "ChronoState V4.7" : snapshot?.rhythmModelVersion?.includes("v4.6") ? "ChronoState V4.6" : snapshot?.rhythmModelVersion?.includes("v4.5") ? "ChronoState V4.5" : snapshot?.rhythmModelVersion?.includes("v4.4") ? "ChronoState V4.4" : snapshot?.rhythmModelVersion?.includes("v4.3") ? "ChronoState V4.3" : snapshot?.rhythmModelVersion?.includes("v4.2") ? "ChronoState V4.2" : snapshot?.rhythmModelVersion?.includes("v4.1") ? "ChronoState V4.1" : snapshot?.rhythmModelVersion?.includes("v4") ? "ChronoState V4" : "离线估算"}</strong></div>
        <div><span>数据质量</span><strong>{snapshot?.rhythmDataQuality ?? "--"}</strong></div>
        <div><span>7 日趋势</span><strong>{snapshot?.rhythmTrendSlope == null ? "--" : `${snapshot.rhythmTrendSlope >= 0 ? "+" : ""}${snapshot.rhythmTrendSlope.toFixed(1)}`}</strong></div>
      </div>

      <SectionCard
        title="下一步"
        subtitle={snapshot?.date}
        action={<StatusPill tone={isNativeHealthAvailable() ? "good" : "warn"}>{isNativeHealthAvailable() ? "真机" : "预览"}</StatusPill>}
      >
        <p className="recommendation">{snapshot?.nextAction}</p>
        <div className="button-row">
          <ActionButton icon={<RefreshCw size={18} />} variant="secondary" onClick={refresh} disabled={loading}>
            刷新
          </ActionButton>
          <ActionButton icon={<Apple size={18} />} onClick={syncHealth} disabled={syncing}>
            {syncing ? "同步中" : "同步健康"}
          </ActionButton>
        </div>
        {error && <p className="error-text">{error}</p>}
      </SectionCard>

      <div className="metric-grid">
        <MetricCard
          label="睡眠"
          value={minutesToText(snapshot?.sleep?.sleep_duration_minutes)}
          detail={snapshot?.sleep?.rhythm_score != null ? `节律 ${snapshot.sleep.rhythm_score}` : "等待 Apple Watch 或手动记录"}
          icon={<BedDouble size={18} />}
        />
        <MetricCard
          label="运动"
          value={(snapshot?.exercise?.steps ?? nativeSteps ?? 0).toLocaleString("zh-CN")}
          detail={`${snapshot?.exercise?.calories ?? 0} kcal · ${snapshot?.exercise?.exercise_minutes ?? 0} 分钟`}
          icon={<Flame size={18} />}
        />
        <MetricCard
          label="情绪"
          value={snapshot?.mood?.mood_score ?? "--"}
          detail={snapshot?.mood?.factors?.length ? snapshot.mood.factors.join(" / ") : "今天还没记录"}
          icon={<SmilePlus size={18} />}
        />
        <MetricCard
          label="专注"
          value={minutesToText(snapshot?.focusMinutes)}
          detail={`${snapshot?.focusSessions ?? 0} 次会话`}
          icon={<Brain size={18} />}
        />
      </div>

      <SectionCard title="今日数据" subtitle="补齐记录后，节律判断会更稳定">
        <div className="timeline-list">
          <div>
            <Moon size={18} />
            <span>{snapshot?.sleep ? "睡眠记录已存在" : "睡眠还未记录"}</span>
          </div>
          <div>
            <SmilePlus size={18} />
            <span>{snapshot?.mood ? "情绪记录已存在" : "情绪还未记录"}</span>
          </div>
          <div>
            <Watch size={18} />
            <span>Watch 快照已准备，可同步到手表端</span>
          </div>
        </div>
        <ActionButton icon={<SmilePlus size={18} />} variant="secondary" onClick={onOpenRecord}>
          去写一条记录
        </ActionButton>
      </SectionCard>
    </div>
  );
}
