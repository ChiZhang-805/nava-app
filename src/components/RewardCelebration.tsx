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
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = frame.current;
    const layer = element?.parentElement;
    const siblings = layer?.parentElement ? [...layer.parentElement.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== layer) : [];
    const previousInert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    let channel: MessageChannel | null = null, dismissed = false, started = false;
    let revealFallback = 0;
    const viewport = () => {
      const style = element?.parentElement && getComputedStyle(element.parentElement);
      return { safeTop: parseFloat(style?.getPropertyValue("--completion-safe-top") || "0") || 0,
        safeBottom: parseFloat(style?.getPropertyValue("--completion-safe-bottom") || "0") || 0 };
    };
    const dismiss = () => { if (!dismissed) { dismissed = true; callback.current(); } };
    const start = () => {
      if (started) return;
      started = true;
      layer?.removeAttribute("data-ready");
      channel?.port1.close();
      channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => {
        if (data?.type === "ready") layer?.setAttribute("data-ready", "true");
        if (data?.type === "continue") dismiss();
      };
      element?.contentWindow?.postMessage({ type: "nava-completion-connect", scene, locale, ...viewport() }, location.origin, [channel.port2]);
      window.clearTimeout(revealFallback);
      revealFallback = window.setTimeout(() => layer?.setAttribute("data-ready", "true"), 4000);
    };
    const resize = () => channel?.port1.postMessage({ type: "viewport", ...viewport() });
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    element?.addEventListener("load", start);
    if (element?.contentDocument?.readyState === "complete") queueMicrotask(start);
    window.addEventListener("keydown", key);
    const observer = new ResizeObserver(resize);
    if (element) observer.observe(element);
    return () => {
      channel?.port1.close(); window.clearTimeout(revealFallback); observer.disconnect();
      siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      element?.removeEventListener("load", start); window.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [scene, locale, eventKey]);

  return <div className="completion-celebration-layer" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "完成" : "Well done"}>
    <iframe key={eventKey + locale + scene} ref={frame} src={`${import.meta.env.BASE_URL}journal/completion.html?scene=${encodeURIComponent(scene)}`} title={locale === "zh" ? "完成" : "Well done"} />
  </div>;
}
