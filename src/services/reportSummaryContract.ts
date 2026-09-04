export type CompactSummary = [string, string, string, string];

export function validCompactReportBullet(value: string, locale: "zh" | "en") {
  const cleaned = value.trim();
  if (locale === "en") {
    const words = cleaned.split(/\s+/).filter(Boolean).length;
    return words >= 2 && words <= 4 && cleaned.length <= 28;
  }
  return Array.from(cleaned).length === 7 && /^\p{Script=Han}{7}$/u.test(cleaned);
}
