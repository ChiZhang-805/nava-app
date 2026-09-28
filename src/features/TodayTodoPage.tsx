import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Check, ChevronRight, Clock3, ListTodo, LoaderCircle, TimerReset } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { addTodo, loadTodos, subscribeProductivity, syncTodos, toggleTodo, type TodoItem } from "../services/productivity";
import { resolveTodoFocusPlan, suggestedFocusPlan } from "../services/focusPlanning.ts";
import { estimateTodoDuration } from "../services/todoDurationEstimate";

type DurationDraft = { hours: string; minutes: string; seconds: string };
const emptyDuration: DurationDraft = { hours: "", minutes: "", seconds: "" };

function durationSeconds(value: DurationDraft) {
  const hours = Math.min(99, Math.max(0, Number(value.hours) || 0));
  const minutes = Math.min(59, Math.max(0, Number(value.minutes) || 0));
  const seconds = Math.min(59, Math.max(0, Number(value.seconds) || 0));
  return Math.round(hours) * 3600 + Math.round(minutes) * 60 + Math.round(seconds);
}

function splitDuration(totalSeconds: number): DurationDraft {
  const safe = Math.min(359_999, Math.max(1, Math.round(totalSeconds)));
  return {
    hours: String(Math.floor(safe / 3600)),
    minutes: String(Math.floor((safe % 3600) / 60)),
    seconds: String(safe % 60),
  };
}

function durationLabel(totalSeconds: number, locale: "zh" | "en") {
  const value = splitDuration(totalSeconds);
  const parts = locale === "zh"
    ? [[value.hours, "小时"], [value.minutes, "分钟"], [value.seconds, "秒"]]
    : [[value.hours, "h"], [value.minutes, "m"], [value.seconds, "s"]];
  return parts.filter(([amount], index) => Number(amount) > 0 || index === 2).map(([amount, unit]) => `${amount}${locale === "zh" ? unit : ` ${unit}`}`).join(locale === "zh" ? " " : " ");
}

function dayLabel(deviceDate: string, locale: "zh" | "en") {
  const parsed = new Date(`${deviceDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return deviceDate;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: locale === "zh" ? "long" : "short",
    day: "numeric",
    weekday: "long",
  }).format(parsed);
}

export default function TodayTodoPage({
  user,
  deviceDate,
  onBack,
  onChanged,
  onStartFocus,
}: {
  user: User;
  deviceDate: string;
  onBack: () => void;
  onChanged: () => void;
  onStartFocus: (todo: TodoItem) => void;
}) {
  const { locale } = useLocale();
  const editor = useRef<HTMLTextAreaElement>(null);
  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos(user.id));
  const [draft, setDraft] = useState("");
  const [duration, setDuration] = useState<DurationDraft>(emptyDuration);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeProductivity(() => setTodos(loadTodos(user.id))), [user.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void syncTodos(user.id)
      .then((items) => { if (active) setTodos(items); })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  const todayTodos = useMemo(() => todos
    .filter((todo) => todo.scheduledDate === deviceDate)
    .sort((a, b) => Number(a.completed) - Number(b.completed)
      || (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99")
      || b.createdAt.localeCompare(a.createdAt)), [deviceDate, todos]);
  const completedCount = todayTodos.filter((todo) => todo.completed).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy("add");
    setError(null);
    try {
      const seconds = durationSeconds(duration);
      const suggestion = suggestedFocusPlan(draft);
      await addTodo(user.id, draft, "manual", deviceDate, undefined, {
        ...suggestion,
        ...(seconds > 0 ? { focusMinutes: Math.min(180, Math.max(1, Math.ceil(seconds / 60))), estimatedSeconds: seconds } : {}),
      });
      setDraft("");
      setDuration(emptyDuration);
      setEstimateNote(null);
      setTodos(loadTodos(user.id));
      onChanged();
      editor.current?.focus();
    } catch (todoError) {
      setError(todoError instanceof Error ? todoError.message : String(todoError));
    } finally {
      setBusy(null);
    }
  }

  function changeDuration(field: keyof DurationDraft, value: string) {
    if (!/^\d{0,2}$/u.test(value)) return;
    const maximum = field === "hours" ? 99 : 59;
    setDuration((current) => ({ ...current, [field]: value === "" ? "" : String(Math.min(maximum, Number(value))) }));
    setEstimateNote(null);
  }

  async function estimateDuration() {
    if (!draft.trim() || busy) return;
    setBusy("estimate");
    setError(null);
    setEstimateNote(null);
    try {
      const estimate = await estimateTodoDuration(draft, locale);
      setDuration(splitDuration(estimate.seconds));
      setEstimateNote(locale === "zh" ? `DeepSeek 预估 · ${durationLabel(estimate.seconds, locale)}` : `DeepSeek estimate · ${durationLabel(estimate.seconds, locale)}`);
    } catch (estimateError) {
      setError(estimateError instanceof Error ? estimateError.message : String(estimateError));
    } finally {
      setBusy(null);
    }
  }

  function submitWithShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function changeTodo(todo: TodoItem) {
    if (busy) return;
    setBusy(todo.id);
    setError(null);
    try {
      setTodos(await toggleTodo(user.id, todo.id));
      onChanged();
    } catch (todoError) {
      setError(todoError instanceof Error ? todoError.message : String(todoError));
    } finally {
      setBusy(null);
    }
  }

  return <section className="home-experience today-todo-page" data-today-todo-page>
    <header className="home-experience-header today-todo-header">
      <button className="home-experience-back" type="button" onClick={onBack} aria-label={locale === "zh" ? "返回首页" : "Back home"}>
        <ArrowLeft size={25} />
      </button>
      <div><span>NAVA TODAY</span><h1>{locale === "zh" ? "今日待办" : "Today's to-do"}</h1></div>
      <span aria-hidden="true" />
    </header>

    <div className="today-todo-intro">
      <span>{dayLabel(deviceDate, locale)}</span>
      <h2>{locale === "zh" ? "写下今天要做的事。" : "Plan what matters today."}</h2>
    </div>

    <form className="today-todo-compose" onSubmit={submit}>
      <div className="today-todo-compose-heading">
        <span><ListTodo size={23} /><strong>{locale === "zh" ? "待办事项" : "To-do"}</strong></span>
        <button type="button" disabled={!draft.trim() || busy != null} onClick={() => void estimateDuration()} aria-label={locale === "zh" ? "让 DeepSeek 预估所需时间" : "Ask DeepSeek to estimate the time needed"} title={locale === "zh" ? "AI 时间预估" : "AI time estimate"}>
          {busy === "estimate" ? <LoaderCircle className="today-todo-spinner" size={21} /> : <Clock3 size={21} />}
        </button>
      </div>
      <label className="today-todo-draft">
        <span>{locale === "zh" ? "今天要做什么" : "What do you need to do today?"}</span>
        <textarea ref={editor} value={draft} maxLength={180} rows={3} onChange={(event) => setDraft(event.target.value)} onKeyDown={submitWithShortcut} placeholder={locale === "zh" ? "例如：整理明天要用的资料" : "For example: Prepare tomorrow's notes"} />
        <small>{draft.length}/180</small>
      </label>
      <div className="today-todo-duration">
        <span>{locale === "zh" ? "时间" : "Time"}</span>
        <div>
          {(["hours", "minutes", "seconds"] as const).map((field) => <label key={field}>
            <input inputMode="numeric" pattern="[0-9]*" value={duration[field]} onChange={(event) => changeDuration(field, event.target.value)} aria-label={locale === "zh" ? { hours: "小时", minutes: "分钟", seconds: "秒钟" }[field] : field} placeholder="00" />
            <span>{locale === "zh" ? { hours: "小时", minutes: "分钟", seconds: "秒" }[field] : { hours: "hr", minutes: "min", seconds: "sec" }[field]}</span>
          </label>)}
        </div>
        {estimateNote && <small aria-live="polite">{estimateNote}</small>}
      </div>
      <button className="today-todo-submit" type="submit" disabled={!draft.trim() || busy != null}>{busy === "add" ? (locale === "zh" ? "正在写入…" : "Adding…") : (locale === "zh" ? "写进今日待办" : "Add to today")}</button>
      {error && <p className="today-todo-error" role="alert">{error}</p>}
    </form>

    <section className="today-todo-list-section" aria-busy={loading}>
      <header><div><strong>{locale === "zh" ? "今天的安排" : "Today's plan"}</strong><span>{todayTodos.length ? `${completedCount}/${todayTodos.length}` : "0"}</span></div>{todayTodos.length > 0 && <small>{locale === "zh" ? "点圆圈完成，点事项开始专注" : "Check it off, or open it to focus"}</small>}</header>
      {loading && todayTodos.length === 0 ? <div className="today-todo-loading" role="status"><LoaderCircle className="today-todo-spinner" size={24} /><span>{locale === "zh" ? "正在读取今日待办" : "Loading today's to-dos"}</span></div>
        : todayTodos.length === 0 ? <div className="today-todo-empty"><span><Check size={25} /></span><strong>{locale === "zh" ? "今天还没有待办" : "Nothing here yet"}</strong><p>{locale === "zh" ? "从上面写下第一件事，今天就有了清晰的起点。" : "Write your first task above and give today a clear starting point."}</p></div>
          : <div className="today-todo-items">{todayTodos.map((todo) => {
            const plan = resolveTodoFocusPlan(todo);
            return <article className={todo.completed ? "is-completed" : ""} key={todo.id}>
              <button className="today-todo-check" type="button" disabled={busy === todo.id} onClick={() => void changeTodo(todo)} aria-label={todo.completed ? (locale === "zh" ? `将“${todo.title}”标记为未完成` : `Mark ${todo.title} incomplete`) : (locale === "zh" ? `完成“${todo.title}”` : `Complete ${todo.title}`)}>
                {busy === todo.id ? <LoaderCircle className="today-todo-spinner" size={17} /> : todo.completed ? <Check size={17} /> : null}
              </button>
              <button className="today-todo-open" type="button" onClick={() => onStartFocus(todo)}>
                <span><strong>{todo.title}</strong><small>{todo.estimatedSeconds ? (locale === "zh" ? `预计 ${durationLabel(todo.estimatedSeconds, locale)}` : `Est. ${durationLabel(todo.estimatedSeconds, locale)}`) : todo.scheduledTime ? `${todo.scheduledTime} · ${locale === "zh" ? `专注 ${plan.focusMinutes} 分钟` : `${plan.focusMinutes} min focus`}` : (locale === "zh" ? `专注 ${plan.focusMinutes} 分钟` : `${plan.focusMinutes} min focus`)}</small></span>
                <TimerReset size={19} aria-hidden="true" /><ChevronRight size={18} aria-hidden="true" />
              </button>
            </article>;
          })}</div>}
    </section>
  </section>;
}
