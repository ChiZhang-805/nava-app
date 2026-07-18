import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";

const STORAGE_KEY = "nava.launch.sequence.v1";

function shouldPlay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return window.sessionStorage.getItem(STORAGE_KEY) !== "seen";
}

export default function LaunchSequence() {
  const t = useT();
  const [visible, setVisible] = useState(shouldPlay);
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setReady(true), 3700);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const close = () => {
    if (!ready || exiting) return;
    window.sessionStorage.setItem(STORAGE_KEY, "seen");
    setExiting(true);
    window.setTimeout(() => setVisible(false), 420);
  };

  return (
    <div className={["launch-sequence", ready ? "ready" : "", exiting ? "exiting" : ""].filter(Boolean).join(" ")} aria-live="polite">
      <div className="launch-lines">
        <span>{t("intro.one")}</span>
        <span>{t("intro.two")}</span>
        <span>{t("intro.three")}</span>
      </div>
      <button className="launch-start" type="button" onClick={close} disabled={!ready}>
        <span>{t("intro.start")}</span>
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
