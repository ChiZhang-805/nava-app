import { useCallback, useState, type KeyboardEvent } from "react";
import NavaWordmark from "./NavaWordmark";

const EXIT_DURATION_MS = 420;

export default function LaunchSequence() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => setVisible(false), EXIT_DURATION_MS);
  }, [exiting]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    close();
  };

  if (!visible) return null;

  return (
    <div
      className={["launch-sequence", "launch-splash", exiting ? "exiting" : ""].filter(Boolean).join(" ")}
      role="button"
      tabIndex={0}
      aria-label="进入 NAVA"
      onClick={close}
      onKeyDown={handleKeyDown}
    >
      <div className="launch-splash__brand" aria-label="NAVA Daily Rhythm">
        <span className="launch-splash__orbit" aria-hidden="true" />
        <NavaWordmark className="launch-splash__wordmark" tone="light" />
        <span className="launch-splash__subtitle">DAILY RHYTHM</span>
      </div>
      <p className="launch-splash__system-name">NAVA 智能节律系统</p>
    </div>
  );
}
