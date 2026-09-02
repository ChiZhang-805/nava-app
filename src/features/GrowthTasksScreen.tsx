import type { User } from "@supabase/supabase-js";
import { Award, Check, ChevronRight, CircleDollarSign, Flame, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { growthCounterValue, growthNewTaskIds, shouldAnimateGrowthVisit } from "../services/growthProgressPresentation";
import { todayISO } from "../services/date";
import { acknowledgeGrowthProgress, growthXp, loadGrowthTasks, loadLastViewedGrowthPoints, loadLastViewedGrowthTaskKeys, readGrowthProgress, reconcileGrowthRewards, resolveGrowthTasks, subscribeProductivity, type GrowthTask } from "../services/productivity";

export default function GrowthTasksScreen({
  user,
  onOpenTarget,
}: {
  user: User;
  onOpenTarget?: (target: GrowthTask["target"]) => void;
}) {
  const { locale } = useLocale();
  const initialTasksRef = useRef<GrowthTask[] | null>(null);
  if (!initialTasksRef.current) initialTasksRef.current = loadGrowthTasks(user.id);
  const [tasks, setTasks] = useState<GrowthTask[]>(initialTasksRef.current);
  const [loading, setLoading] = useState(true);
  const [displayedXp, setDisplayedXp] = useState(() => loadLastViewedGrowthPoints(user.id) ?? growthXp(initialTasksRef.current ?? []));
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(() => {
    const seenKeys = loadLastViewedGrowthTaskKeys(user.id);
    if (!seenKeys) return new Set();
    const seen = new Set(seenKeys);
    return new Set((initialTasksRef.current ?? []).filter((task) => {
      const key = task.category === "daily" ? `${todayISO()}:${task.id}` : task.id;
      return task.completed && !seen.has(key);
    }).map((task) => task.id));
  });
  const [revealedTaskIds, setRevealedTaskIds] = useState<Set<string>>(() => new Set());
  const [settling, setSettling] = useState(false);
  const [toastDelta, setToastDelta] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let animationFrame = 0;
    const timers: number[] = [];
    const later = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    setLoading(true);
    setSettling(false);
    setToastDelta(null);
    setRevealedTaskIds(new Set());

    void resolveGrowthTasks(user.id)
      .then(async (next) => {
        const rewards = await reconcileGrowthRewards(next);
        const visit = await readGrowthProgress(user.id, next, rewards.totalPoints);
        if (!active) return;

        setTasks(next);
        const shouldAnimate = shouldAnimateGrowthVisit(visit);
        const completedIds = new Set(next.filter((task) => task.completed).map((task) => task.id));
        const incomingTaskIds = growthNewTaskIds(visit).filter((id) => completedIds.has(id));

        if (!shouldAnimate) {
          setDisplayedXp(visit.currentPoints);
          setNewTaskIds(new Set());
          setRevealedTaskIds(new Set());
          void acknowledgeGrowthProgress(user.id, visit).catch((error) => console.warn("Growth progress acknowledgement deferred", error));
          return;
        }

        const incoming = new Set(incomingTaskIds);
        setDisplayedXp(visit.previousPoints);
        setNewTaskIds(incoming);
        setRevealedTaskIds(new Set());
        setSettling(true);

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) {
          setDisplayedXp(visit.currentPoints);
          setRevealedTaskIds(incoming);
          setSettling(false);
          setToastDelta(visit.delta);
          later(() => setToastDelta(null), 3200);
        } else {
          const startedAt = performance.now();
          const duration = 920;
          const tick = (now: number) => {
            if (!active) return;
            const progress = Math.min(1, (now - startedAt) / duration);
            setDisplayedXp(growthCounterValue(visit.previousPoints, visit.currentPoints, progress));
            if (progress < 1) animationFrame = window.requestAnimationFrame(tick);
          };
          animationFrame = window.requestAnimationFrame(tick);

          incomingTaskIds.forEach((taskId, index) => {
            later(() => setRevealedTaskIds((current) => new Set([...current, taskId])), 260 + index * 150);
          });

          const finishDelay = Math.max(duration + 80, 360 + incomingTaskIds.length * 150);
          later(() => {
            setDisplayedXp(visit.currentPoints);
            setRevealedTaskIds(incoming);
            setSettling(false);
            setToastDelta(visit.delta);
            navigator.vibrate?.([18, 28, 26]);
            later(() => setToastDelta(null), 3200);
          }, finishDelay);
        }

        void acknowledgeGrowthProgress(user.id, visit).catch((error) => console.warn("Growth progress acknowledgement deferred", error));
      })
      .catch((error) => console.warn("Growth progress could not be refreshed", error))
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = subscribeProductivity(() => setTasks(loadGrowthTasks(user.id)));
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
      unsubscribe();
    };
  }, [user.id]);

  const level = Math.floor(displayedXp / 100) + 1;
  const progress = displayedXp % 100;

  return (
    <div className={["growth-screen", toastDelta !== null ? "has-toast" : ""].filter(Boolean).join(" ")} data-growth-screen>
      <section className={["growth-summary-card", settling ? "is-settling" : ""].filter(Boolean).join(" ")}>
        <div className="growth-level-orb"><Award size={26} /><strong>Lv.{level}</strong></div>
        <div className="growth-progress-copy">
          <span>{locale === "zh" ? "本周成长" : "Weekly growth"}</span>
          <strong aria-live="polite">{displayedXp} XP</strong>
          <div className="growth-progress-track" aria-label={`${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        </div>
        <Flame size={25} aria-hidden="true" />
      </section>

      <header className="growth-section-heading">
        <div><span>NAVA</span><h2>{locale === "zh" ? "成长任务" : "Growth tasks"}</h2></div>
        <Sparkles size={22} aria-hidden="true" />
      </header>

      <div className="growth-task-list" aria-busy={loading}>
        {(["profile", "daily"] as const).map((category) => <section className="growth-task-group" key={category}>
          <header>{category === "profile" ? (locale === "zh" ? "画像完善" : "Profile") : (locale === "zh" ? "今日节律" : "Today")}</header>
          {tasks.filter((task) => task.category === category && !(category === "profile" && task.completed)).map((task) => {
            const isIncoming = newTaskIds.has(task.id);
            const completedVisible = task.completed && (!isIncoming || revealedTaskIds.has(task.id));
            const justRevealed = isIncoming && revealedTaskIds.has(task.id);
            return (
              <button
                className={["growth-task-card", completedVisible ? "completed" : "", justRevealed ? "completion-reveal" : ""].filter(Boolean).join(" ")}
                data-growth-task={task.id}
                data-completed={completedVisible ? "true" : "false"}
                key={task.id}
                type="button"
                disabled={task.completed}
                onClick={() => { if (!task.completed) onOpenTarget?.(task.target); }}
              >
                <span className="growth-task-check">{completedVisible ? <Check size={19} /> : <span />}</span>
                <span className="growth-task-copy">
                  <strong>{locale === "zh" ? task.titleZh : task.titleEn}</strong>
                  <small>{locale === "zh" ? task.detailZh : task.detailEn}</small>
                </span>
                <span className="growth-task-meta">{completedVisible
                  ? <b>{locale === "zh" ? "已完成" : "Completed"}</b>
                  : <><b>+{task.xp}</b><ChevronRight size={15} aria-hidden="true" /></>}</span>
              </button>
            );
          })}
        </section>)}
      </div>

      {toastDelta !== null && (
        <div className="growth-earned-toast" role="status" aria-live="polite">
          <span><CircleDollarSign size={22} /></span>
          <div><strong>{locale === "zh" ? "积分已到账" : "Points added"}</strong><small>{locale === "zh" ? "新的成长进度已经同步" : "Your growth progress is up to date"}</small></div>
          <b>+{toastDelta}</b>
        </div>
      )}
    </div>
  );
}
