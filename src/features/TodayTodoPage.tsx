import type { User } from "@supabase/supabase-js";
import { CalendarDays, Check, ChevronRight, ClipboardList, Clock3, CopyCheck, Home, ListTodo, LoaderCircle, Mic, Trash2, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import DurationWheelPicker from "../components/DurationWheelPicker";
import MoreMenu from "../components/MoreMenu";
import { addTodo, deleteTodos, loadTodos, subscribeProductivity, syncTodos, toggleTodo, type TodoItem } from "../services/productivity";
import { resolveTodoFocusPlan, suggestedFocusPlan } from "../services/focusPlanning.ts";
import { estimateTodoDuration } from "../services/todoDurationEstimate";
import { startVoiceInput, type VoiceInputError, type VoiceInputSession } from "../services/voice";

type DurationDraft = { hours: string; minutes: string; seconds: string };
type DurationField = keyof DurationDraft;
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

function offsetDate(deviceDate: string, days: number) {
  const value = new Date(`${deviceDate}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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
  const previousDeviceDate = useRef(deviceDate);
  const voiceSessionRef = useRef<VoiceInputSession | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceHandledRef = useRef(false);
  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos(user.id));
  const [draft, setDraft] = useState("");
  const [duration, setDuration] = useState<DurationDraft>(emptyDuration);
  const [durationPickerField, setDurationPickerField] = useState<DurationField | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(deviceDate);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeProductivity(() => setTodos(loadTodos(user.id))), [user.id]);

  useEffect(() => {
    const previous = previousDeviceDate.current;
    previousDeviceDate.current = deviceDate;
    setSelectedDate((current) => current === previous ? deviceDate : current);
  }, [deviceDate]);

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

  useEffect(() => () => { void voiceSessionRef.current?.cancel(); }, []);

  const dayTodos = useMemo(() => todos
    .filter((todo) => todo.scheduledDate === selectedDate)
    .sort((a, b) => Number(a.completed) - Number(b.completed)
      || (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99")
      || b.createdAt.localeCompare(a.createdAt)), [selectedDate, todos]);
  const isToday = selectedDate === deviceDate;
  const isTomorrow = selectedDate === offsetDate(deviceDate, 1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy("add");
    setError(null);
    try {
      const seconds = durationSeconds(duration);
      const suggestion = suggestedFocusPlan(draft);
      await addTodo(user.id, draft, "manual", selectedDate, undefined, {
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

  async function estimateDuration() {
    if (!draft.trim() || busy) return;
    setBusy("estimate");
    setError(null);
    setEstimateNote(null);
    try {
      const estimate = await estimateTodoDuration(draft, locale);
      setDuration(splitDuration(estimate.seconds));
      const source = estimate.provider === "deepseek"
        ? (locale === "zh" ? "DeepSeek 预估" : "DeepSeek estimate")
        : estimate.provider === "explicit"
          ? (locale === "zh" ? "已识别句中时长" : "Duration found in task")
          : (locale === "zh" ? "智能兜底估算" : "Smart fallback estimate");
      setEstimateNote(`${source} · ${durationLabel(estimate.seconds, locale)}`);
    } catch (estimateError) {
      setError(estimateError instanceof Error ? estimateError.message : String(estimateError));
    } finally {
      setBusy(null);
    }
  }

  function voiceErrorText(voiceError: VoiceInputError) {
    if (voiceError.code === "permission_denied") return locale === "zh" ? "请允许麦克风与语音识别权限。" : "Allow microphone and speech recognition access.";
    if (voiceError.code === "audio_unavailable") return locale === "zh" ? "没有检测到可用麦克风。" : "No microphone is available.";
    if (voiceError.code === "voice_unavailable") return locale === "zh" ? "当前浏览器不支持语音输入。" : "Voice input is unavailable in this browser.";
    return locale === "zh" ? "没有听清，请再说一次。" : "I couldn't hear that. Please try again.";
  }

  async function applyVoiceTranscript(transcript: string) {
    const task = transcript.trim();
    if (!task || voiceHandledRef.current) return;
    voiceHandledRef.current = true;
    setDraft(task);
    setBusy("estimate");
    setError(null);
    setEstimateNote(null);
    try {
      const estimate = await estimateTodoDuration(task, locale);
      setDuration(splitDuration(estimate.seconds));
      const source = estimate.provider === "deepseek"
        ? (locale === "zh" ? "DeepSeek 预估" : "DeepSeek estimate")
        : estimate.provider === "explicit"
          ? (locale === "zh" ? "已识别句中时长" : "Duration found in task")
          : (locale === "zh" ? "智能兜底估算" : "Smart fallback estimate");
      setEstimateNote(`${source} · ${durationLabel(estimate.seconds, locale)}`);
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : String(voiceError));
    } finally {
      setBusy(null);
    }
  }

  async function beginVoiceDraft() {
    if (busy) return;
    setError(null);
    setEstimateNote(null);
    setBusy("voice");
    voiceTranscriptRef.current = "";
    voiceHandledRef.current = false;
    try {
      const session = await startVoiceInput({
        locale,
        onTranscript: (transcript, final) => {
          voiceTranscriptRef.current = transcript.trim();
          setDraft(voiceTranscriptRef.current);
          if (final) {
            void voiceSessionRef.current?.stop();
            void applyVoiceTranscript(voiceTranscriptRef.current);
          }
        },
        onEnd: () => {
          voiceSessionRef.current = null;
          if (!voiceHandledRef.current && voiceTranscriptRef.current) void applyVoiceTranscript(voiceTranscriptRef.current);
          else if (!voiceHandledRef.current) {
            setBusy(null);
            setError(locale === "zh" ? "没有听清，请再说一次。" : "I couldn't hear that. Please try again.");
          }
        },
        onError: (voiceError) => {
          setBusy(null);
          setError(voiceErrorText(voiceError));
        },
      });
      voiceSessionRef.current = session;
    } catch (voiceError) {
      setBusy(null);
      setError(voiceErrorText(voiceError as VoiceInputError));
    }
  }

  function submitWithShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function openDurationPicker(field: DurationField) {
    setDurationPickerField((current) => current === field ? null : field);
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

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function closeSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function removeSelected() {
    if (selectedIds.size === 0 || busy) return;
    setBusy("delete");
    setError(null);
    try {
      setTodos(await deleteTodos(user.id, [...selectedIds]));
      closeSelection();
      onChanged();
    } catch (todoError) {
      setError(todoError instanceof Error ? todoError.message : String(todoError));
    } finally {
      setBusy(null);
    }
  }

  const pageTitle = locale === "zh"
    ? isToday ? "今日待办" : isTomorrow ? "明日待办" : "日期待办"
    : isToday ? "Today's to-do" : isTomorrow ? "Tomorrow's to-do" : "Dated to-do";
  const planTitle = locale === "zh"
    ? isToday ? "今天的安排" : isTomorrow ? "明天的安排" : `${dayLabel(selectedDate, locale)}的安排`
    : isToday ? "Today's plan" : isTomorrow ? "Tomorrow's plan" : `Plan for ${dayLabel(selectedDate, locale)}`;

  return <section className="home-experience today-todo-page" data-today-todo-page>
    <header className="home-experience-header today-todo-header">
      <button className="home-experience-back" type="button" onClick={onBack} aria-label={locale === "zh" ? "返回首页" : "Back home"}>
        <Home size={23} />
      </button>
      <div><h1>{pageTitle}</h1></div>
      <MoreMenu open={menuOpen} onOpenChange={setMenuOpen} label={locale === "zh" ? "待办菜单" : "To-do menu"} className="today-todo-more">
        <button type="button" onClick={() => setDatePickerOpen(true)}><CalendarDays size={19} />{locale === "zh" ? "切换日期" : "Switch date"}</button>
      </MoreMenu>
    </header>

    <div className="today-todo-intro">
      <span>{dayLabel(selectedDate, locale)}</span>
      <h2>{locale === "zh" ? (isToday ? "写下今天要做的事。" : isTomorrow ? "写下明天要做的事。" : "写下这一天要做的事。") : (isToday ? "Plan what matters today." : isTomorrow ? "Plan what matters tomorrow." : "Plan what matters that day.")}</h2>
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
        <div className="today-todo-duration-fields" role="group" aria-label={locale === "zh" ? "选择小时、分钟和秒钟" : "Choose hours, minutes and seconds"}>
          {(["hours", "minutes", "seconds"] as const).map((field) => {
            const unit = locale === "zh" ? { hours: "小时", minutes: "分钟", seconds: "秒" }[field] : { hours: "hr", minutes: "min", seconds: "sec" }[field];
            const open = durationPickerField === field;
            return <div className="today-todo-duration-slot" key={field}>
              <button className="today-todo-duration-trigger" data-duration-field={field} type="button" onClick={() => openDurationPicker(field)} aria-label={locale === "zh" ? `打开${unit}滚轮` : `Open ${unit} wheel`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`todo-duration-options-${field}`}>
                <strong>{String(Number(duration[field]) || 0).padStart(2, "0")}</strong><small>{unit}</small>
              </button>
              {open && <DurationWheelPicker key={field} locale={locale} field={field} value={Number(duration[field]) || 0} onCancel={() => setDurationPickerField(null)} onSelect={(value) => {
                setDuration((current) => ({ ...current, [field]: String(value) }));
                setEstimateNote(null);
                setDurationPickerField(null);
              }} />}
            </div>;
          })}
        </div>
        {estimateNote && <small aria-live="polite">{estimateNote}</small>}
      </div>
      {!draft.trim() && durationSeconds(duration) === 0 || busy === "voice"
        ? <button className="today-todo-submit is-voice" type="button" onClick={() => void beginVoiceDraft()} disabled={busy != null && busy !== "voice"}><Mic size={19} />{busy === "voice" ? (locale === "zh" ? "正在聆听…" : "Listening…") : (locale === "zh" ? "和小猫说说今天想做的事" : "Tell the cat what you want to do")}</button>
        : <button className="today-todo-submit" type="submit" disabled={!draft.trim() || busy != null}>{busy === "add" ? (locale === "zh" ? "正在写入…" : "Adding…") : (locale === "zh" ? "写进今日待办" : "Add to today")}</button>}
      {error && <p className="today-todo-error" role="alert">{error}</p>}
    </form>

    <section className="today-todo-list-section" aria-busy={loading}>
      <header><div><span className="today-todo-plan-title"><ListTodo size={21} /><strong>{planTitle}</strong></span><button type="button" className={selectionMode ? "is-active" : ""} onClick={() => selectionMode ? closeSelection() : setSelectionMode(true)} aria-label={selectionMode ? (locale === "zh" ? "退出多选" : "Exit selection") : (locale === "zh" ? "多选安排" : "Select multiple tasks")}>{selectionMode ? <X size={20} /> : <CopyCheck size={21} />}</button></div></header>
      {loading && dayTodos.length === 0 ? <div className="today-todo-loading" role="status"><LoaderCircle className="today-todo-spinner" size={24} /><span>{locale === "zh" ? "正在读取待办" : "Loading to-dos"}</span></div>
        : dayTodos.length === 0 ? <div className="today-todo-empty"><ClipboardList size={31} strokeWidth={1.8} /><strong>{locale === "zh" ? "这一天还没有待办" : "Nothing here yet"}</strong></div>
          : <div className="today-todo-items">{dayTodos.map((todo) => {
            const plan = resolveTodoFocusPlan(todo);
            const selected = selectedIds.has(todo.id);
            return <article className={[todo.completed ? "is-completed" : "", selectionMode ? "is-selecting" : "", selected ? "is-selected" : ""].filter(Boolean).join(" ")} key={todo.id}>
              <button className="today-todo-check" type="button" disabled={busy === todo.id || busy === "delete"} onClick={() => selectionMode ? toggleSelected(todo.id) : void changeTodo(todo)} aria-label={selectionMode ? (selected ? (locale === "zh" ? `取消选择“${todo.title}”` : `Deselect ${todo.title}`) : (locale === "zh" ? `选择“${todo.title}”` : `Select ${todo.title}`)) : todo.completed ? (locale === "zh" ? `将“${todo.title}”标记为未完成` : `Mark ${todo.title} incomplete`) : (locale === "zh" ? `完成“${todo.title}”` : `Complete ${todo.title}`)}>
                {busy === todo.id ? <LoaderCircle className="today-todo-spinner" size={17} /> : selected || (!selectionMode && todo.completed) ? <Check size={17} /> : null}
              </button>
              <button className="today-todo-open" type="button" onClick={() => selectionMode ? toggleSelected(todo.id) : onStartFocus(todo)}>
                <span><strong>{todo.title}</strong><small>{todo.estimatedSeconds ? (locale === "zh" ? `预计 ${durationLabel(todo.estimatedSeconds, locale)}` : `Est. ${durationLabel(todo.estimatedSeconds, locale)}`) : todo.scheduledTime ? `${todo.scheduledTime} · ${locale === "zh" ? `专注 ${plan.focusMinutes} 分钟` : `${plan.focusMinutes} min focus`}` : (locale === "zh" ? `专注 ${plan.focusMinutes} 分钟` : `${plan.focusMinutes} min focus`)}</small></span>
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            </article>;
          })}</div>}
      {selectionMode && dayTodos.length > 0 && <div className="today-todo-selection-actions"><button type="button" onClick={() => setSelectedIds(selectedIds.size === dayTodos.length ? new Set() : new Set(dayTodos.map((todo) => todo.id)))}>{selectedIds.size === dayTodos.length ? (locale === "zh" ? "取消全选" : "Clear all") : (locale === "zh" ? "全选" : "Select all")}</button><button type="button" className="is-delete" disabled={selectedIds.size === 0 || busy === "delete"} onClick={() => void removeSelected()}>{busy === "delete" ? <LoaderCircle className="today-todo-spinner" size={18} /> : <Trash2 size={18} />}{locale === "zh" ? `删除已选${selectedIds.size ? `（${selectedIds.size}）` : ""}` : `Delete selected${selectedIds.size ? ` (${selectedIds.size})` : ""}`}</button></div>}
    </section>
    {datePickerOpen && <div className="today-todo-date-overlay" role="presentation" onClick={() => setDatePickerOpen(false)}><section role="dialog" aria-modal="true" aria-label={locale === "zh" ? "切换待办日期" : "Switch to-do date"} onClick={(event) => event.stopPropagation()}><header><strong>{locale === "zh" ? "切换日期" : "Switch date"}</strong><button type="button" onClick={() => setDatePickerOpen(false)} aria-label={locale === "zh" ? "关闭" : "Close"}><X size={20} /></button></header><div><button type="button" onClick={() => { setSelectedDate(deviceDate); setDatePickerOpen(false); }}>{locale === "zh" ? "今天" : "Today"}<small>{dayLabel(deviceDate, locale)}</small></button><button type="button" onClick={() => { setSelectedDate(offsetDate(deviceDate, 1)); setDatePickerOpen(false); }}>{locale === "zh" ? "明天" : "Tomorrow"}<small>{dayLabel(offsetDate(deviceDate, 1), locale)}</small></button></div><label><span>{locale === "zh" ? "选择其他日期" : "Choose another date"}</span><input type="date" value={selectedDate} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/u.test(event.target.value)) { setSelectedDate(event.target.value); setDatePickerOpen(false); } }} /></label></section></div>}
  </section>;
}
