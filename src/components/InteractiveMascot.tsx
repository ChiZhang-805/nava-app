import { useEffect, useRef, useState, type MouseEvent } from "react";
import lifeFigure from "../assets/figma/home-option2/home-mascot-v5.png";
import idleMotion from "../assets/mascot/animated/home-idle.webp";
import { homeMascotActions, preferredHomeMascotAction } from "../services/homeMascotClips";
import { HomeMascotPlayer } from "../services/homeMascotPlayer";
import type { MascotMotion } from "../services/mascotMotion";

export default function InteractiveMascot({ locale, preferredMotion }: { locale: "zh" | "en"; preferredMotion?: MascotMotion }) {
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [preferredPlayed, setPreferredPlayed] = useState(false);
  const [state, setState] = useState({ action: "idle", phase: "loading", queued: false });
  const [run, setRun] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<HomeMascotPlayer | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const instance = new HomeMascotPlayer(canvas.current, idleMotion, setState);
    player.current = instance;
    return () => { instance.dispose(); player.current = null; };
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

  const motion = homeMascotActions.find((action) => action.id === state.action);

  const playNext = (event: MouseEvent<HTMLButtonElement>) => {
    if (!player.current?.play(nextAction)) return;
    const home = event.currentTarget.closest<HTMLElement>(".option-two-home");
    if (home) {
      home.scrollLeft = 0;
    }

    setRun((value) => value + 1);
    if (!preferredPlayed && preferredAction) {
      setPreferredPlayed(true);
      setSequenceIndex((homeMascotActions.indexOf(preferredAction) + 1) % homeMascotActions.length);
    } else {
      setSequenceIndex((value) => (value + 1) % homeMascotActions.length);
    }
    navigator.vibrate?.(12);
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
        ? (locale === "zh" ? `小猫正在${activeLabel}${state.queued ? "，下个动作已排队" : "，点击安排下个动作"}` : `The cat is ${activeLabel}${state.queued ? "; next action queued" : "; tap for its next action"}`)
        : (locale === "zh" ? `点击小猫，让它${nextLabel}` : `Tap the NAVA cat to ${nextLabel}`)}
      data-mascot-motion={motion?.id ?? "idle"}
      data-next-motion={nextAction.id}
      data-context-motion={preferredMotion ?? "sequence"}
      data-motion-run={run}
      data-motion-visual="persistent-mascot-player"
      data-player-phase={state.phase}
      data-action-queued={state.queued}
    >
      <span className="visually-hidden">{locale === "zh" ? "点击小猫播放下一个动作" : "Tap the cat for its next action"}</span>
      <canvas ref={canvas} width={640} height={480} aria-hidden="true"
        className="nava-mascot-pose nava-mascot-pose--idle nava-mascot-canvas" />
      <img className="nava-mascot-fallback" src={lifeFigure} alt="" aria-hidden="true" draggable={false} />
    </button>
  );
}
