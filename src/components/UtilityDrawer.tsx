import type { User } from "@supabase/supabase-js";
import { Check, ChevronRight, CircleDollarSign, LockKeyhole, ShoppingBag, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "../i18n";
import { addTodo, growthXp, loadGrowthTasks, loadTodos, reconcileGrowthRewards, resolveGrowthTasks, subscribeProductivity, syncTodos, toggleTodo, type GrowthSummary, type TodoItem } from "../services/productivity";

export default function UtilityDrawer({
  user,
  open,
  onClose,
  onTaskCompleted,
  onEditHome,
}: {
  user: User;
  open: boolean;
  onClose: () => void;
  onTaskCompleted?: () => Promise<GrowthSummary | null>;
  onEditHome: () => void;
}) {
  const { locale } = useLocale();
  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos(user.id));
  const [draft, setDraft] = useState("");
  const [xp, setXp] = useState(() => growthXp(loadGrowthTasks(user.id)));
  const [busyTodo, setBusyTodo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeProductivity(() => {
    setTodos(loadTodos(user.id));
    setXp((current) => Math.max(current, growthXp(loadGrowthTasks(user.id))));
  }), [user.id]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([syncTodos(user.id), resolveGrowthTasks(user.id)]).then(async ([nextTodos, tasks]) => {
      const summary = await reconcileGrowthRewards(tasks);
      if (!active) return;
      setTodos(nextTodos);
      setXp(summary.totalPoints);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    return () => {
      active = false;
    };
  }, [open, user.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusyTodo("add");
    setError(null);
    try {
      await addTodo(user.id, draft, "manual");
      setDraft("");
      setTodos(loadTodos(user.id));
    } catch (todoError) {
      setError(todoError instanceof Error ? todoError.message : String(todoError));
    } finally {
      setBusyTodo(null);
    }
  }

  async function changeTodo(todo: TodoItem) {
    setBusyTodo(todo.id);
    setError(null);
    try {
      const next = await toggleTodo(user.id, todo.id);
      setTodos(next);
      const completed = next.find((item) => item.id === todo.id)?.completed === true;
      if (!todo.completed && completed) {
        const summary = await onTaskCompleted?.();
        if (summary) setXp(summary.totalPoints);
      }
    } catch (todoError) {
      setError(todoError instanceof Error ? todoError.message : String(todoError));
    } finally {
      setBusyTodo(null);
    }
  }

  if (!open) return null;
  return (
    <div className="utility-drawer-layer" role="presentation" onClick={onClose}>
      <aside className="utility-drawer" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "功能导航" : "Utilities"} onClick={(event) => event.stopPropagation()}>
        <header><div><span>NAVA</span><h2>{locale === "zh" ? "今日安排" : "Today"}</h2></div><button type="button" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={22} /></button></header>

        <section className="drawer-todo-section">
          <div className="drawer-section-title"><strong>{locale === "zh" ? "待办事项" : "To-do"}</strong><span>{todos.filter((item) => !item.completed).length}</span></div>
          <form onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={locale === "zh" ? "添加今天要做的事" : "Add a task"} /><button type="submit" disabled={busyTodo === "add"} aria-label={locale === "zh" ? "添加" : "Add"}><ChevronRight size={20} /></button></form>
          <div className="drawer-todo-list">
            {todos.length === 0 && <p>{locale === "zh" ? "也可以直接告诉 NAVA：今天待办完成一次散步。" : "You can also tell NAVA: add a walk to today's to-do list."}</p>}
            {todos.slice(0, 5).map((todo) => <button type="button" key={todo.id} disabled={busyTodo === todo.id} onClick={() => void changeTodo(todo)}><span>{todo.completed && <Check size={15} />}</span><b>{todo.title}<small>{todo.scheduledDate}{todo.scheduledTime ? ` · ${todo.scheduledTime}` : ""}</small></b></button>)}
          </div>
          {error && <p className="drawer-todo-error" role="alert">{error}</p>}
        </section>

        <section className="drawer-points-card"><CircleDollarSign size={24} /><div><span>{locale === "zh" ? "成长积分" : "Growth points"}</span><strong>{xp} XP</strong></div></section>

        <button className="drawer-home-edit" type="button" onClick={onEditHome}><SlidersHorizontal size={22} /><span><strong>{locale === "zh" ? "编辑首页" : "Edit home"}</strong><small>{locale === "zh" ? "选择与排列健康小组件" : "Choose and arrange health widgets"}</small></span><ChevronRight size={18} /></button>

        <button className="drawer-placeholder-card" type="button" disabled><ShoppingBag size={22} /><span><strong>{locale === "zh" ? "积分商城" : "Points shop"}</strong><small>{locale === "zh" ? "功能预留" : "Reserved"}</small></span><LockKeyhole size={16} /></button>
        <button className="drawer-placeholder-card" type="button" disabled><UsersRound size={22} /><span><strong>{locale === "zh" ? "节律社区" : "Rhythm community"}</strong><small>{locale === "zh" ? "功能预留" : "Reserved"}</small></span><LockKeyhole size={16} /></button>
      </aside>
    </div>
  );
}
