import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./bottom-sheet.css";

type BottomSheetProps = {
  children: ReactNode;
  label: string;
  closeLabel: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
};

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** One presentation boundary for compact, non-dimming app sheets. Mount while open. */
export default function BottomSheet({ children, label, closeLabel, onClose, busy = false, className = "" }: BottomSheetProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const grabberRef = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onClose, busy });
  callbacks.current = { onClose, busy };
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ id: number; y: number; distance: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreClick = useRef(false);

  const dismiss = () => {
    if (callbacks.current.busy || closeTimer.current) return;
    setClosing(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (!callbacks.current.busy) callbacks.current.onClose();
      else setClosing(false);
    }, duration);
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    setHost(anchorRef.current?.closest<HTMLElement>(".phone-frame") ?? document.body);
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    if (!host || !dialogRef.current) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const portal = dialogRef.current.parentElement;
    // Preserve both keyboard and VoiceOver modality while leaving the screen visually unchanged.
    const siblings = Array.from(host.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== portal);
    const originalInert = siblings.map((node) => node.inert);
    grabberRef.current?.focus({ preventScroll: true });
    siblings.forEach((node) => { node.inert = true; });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? []).filter((node) => node.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      siblings.forEach((node, index) => { node.inert = originalInert[index]; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [host]);

  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    ignoreClick.current = current.distance > 6;
    setDragY(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && current.distance >= 56) dismiss();
  };

  return <>
    <span ref={anchorRef} hidden />
    {host && createPortal(
      <div className={`nava-bottom-sheet-layer${host === document.body ? " is-viewport" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
        <section ref={dialogRef} className={`nava-bottom-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} aria-busy={busy || undefined} tabIndex={-1}
          data-closing={closing || undefined} data-dragging={drag.current ? "true" : undefined} style={{ translate: dragY ? `0 ${dragY}px` : undefined }}>
          <button ref={grabberRef} type="button" className="nava-bottom-sheet-grabber" aria-label={closeLabel} aria-disabled={busy || undefined}
            onClick={() => { if (ignoreClick.current) { ignoreClick.current = false; return; } dismiss(); }}
            onPointerDown={(event) => {
              if (busy || !event.isPrimary || event.button !== 0) return;
              ignoreClick.current = false;
              drag.current = { id: event.pointerId, y: event.clientY, distance: 0 };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current || drag.current.id !== event.pointerId) return;
              drag.current.distance = Math.max(0, event.clientY - drag.current.y);
              setDragY(drag.current.distance);
            }}
            onPointerUp={(event) => endDrag(event)} onPointerCancel={(event) => endDrag(event, true)}>
            <span aria-hidden="true" />
          </button>
          <div className="nava-bottom-sheet-content">{children}</div>
        </section>
      </div>, host)}
  </>;
}
