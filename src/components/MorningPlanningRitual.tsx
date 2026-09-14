import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { TodoItem } from "../services/productivity";

export type MorningTaskPlan = { focusMinutes: number; focusSessions: number };

type Props = {
  date: string;
  locale: "zh" | "en";
  todos: TodoItem[];
  onCreateTask: (title: string) => Promise<TodoItem>;
  onSavePlan: (task: TodoItem, plan: MorningTaskPlan) => Promise<void>;
  onFinish: (firstTask: TodoItem, plan: MorningTaskPlan, count: number) => void;
  onClose: () => void;
};

const stepCopy = {
  zh: ["收集待办", "选出重点", "估计投入", "回看计划"],
  en: ["Gather tasks", "Pick priorities", "Timebox", "Review plan"],
};

function planFor(task: TodoItem, choices: Record<string, MorningTaskPlan>): MorningTaskPlan {
  return choices[task.id] ?? {
    focusMinutes: task.focusMinutes && task.focusMinutes > 0 ? task.focusMinutes : 25,
    focusSessions: task.focusSessions && task.focusSessions > 0 ? task.focusSessions : 1,
  };
}

export default function MorningPlanningRitual({ date, locale, todos, onCreateTask, onSavePlan, onFinish, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, MorningTaskPlan>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const available = useMemo(() => todos.filter((task) => task.scheduledDate === date && !task.completed), [date, todos]);
  const selected = selectedIds.flatMap((id) => available.find((task) => task.id === id) ?? []);
  const plannedMinutes = selected.reduce((sum, task) => {
    const plan = planFor(task, choices);
    return sum + plan.focusMinutes * plan.focusSessions;
  }, 0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedMinutes(Math.floor((Date.now() - startedAt) / 60_000)), 15_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const updatePlan = (id: string, patch: Partial<MorningTaskPlan>) => {
    const task = selected.find((candidate) => candidate.id === id);
    if (!task) return;
    setChoices((current) => ({ ...current, [id]: { ...planFor(task, current), ...patch } }));
  };
  const togglePriority = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  };
  const movePriority = (index: number, delta: number) => {
    setSelectedIds((current) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };
  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateTask(draft.trim());
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const task of selected) await onSavePlan(task, planFor(task, choices));
      onFinish(selected[0], planFor(selected[0], choices), selected.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const host = document.querySelector(".phone-frame") ?? document.body;
  useLayoutEffect(() => {
    if (!(host instanceof HTMLElement) || !host.classList.contains("phone-frame")) return undefined;
    host.classList.add("morning-plan-host");
    return () => host.classList.remove("morning-plan-host");
  }, [host]);
  return createPortal((
    <div className="morning-plan-overlay" role="dialog" aria-modal="true" aria-labelledby="morning-plan-title" data-morning-plan-step={step}>
      <div className="morning-plan-sheet">
        <header className="morning-plan-header">
          <div>
            <span className="morning-plan-kicker"><Clock3 size={15} />{locale === "zh" ? "建议留出 10–15 分钟" : "Allow 10–15 minutes"}</span>
            <h2 id="morning-plan-title">{locale === "zh" ? "晨间规划" : "Morning planning"}</h2>
            <p>{locale === "zh" ? `${date} · 已用 ${elapsedMinutes} 分钟，可按自己的节奏完成` : `${date} · ${elapsedMinutes} min elapsed; go at your pace`}</p>
          </div>
          <button type="button" className="morning-plan-close" onClick={onClose} disabled={busy} aria-label={locale === "zh" ? "关闭晨间规划" : "Close morning plan"}><X size={20} /></button>
        </header>
        <nav className="morning-plan-steps" aria-label={locale === "zh" ? "规划进度" : "Planning progress"}>
          {stepCopy[locale].map((label, index) => <span className={index === step ? "current" : index < step ? "done" : ""} key={label}><i>{index < step ? "✓" : index + 1}</i><small>{label}</small></span>)}
        </nav>
        <div className="morning-plan-content">
          {step === 0 && <section className="morning-plan-panel" aria-label={stepCopy[locale][0]}>
            <h3>{locale === "zh" ? "先把今天要做的事放在这里" : "Get today's tasks out of your head"}</h3>
            <p>{locale === "zh" ? "不必立刻排序。已添加的待办会保存到你的账号。" : "Do not rank them yet. Added tasks save to your account."}</p>
            <form className="morning-plan-add" onSubmit={(event) => void createTask(event)}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} placeholder={locale === "zh" ? "例如：准备小组汇报" : "For example: prepare a team update"} aria-label={locale === "zh" ? "新待办事项" : "New task"} />
              <button type="submit" disabled={!draft.trim() || busy} aria-label={locale === "zh" ? "添加今日待办" : "Add today's task"}><Plus size={20} /></button>
            </form>
            <div className="morning-plan-task-list">{available.length ? available.map((task) => <div className="morning-plan-task" key={task.id}><span>{task.title}</span><small>{task.scheduledTime ?? (locale === "zh" ? "今天" : "Today")}</small></div>) : <p className="morning-plan-empty">{locale === "zh" ? "今天还没有待办，先写下一件想完成的事。" : "No tasks yet. Add one thing you want to finish."}</p>}</div>
          </section>}
          {step === 1 && <section className="morning-plan-panel" aria-label={stepCopy[locale][1]}>
            <h3>{locale === "zh" ? "选出最重要的 1–3 件事" : "Choose your top 1–3 tasks"}</h3>
            <p>{locale === "zh" ? "按点击顺序排序；这只是今天的规划，不会把事项标记为完成。" : "Tap in priority order. Planning does not mark a task complete."}</p>
            <div className="morning-plan-choices">{available.map((task) => {
              const index = selectedIds.indexOf(task.id);
              return <button type="button" className={index >= 0 ? "selected" : ""} key={task.id} aria-pressed={index >= 0} onClick={() => togglePriority(task.id)} disabled={index < 0 && selectedIds.length >= 3}>
                <i>{index >= 0 ? index + 1 : "+"}</i><span>{task.title}</span><small>{task.scheduledTime ?? ""}</small>
              </button>;
            })}</div>
            <small className="morning-plan-hint">{locale === "zh" ? `已选 ${selectedIds.length}/3 项` : `${selectedIds.length}/3 selected`}</small>
          </section>}
          {step === 2 && <section className="morning-plan-panel" aria-label={stepCopy[locale][2]}>
            <h3>{locale === "zh" ? "给每项留出可完成的专注块" : "Give each priority a workable timebox"}</h3>
            <p>{locale === "zh" ? "分钟和次数可以调整；最终确认后才写入待办计划。" : "Adjust minutes and sessions; nothing changes until final confirmation."}</p>
            <div className="morning-plan-timeboxes">{selected.map((task, index) => {
              const plan = planFor(task, choices);
              return <div className="morning-plan-timebox" key={task.id}><strong>{index + 1}. {task.title}</strong><div>
                <label>{locale === "zh" ? "每次分钟" : "Minutes each"}<input type="number" inputMode="numeric" min={1} max={180} value={plan.focusMinutes} onChange={(event) => updatePlan(task.id, { focusMinutes: Math.min(180, Math.max(1, Number(event.target.value) || 1)) })} /></label>
                <label>{locale === "zh" ? "计划次数" : "Sessions"}<input type="number" inputMode="numeric" min={1} max={12} value={plan.focusSessions} onChange={(event) => updatePlan(task.id, { focusSessions: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /></label>
              </div></div>;
            })}</div>
          </section>}
          {step === 3 && <section className="morning-plan-panel" aria-label={stepCopy[locale][3]}>
            <h3>{locale === "zh" ? "今天就先从第一件事开始" : "Start with the first priority"}</h3>
            <p>{locale === "zh" ? `共安排 ${plannedMinutes} 分钟专注。这是计划，不是已完成时长。` : `${plannedMinutes} focus minutes planned, not completed.`}</p>
            <div className="morning-plan-review">{selected.map((task, index) => {
              const plan = planFor(task, choices);
              return <div className="morning-plan-review-row" key={task.id}><span className="morning-plan-rank">{index + 1}</span><div><strong>{task.title}</strong><small>{plan.focusMinutes} {locale === "zh" ? "分钟" : "min"} × {plan.focusSessions}{task.scheduledTime ? ` · ${task.scheduledTime}` : ""}</small></div><span className="morning-plan-move"><button type="button" onClick={() => movePriority(index, -1)} disabled={index === 0} aria-label={locale === "zh" ? `将${task.title}上移` : `Move ${task.title} up`}><ChevronUp size={17} /></button><button type="button" onClick={() => movePriority(index, 1)} disabled={index === selected.length - 1} aria-label={locale === "zh" ? `将${task.title}下移` : `Move ${task.title} down`}><ChevronDown size={17} /></button></span></div>;
            })}</div>
            {plannedMinutes > 480 && <p className="morning-plan-advice">{locale === "zh" ? "今天安排较满，可以返回上一步缩短时长。" : "This is a full day. Consider shortening a timebox."}</p>}
          </section>}
          {error && <p className="morning-plan-error" role="alert">{error}</p>}
        </div>
        <footer className="morning-plan-footer">
          <button type="button" className="secondary" onClick={() => { setError(null); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || busy}><ChevronLeft size={17} />{locale === "zh" ? "上一步" : "Back"}</button>
          {step < 3 ? <button type="button" className="primary" onClick={() => { setError(null); setStep((current) => current + 1); }} disabled={busy || step === 0 && !available.length || step === 1 && !selected.length}>{locale === "zh" ? "下一步" : "Next"}<ChevronRight size={17} /></button>
            : <button type="button" className="primary" onClick={() => void finish()} disabled={busy || !selected.length}>{busy ? (locale === "zh" ? "正在保存" : "Saving") : (locale === "zh" ? "确认计划并选中第一项" : "Save and select first task")}</button>}
        </footer>
      </div>
    </div>
  ), host);
}
