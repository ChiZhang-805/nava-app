import { Capacitor, registerPlugin } from "@capacitor/core";

type AuthViewport = { height: number; visibleHeight: number };
const nativeAuthViewport = registerPlugin<{
  setEnabled(options: { enabled: boolean }): Promise<AuthViewport>;
}>("NavaAuthViewport");
let nativeQueue: Promise<unknown> = Promise.resolve();

/** Auth alone opts into the fixed native canvas. Serialize activation/cleanup,
 * including React StrictMode, so a late response cannot reactivate an old page. */
export function activateAuthViewport() {
  const root = document.documentElement;
  root.dataset.authViewport = "true";
  root.style.setProperty("--auth-canvas-height", `${window.innerHeight}px`);
  let active = true;
  if (Capacitor.getPlatform() === "ios") {
    nativeQueue = nativeQueue.then(() => nativeAuthViewport.setEnabled({ enabled: true }))
      .then(metrics => {
        if (!active) return;
        root.dataset.nativeAuthCanvas = "true";
        window.dispatchEvent(new CustomEvent("nava:auth-viewport", { detail: metrics }));
      }).catch(() => { /* Older binaries retain the fixed CSS backdrop. */ });
  }
  window.dispatchEvent(new Event("nava:auth-layout"));
  return () => {
    active = false;
    delete root.dataset.authViewport;
    delete root.dataset.nativeAuthCanvas;
    root.style.removeProperty("--auth-canvas-height");
    if (Capacitor.getPlatform() === "ios") {
      nativeQueue = nativeQueue.then(() => nativeAuthViewport.setEnabled({ enabled: false })).catch(() => {});
    }
    window.dispatchEvent(new Event("nava:auth-layout"));
  };
}

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

export function installMobileViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let frame = 0;
  let previousHeight = 0;
  let previousInput: HTMLElement | null = null;
  let nativeMetrics: AuthViewport | null = null;
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
      const native = auth && root.dataset.nativeAuthCanvas === "true" ? nativeMetrics : null;
      const height = Math.round(native?.visibleHeight ?? viewport.height);
      const fullHeight = native?.height ?? window.innerHeight;
      const active = window.innerWidth < 700 && fullHeight - height > 120;
      const open = active && Boolean(native || input || root.dataset.keyboardOpen === "true");
      if (auth && (native || (!open && !input) || previousWidth !== window.innerWidth)) {
        root.style.setProperty("--auth-canvas-height", `${fullHeight}px`);
      }
      previousWidth = window.innerWidth;
      if (!open) {
        delete root.dataset.keyboardOpen;
        delete root.dataset.viewportScale;
        root.style.removeProperty("--nava-visible-height");
        if (previousHeight && auth) {
          const region = document.querySelector(".auth-form-region");
          if (region) region.scrollTop = 0;
        }
        previousHeight = 0;
        previousInput = input;
        return;
      }
      root.dataset.keyboardOpen = "true";
      root.dataset.viewportScale = viewport.scale.toFixed(3);
      root.style.setProperty("--nava-visible-height", `${height}px`);
      if (input && (height !== previousHeight || input !== previousInput)) {
        if (auth) revealAuthField(input);
        else input.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      }
      previousHeight = height;
      previousInput = input;
    });
  };
  const onNativeViewport = (event: Event) => {
    const value = (event as CustomEvent<AuthViewport>).detail;
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
  };
}
