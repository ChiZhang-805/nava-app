import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useT, type TranslationKey } from "../i18n";
import { requestBackgroundMotionPermission } from "../services/backgroundMotion";
import NavaWordmark from "./NavaWordmark";

const STORAGE_KEY = "nava.launch.sequence.v2";
const LINE_ACTIVE_MS = 8000;
const FADE_DURATION_MS = 1200;
const lineKeys: TranslationKey[] = ["intro.one", "intro.two", "intro.three"];
const LaunchBubble = lazy(() => import("./LaunchBubble"));

function shouldPlay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return window.sessionStorage.getItem(STORAGE_KEY) !== "seen";
}

export default function LaunchSequence() {
  const t = useT();
  const [visible, setVisible] = useState(shouldPlay);
  const [lineIndex, setLineIndex] = useState(0);
  const [lineState, setLineState] = useState<"entering" | "leaving">("entering");
  const [exiting, setExiting] = useState(false);
  const ready = lineIndex >= lineKeys.length;
  const currentLine = useMemo(() => (ready ? "" : t(lineKeys[lineIndex])), [lineIndex, ready, t]);

  const advanceLine = useCallback(() => {
    if (ready || exiting || lineState === "leaving") return;
    setLineState("leaving");
    window.setTimeout(() => {
      setLineIndex((value) => value + 1);
      setLineState("entering");
    }, FADE_DURATION_MS);
  }, [exiting, lineState, ready]);

  useEffect(() => {
    if (!visible || ready || exiting || lineState === "leaving") return;
    const timer = window.setTimeout(advanceLine, LINE_ACTIVE_MS);
    return () => window.clearTimeout(timer);
  }, [advanceLine, exiting, lineIndex, lineState, ready, visible]);

  if (!visible) return null;

  const close = () => {
    if (!ready || exiting) return;
    window.sessionStorage.setItem(STORAGE_KEY, "seen");
    setExiting(true);
    window.setTimeout(() => setVisible(false), 420);
  };

  return (
    <div
      className={["launch-sequence", ready ? "ready" : "", exiting ? "exiting" : ""].filter(Boolean).join(" ")}
      onClick={advanceLine}
      aria-live="polite"
    >
      <NavaWordmark className="launch-wordmark" />
      {ready && !exiting && (
        <Suspense fallback={null}>
          <LaunchBubble />
        </Suspense>
      )}
      <div className="launch-lines">
        {!ready && (
          <span className={["launch-line", lineState].filter(Boolean).join(" ")} key={lineIndex}>
            {currentLine}
          </span>
        )}
      </div>
      <button
        className="launch-start"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void requestBackgroundMotionPermission();
          close();
        }}
        disabled={!ready}
      >
        {t("intro.start")}
      </button>
    </div>
  );
}
