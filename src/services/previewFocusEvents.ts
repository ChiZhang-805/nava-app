export const FOCUS_PREVIEW_STATE_EVENT = "nava:focus-preview-state";
export const FOCUS_PREVIEW_INTERRUPT_EVENT = "nava:focus-preview-interrupt";

export type FocusPreviewState = "unavailable" | "ready" | "running" | "paused";
export type FocusPreviewReason = "call" | "message" | "distraction" | "other";

export function publishFocusPreviewState(state: FocusPreviewState) {
  window.dispatchEvent(new CustomEvent<{ state: FocusPreviewState }>(FOCUS_PREVIEW_STATE_EVENT, { detail: { state } }));
}
