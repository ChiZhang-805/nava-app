export const mascotMotionSequence = [
  { id: "wave", durationMs: 3200 },
  { id: "tail", durationMs: 3400 },
  { id: "read", durationMs: 3800 },
  { id: "sleep", durationMs: 3600 },
  { id: "lift", durationMs: 3400 },
] as const;

export type MascotMotion = typeof mascotMotionSequence[number]["id"];

export function mascotMotionAt(index: number) {
  const normalized = ((Math.trunc(index) % mascotMotionSequence.length) + mascotMotionSequence.length) % mascotMotionSequence.length;
  return mascotMotionSequence[normalized];
}

export function nextMascotMotionIndex(index: number) {
  return (Math.trunc(index) + 1) % mascotMotionSequence.length;
}
