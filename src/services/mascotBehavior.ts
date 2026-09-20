export type MascotTimePhase = "morning" | "day" | "night";
export function mascotTimePhase(hour: number): MascotTimePhase {
  return hour >= 4 && hour < 12 ? "morning" : hour >= 12 && hour < 20 ? "day" : "night";
}
const quiet = ["read", "yawn", "nap", "curious"];
const active = ["wave", "butterfly", "roll"];
export const mascotIdleDelay = (hour: number) => mascotTimePhase(hour) === "day" ? 45_000 : mascotTimePhase(hour) === "morning" ? 75_000 : 120_000;
export function ambientMascotAction({ hour, positiveMood = false, sleepConcern = false, lastAction, idleMs, random = Math.random() }: {
  hour: number; positiveMood?: boolean; sleepConcern?: boolean; lastAction?: string; idleMs: number; random?: number;
}): string | null {
  const phase = mascotTimePhase(hour);
  if (idleMs < mascotIdleDelay(hour)) return null;
  // Respect the animator's explicit positive-mood exclusion, even during the afternoon.
  const calm = phase === "night" || positiveMood;
  const pool = sleepConcern ? ["yawn", "nap", "read"] : calm ? quiet
    : [...quiet, ...active, ...(phase === "day" ? active : []), ...(idleMs >= 180_000 ? ["fish", "fluff"] : [])];
  const candidates = pool.filter((id) => id !== lastAction);
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random * candidates.length)))];
}
