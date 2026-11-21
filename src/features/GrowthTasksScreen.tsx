import type { User } from "@supabase/supabase-js";
import { Award, Check, ChevronRight, CircleDollarSign, Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n";
import PageSkeleton from "../components/PageSkeleton";
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
  const [badges, setBadges] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [levelsOpen, setLevelsOpen] = useState(false);

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
    setLoadError(null);
    setSettling(false);
    setToastDelta(null);
    setRevealedTaskIds(new Set());

    void resolveGrowthTasks(user.id)
      .then(async (next) => {
        const rewards = await reconcileGrowthRewards(next);
        const visit = await readGrowthProgress(user.id, next, rewards.totalPoints);
        if (!active) return;

        setTasks(next);
        setBadges(rewards.badges);
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
      .catch((error) => {
        console.warn("Growth progress could not be refreshed", error);
        if (active) setLoadError(locale === "zh" ? "成长进度暂时没能加载，请稍后重试。" : "Your growth progress could not be loaded. Please try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = subscribeProductivity(() => setTasks(loadGrowthTasks(user.id)));
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
      unsubscribe();
    };
  }, [locale, retryVersion, user.id]);

  const level = Math.floor(displayedXp / 100) + 1;
  const progress = displayedXp % 100;
  const xpToNextLevel = 100 - progress;
  const firstVisibleLevel = Math.max(1, level - 1);
  const visibleLevels = [firstVisibleLevel, firstVisibleLevel + 1, firstVisibleLevel + 2];

  if (loading) return <PageSkeleton variant="growth" />;

  return (
    <div className={["growth-screen", toastDelta !== null ? "has-toast" : ""].filter(Boolean).join(" ")} data-growth-screen>
      <section className={["growth-summary-card", settling ? "is-settling" : ""].filter(Boolean).join(" ")}>
        <div className="growth-level-orb"><Award size={26} /><strong>Lv.{level}</strong></div>
        <div className="growth-progress-copy">
          <div className="growth-progress-heading">
            <div className="growth-progress-total">
              <span>{locale === "zh" ? "累计成长" : "Total growth"}</span>
              <strong aria-live="polite">{displayedXp} XP</strong>
            </div>
            <button className="growth-level-details-toggle" type="button" aria-expanded={levelsOpen} aria-controls="growth-level-details" aria-label={locale === "zh" ? "成长等级" : "Growth levels"} onClick={() => setLevelsOpen(open => !open)}><Flame size={25} aria-hidden="true" /></button>
          </div>
          <div className="growth-progress-track" aria-label={`${progress}%`}><span style={{ width: `${progress}%` }} /></div>
          <div className="growth-progress-meta">
            <small>{locale === "zh" ? `还差 ${xpToNextLevel} XP 到 Lv.${level + 1}` : `${xpToNextLevel} XP to Lv.${level + 1}`}</small>
            {badges.length > 0 && <small>{locale === "zh" ? `${badges.length} 枚勋章` : `${badges.length} badge${badges.length === 1 ? "" : "s"}`}</small>}
          </div>
        </div>
      </section>
      <section id="growth-level-details" className="growth-level-details" aria-labelledby="growth-level-heading" hidden={!levelsOpen}>
        <h3 id="growth-level-heading">{locale === "zh" ? "成长等级" : "Growth levels"}</h3>
        <p>{locale === "zh"
          ? `再攒 ${xpToNextLevel} XP 就能升到 Lv.${level + 1}。成长从 Lv.1 开始，每积累 100 XP 升一级。积分可在商城兑换，首页的节律分数反映你的近期状态。`
          : `Earn ${xpToNextLevel} more XP to reach Lv.${level + 1}. You start at Lv.1 and gain a level with every 100 XP. Spend points in the shop and check your home rhythm score for a view of your recent wellbeing.`}</p>
        <ol>{visibleLevels.map(item => <li key={item}><strong>Lv.{item}</strong><span>{(item - 1) * 100} XP</span></li>)}</ol>
      </section>

      <header className="growth-section-heading">
        <div><span>NAVA</span><h2>{locale === "zh" ? "成长任务" : "Growth tasks"}</h2></div>
      </header>

      {loadError && <section className="growth-load-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}>{locale === "zh" ? "重新加载" : "Retry"}</button></section>}

      {!loadError && <div className="growth-task-list" aria-busy={loading}>
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
                  ? <b>{locale === "zh" ? "完成啦" : "Completed"}</b>
                  : <><b>+{task.xp}</b><ChevronRight size={15} aria-hidden="true" /></>}</span>
              </button>
            );
          })}
        </section>)}
      </div>}

      {toastDelta !== null && (
        <div className="growth-earned-toast" role="status" aria-live="polite">
          <span><CircleDollarSign size={22} /></span>
          <div><strong>{locale === "zh" ? "积分到账啦" : "Points added"}</strong><small>{locale === "zh" ? "新的成长进度已经同步" : "Your growth progress is up to date"}</small></div>
          <b>+{toastDelta}</b>
        </div>
      )}
    </div>
  );
}
