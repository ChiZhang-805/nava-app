import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NavaNotificationItem } from "../services/notifications";

export default function NotificationBanner({
  item,
  locale,
  onOpen,
  onDismiss,
}: {
  item: NavaNotificationItem;
  locale: "zh" | "en";
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const gestureRef = useRef<{ pointerId: number; startY: number } | null>(null);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    setOffsetY(0);
    const timeout = window.setTimeout(onDismiss, 8_500);
    return () => window.clearTimeout(timeout);
  }, [item.id, onDismiss]);

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    gestureRef.current = { pointerId: event.pointerId, startY: event.clientY };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic accessibility/QA pointer events do not always own capture.
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setOffsetY(Math.min(0, Math.max(-96, event.clientY - gesture.startY)));
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.clientY - gesture.startY < -42) onDismiss();
    else setOffsetY(0);
  };

  return (
    <div className="nava-notification-banner-layer" role="status" aria-live="polite">
      <div
        className="nava-notification-banner"
        data-notification-category={item.category}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => { gestureRef.current = null; setOffsetY(0); }}
        style={{ transform: `translateY(${offsetY}px)` }}
      >
        <button className="nava-notification-banner-main" type="button" onClick={onOpen}>
          <span className="nava-notification-banner-icon" aria-hidden="true"><Bell size={19} /></span>
          <span className="nava-notification-banner-copy">
            <span className="nava-notification-banner-meta"><strong>NAVA</strong><time>{locale === "zh" ? "现在" : "now"}</time></span>
            <b>{item.title}</b>
            <span>{item.body}</span>
          </span>
        </button>
        <button className="nava-notification-banner-close" type="button" onClick={onDismiss} aria-label={locale === "zh" ? "关闭提醒" : "Dismiss reminder"}><X size={16} /></button>
        <span className="nava-notification-banner-grabber" aria-hidden="true" />
      </div>
    </div>
  );
}
