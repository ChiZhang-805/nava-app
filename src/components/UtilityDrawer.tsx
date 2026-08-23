import type { User } from "@supabase/supabase-js";
import { Check, ChevronRight, CircleDollarSign, LockKeyhole, ShoppingBag, UsersRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "../i18n";
import { addTodo, growthXp, loadGrowthTasks, loadTodos, subscribeProductivity, toggleTodo, type TodoItem } from "../services/productivity";

export default function UtilityDrawer({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const { locale } = useLocale();
  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos(user.id));
  const [draft, setDraft] = useState("");
  const [xp, setXp] = useState(() => growthXp(loadGrowthTasks(user.id)));

  useEffect(() => subscribeProductivity(() => {
    setTodos(loadTodos(user.id));
    setXp(growthXp(loadGrowthTasks(user.id)));
  }), [user.id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    addTodo(user.id, draft, "manual");
    setDraft("");
    setTodos(loadTodos(user.id));
  }

  if (!open) return null;
  return (
    <div className="utility-drawer-layer" role="presentation" onClick={onClose}>
      <aside className="utility-drawer" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "功能导航" : "Utilities"} onClick={(event) => event.stopPropagation()}>
        <header><div><span>NAVA</span><h2>{locale === "zh" ? "今日安排" : "Today"}</h2></div><button type="button" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={22} /></button></header>

        <section className="drawer-todo-section">
          <div className="drawer-section-title"><strong>{locale === "zh" ? "待办事项" : "To-do"}</strong><span>{todos.filter((item) => !item.completed).length}</span></div>
          <form onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={locale === "zh" ? "添加今天要做的事" : "Add a task"} /><button type="submit" aria-label={locale === "zh" ? "添加" : "Add"}><ChevronRight size={20} /></button></form>
          <div className="drawer-todo-list">
            {todos.length === 0 && <p>{locale === "zh" ? "也可以直接告诉 NAVA：今天待办完成一次散步。" : "You can also tell NAVA: add a walk to today's to-do list."}</p>}
            {todos.slice(0, 5).map((todo) => <button type="button" key={todo.id} onClick={() => setTodos(toggleTodo(user.id, todo.id))}><span>{todo.completed && <Check size={15} />}</span><b>{todo.title}</b></button>)}
          </div>
        </section>

        <section className="drawer-points-card"><CircleDollarSign size={24} /><div><span>{locale === "zh" ? "成长积分" : "Growth points"}</span><strong>{xp} XP</strong></div></section>

        <button className="drawer-placeholder-card" type="button" disabled><ShoppingBag size={22} /><span><strong>{locale === "zh" ? "积分商城" : "Points shop"}</strong><small>{locale === "zh" ? "功能预留" : "Reserved"}</small></span><LockKeyhole size={16} /></button>
        <button className="drawer-placeholder-card" type="button" disabled><UsersRound size={22} /><span><strong>{locale === "zh" ? "节律社区" : "Rhythm community"}</strong><small>{locale === "zh" ? "功能预留" : "Reserved"}</small></span><LockKeyhole size={16} /></button>
      </aside>
    </div>
  );
}
