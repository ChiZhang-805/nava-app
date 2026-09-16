import type { NavaNotificationItem } from "./notifications";

/** Desktop harness only. Native builds replace this module with a no-op bridge. */
export const phonePreviewMedia = "(hover: hover) and (pointer: fine) and (min-width: 700px) and (min-height: 700px)";
export const phoneNotificationEvent = "nava:preview-system-notification";
export const phoneNotificationOpenEvent = "nava:preview-system-open";
export const phoneCommandEvent = "nava:preview-phone-command";
export function commandPhonePreview(action: PhoneAction | "message") {
  window.dispatchEvent(new CustomEvent(phoneCommandEvent, { detail: action }));
}
export type PhoneNotice = { item: NavaNotificationItem; open: () => void };
export function presentPhonePreviewNotification(item: NavaNotificationItem, open: () => void) {
  if (!window.matchMedia(phonePreviewMedia).matches || !document.documentElement.hasAttribute("data-phone-preview")) return false;
  window.dispatchEvent(new CustomEvent<PhoneNotice>(phoneNotificationEvent, { detail: { item, open } }));
  return true;
}

export type PhoneSurface = "app" | "home" | "locked" | "off";
export type PhoneState = { surface: PhoneSurface; returnTo: "app" | "home"; call: "none" | "banner" | "full" | "active"; callLocked: boolean; muted: boolean };
export type PhoneAction = "home" | "app" | "lock" | "wake" | "unlock" | "call" | "expand-call" | "answer" | "end-call" | "side";
export const initialPhoneState: PhoneState = { surface: "app", returnTo: "app", call: "none", callLocked: false, muted: false };
export function phoneTransition(state: PhoneState, action: PhoneAction): PhoneState {
  const locked = state.surface === "off" || state.surface === "locked";
  switch (action) {
    case "home": return locked || state.call !== "none" ? state : { ...state, surface: "home", returnTo: "home" };
    case "app": return locked || state.call !== "none" ? state : { ...state, surface: "app", returnTo: "app" };
    case "lock": return { ...state, returnTo: locked ? state.returnTo : state.surface as "app" | "home", surface: "off", call: state.call === "banner" ? "full" : state.call, callLocked: state.call !== "none" || state.callLocked };
    case "wake": return state.surface === "off" ? { ...state, surface: "locked" } : state;
    case "unlock": return locked && state.call === "none" ? { ...state, surface: state.returnTo } : state;
    case "call": return state.call !== "none" ? state : { ...state, surface: locked ? "locked" : state.surface, call: locked ? "full" : "banner", callLocked: locked, muted: false };
    case "expand-call": return state.call === "banner" ? { ...state, call: "full" } : state;
    case "answer": return state.call === "banner" || state.call === "full" ? { ...state, call: "active" } : state;
    case "end-call": return { ...state, call: "none", muted: false, surface: state.callLocked ? "locked" : state.surface, callLocked: false };
    case "side":
      if (state.call === "active") return phoneTransition(state, "end-call");
      if (state.call !== "none") return { ...state, muted: true };
      return phoneTransition(state, state.surface === "off" ? "wake" : "lock");
  }
}
