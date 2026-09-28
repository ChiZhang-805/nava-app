export function parseTodoDurationEstimate(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_duration_estimate");
  const match = value.trim().match(/^DURATION_SECONDS\s*=\s*(\d{1,6})$/u);
  if (!match) throw new Error("invalid_duration_estimate");
  const seconds = Number(match[1]);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 359_999) throw new Error("invalid_duration_estimate");
  return seconds;
}
