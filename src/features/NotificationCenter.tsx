import {
  ArrowLeft,
  BellRing,
  ChartNoAxesCombined,
  Check,
  Footprints,
  Inbox,
  ListPlus,
  Mail,
  MailOpen,
  MoonStar,
  ScanFace,
  SmilePlus,
  TimerReset,
  Trash2,
  Undo2,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import MoreMenu from "../components/MoreMenu";
import {
  deleteNavaNotification,
  deleteNavaNotifications,
  markAllNavaNotificationsRead,
  markNavaNotification,
  markNavaNotifications,
  restoreNavaNotification,
  restoreNavaNotifications,
  respondToNavaNotification,
  type NavaNotificationItem,
  type NavaNotificationFeedback,
  type NavaNotificationTarget,
} from "../services/notifications";

const categoryIcons: Record<NavaNotificationItem["category"], LucideIcon> = {
  sleep: MoonStar,
  nutrition: Utensils,
  mood: SmilePlus,
  focus: TimerReset,
  exercise: Footprints,
  face: ScanFace,
  weekly: ChartNoAxesCombined,
  system: BellRing,
};

function relativeTime(value: string, locale: "zh" | "en") {
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (deltaMinutes < 1) return locale === "zh" ? "刚刚" : "now";
  if (deltaMinutes < 60) return locale === "zh" ? `${deltaMinutes} 分钟前` : `${deltaMinutes}m`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return locale === "zh" ? `${hours} 小时前` : `${hours}h`;
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { month: "short", day: "numeric" }).format(date);
}

function categoryLabel(item: NavaNotificationItem, locale: "zh" | "en") {
  const labels: Record<NavaNotificationItem["category"], [string, string]> = {
    sleep: ["睡眠", "Sleep"], nutrition: ["饮食", "Diet"], mood: ["情绪", "Mood"], focus: ["专注", "Focus"],
    exercise: ["运动", "Activity"], face: ["面部", "Face"], weekly: ["周报", "Weekly"], system: ["NAVA", "NAVA"],
  };
  return labels[item.category][locale === "zh" ? 0 : 1];
}

function NotificationCategoryIcon({ item }: { item: NavaNotificationItem }) {
  const Icon = categoryIcons[item.category];
  return <span className="notification-row-icon" data-category={item.category} aria-hidden="true"><Icon size={25} /></span>;
}

function feedbackOptions(item: NavaNotificationItem, locale: "zh" | "en"): Array<[NavaNotificationFeedback, string]> {
  if (item.source !== "contextual") return [];
  const zh = locale === "zh";
  if (item.category === "exercise") return [
    ["accepted", zh ? "我会调整" : "I'll adjust"],
    ["completed", zh ? "已经恢复" : "Recovered"],
    ["still_recovering", zh ? "仍需恢复" : "Still recovering"],
  ];
  if (item.category === "mood") return [
    ["accepted", zh ? "我知道了" : "Got it"],
    ["completed", zh ? "已经好转" : "Feeling better"],
    ["not_now", zh ? "稍后处理" : "Later"],
  ];
  if (item.category === "nutrition") return [
    ["accepted", zh ? "我会补充" : "I'll add it"],
    ["completed", zh ? "已经完成" : "Done"],
    ["not_now", zh ? "稍后处理" : "Later"],
  ];
  if (item.category === "face") return [
    ["accepted", zh ? "我知道了" : "Got it"],
    ["completed", zh ? "已经记录" : "Recorded"],
    ["not_now", zh ? "暂不记录" : "Not now"],
  ];
  return [];
}

function NotificationRow({
  item,
  locale,
  selectionMode,
  selected,
  onOpen,
  onReadChange,
  onDelete,
  onToggleSelect,
  onLongPress,
}: {
  item: NavaNotificationItem;
  locale: "zh" | "en";
  selectionMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onReadChange: (read: boolean) => void;
  onDelete: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const gestureRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offset: number;
    longPressed: boolean;
    timer?: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (selectionMode) setOffset(0);
  }, [selectionMode]);

  const clearLongPress = () => {
    const gesture = gestureRef.current;
    if (gesture?.timer) window.clearTimeout(gesture.timer);
    if (gesture) gesture.timer = undefined;
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionMode || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const gesture: NonNullable<typeof gestureRef.current> = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset, longPressed: false };
    gesture.timer = window.setTimeout(() => {
      gesture.longPressed = true;
      suppressClickRef.current = true;
      setOffset(0);
      onLongPress();
    }, 520);
    gestureRef.current = gesture;
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.longPressed) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 8) clearLongPress();
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return;
    setOffset(Math.max(-92, Math.min(92, gesture.offset + dx)));
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearLongPress();
    gestureRef.current = null;
    if (gesture.longPressed) return;
    setOffset((value) => value > 34 ? 88 : value < -34 ? -88 : 0);
  };

  const cancel = () => {
    clearLongPress();
    gestureRef.current = null;
    setOffset(0);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selectionMode) onToggleSelect();
    else if (Math.abs(offset) > 8) setOffset(0);
    else onOpen();
  };

  return (
    <article className={`notification-row-shell${selected ? " is-selected" : ""}`} data-read={Boolean(item.readAt)} data-swipe={offset > 0 ? "delete" : offset < 0 ? "read" : "closed"} data-selection-mode={selectionMode}>
      {!selectionMode && <>
        <button className="notification-swipe-action notification-swipe-delete" type="button" onClick={() => { onDelete(); setOffset(0); }} tabIndex={offset > 0 ? 0 : -1} aria-label={locale === "zh" ? `删除${item.title}` : `Delete ${item.title}`}><Trash2 size={21} /><span>{locale === "zh" ? "删除" : "Delete"}</span></button>
        <button className="notification-swipe-action notification-swipe-read" type="button" onClick={() => { onReadChange(Boolean(item.readAt)); setOffset(0); }} tabIndex={offset < 0 ? 0 : -1} aria-label={item.readAt ? (locale === "zh" ? `标记${item.title}为未读` : `Mark ${item.title} unread`) : (locale === "zh" ? `标记${item.title}为已读` : `Mark ${item.title} read`)}>{item.readAt ? <Mail size={21} /> : <MailOpen size={21} />}<span>{item.readAt ? (locale === "zh" ? "未读" : "Unread") : (locale === "zh" ? "已读" : "Read")}</span></button>
      </>}
      <div
        className="notification-row-card"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
        onContextMenu={(event) => { event.preventDefault(); if (!selectionMode) onLongPress(); }}
        style={{ transform: `translateX(${selectionMode ? 0 : offset}px)` }}
      >
        <button type="button" className="notification-row-main" onClick={handleClick} aria-pressed={selectionMode ? selected : undefined}>
          {selectionMode && <span className="notification-select-check" aria-hidden="true">{selected && <Check size={15} />}</span>}
          <NotificationCategoryIcon item={item} />
          <span className="notification-row-copy">
            <span className="notification-row-meta"><strong>{categoryLabel(item, locale)}</strong></span>
            <b>{item.title}</b>
            <span className="notification-row-body">{item.body}</span>
          </span>
          <span className="notification-row-side">
            <time dateTime={item.createdAt}>{relativeTime(item.createdAt, locale)}</time>
            {!item.readAt && !selectionMode && <i className="notification-unread-dot" aria-label={locale === "zh" ? "未读" : "Unread"} />}
          </span>
        </button>
      </div>
    </article>
  );
}

export default function NotificationCenter({
  userId,
  items,
  locale,
  onBack,
  onOpenSettings,
  onOpenTarget,
}: {
  userId: string;
  items: NavaNotificationItem[];
  locale: "zh" | "en";
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenTarget: (target?: NavaNotificationTarget) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [deleted, setDeleted] = useState<NavaNotificationItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const unreadCount = items.filter((item) => !item.readAt).length;
  const shownItems = useMemo(() => filter === "unread" ? items.filter((item) => !item.readAt) : items, [filter, items]);
  const detailItem = items.find((item) => item.id === detailId) ?? null;
  const detailFeedbackOptions = detailItem ? feedbackOptions(detailItem, locale) : [];
  const allShownSelected = shownItems.length > 0 && shownItems.every((item) => selectedIds.has(item.id));

  useEffect(() => {
    if (deleted.length === 0) return;
    const timeout = window.setTimeout(() => setDeleted([]), 5_500);
    return () => window.clearTimeout(timeout);
  }, [deleted]);
  useEffect(() => {
    setSelectedIds((current) => {
      const available = new Set(items.map((item) => item.id));
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
    if (detailId && !items.some((item) => item.id === detailId)) setDetailId(null);
  }, [detailId, items]);
  useEffect(() => {
    if (!detailItem || detailItem.readAt) return;
    markNavaNotification(userId, detailItem.id, true);
  }, [detailItem, userId]);
  useEffect(() => {
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailId) setDetailId(null);
      else if (selectionMode) {
        setSelectionMode(false);
        setSelectedIds(new Set());
      } else setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOverlay);
    return () => {
      document.removeEventListener("keydown", closeOverlay);
    };
  }, [detailId, selectionMode]);

  const openDetails = (item: NavaNotificationItem) => {
    setDetailId(item.id);
  };

  const enterSelection = (id?: string) => {
    setMenuOpen(false);
    setSelectionMode(true);
    setSelectedIds(id ? new Set([id]) : new Set());
  };

  const leaveSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeItems = (ids: string[]) => {
    const removed = deleteNavaNotifications(userId, ids);
    if (removed.length > 0) setDeleted(removed);
  };

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(locale === "zh" ? `删除选中的 ${selectedIds.size} 条通知？` : `Delete ${selectedIds.size} selected notifications?`)) return;
    removeItems([...selectedIds]);
    leaveSelection();
  };

  const deleteAll = () => {
    setMenuOpen(false);
    if (items.length === 0 || !window.confirm(locale === "zh" ? "删除全部通知？" : "Delete all notifications?")) return;
    removeItems(items.map((item) => item.id));
  };

  return (
    <section className="home-experience notification-center" data-notification-center>
      <header className={`home-experience-header notification-center-header${selectionMode ? " is-selecting" : ""}`}>
        <button type="button" onClick={selectionMode ? leaveSelection : onBack} aria-label={selectionMode ? (locale === "zh" ? "退出多选" : "Exit selection") : (locale === "zh" ? "返回首页" : "Back home")}>{selectionMode ? <X size={21} /> : <ArrowLeft size={21} />}</button>
        <div className="notification-center-title"><h1>{selectionMode ? (locale === "zh" ? `已选择 ${selectedIds.size} 项` : `${selectedIds.size} selected`) : (locale === "zh" ? "通知中心" : "Notifications")}</h1></div>
        {selectionMode ? (
          <div className="notification-selection-actions">
            <button type="button" onClick={deleteSelection} disabled={selectedIds.size === 0} aria-label={locale === "zh" ? "删除所选通知" : "Delete selected notifications"}><Trash2 size={20} /></button>
            <button type="button" onClick={() => { markNavaNotifications(userId, [...selectedIds], true); leaveSelection(); }} disabled={selectedIds.size === 0} aria-label={locale === "zh" ? "标记所选通知为已读" : "Mark selected notifications read"}><MailOpen size={20} /></button>
          </div>
        ) : (
          <MoreMenu open={menuOpen} onOpenChange={setMenuOpen} label={locale === "zh" ? "通知操作" : "Notification actions"}>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}><BellRing size={17} />{locale === "zh" ? "提醒设置" : "Reminder settings"}</button>
              <button type="button" role="menuitem" disabled={unreadCount === 0} onClick={() => { markAllNavaNotificationsRead(userId); setMenuOpen(false); }}><MailOpen size={17} />{locale === "zh" ? "全部已读" : "Mark all read"}</button>
              <button type="button" role="menuitem" disabled={items.length === 0} onClick={deleteAll}><Trash2 size={17} />{locale === "zh" ? "全部删除" : "Delete all"}</button>
              <button type="button" role="menuitem" disabled={items.length === 0} onClick={() => enterSelection()}><ListPlus size={17} />{locale === "zh" ? "多选" : "Select"}</button>
          </MoreMenu>
        )}
      </header>


      {selectionMode ? (
        <div className="notification-selection-bar">
          <button type="button" onClick={() => setSelectedIds(allShownSelected ? new Set() : new Set(shownItems.map((item) => item.id)))} disabled={shownItems.length === 0}>{allShownSelected ? (locale === "zh" ? "取消全选" : "Clear all") : (locale === "zh" ? "全选" : "Select all")}</button>
          <span>{locale === "zh" ? `当前显示 ${shownItems.length} 条` : `${shownItems.length} shown`}</span>
        </div>
      ) : (
        <div className="notification-filter-tabs" role="tablist" aria-label={locale === "zh" ? "通知筛选" : "Notification filter"}>
          <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>{locale === "zh" ? "全部" : "All"}<span>{items.length}</span></button>
          <button type="button" role="tab" aria-selected={filter === "unread"} onClick={() => setFilter("unread")}>{locale === "zh" ? "未读" : "Unread"}<span>{unreadCount}</span></button>
        </div>
      )}

      <div className="notification-list" aria-live="polite">
        {shownItems.map((item) => (
          <NotificationRow
            key={item.id}
            item={item}
            locale={locale}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.id)}
            onOpen={() => openDetails(item)}
            onReadChange={(read) => markNavaNotification(userId, item.id, !read)}
            onDelete={() => { const removed = deleteNavaNotification(userId, item.id); if (removed) setDeleted([removed]); }}
            onToggleSelect={() => toggleSelection(item.id)}
            onLongPress={() => enterSelection(item.id)}
          />
        ))}
        {shownItems.length === 0 && <div className="notification-empty-state"><span><Inbox size={30} /></span><strong>{filter === "unread" ? (locale === "zh" ? "没有未读通知" : "No unread notifications") : (locale === "zh" ? "通知箱很安静" : "Your inbox is quiet")}</strong><p>{locale === "zh" ? "NAVA 会根据真实记录和已授权的提醒设置，把重要事项放在这里。" : "NAVA places reminders here based on real records and your permissions."}</p></div>}
      </div>

      {detailItem && <div className="notification-detail-layer" role="presentation" onClick={() => setDetailId(null)}>
        <section className="notification-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title" onClick={(event) => event.stopPropagation()}>
          <button className="notification-detail-close" type="button" onClick={() => setDetailId(null)} aria-label={locale === "zh" ? "关闭通知详情" : "Close notification details"}><X size={20} /></button>
          <div className="notification-detail-heading">
            <NotificationCategoryIcon item={detailItem} />
            <div><strong>{categoryLabel(detailItem, locale)}</strong><time dateTime={detailItem.createdAt}>{relativeTime(detailItem.createdAt, locale)}</time></div>
          </div>
          <h2 id="notification-detail-title">{detailItem.title}</h2>
          <p>{detailItem.body}</p>
          {detailFeedbackOptions.length > 0 && <fieldset className="notification-detail-feedback">
            <legend>{locale === "zh" ? "反馈当前状态" : "Share current status"}</legend>
            {detailFeedbackOptions.map(([value, label]) => <button key={value} type="button" className={detailItem.target?.feedback === value ? "selected" : ""} aria-pressed={detailItem.target?.feedback === value} onClick={() => respondToNavaNotification(userId, detailItem.id, value)}>{detailItem.target?.feedback === value && <Check size={14} />}{label}</button>)}
            {detailItem.target?.feedbackAt && <small>{locale === "zh" ? "反馈已保存到当前账号" : "Feedback saved to your account"}</small>}
          </fieldset>}
          {detailItem.target && <button className="notification-detail-target" type="button" onClick={() => { setDetailId(null); onOpenTarget(detailItem.target); }}>{locale === "zh" ? "打开相关页面" : "Open related page"}</button>}
        </section>
      </div>}

      {deleted.length > 0 && <div className="notification-undo" role="status"><span>{locale === "zh" ? `已删除 ${deleted.length} 条通知` : `${deleted.length} notification${deleted.length === 1 ? "" : "s"} deleted`}</span><button type="button" onClick={() => { if (deleted.length === 1) restoreNavaNotification(userId, deleted[0]); else restoreNavaNotifications(userId, deleted); setDeleted([]); }}><Undo2 size={16} />{locale === "zh" ? "撤销" : "Undo"}</button></div>}
    </section>
  );
}
