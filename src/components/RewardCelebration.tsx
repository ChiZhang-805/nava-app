import { useEffect, useRef } from "react";
import type { GrowthRewardGrant } from "../services/productivity";
import { completionSceneForReward } from "../services/rewardPresentation";
import "./reward-celebration.css";

/** A celebration presents a committed ledger grant. Rendering or dismissing it
 * never awards points; the journal's own completion scene is not queued twice. */
export default function RewardCelebration({ rewards = [], sceneOverride, locale, onDismiss }: {
  rewards?: GrowthRewardGrant[]; sceneOverride?: string; locale: "zh" | "en"; onDismiss: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  const eventKey = (rewards.find(r => !r.eventKey.endsWith(":bare-face-bonus")) ?? rewards[0])?.eventKey ?? "";
  const scene = sceneOverride ?? completionSceneForReward(eventKey);

  useEffect(() => {
    let previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = frame.current;
    const layer = element?.parentElement;
    const siblings = layer?.parentElement ? [...layer.parentElement.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== layer) : [];
    let previousInert: boolean[] = [];
    let channel: MessageChannel | null = null, dismissed = false, started = false, revealed = false;
    layer?.removeAttribute("data-ready");
    const rememberFocus = (event: FocusEvent) => {
      if (!revealed && event.target instanceof HTMLElement && !layer?.contains(event.target)) previous = event.target;
    };
    document.addEventListener("focusin", rememberFocus);
    const viewport = () => {
      const style = element?.parentElement && getComputedStyle(element.parentElement);
      return { safeTop: parseFloat(style?.getPropertyValue("--completion-safe-top") || "0") || 0,
        safeBottom: parseFloat(style?.getPropertyValue("--completion-safe-bottom") || "0") || 0 };
    };
    // The record/reward is already committed. If optional artwork cannot load,
    // leave the usable page in place instead of revealing an empty green frame.
    const dismiss = () => { if (!dismissed) { dismissed = true; callback.current(); } };
    const loadingDeadline = window.setTimeout(dismiss, 4000);
    const reveal = () => {
      if (dismissed || revealed) return;
      const garden = element?.contentDocument?.querySelector<HTMLElement>(".celebration-garden");
      const images = [...(garden?.querySelectorAll<HTMLImageElement>("img") ?? [])];
      if (!garden || garden.hidden || !images.length || images.some(image => !image.complete || !image.naturalWidth)) return;
      window.clearTimeout(loadingDeadline);
      previousInert = siblings.map(node => node.inert);
      siblings.forEach(node => { node.inert = true; });
      revealed = true;
      layer?.setAttribute("data-ready", "true");
      garden.querySelector<HTMLButtonElement>(".scene-continue")?.focus({ preventScroll: true });
    };
    const start = () => {
      if (started || dismissed) return;
      // An iframe starts with a complete about:blank document. It must not consume
      // the only handshake before the actual completion document is loaded.
      const loadedUrl = element?.contentDocument?.URL;
      if (!loadedUrl || loadedUrl === "about:blank" || new URL(loadedUrl).pathname !== new URL(element!.src).pathname) return;
      started = true;
      channel?.port1.close();
      channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => {
        if (data?.type === "ready") reveal();
        if (data?.type === "continue" && revealed) dismiss();
      };
      element?.contentWindow?.postMessage({ type: "nava-completion-connect", scene, locale, ...viewport() }, location.origin, [channel.port2]);
    };
    const resize = () => channel?.port1.postMessage({ type: "viewport", ...viewport() });
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && revealed) dismiss(); };
    element?.addEventListener("load", start);
    if (element?.contentDocument?.readyState === "complete") queueMicrotask(start);
    window.addEventListener("keydown", key);
    const observer = new ResizeObserver(resize);
    if (element) observer.observe(element);
    return () => {
      dismissed = true;
      channel?.port1.close(); window.clearTimeout(loadingDeadline); observer.disconnect();
      document.removeEventListener("focusin", rememberFocus);
      if (revealed) siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      element?.removeEventListener("load", start); window.removeEventListener("keydown", key);
      if (revealed && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [scene, locale, eventKey]);

  return <div className="completion-celebration-layer" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "完成" : "Well done"}>
    <iframe key={eventKey + locale + scene} ref={frame} src={`${import.meta.env.BASE_URL}journal/completion.html?scene=${encodeURIComponent(scene)}`} title={locale === "zh" ? "完成" : "Well done"} />
  </div>;
}
