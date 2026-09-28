import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Check, ChevronRight, ListTodo, LoaderCircle, Plus, TimerReset } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import { addTodo, loadTodos, subscribeProductivity, syncTodos, toggleTodo, type TodoItem } from "../services/productivity";
import { resolveTodoFocusPlan, suggestedFocusPlan } from "../services/focusPlanning.ts";

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
  const [scheduledTime, setScheduledTime] = useState("");
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
      await addTodo(user.id, draft, "manual", deviceDate, scheduledTime || undefined, suggestedFocusPlan(draft));
      setDraft("");
      setScheduledTime("");
      setTodos(loadTodos(user.id));
      onChanged();
      editor.current?.focus();
    } catch (todoError) {
      setError(todoError instanceof Error ? todoError.message : String(todoError));
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
      <h2>{locale === "zh" ? "把今天想做的事，认真写下来。" : "Write down what matters today."}</h2>
      <p>{locale === "zh" ? "先写一件最想完成的事，再慢慢把今天安排好。" : "Start with one thing you most want to finish, then shape the rest of your day."}</p>
    </div>

    <form className="today-todo-compose" onSubmit={submit}>
      <div className="today-todo-compose-heading"><ListTodo size={23} /><strong>{locale === "zh" ? "写下待办" : "Write a to-do"}</strong></div>
      <label className="today-todo-draft">
        <span>{locale === "zh" ? "今天要做什么？" : "What would you like to do today?"}</span>
        <textarea ref={editor} value={draft} maxLength={180} rows={3} onChange={(event) => setDraft(event.target.value)} onKeyDown={submitWithShortcut} placeholder={locale === "zh" ? "例如：整理明天要用的资料" : "For example: Prepare tomorrow's notes"} />
        <small>{draft.length}/180</small>
      </label>
      <div className="today-todo-compose-actions">
        <label><span>{locale === "zh" ? "时间（可选）" : "Time (optional)"}</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        <button type="submit" disabled={!draft.trim() || busy === "add"}>
          {busy === "add" ? <LoaderCircle className="today-todo-spinner" size={20} /> : <Plus size={21} />}
          {locale === "zh" ? "写进今日待办" : "Add to today"}
        </button>
      </div>
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
                <span><strong>{todo.title}</strong><small>{todo.scheduledTime ? `${todo.scheduledTime} · ` : ""}{locale === "zh" ? `专注 ${plan.focusMinutes} 分钟` : `${plan.focusMinutes} min focus`}</small></span>
                <TimerReset size={19} aria-hidden="true" /><ChevronRight size={18} aria-hidden="true" />
              </button>
            </article>;
          })}</div>}
    </section>
  </section>;
}
