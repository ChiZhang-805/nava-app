import { useCallback, useEffect, useMemo, useState } from "react";
import { useT, type TranslationKey } from "../i18n";

const STORAGE_KEY = "nava.launch.sequence.v1";
const LINE_DURATION_MS = 5000;
const FADE_DURATION_MS = 760;
const lineKeys: TranslationKey[] = ["intro.one", "intro.two", "intro.three", "intro.four"];

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
    const timer = window.setTimeout(advanceLine, LINE_DURATION_MS);
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
      <div className="launch-material" aria-hidden="true" />
      <svg className="launch-noise" viewBox="0 0 430 932" preserveAspectRatio="none" aria-hidden="true">
        <filter id="launchNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="430" height="932" filter="url(#launchNoise)" />
      </svg>
      <svg className="launch-waves" viewBox="0 0 430 932" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="launchWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgba(255,255,255,0)" />
            <stop offset="0.3" stopColor="rgba(255,255,255,0.52)" />
            <stop offset="0.66" stopColor="rgba(205,241,255,0.22)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id="launchWaveB" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(13,102,166,0.04)" />
            <stop offset="0.48" stopColor="rgba(255,255,255,0.34)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>
        <path d="M-64 186 C42 118 112 248 204 176 C296 104 342 112 494 206" />
        <path d="M-78 328 C52 238 132 456 246 336 C336 240 392 274 504 372" />
        <path d="M-70 492 C40 432 118 592 230 516 C334 446 382 464 500 556" />
        <path d="M-58 652 C82 548 164 704 264 638 C346 584 392 604 496 694" />
        <path className="secondary" d="M-42 252 C84 318 132 178 246 252 C340 314 384 278 474 236" />
        <path className="secondary" d="M-62 742 C54 674 146 820 252 728 C330 660 394 708 494 786" />
      </svg>
      <div className="launch-wordmark" aria-hidden="true">NAVA</div>
      <div className="launch-lines">
        {!ready && (
          <span className={["launch-line", lineState, lineKeys[lineIndex] === "intro.four" ? "brand" : ""].filter(Boolean).join(" ")} key={lineIndex}>
            {currentLine}
          </span>
        )}
      </div>
      <button
        className="launch-start"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          close();
        }}
        disabled={!ready}
      >
        {t("intro.start")}
      </button>
    </div>
  );
}
