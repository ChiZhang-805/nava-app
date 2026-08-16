import { useEffect, useState } from "react";

type MascotMotionSlotProps = {
  staticSrc: string;
  motionSrc?: string;
  playToken?: number;
  motionDurationMs?: number;
  className?: string;
};

export default function MascotMotionSlot({
  staticSrc,
  motionSrc,
  playToken = 0,
  motionDurationMs = 1800,
  className = "",
}: MascotMotionSlotProps) {
  const [activeToken, setActiveToken] = useState<number | null>(null);

  useEffect(() => {
    if (!motionSrc || playToken <= 0) return;

    setActiveToken(playToken);
    const timer = window.setTimeout(() => setActiveToken(null), motionDurationMs);
    return () => window.clearTimeout(timer);
  }, [motionDurationMs, motionSrc, playToken]);

  const isPlaying = Boolean(motionSrc && activeToken !== null);

  return (
    <span
      className={["mascot-motion-slot", isPlaying ? "is-playing" : "", className].filter(Boolean).join(" ")}
      data-mascot-media-slot="true"
      data-motion-ready="true"
    >
      <img
        key={isPlaying ? `motion-${activeToken}` : "static"}
        className="figma-nav-mascot"
        src={isPlaying ? motionSrc : staticSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </span>
  );
}
