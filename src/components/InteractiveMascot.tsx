import { useEffect, useRef, useState, type MouseEvent } from "react";
import lifeFigure from "../assets/figma/home-option2/home-mascot-v5.png";
import {
  mascotMotionAt,
  mascotMotionSequence,
  nextMascotMotionIndex,
  type MascotMotion,
} from "../services/mascotMotion";

const motionLabels: Record<MascotMotion, { zh: string; en: string }> = {
  wave: { zh: "挥爪打招呼", en: "wave hello" },
  tail: { zh: "摇尾巴", en: "wag its tail" },
  read: { zh: "拿出一本书阅读", en: "read a book" },
  sleep: { zh: "趴下睡一会儿", en: "curl up for a nap" },
  lift: { zh: "举起小哑铃", en: "lift a tiny dumbbell" },
};

export default function InteractiveMascot({ locale, preferredMotion }: { locale: "zh" | "en"; preferredMotion?: MascotMotion }) {
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [motion, setMotion] = useState<MascotMotion | null>(null);
  const [run, setRun] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const playNext = (event: MouseEvent<HTMLButtonElement>) => {
    if (motion) return;
    const home = event.currentTarget.closest<HTMLElement>(".option-two-home");
    if (home) {
      home.scrollLeft = 0;
      window.requestAnimationFrame(() => { home.scrollLeft = 0; });
    }

    const next = preferredMotion
      ? mascotMotionSequence.find((candidate) => candidate.id === preferredMotion) ?? mascotMotionAt(sequenceIndex)
      : mascotMotionAt(sequenceIndex);
    setMotion(next.id);
    setRun((value) => value + 1);
    if (!preferredMotion) setSequenceIndex((value) => nextMascotMotionIndex(value));
    navigator.vibrate?.(12);
    timerRef.current = window.setTimeout(() => {
      setMotion(null);
      timerRef.current = null;
    }, next.durationMs);
  };

  const nextMotion = preferredMotion ?? mascotMotionAt(sequenceIndex).id;
  const nextLabel = motionLabels[nextMotion][locale];
  const activeLabel = motion ? motionLabels[motion][locale] : null;
  return (
    <button
      className={["nava-mascot", motion ? `nava-mascot--${motion}` : "nava-mascot--idle"].join(" ")}
      type="button"
      onClick={playNext}
      onPointerDown={(event) => event.preventDefault()}
      aria-label={motion
        ? (locale === "zh" ? `小猫正在${activeLabel}` : `The NAVA cat is about to ${activeLabel}`)
        : (locale === "zh" ? `点击小猫，让它${nextLabel}` : `Tap the NAVA cat to ${nextLabel}`)}
      aria-disabled={motion ? "true" : "false"}
      data-mascot-motion={motion ?? "idle"}
      data-next-motion={nextMotion}
      data-context-motion={preferredMotion ?? "sequence"}
      data-motion-run={run}
      data-motion-visual="figma-reference-mascot"
    >
      <span className="visually-hidden">{locale === "zh" ? "点击小猫播放下一个动作" : "Tap the cat for its next action"}</span>
      <img key={run} className="nava-mascot-pose nava-mascot-pose--idle" src={lifeFigure} alt="" aria-hidden="true" draggable={false} />
    </button>
  );
}
