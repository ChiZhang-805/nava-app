export const mascotMotionSequence = [
  { id: "wave", durationMs: 4000 },
  { id: "tail", durationMs: 4000 },
  { id: "read", durationMs: 4000 },
  { id: "sleep", durationMs: 4000 },
  { id: "lift", durationMs: 4000 },
] as const;

export type MascotMotion = typeof mascotMotionSequence[number]["id"];

export const mascotFramesPerSecond = 24;
export const mascotDisplayFrameCount = 4 * mascotFramesPerSecond;

function boundedDisplayFrame(displayFrame: number) {
  return Math.min(mascotDisplayFrameCount - 1, Math.max(0, Math.trunc(displayFrame)));
}

export function mascotArtworkFrame(motion: MascotMotion, displayFrame: number) {
  const frame = boundedDisplayFrame(displayFrame);

  if (motion === "wave" || motion === "tail") return frame % 24;

  if (motion === "read") {
    if (frame < 24) return Math.min(11, Math.floor(frame / 2));
    if (frame < 72) return 12 + ((frame - 24) % 4);
    return 16 + Math.min(7, Math.floor((frame - 72) / 3));
  }

  if (motion === "sleep") {
    if (frame < 24) return Math.min(8, Math.floor((frame * 9) / 24));
    if (frame < 72) return 9 + ((frame - 24) % 6);
    return 15 + Math.min(8, Math.floor(((frame - 72) * 9) / 24));
  }

  if (frame < 32) return Math.min(9, Math.floor((frame * 10) / 32));
  if (frame < 64) return 10 + ((frame - 32) % 5);
  return 15 + Math.min(4, Math.floor(((frame - 64) * 5) / 32));
}

export function mascotMotionAt(index: number) {
  const normalized = ((Math.trunc(index) % mascotMotionSequence.length) + mascotMotionSequence.length) % mascotMotionSequence.length;
  return mascotMotionSequence[normalized];
}

export function nextMascotMotionIndex(index: number) {
  return (Math.trunc(index) + 1) % mascotMotionSequence.length;
}
