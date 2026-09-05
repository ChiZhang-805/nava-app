import { ArchiveRestore, ArrowLeft, Bell, BellRing, CheckCheck, Inbox, Mail, MailOpen, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  deleteNavaNotification,
  enableNavaNotificationSuite,
  markAllNavaNotificationsRead,
  markNavaNotification,
  notificationPermissionState,
  restoreNavaNotification,
  type NavaNotificationItem,
  type NavaNotificationTarget,
} from "../services/notifications";

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

function NotificationRow({
  item,
  locale,
  onOpen,
  onReadChange,
  onDelete,
}: {
  item: NavaNotificationItem;
  locale: "zh" | "en";
  onOpen: () => void;
  onReadChange: (read: boolean) => void;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const gestureRef = useRef<{ pointerId: number; x: number; y: number; offset: number } | null>(null);

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic accessibility/QA pointer events do not always own capture.
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return;
    setOffset(Math.max(-92, Math.min(92, gesture.offset + dx)));
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setOffset((value) => value > 34 ? 88 : value < -34 ? -88 : 0);
  };

  return (
    <article className="notification-row-shell" data-read={Boolean(item.readAt)} data-swipe={offset > 0 ? "delete" : offset < 0 ? "read" : "closed"}>
      <button className="notification-swipe-action notification-swipe-delete" type="button" onClick={() => { onDelete(); setOffset(0); }} tabIndex={offset > 0 ? 0 : -1} aria-label={locale === "zh" ? `删除${item.title}` : `Delete ${item.title}`}><Trash2 size={22} /><span>{locale === "zh" ? "删除" : "Delete"}</span></button>
      <button className="notification-swipe-action notification-swipe-read" type="button" onClick={() => { onReadChange(Boolean(item.readAt)); setOffset(0); }} tabIndex={offset < 0 ? 0 : -1} aria-label={item.readAt ? (locale === "zh" ? `标记${item.title}为未读` : `Mark ${item.title} unread`) : (locale === "zh" ? `标记${item.title}为已读` : `Mark ${item.title} read`)}>{item.readAt ? <Mail size={22} /> : <MailOpen size={22} />}<span>{item.readAt ? (locale === "zh" ? "未读" : "Unread") : (locale === "zh" ? "已读" : "Read")}</span></button>
      <div
        className="notification-row-card"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => { gestureRef.current = null; setOffset(0); }}
        style={{ transform: `translateX(${offset}px)` }}
      >
        <button type="button" className="notification-row-main" onClick={() => { if (Math.abs(offset) > 8) setOffset(0); else onOpen(); }}>
          <span className="notification-row-icon" data-category={item.category} aria-hidden="true"><Bell size={20} /></span>
          <span className="notification-row-copy">
            <span className="notification-row-meta"><strong>{categoryLabel(item, locale)}</strong><time dateTime={item.createdAt}>{relativeTime(item.createdAt, locale)}</time></span>
            <b>{item.title}</b>
            <span>{item.body}</span>
          </span>
          {!item.readAt && <i className="notification-unread-dot" aria-label={locale === "zh" ? "未读" : "Unread"} />}
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
  onOpenTarget,
}: {
  userId: string;
  items: NavaNotificationItem[];
  locale: "zh" | "en";
  onBack: () => void;
  onOpenTarget: (target?: NavaNotificationTarget) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [deleted, setDeleted] = useState<NavaNotificationItem | null>(null);
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof notificationPermissionState>>>("prompt");
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const unreadCount = items.filter((item) => !item.readAt).length;
  const shownItems = useMemo(() => filter === "unread" ? items.filter((item) => !item.readAt) : items, [filter, items]);

  useEffect(() => { void notificationPermissionState().then(setPermission); }, []);
  useEffect(() => {
    if (!deleted) return;
    const timeout = window.setTimeout(() => setDeleted(null), 5_500);
    return () => window.clearTimeout(timeout);
  }, [deleted]);

  const enableSystem = async () => {
    setPermissionBusy(true);
    setPermissionError(null);
    try {
      await enableNavaNotificationSuite(userId, "22:30", locale);
      setPermission(await notificationPermissionState());
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error));
      setPermission(await notificationPermissionState());
    } finally {
      setPermissionBusy(false);
    }
  };

  return (
    <section className="home-experience notification-center" data-notification-center>
      <header className="home-experience-header notification-center-header">
        <button type="button" onClick={onBack} aria-label={locale === "zh" ? "返回首页" : "Back home"}><ArrowLeft size={21} /></button>
        <div><span>{locale === "zh" ? "通知中心" : "Notifications"}</span><small>{unreadCount > 0 ? (locale === "zh" ? `${unreadCount} 条未读` : `${unreadCount} unread`) : (locale === "zh" ? "全部已读" : "All caught up")}</small></div>
        <button type="button" onClick={() => markAllNavaNotificationsRead(userId)} disabled={unreadCount === 0} aria-label={locale === "zh" ? "全部标为已读" : "Mark all read"}><CheckCheck size={21} /></button>
      </header>

      <section className="notification-permission-card" data-permission={permission}>
        <span><BellRing size={21} /></span>
        <div><strong>{locale === "zh" ? "系统通知" : "System notifications"}</strong><p>{permission === "granted" ? (locale === "zh" ? "已授权；安装版可在锁屏和通知中心显示提醒。" : "Enabled for lock screen and notification center in the installed app.") : permission === "unsupported" ? (locale === "zh" ? "当前浏览器不支持；应用内提醒仍可正常使用。" : "Unavailable here; in-app reminders still work.") : (locale === "zh" ? "开启后安排睡眠、饮食、专注、情绪、状态和周报提醒。" : "Enable sleep, diet, focus, mood, status, and weekly reminders.")}</p></div>
        {permission !== "granted" && permission !== "unsupported" && <button type="button" onClick={() => void enableSystem()} disabled={permissionBusy}>{permissionBusy ? (locale === "zh" ? "开启中" : "Enabling") : (locale === "zh" ? "开启" : "Enable")}</button>}
      </section>
      {permissionError && <p className="notification-permission-error" role="alert">{permissionError}</p>}

      <div className="notification-filter-tabs" role="tablist" aria-label={locale === "zh" ? "通知筛选" : "Notification filter"}>
        <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>{locale === "zh" ? "全部" : "All"}<span>{items.length}</span></button>
        <button type="button" role="tab" aria-selected={filter === "unread"} onClick={() => setFilter("unread")}>{locale === "zh" ? "未读" : "Unread"}<span>{unreadCount}</span></button>
      </div>

      <p className="notification-swipe-hint"><ArchiveRestore size={15} />{locale === "zh" ? "右滑显示删除，左滑标记已读或未读" : "Swipe right to delete; left to change read state"}</p>

      <div className="notification-list" aria-live="polite">
        {shownItems.map((item) => (
          <NotificationRow
            key={item.id}
            item={item}
            locale={locale}
            onOpen={() => { markNavaNotification(userId, item.id, true); onOpenTarget(item.target); }}
            onReadChange={(read) => markNavaNotification(userId, item.id, !read)}
            onDelete={() => { const removed = deleteNavaNotification(userId, item.id); if (removed) setDeleted(removed); }}
          />
        ))}
        {shownItems.length === 0 && <div className="notification-empty-state"><span><Inbox size={30} /></span><strong>{filter === "unread" ? (locale === "zh" ? "没有未读通知" : "No unread notifications") : (locale === "zh" ? "通知箱很安静" : "Your inbox is quiet")}</strong><p>{locale === "zh" ? "NAVA 会根据真实记录和已授权的提醒设置，把重要事项放在这里。" : "NAVA places reminders here based on real records and your permissions."}</p></div>}
      </div>

      {deleted && <div className="notification-undo" role="status"><span>{locale === "zh" ? "通知已移到删除状态" : "Notification deleted"}</span><button type="button" onClick={() => { restoreNavaNotification(userId, deleted); setDeleted(null); }}><Undo2 size={16} />{locale === "zh" ? "撤销" : "Undo"}</button></div>}
    </section>
  );
}
