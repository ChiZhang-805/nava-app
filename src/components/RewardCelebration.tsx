import { Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GrowthRewardGrant } from "../services/productivity";
import { rewardLabel, rewardPoints } from "../services/rewardPresentation";

const confettiColors = ["#ffcc4d", "#28b98a", "#36aeea", "#ff7b7b", "#9f78e8", "#ffffff"];
const confetti = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  x: 8 + ((index * 37) % 84),
  drift: -42 + ((index * 29) % 84),
  delay: (index % 10) * 38,
  duration: 980 + (index % 6) * 115,
  rotation: 120 + ((index * 47) % 290),
  color: confettiColors[index % confettiColors.length],
}));

export default function RewardCelebration({
  rewards,
  locale,
  onDismiss,
}: {
  rewards: GrowthRewardGrant[];
  locale: "zh" | "en";
  onDismiss: () => void;
}) {
  const total = useMemo(() => rewardPoints(rewards), [rewards]);
  const primaryReward = rewards.find((reward) => !reward.eventKey.endsWith(":bare-face-bonus")) ?? rewards[0];
  const isProfileMilestone = primaryReward?.eventKey.startsWith("profile:") === true;
  const [visiblePoints, setVisiblePoints] = useState(0);
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = reduceMotion ? 1 : Math.min(1, (now - startedAt) / 760);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVisiblePoints(Math.round(total * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    continueRef.current?.focus({ preventScroll: true });
    if (!reduceMotion) navigator.vibrate?.([28, 36, 52]);

    const dismissTimer = window.setTimeout(onDismiss, reduceMotion ? 3000 : 4300);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(dismissTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss, total]);

  if (!primaryReward) return null;

  return (
    <div className="reward-celebration-layer" role="dialog" aria-modal="true" aria-labelledby="reward-celebration-title">
      <div className="reward-fireworks" aria-hidden="true">
        {confetti.map((piece) => (
          <i
            key={piece.id}
            style={{
              "--reward-x": `${piece.x}%`,
              "--reward-drift": `${piece.drift}px`,
              "--reward-delay": `${piece.delay}ms`,
              "--reward-duration": `${piece.duration}ms`,
              "--reward-rotation": `${piece.rotation}deg`,
              "--reward-color": piece.color,
            } as CSSProperties}
          />
        ))}
      </div>

      <section className="reward-celebration-card">
        <div className="reward-trophy-stage" aria-hidden="true">
          <span className="reward-orbit reward-orbit--one"><Sparkles size={20} /></span>
          <span className="reward-orbit reward-orbit--two"><Sparkles size={15} /></span>
          <div className="reward-trophy-halo" />
          <div className="reward-trophy"><Trophy size={72} strokeWidth={2.2} /></div>
          <span className="reward-trophy-shadow" />
        </div>

        <div className="reward-copy">
          <span>{locale === "zh" ? "NAVA 为你喝彩" : "NAVA celebrates you"}</span>
          <h2 id="reward-celebration-title">{locale === "zh" ? "做得漂亮！" : "Nicely done!"}</h2>
          <p>{rewardLabel(primaryReward.eventKey, locale)}</p>
        </div>

        <div className="reward-points" aria-live="polite">
          <small>{locale === "zh" ? "积分" : "XP"}</small>
          <strong>+{visiblePoints}</strong>
        </div>
        <p className="reward-daily-note">{isProfileMilestone
          ? (locale === "zh" ? "成长里程碑奖励" : "Growth milestone reward")
          : (locale === "zh" ? "今日首次完成奖励 · 每项每天一次" : "First completion today · once per item daily")}</p>

        <button ref={continueRef} type="button" onClick={onDismiss}>
          {locale === "zh" ? "继续" : "Continue"}
        </button>
      </section>
    </div>
  );
}
