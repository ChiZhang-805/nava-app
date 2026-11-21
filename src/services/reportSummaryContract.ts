export type CompactSummary = [string, string, string, string];

export function validCompactReportBullet(value: string, locale: "zh" | "en", weekly = false) {
  const cleaned = value.trim();
  if (locale === "en") {
    const words = cleaned.split(/\s+/).filter(Boolean).length;
    return words >= 2 && words <= 4 && cleaned.length <= 28;
  }
  return (weekly ? /^\p{Script=Han}{7,10}$/u : /^\p{Script=Han}{7}$/u).test(cleaned);
}
