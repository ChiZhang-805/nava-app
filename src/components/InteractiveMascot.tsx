import { useEffect, useRef, useState, type MouseEvent } from "react";
import lifeFigure from "../assets/figma/home-option2/raw-01.png";
import liftPose from "../assets/mascot/nava-lift-v1.png";
import readPose from "../assets/mascot/nava-read-v1.png";
import sleepPose from "../assets/mascot/nava-sleep-v1.png";
import tailPose from "../assets/mascot/nava-tail-v1.png";
import wavePose from "../assets/mascot/nava-wave-v1.png";
import { mascotMotionAt, nextMascotMotionIndex, type MascotMotion } from "../services/mascotMotion";

const motionLabels: Record<MascotMotion, { zh: string; en: string }> = {
  wave: { zh: "挥爪打招呼", en: "wave hello" },
  tail: { zh: "摇尾巴", en: "wag its tail" },
  read: { zh: "拿出一本书阅读", en: "read a book" },
  sleep: { zh: "趴下睡一会儿", en: "curl up for a nap" },
  lift: { zh: "举起小哑铃", en: "lift a tiny dumbbell" },
};

const actionPoses: Record<MascotMotion, string> = {
  wave: wavePose,
  tail: tailPose,
  read: readPose,
  sleep: sleepPose,
  lift: liftPose,
};

export default function InteractiveMascot({ locale }: { locale: "zh" | "en" }) {
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

    const next = mascotMotionAt(sequenceIndex);
    setMotion(next.id);
    setRun((value) => value + 1);
    setSequenceIndex((value) => nextMascotMotionIndex(value));
    navigator.vibrate?.(12);
    timerRef.current = window.setTimeout(() => {
      setMotion(null);
      timerRef.current = null;
    }, next.durationMs);
  };

  const nextMotion = mascotMotionAt(sequenceIndex).id;
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
      data-motion-run={run}
    >
      <span className="visually-hidden">{locale === "zh" ? "点击小猫播放下一个动作" : "Tap the cat for its next action"}</span>
      <span className="nava-mascot-pose-shadow" aria-hidden="true" />
      <img className="nava-mascot-pose nava-mascot-pose--idle" src={lifeFigure} alt="" aria-hidden="true" draggable={false} />
      {(Object.entries(actionPoses) as Array<[MascotMotion, string]>).map(([id, source]) => (
        <img
          key={id}
          className={`nava-mascot-pose nava-mascot-pose--${id}`}
          src={source}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ))}
    </button>
  );
}
