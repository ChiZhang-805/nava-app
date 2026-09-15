import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NavaNotificationItem } from "../services/notifications";
import navaAppIcon from "../assets/figma/option-two-icons/home-glyph.svg";

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
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    // Capturing on pointerdown retargets the eventual click to this container,
    // away from its navigation button. Capture only a deliberate upward swipe.
    if (event.clientY - gesture.startY < -6) {
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Synthetic QA events may not own capture. */ }
    }
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
          <span className="nava-notification-banner-icon" aria-hidden="true"><img src={navaAppIcon} alt="" /></span>
          <span className="nava-notification-banner-copy">
            <span className="nava-notification-banner-meta"><strong>NAVA</strong><time>{locale === "zh" ? "现在" : "now"}</time></span>
            <b>{item.title}</b>
            <span>{item.body}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
