import { useEffect, useRef, useState } from "react";

function currentClock() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function DesktopDevicePreviewChrome() {
  const [clock, setClock] = useState(currentClock);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setClock(currentClock());
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, []);

  useEffect(() => {
    const stage = previewRef.current?.parentElement;
    if (!stage) return;
    const desktopPreview = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 700px) and (min-height: 700px)");
    const updateScale = () => {
      if (!desktopPreview.matches) {
        stage.style.removeProperty("--nava-preview-scale");
        return;
      }
      const scale = Math.min(1, Math.max(0.68, (window.innerHeight - 52) / 932));
      stage.style.setProperty("--nava-preview-scale", scale.toFixed(6));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    desktopPreview.addEventListener("change", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      desktopPreview.removeEventListener("change", updateScale);
      stage.style.removeProperty("--nava-preview-scale");
    };
  }, []);

  return (
    <div ref={previewRef} className="nava-device-preview" aria-hidden="true" data-preview-only="desktop-device-chrome">
      <span className="nava-device-side-button nava-device-side-button--ringer" />
      <span className="nava-device-side-button nava-device-side-button--volume-up" />
      <span className="nava-device-side-button nava-device-side-button--volume-down" />
      <span className="nava-device-side-button nava-device-side-button--power" />
      <div className="nava-device-status-bar">
        <time>{clock}</time>
        <span className="nava-device-dynamic-island"><i /></span>
        <span className="nava-device-status-icons">
          <svg className="nava-device-signal" viewBox="0 0 18 13">
            <rect x="1" y="8" width="2.5" height="4" rx="1" />
            <rect x="5.5" y="6" width="2.5" height="6" rx="1" />
            <rect x="10" y="3.5" width="2.5" height="8.5" rx="1" />
            <rect x="14.5" y="1" width="2.5" height="11" rx="1" />
          </svg>
          <svg className="nava-device-wifi" viewBox="0 0 18 14">
            <path d="M1.3 4.5C5.7.8 12.3.8 16.7 4.5M4.1 7.7c2.8-2.3 7-2.3 9.8 0M7.2 10.7c1-.8 2.6-.8 3.6 0" />
            <circle cx="9" cy="12.4" r="1" />
          </svg>
          <span className="nava-device-battery"><i /></span>
        </span>
      </div>
    </div>
  );
}
