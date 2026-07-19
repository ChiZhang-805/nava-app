export type BackgroundMotionStatus = "active" | "denied" | "disabled" | "prompt" | "unsupported";

export interface BackgroundMotionSnapshot {
  intensity: number;
  updatedAt: number;
  x: number;
  y: number;
}

interface MotionVector {
  intensity: number;
  x: number;
  y: number;
}

type MotionPermissionState = "denied" | "granted";

interface PermissionCapableEventConstructor {
  requestPermission?: () => Promise<MotionPermissionState>;
}

const ZERO_VECTOR: MotionVector = { intensity: 0, x: 0, y: 0 };
const SENSOR_STALE_MS = 260;
const SENSOR_DECAY_MS = 720;

let currentSnapshot: BackgroundMotionSnapshot = { ...ZERO_VECTOR, updatedAt: 0 };
let impulseVector: MotionVector = ZERO_VECTOR;
let listenersAttached = false;
let orientationOrigin: { beta: number; gamma: number } | null = null;
let permissionRequest: Promise<BackgroundMotionStatus> | null = null;
let status: BackgroundMotionStatus = "prompt";
let tiltVector: MotionVector = ZERO_VECTOR;

function clamp(value: number, minimum = -1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function applyDeadZone(value: number, deadZone = 0.055) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  return Math.sign(value) * clamp((magnitude - deadZone) / (1 - deadZone), 0, 1);
}

function normalizeVector(x: number, y: number, intensity: number): MotionVector {
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.0001 || intensity <= 0) return ZERO_VECTOR;
  return {
    intensity: clamp(intensity, 0, 1),
    x: x === 0 ? 0 : x / magnitude,
    y: y === 0 ? 0 : y / magnitude,
  };
}

function rotateForScreen(x: number, y: number, screenAngle: number) {
  const angle = ((screenAngle % 360) + 360) % 360;
  if (angle === 90) return { x: -y, y: x };
  if (angle === 180) return { x: -x, y: -y };
  if (angle === 270) return { x: y, y: -x };
  return { x, y };
}

function readScreenAngle() {
  const legacyAngle = Number((window as Window & { orientation?: number }).orientation ?? 0);
  return window.screen.orientation?.angle ?? legacyAngle;
}

export function normalizeOrientationDelta(betaDelta: number, gammaDelta: number, screenAngle = 0): MotionVector {
  const rotated = rotateForScreen(gammaDelta / 18, -betaDelta / 18, screenAngle);
  const x = applyDeadZone(clamp(rotated.x));
  const y = applyDeadZone(clamp(rotated.y));
  return normalizeVector(x, y, clamp(Math.hypot(x, y), 0, 1));
}

export function normalizeAcceleration(x: number, y: number, z: number, screenAngle = 0): MotionVector {
  const accelerationMagnitude = Math.hypot(x, y, z);
  const intensity = clamp((accelerationMagnitude - 0.12) / 1.8, 0, 1);
  const rotated = rotateForScreen(x, -y, screenAngle);
  return normalizeVector(rotated.x, rotated.y, intensity);
}

function publishSnapshot() {
  const combinedX = tiltVector.x * tiltVector.intensity * 0.78 + impulseVector.x * impulseVector.intensity * 0.72;
  const combinedY = tiltVector.y * tiltVector.intensity * 0.78 + impulseVector.y * impulseVector.intensity * 0.72;
  const intensity = Math.max(tiltVector.intensity * 0.88, impulseVector.intensity);
  const combined = normalizeVector(combinedX, combinedY, intensity);
  currentSnapshot = {
    ...combined,
    updatedAt: performance.now(),
  };
}

function onDeviceOrientation(event: DeviceOrientationEvent) {
  if (document.hidden || event.beta === null || event.gamma === null) return;
  if (!orientationOrigin) {
    orientationOrigin = { beta: event.beta, gamma: event.gamma };
    return;
  }

  tiltVector = normalizeOrientationDelta(
    event.beta - orientationOrigin.beta,
    event.gamma - orientationOrigin.gamma,
    readScreenAngle(),
  );
  publishSnapshot();
}

function onDeviceMotion(event: DeviceMotionEvent) {
  if (document.hidden) return;
  const acceleration = event.acceleration;
  if (acceleration && acceleration.x !== null && acceleration.y !== null && acceleration.z !== null) {
    impulseVector = normalizeAcceleration(acceleration.x, acceleration.y, acceleration.z, readScreenAngle());
  } else {
    const rotation = event.rotationRate;
    const beta = rotation?.beta ?? 0;
    const gamma = rotation?.gamma ?? 0;
    const intensity = clamp((Math.hypot(beta, gamma) - 2) / 75, 0, 1);
    const rotated = rotateForScreen(gamma, -beta, readScreenAngle());
    impulseVector = normalizeVector(rotated.x, rotated.y, intensity);
  }
  publishSnapshot();
}

function resetOrientationOrigin() {
  orientationOrigin = null;
  tiltVector = ZERO_VECTOR;
  impulseVector = ZERO_VECTOR;
  currentSnapshot = { ...ZERO_VECTOR, updatedAt: performance.now() };
}

function permissionRequesters() {
  const scope = window as Window & typeof globalThis & {
    DeviceMotionEvent?: PermissionCapableEventConstructor;
    DeviceOrientationEvent?: PermissionCapableEventConstructor;
  };
  const constructors = [scope.DeviceOrientationEvent, scope.DeviceMotionEvent];
  return constructors.flatMap((constructor) => {
    if (typeof constructor?.requestPermission !== "function") return [];
    return [constructor.requestPermission.bind(constructor)];
  });
}

function motionIsSupported() {
  return "DeviceOrientationEvent" in window || "DeviceMotionEvent" in window;
}

function motionIsDisabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  status = "active";
  window.addEventListener("deviceorientation", onDeviceOrientation, { passive: true });
  window.addEventListener("devicemotion", onDeviceMotion, { passive: true });
  window.addEventListener("orientationchange", resetOrientationOrigin, { passive: true });
  window.screen.orientation?.addEventListener("change", resetOrientationOrigin);
}

export function startBackgroundMotionIfAvailable(): BackgroundMotionStatus {
  if (typeof window === "undefined" || !motionIsSupported()) {
    status = "unsupported";
    return status;
  }
  if (motionIsDisabled()) {
    status = "disabled";
    return status;
  }
  if (listenersAttached) return "active";
  if (permissionRequesters().length > 0) {
    status = "prompt";
    return status;
  }
  attachListeners();
  return status;
}

export function requestBackgroundMotionPermission(): Promise<BackgroundMotionStatus> {
  if (typeof window === "undefined" || !motionIsSupported()) return Promise.resolve("unsupported");
  if (motionIsDisabled()) return Promise.resolve("disabled");
  if (listenersAttached) return Promise.resolve("active");
  if (permissionRequest) return permissionRequest;

  const requesters = permissionRequesters();
  if (requesters.length === 0) {
    attachListeners();
    return Promise.resolve("active");
  }

  // Start every permission request before the first await so iOS still sees
  // the transient user activation from the Start button.
  const requests = requesters.map((request) => {
    try {
      return request();
    } catch {
      return Promise.resolve<MotionPermissionState>("denied");
    }
  });

  permissionRequest = Promise.allSettled(requests).then((results) => {
    const granted = results.some((result) => result.status === "fulfilled" && result.value === "granted");
    if (granted) attachListeners();
    else status = "denied";
    return status;
  });
  return permissionRequest;
}

export function getBackgroundMotionSnapshot(now = performance.now()): BackgroundMotionSnapshot {
  if (!listenersAttached || currentSnapshot.updatedAt <= 0) return { ...ZERO_VECTOR, updatedAt: 0 };
  const age = Math.max(0, now - currentSnapshot.updatedAt);
  if (age <= SENSOR_STALE_MS) return currentSnapshot;
  const decay = Math.exp(-(age - SENSOR_STALE_MS) / SENSOR_DECAY_MS);
  return {
    ...currentSnapshot,
    intensity: currentSnapshot.intensity * decay,
  };
}

export function getBackgroundMotionStatus() {
  return status;
}
