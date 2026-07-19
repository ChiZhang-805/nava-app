export interface LaunchFieldSnapshot {
  active: number;
  impulse: number;
  x: number;
  y: number;
}

const IMPULSE_DECAY_MS = 1150;

let active = 0;
let impulse = 0;
let impulseStartedAt = 0;
let pointerX = 0;
let pointerY = 0;

function clamp(value: number, minimum = -1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readDecayedImpulse(now: number) {
  const age = Math.max(0, now - impulseStartedAt);
  return impulse * Math.exp(-age / IMPULSE_DECAY_MS);
}

export function setLaunchFieldActive(nextActive: boolean) {
  active = nextActive ? 1 : 0;
  if (!nextActive) impulse = 0;
}

export function updateLaunchFieldPointer(x: number, y: number, strength = 0.18, now = performance.now()) {
  pointerX = clamp(x);
  pointerY = clamp(y);
  impulse = Math.max(readDecayedImpulse(now), clamp(strength, 0, 1));
  impulseStartedAt = now;
}

export function getLaunchFieldSnapshot(now = performance.now()): LaunchFieldSnapshot {
  return {
    active,
    impulse: readDecayedImpulse(now),
    x: pointerX,
    y: pointerY,
  };
}
