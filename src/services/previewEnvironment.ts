/** Ephemeral desktop test controls. No telemetry, health records or OS events. */
export type PreviewModule = "focus" | "exercise" | "sleep" | "recording" | "playback" | "camera";
export type PreviewReason = "call" | "message" | "distraction" | "other";
export type PreviewState = "ready" | "running" | "paused";
export type PreviewActivity = { module: PreviewModule; state: PreviewState };

let current: { activity: PreviewActivity; interrupt: (reason: PreviewReason) => void } | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
export const getPreviewActivity = () => current?.activity ?? null;
export function subscribePreviewActivity(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Only the visible activity owns the controls, never a hidden background timer. */
export function registerPreviewActivity(activity: PreviewActivity, interrupt: (reason: PreviewReason) => void) {
  const registration = { activity, interrupt };
  current = registration;
  notify();
  return () => {
    if (current !== registration) return;
    current = null;
    notify();
  };
}

export function simulatePreviewInterruption(reason: PreviewReason) {
  if (!current || current.activity.state !== "running") return false;
  if (!["call", "message", "distraction", "other"].includes(reason)) return false;
  if (current.activity.module !== "focus" && reason === "distraction") return false;
  // Close the re-entry window before React or asynchronous persistence finishes.
  const target = current;
  target.activity = { ...target.activity, state: "paused" };
  notify();
  target.interrupt(reason);
  return true;
}
