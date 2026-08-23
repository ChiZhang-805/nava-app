import type { User } from "@supabase/supabase-js";
import { Award, Check, Flame, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../i18n";
import { growthXp, loadGrowthTasks, subscribeProductivity, toggleGrowthTask, type GrowthTask } from "../services/productivity";

export default function GrowthTasksScreen({ user }: { user: User }) {
  const { locale } = useLocale();
  const [tasks, setTasks] = useState<GrowthTask[]>(() => loadGrowthTasks(user.id));

  useEffect(() => subscribeProductivity(() => setTasks(loadGrowthTasks(user.id))), [user.id]);

  const xp = useMemo(() => growthXp(tasks), [tasks]);
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

      <div className="growth-task-list">
        {tasks.map((task) => (
          <button
            className={["growth-task-card", task.completed ? "completed" : ""].filter(Boolean).join(" ")}
            data-growth-task={task.id}
            key={task.id}
            type="button"
            onClick={() => setTasks(toggleGrowthTask(user.id, task.id))}
          >
            <span className="growth-task-check">{task.completed ? <Check size={19} /> : <span />}</span>
            <span className="growth-task-copy">
              <strong>{locale === "zh" ? task.titleZh : task.titleEn}</strong>
              <small>{locale === "zh" ? task.detailZh : task.detailEn}</small>
            </span>
            <b>+{task.xp}</b>
          </button>
        ))}
      </div>

      <section className="growth-badge-card">
        <Award size={28} />
        <div><strong>{locale === "zh" ? "下一枚徽章" : "Next badge"}</strong><span>{locale === "zh" ? "再获得 100 XP，解锁节律观察者" : "Earn 100 XP to unlock Rhythm Observer"}</span></div>
      </section>
    </div>
  );
}
