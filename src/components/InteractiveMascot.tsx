import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import lifeFigure from "../assets/figma/home-option2/raw-01.png";
import liftSprite from "../assets/mascot/nava-lift-sprite-v3.webp";
import readSprite from "../assets/mascot/nava-read-sprite-v3.webp";
import sleepSprite from "../assets/mascot/nava-sleep-sprite-v3.webp";
import tailSprite from "../assets/mascot/nava-tail-sprite-v3.webp";
import waveSprite from "../assets/mascot/nava-wave-sprite-v3.webp";
import {
  mascotArtworkFrame,
  mascotFramesPerSecond,
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

const actionSprites: Record<MascotMotion, { source: string; columns: number; rows: number }> = {
  wave: { source: waveSprite, columns: 6, rows: 4 },
  tail: { source: tailSprite, columns: 6, rows: 4 },
  read: { source: readSprite, columns: 6, rows: 4 },
  sleep: { source: sleepSprite, columns: 6, rows: 4 },
  lift: { source: liftSprite, columns: 5, rows: 4 },
};

export default function InteractiveMascot({ locale, preferredMotion }: { locale: "zh" | "en"; preferredMotion?: MascotMotion }) {
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [motion, setMotion] = useState<MascotMotion | null>(null);
  const [run, setRun] = useState(0);
  const [displayFrame, setDisplayFrame] = useState(0);
  const timerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    if (!motion) {
      setDisplayFrame(0);
      return;
    }

    const startedAt = performance.now();
    let previousFrame = -1;
    const draw = (now: number) => {
      const nextFrame = Math.min(95, Math.floor(((now - startedAt) * mascotFramesPerSecond) / 1000));
      if (nextFrame !== previousFrame) {
        previousFrame = nextFrame;
        setDisplayFrame(nextFrame);
      }
      if (nextFrame < 95) animationRef.current = window.requestAnimationFrame(draw);
    };
    animationRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [motion, run]);

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
  const artworkFrame = motion ? mascotArtworkFrame(motion, displayFrame) : 0;
  const activeSprite = motion ? actionSprites[motion] : null;
  const spriteColumn = activeSprite ? artworkFrame % activeSprite.columns : 0;
  const spriteRow = activeSprite ? Math.floor(artworkFrame / activeSprite.columns) : 0;
  const spriteStyle = activeSprite ? {
    backgroundImage: `url(${activeSprite.source})`,
    backgroundSize: `${activeSprite.columns * 100}% ${activeSprite.rows * 100}%`,
    backgroundPosition: `${activeSprite.columns === 1 ? 0 : (spriteColumn / (activeSprite.columns - 1)) * 100}% ${activeSprite.rows === 1 ? 0 : (spriteRow / (activeSprite.rows - 1)) * 100}%`,
  } satisfies CSSProperties : undefined;
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
      data-display-frame={displayFrame}
      data-artwork-frame={artworkFrame}
      data-animation-fps={mascotFramesPerSecond}
    >
      <span className="visually-hidden">{locale === "zh" ? "点击小猫播放下一个动作" : "Tap the cat for its next action"}</span>
      {motion
        ? <span
            key={`${motion}-${run}`}
            className={`nava-mascot-animation nava-mascot-animation--${motion}`}
            style={spriteStyle}
            aria-hidden="true"
            data-animation-frames="96"
            data-artwork-frames={activeSprite ? activeSprite.columns * activeSprite.rows : 0}
          />
        : <img className="nava-mascot-pose nava-mascot-pose--idle" src={lifeFigure} alt="" aria-hidden="true" draggable={false} />}
    </button>
  );
}
