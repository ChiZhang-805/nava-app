import { useEffect, useRef, useState, type MouseEvent } from "react";
import lifeFigure from "../assets/figma/home-option2/home-mascot-v5.png";
import idleMotion from "../assets/mascot/animated/home-idle.webp";
import MascotImage from "./MascotImage";
import { homeMascotActions, preferredHomeMascotAction, type HomeMascotAction } from "../services/homeMascotClips";
import type { MascotMotion } from "../services/mascotMotion";

export default function InteractiveMascot({ locale, preferredMotion }: { locale: "zh" | "en"; preferredMotion?: MascotMotion }) {
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [preferredPlayed, setPreferredPlayed] = useState(false);
  const [motion, setMotion] = useState<HomeMascotAction | null>(null);
  const [clipIndex, setClipIndex] = useState(0);
  const [run, setRun] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    setPreferredPlayed(false);
  }, [preferredMotion]);

  const preferredAction = preferredMotion
    ? homeMascotActions.find((candidate) => candidate.id === preferredHomeMascotAction[preferredMotion])
    : null;
  const nextAction = !preferredPlayed && preferredAction
    ? preferredAction
    : homeMascotActions[sequenceIndex % homeMascotActions.length];

  const playClip = (action: HomeMascotAction, index: number) => {
    timerRef.current = window.setTimeout(() => {
      if (index + 1 < action.clips.length) {
        setClipIndex(index + 1);
        playClip(action, index + 1);
      } else {
        setMotion(null);
        setClipIndex(0);
        timerRef.current = null;
      }
    }, action.clips[index].durationMs);
  };

  const playNext = (event: MouseEvent<HTMLButtonElement>) => {
    if (motion) return;
    const home = event.currentTarget.closest<HTMLElement>(".option-two-home");
    if (home) {
      home.scrollLeft = 0;
      window.requestAnimationFrame(() => { home.scrollLeft = 0; });
    }

    const next = nextAction;
    setMotion(next);
    setClipIndex(0);
    setRun((value) => value + 1);
    if (!preferredPlayed && preferredAction) {
      setPreferredPlayed(true);
      setSequenceIndex((homeMascotActions.indexOf(preferredAction) + 1) % homeMascotActions.length);
    } else {
      setSequenceIndex((value) => (value + 1) % homeMascotActions.length);
    }
    navigator.vibrate?.(12);
    playClip(next, 0);
  };

  const nextLabel = nextAction.label[locale];
  const activeLabel = motion?.label[locale];
  return (
    <button
      className={["nava-mascot", motion ? `nava-mascot--${motion.id}` : "nava-mascot--idle"].join(" ")}
      type="button"
      onClick={playNext}
      onPointerDown={(event) => event.preventDefault()}
      aria-label={motion
        ? (locale === "zh" ? `小猫正在${activeLabel}` : `The NAVA cat is about to ${activeLabel}`)
        : (locale === "zh" ? `点击小猫，让它${nextLabel}` : `Tap the NAVA cat to ${nextLabel}`)}
      aria-disabled={motion ? "true" : "false"}
      data-mascot-motion={motion?.id ?? "idle"}
      data-next-motion={nextAction.id}
      data-context-motion={preferredMotion ?? "sequence"}
      data-motion-run={run}
      data-motion-visual="supplied-animated-mascot"
    >
      <span className="visually-hidden">{locale === "zh" ? "点击小猫播放下一个动作" : "Tap the cat for its next action"}</span>
      <MascotImage
        key={`${run}-${clipIndex}`}
        className="nava-mascot-pose nava-mascot-pose--idle"
        animatedSrc={motion?.clips[clipIndex]?.src ?? idleMotion}
        staticSrc={lifeFigure}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </button>
  );
}
