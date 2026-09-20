import { useEffect, useRef, useState, type MouseEvent } from "react";
import lifeFigure from "../assets/figma/home-option2/home-mascot-v5.png";
import idleMotion from "../assets/mascot/animated/home-idle.webp";
import { homeMascotActions, preferredHomeMascotAction } from "../services/homeMascotClips";
import { HomeMascotPlayer } from "../services/homeMascotPlayer";
import type { MascotMotion } from "../services/mascotMotion";
import { ambientMascotAction, mascotIdleDelay, mascotTimePhase } from "../services/mascotBehavior";

export default function InteractiveMascot({ locale, preferredMotion, positiveMood = false }: { locale: "zh" | "en"; preferredMotion?: MascotMotion; positiveMood?: boolean }) {
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [preferredPlayed, setPreferredPlayed] = useState(false);
  const [state, setState] = useState({ action: "idle", phase: "loading", queued: false });
  const [run, setRun] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<HomeMascotPlayer | null>(null);
  const lastInput = useRef(Date.now());
  const lastAction = useRef("");
  const lastAutomatic = useRef(Date.now());
  const stateRef = useRef(state); stateRef.current = state;
  const stroke = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!canvas.current) return;
    const instance = new HomeMascotPlayer(canvas.current, idleMotion, setState);
    player.current = instance;
    return () => { instance.dispose(); player.current = null; };
  }, []);

  useEffect(() => {
    const input = () => { lastInput.current = Date.now(); };
    const visibility = () => { lastInput.current = Date.now(); lastAutomatic.current = Date.now(); };
    document.addEventListener("pointerdown", input, { passive: true });
    document.addEventListener("keydown", input);
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      if (document.hidden || canvas.current?.dataset.paused !== "false") { visibility(); return; }
      if (stateRef.current.phase !== "idle") return;
      const now = Date.now(), hour = new Date().getHours();
      if (now - lastAutomatic.current < mascotIdleDelay(hour)) return;
      const id = ambientMascotAction({ hour, positiveMood, sleepConcern: preferredMotion === "sleep", lastAction: lastAction.current, idleMs: now - lastInput.current });
      const action = homeMascotActions.find((item) => item.id === id);
      if (action && player.current?.play(action)) { lastAutomatic.current = now; lastAction.current = action.id; setRun((value) => value + 1); }
    }, 1000);
    return () => { clearInterval(timer); document.removeEventListener("pointerdown", input); document.removeEventListener("keydown", input); document.removeEventListener("visibilitychange", visibility); };
  }, [positiveMood, preferredMotion]);

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
    if (suppressClick.current) { suppressClick.current = false; return; }
    lastInput.current = Date.now();
    if (motion?.interaction) { if (motion.interaction === "fish" || event.detail === 0) player.current?.interact(); return; }
    if (!player.current?.play(nextAction)) return;
    lastAction.current = nextAction.id;
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
      onPointerDown={(event) => {
        lastInput.current = Date.now();
        suppressClick.current = false;
        if (motion?.interaction !== "groom") { event.preventDefault(); return; }
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        stroke.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerMove={(event) => { if (stroke.current) event.stopPropagation(); }}
      onPointerUp={(event) => {
        const start = stroke.current; stroke.current = null;
        if (!start || start.id !== event.pointerId) return;
        event.stopPropagation(); suppressClick.current = true;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 24) player.current?.interact();
      }}
      onPointerCancel={() => { stroke.current = null; }}
      style={motion?.interaction === "groom" ? { touchAction: "none" } : undefined}
      aria-label={motion?.interaction === "groom"
        ? (locale === "zh" ? "滑动给小猫捋毛，也可按回车继续" : "Stroke the cat to groom, or press Enter to continue")
        : motion?.interaction === "fish"
        ? (locale === "zh" ? "小猫正在摸鱼，点击叫醒它" : "The cat is playing with its fish. Tap to wake it") : motion
        ? (locale === "zh" ? `小猫正在${activeLabel}${state.queued ? "，下个动作已排队" : "，点击安排下个动作"}` : `The cat is ${activeLabel}${state.queued ? "; next action queued" : "; tap for its next action"}`)
        : (locale === "zh" ? `点击小猫，让它${nextLabel}` : `Tap the NAVA cat to ${nextLabel}`)}
      data-mascot-motion={motion?.id ?? "idle"}
      data-next-motion={nextAction.id}
      data-context-motion={preferredMotion ?? "sequence"}
      data-motion-run={run}
      data-motion-visual="persistent-mascot-player"
      data-player-phase={state.phase}
      data-action-queued={state.queued}
      data-time-phase={mascotTimePhase(new Date().getHours())}
      data-interaction={motion?.interaction ?? "tap"}
    >
      <span className="visually-hidden">{locale === "zh" ? "点击小猫播放下一个动作" : "Tap the cat for its next action"}</span>
      <canvas ref={canvas} width={640} height={480} aria-hidden="true"
        className="nava-mascot-pose nava-mascot-pose--idle nava-mascot-canvas" />
      <img className="nava-mascot-fallback" src={lifeFigure} alt="" aria-hidden="true" draggable={false} />
    </button>
  );
}
