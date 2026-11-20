import { Capacitor, registerPlugin } from "@capacitor/core";

type KeyboardViewport = { height: number; visibleHeight: number };
const nativeAuthViewport = registerPlugin<{
  setEnabled(options: { enabled: boolean; keepRootPinned?: boolean }): Promise<KeyboardViewport>;
}>("NavaAuthViewport");
let nativeQueue: Promise<unknown> = Promise.resolve();
let nativeMetrics: KeyboardViewport | null = null;

function activateNativeViewport(keepRootPinned: boolean, canvas: "nativeAuthCanvas" | "nativeAppCanvas") {
  const root = document.documentElement;
  let active = true;
  if (Capacitor.getPlatform() === "ios") {
    nativeQueue = nativeQueue.then(() => nativeAuthViewport.setEnabled({ enabled: true, keepRootPinned }))
      .then(metrics => {
        if (!active) return;
        root.dataset[canvas] = "true";
        window.dispatchEvent(new CustomEvent("nava:auth-viewport", { detail: metrics }));
      }).catch(() => { /* Browser-style viewport handling remains available. */ });
  }
  return () => {
    active = false;
    delete root.dataset[canvas];
    if (Capacitor.getPlatform() === "ios") {
      nativeQueue = nativeQueue.then(() => nativeAuthViewport.setEnabled({ enabled: false })).catch(() => {});
    }
    window.dispatchEvent(new Event("nava:auth-layout"));
  };
}

/** Serialize native activation and cleanup so late responses cannot re-enable a departed route. */
export function activateAuthViewport() {
  const root = document.documentElement;
  root.dataset.authViewport = "true";
  root.style.setProperty("--auth-canvas-height", `${window.innerHeight}px`);
  const deactivate = activateNativeViewport(true, "nativeAuthCanvas");
  window.dispatchEvent(new Event("nava:auth-layout"));
  return () => {
    delete root.dataset.authViewport;
    root.style.removeProperty("--auth-canvas-height");
    deactivate();
  };
}

export const activateAppViewport = () => activateNativeViewport(false, "nativeAppCanvas");
export const getNativeAppViewport = () => document.documentElement.dataset.nativeAppCanvas === "true" ? nativeMetrics : null;

/** scrollIntoView also pans ancestors. Move only the inner form viewport.
 * Include the label and, when it fits, submit without pushing the field away. */
function revealAuthField(input: HTMLElement) {
  const region = input.closest<HTMLElement>(".auth-form-region");
  if (!region) return;
  const field = input.closest<HTMLElement>(".field") ?? input;
  const bounds = region.getBoundingClientRect();
  const fieldBounds = field.getBoundingClientRect();
  const submit = region.querySelector<HTMLElement>(".auth-submit")?.getBoundingClientRect();
  const bottom = submit && submit.bottom - fieldBounds.top <= region.clientHeight - 24
    ? submit.bottom : fieldBounds.bottom;
  const delta = fieldBounds.top < bounds.top + 12
    ? fieldBounds.top - bounds.top - 12
    : Math.max(0, bottom - bounds.bottom + 12);
  if (Math.abs(delta) > 1) region.scrollTop += delta;
}

/** Keep focus within app-owned scroll regions. scrollIntoView can move the root canvas. */
function revealAppField(input: HTMLElement, top: number, height: number) {
  const gap = 12;
  for (let region = input.parentElement; region && !region.matches(".phone-frame, .nava-app-stage, body"); region = region.parentElement) {
    if (region.scrollHeight <= region.clientHeight + 1 || !["auto", "scroll"].includes(getComputedStyle(region).overflowY)) continue;
    const bounds = region.getBoundingClientRect();
    const field = input.getBoundingClientRect();
    const label = input.closest("label")?.getBoundingClientRect() ?? field;
    const bottomDelta = field.bottom - Math.min(top + height, bounds.bottom) + gap;
    const alignToBottom = input.hasAttribute("data-profile-end-field") && region.classList.contains("advanced-profile-screen");
    const delta = alignToBottom || bottomDelta > 0
      ? bottomDelta : Math.min(0, label.top - Math.max(top, bounds.top) - gap);
    if (Math.abs(delta) > 1) region.scrollTop += delta;
  }
}

export function installMobileViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let frame = 0;
  let previousHeight = 0;
  let previousTop = 0;
  let closedHeight = window.innerHeight;
  let previousInput: HTMLElement | null = null;
  let previousWidth = window.innerWidth;
  const editable = () => {
    const element = document.activeElement;
    return element instanceof HTMLElement && element.matches(
      'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="color"])',
    ) ? element : null;
  };
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const input = editable();
      const auth = root.dataset.authViewport === "true";
      const native = root.dataset.nativeAuthCanvas === "true" || root.dataset.nativeAppCanvas === "true" ? nativeMetrics : null;
      const height = Math.round(native?.visibleHeight ?? viewport.height);
      const journal = document.activeElement?.matches(".journal-experience iframe");
      if ((!input && !journal && root.dataset.keyboardOpen !== "true") || previousWidth !== window.innerWidth || window.innerHeight > closedHeight) {
        closedHeight = window.innerHeight;
      }
      const fullHeight = native?.height ?? closedHeight;
      const active = window.innerWidth < 700 && fullHeight - height > (native ? 1 : 120);
      const open = active && Boolean(native || input || journal || root.dataset.keyboardOpen === "true");
      if (auth && (native || (!open && !input) || previousWidth !== window.innerWidth)) {
        root.style.setProperty("--auth-canvas-height", `${fullHeight}px`);
      }
      previousWidth = window.innerWidth;
      if (!open) {
        delete root.dataset.keyboardOpen;
        delete root.dataset.viewportScale;
        root.style.removeProperty("--nava-visible-height");
        root.style.removeProperty("--nava-keyboard-canvas-height");
        root.style.removeProperty("--nava-keyboard-top");
        if (previousHeight && auth) {
          const region = document.querySelector(".auth-form-region");
          if (region) region.scrollTop = 0;
        }
        previousHeight = 0;
        previousTop = 0;
        previousInput = input;
        return;
      }
      root.dataset.keyboardOpen = "true";
      root.dataset.viewportScale = viewport.scale.toFixed(3);
      root.style.setProperty("--nava-visible-height", `${height}px`);
      const top = native ? 0 : Math.max(0, viewport.offsetTop);
      root.style.setProperty("--nava-keyboard-canvas-height", `${Math.max(fullHeight, height + top)}px`);
      root.style.setProperty("--nava-keyboard-top", `${top}px`);
      if (input && (height !== previousHeight || input !== previousInput || top !== previousTop)) {
        if (auth) revealAuthField(input);
        else revealAppField(input, top, height);
      }
      previousHeight = height;
      previousTop = top;
      previousInput = input;
    });
  };
  const onNativeViewport = (event: Event) => {
    const value = (event as CustomEvent<KeyboardViewport>).detail;
    if (value?.height > 0 && value.visibleHeight >= 0 && value.visibleHeight <= value.height) {
      nativeMetrics = value;
      update();
    }
  };
  const onAuthLayout = () => { nativeMetrics = null; update(); };
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  window.addEventListener("nava:auth-viewport", onNativeViewport);
  window.addEventListener("nava:auth-layout", onAuthLayout);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    window.removeEventListener("nava:auth-viewport", onNativeViewport);
    window.removeEventListener("nava:auth-layout", onAuthLayout);
    document.removeEventListener("focusin", update);
    document.removeEventListener("focusout", update);
    delete root.dataset.keyboardOpen;
    delete root.dataset.viewportScale;
    root.style.removeProperty("--nava-visible-height");
    root.style.removeProperty("--nava-keyboard-canvas-height");
    root.style.removeProperty("--nava-keyboard-top");
  };
}
