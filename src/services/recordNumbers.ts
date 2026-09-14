/** Missing is not zero. Shared by record editors, aggregates and presentation. */
export function optionalNonNegative(value: unknown): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Empty sets are an additive identity; an unknown member makes the total unknown. */
export function sumKnown(values: unknown[]): number | null {
  const parsed = values.map(optionalNonNegative);
  if (parsed.some((value) => value == null)) return null;
  const sum = Math.round(parsed.reduce<number>((sum, value) => sum + value!, 0) * 10) / 10;
  return Number.isFinite(sum) ? sum : null;
}

export function scaleKnown(value: unknown, ratio: number, decimals = 1): number | null {
  const parsed = optionalNonNegative(value);
  if (parsed == null || !Number.isFinite(ratio) || ratio < 0) return null;
  const factor = 10 ** decimals;
  const scaled = Math.round(parsed * ratio * factor) / factor;
  return Number.isFinite(scaled) ? scaled : null;
}
