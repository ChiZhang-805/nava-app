import type { User } from "@supabase/supabase-js";
import { Award, Check, ChevronRight, Flame, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { growthXp, loadGrowthTasks, reconcileGrowthRewards, resolveGrowthTasks, subscribeProductivity, type GrowthSummary, type GrowthTask } from "../services/productivity";

export default function GrowthTasksScreen({
  user,
  onOpenTarget,
}: {
  user: User;
  onOpenTarget?: (target: GrowthTask["target"]) => void;
}) {
  const { locale } = useLocale();
  const [tasks, setTasks] = useState<GrowthTask[]>(() => loadGrowthTasks(user.id));
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<GrowthSummary | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const list = taskListRef.current;
    if (!list) return undefined;
    list.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      if (taskListRef.current) taskListRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [user.id]);

  useEffect(() => {
    let active = true;
    void resolveGrowthTasks(user.id)
      .then(async (next) => {
        if (active) setTasks(next);
        const rewards = await reconcileGrowthRewards(next);
        if (active) setSummary(rewards);
      })
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = subscribeProductivity(() => setTasks(loadGrowthTasks(user.id)));
    return () => { active = false; unsubscribe(); };
  }, [user.id]);

  const xp = useMemo(() => summary?.totalPoints ?? growthXp(tasks), [summary, tasks]);
  const level = Math.floor(xp / 100) + 1;
  const progress = xp % 100;

  return (
    <div className="growth-screen" data-growth-screen>
      <section className="growth-summary-card">
        <div className="growth-level-orb"><Award size={26} /><strong>Lv.{level}</strong></div>
        <div className="growth-progress-copy">
          <span>{locale === "zh" ? "本周成长" : "Weekly growth"}</span>
          <strong>{xp} XP</strong>
          <div className="growth-progress-track" aria-label={`${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        </div>
        <Flame size={25} aria-hidden="true" />
      </section>

      <header className="growth-section-heading">
        <div><span>NAVA</span><h2>{locale === "zh" ? "成长任务" : "Growth tasks"}</h2></div>
        <Sparkles size={22} aria-hidden="true" />
      </header>

      <div className="growth-task-list" aria-busy={loading} ref={taskListRef}>
        {(["profile", "daily"] as const).map((category) => <section className="growth-task-group" key={category}>
          <header>{category === "profile" ? (locale === "zh" ? "画像完善" : "Profile") : (locale === "zh" ? "今日节律" : "Today")}</header>
          {tasks.filter((task) => task.category === category).map((task) => (
          <button
            className={["growth-task-card", task.completed ? "completed" : ""].filter(Boolean).join(" ")}
            data-growth-task={task.id}
            key={task.id}
            type="button"
            onClick={() => onOpenTarget?.(task.target)}
          >
            <span className="growth-task-check">{task.completed ? <Check size={19} /> : <span />}</span>
            <span className="growth-task-copy">
              <strong>{locale === "zh" ? task.titleZh : task.titleEn}</strong>
              <small>{locale === "zh" ? task.detailZh : task.detailEn}</small>
            </span>
            <span className="growth-task-meta"><b>+{task.xp}</b><ChevronRight size={15} aria-hidden="true" /></span>
          </button>
          ))}
        </section>)}
      </div>

      <section className="growth-badge-card">
        <Award size={28} />
        <div><strong>{summary?.badges.includes("bare_face_week") ? (locale === "zh" ? "素颜七日徽章" : "Bare-face week") : summary?.badges.includes("rhythm_observer") ? (locale === "zh" ? "节律观察者" : "Rhythm Observer") : (locale === "zh" ? "下一枚徽章" : "Next badge")}</strong><span>{summary?.badges.length ? (locale === "zh" ? "奖励已由后端依据真实记录核验。" : "Rewards verified from real records by the backend.") : (locale === "zh" ? `再获得 ${Math.max(0, 100 - xp)} XP，解锁节律观察者` : `Earn ${Math.max(0, 100 - xp)} XP to unlock Rhythm Observer`)}</span></div>
      </section>
    </div>
  );
}
