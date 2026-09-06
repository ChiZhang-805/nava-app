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
  return typeof navigator !== "undefined" && typeof (navigator as WakeLockNavigator).wakeLock?.request === "function";
}

export async function requestScreenWakeLock() {
  if (!screenWakeLockSupported()) return null;
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
