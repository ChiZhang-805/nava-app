import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeWakeLock = registerPlugin<{
  acquire(options: { id: string }): Promise<{ active: boolean }>;
  release(options: { id: string }): Promise<void>;
  addListener(event: "released", callback: () => void): Promise<{ remove(): Promise<void> }>;
}>("NavaWakeLock");

export type ScreenWakeLockSentinel = EventTarget & {
  readonly released?: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function screenWakeLockSupported() {
  if (Capacitor.getPlatform() === "ios") return Capacitor.isPluginAvailable("NavaWakeLock");
  return typeof navigator !== "undefined" && typeof (navigator as WakeLockNavigator).wakeLock?.request === "function";
}

export async function requestScreenWakeLock() {
  if (!screenWakeLockSupported()) return null;
  if (Capacitor.getPlatform() === "ios") {
    const id = crypto.randomUUID();
    let released = false;
    const sentinel = new EventTarget() as ScreenWakeLockSentinel;
    Object.defineProperty(sentinel, "released", { get: () => released });
    const finish = () => { if (!released) { released = true; sentinel.dispatchEvent(new Event("release")); } };
    const listener = await NativeWakeLock.addListener("released", () => { finish(); void listener.remove(); });
    sentinel.release = async () => {
      try { await NativeWakeLock.release({ id }); }
      finally { finish(); await listener.remove(); }
    };
    try {
      const result = await NativeWakeLock.acquire({ id });
      if (!result.active || released) { await sentinel.release(); return null; }
      return sentinel;
    } catch (error) { await sentinel.release(); throw error; }
  }
  return (navigator as WakeLockNavigator).wakeLock!.request("screen");
}

export function focusFullscreenSupported() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement as LegacyFullscreenElement;
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
}

export function focusFullscreenActive() {
  if (typeof document === "undefined") return false;
  const target = document as LegacyFullscreenDocument;
  return Boolean(document.fullscreenElement ?? target.webkitFullscreenElement);
}

export async function requestFocusFullscreen() {
  if (!focusFullscreenSupported() || focusFullscreenActive()) return focusFullscreenActive();
  const root = document.documentElement as LegacyFullscreenElement;
  try {
    if (root.requestFullscreen) await root.requestFullscreen();
    else await root.webkitRequestFullscreen?.();
  } catch {
    return false;
  }
  return focusFullscreenActive();
}

export async function exitFocusFullscreen() {
  if (!focusFullscreenActive()) return true;
  const target = document as LegacyFullscreenDocument;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await target.webkitExitFullscreen?.();
  } catch {
    return false;
  }
  return !focusFullscreenActive();
}
