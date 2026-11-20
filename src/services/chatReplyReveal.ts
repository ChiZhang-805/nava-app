import type { ChatReplySegment } from "../../supabase/functions/_shared/chat-reply-segments.ts";

/** Presentation only: the complete reply must already be saved before starting. */
export function replyRevealOffsets(parts: readonly ChatReplySegment[]): number[] {
  const gaps = parts.slice(0, -1).map(part => Math.min(650, 250 + (part.type === "text" ? Array.from(part.text).length * 12 : 80)));
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const scale = total > 3000 ? 3000 / total : 1;
  let elapsed = 0;
  return [0, ...gaps.map(gap => (elapsed += gap * scale)).map(Math.round)];
}

export function createReplyRevealClock<T>(clock: { set: (callback: () => void, ms: number) => T; clear: (handle: T) => void }) {
  let generation = 0;
  let timers: T[] = [];
  const cancel = () => { generation++; timers.forEach(clock.clear); timers = []; };
  return {
    cancel,
    start(parts: readonly ChatReplySegment[], reducedMotion: boolean, show: (count: number) => void) {
      cancel();
      const run = generation;
      if (reducedMotion || parts.length < 2) { show(parts.length); return; }
      show(1);
      replyRevealOffsets(parts).slice(1).forEach((delay, index) => {
        timers.push(clock.set(() => { if (generation === run) show(index + 2); }, delay));
      });
    },
  };
}
