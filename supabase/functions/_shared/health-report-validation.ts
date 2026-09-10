export type HealthReportLanguage = "zh" | "en";

export function normalizeModelHeadline(value: unknown, fallback: unknown, lang: HealthReportLanguage) {
  const cleaned = cleanText(value);
  if (lang === "en") {
    const directWords = cleaned.split(/\s+/).filter(Boolean);
    if (directWords.length >= 5 && directWords.length <= 12) return cleaned;
    const words = cleanText(`${cleaned} ${typeof fallback === "string" ? fallback : ""}`).split(/\s+/).filter(Boolean);
    return words.length >= 5 ? words.slice(0, 12).join(" ") : "";
  }
  const directHan = cleaned.match(/\p{Script=Han}/gu) ?? [];
  if (directHan.length >= 15 && directHan.length <= 24) return cleaned;
  const han = cleanText(`${cleaned} ${typeof fallback === "string" ? fallback : ""}`).match(/\p{Script=Han}/gu) ?? [];
  return han.length >= 15 ? han.slice(0, 24).join("") : "";
}

export function numericEvidenceGrounded(value: string, sourceContext: unknown) {
  const claimed: string[] = value.match(/\d+(?:\.\d+)?/g) ?? [];
  if (claimed.length === 0) return true;
  const citedDates: string[] = value.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const datedRows = collectDatedRows(sourceContext);
  const relevantSource = citedDates.length > 0
    ? datedRows.filter((row) => citedDates.includes(String(row.record_date)))
    : datedRows;
  const suppliedText = relevantSource.length > 0 ? JSON.stringify(relevantSource) : JSON.stringify(sourceContext);
  const supplied = new Set((suppliedText.match(/\d+(?:\.\d+)?/g) ?? []).map(normalizeNumberToken));
  collectDerivedEvidenceNumbers(sourceContext, supplied);
  return claimed.map(normalizeNumberToken).every((token) => supplied.has(token));
}

function collectDerivedEvidenceNumbers(value: unknown, output: Set<string>, visited = new Set<unknown>()) {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    const dated = value.flatMap((item) => {
      const row = record(item);
      return row && typeof row.record_date === "string" ? [row] : [];
    });
    if (dated.length > 0) {
      addNumberVariants(output, dated.length);
      addNumberVariants(output, new Set(dated.map((row) => row.record_date)).size);
      const keys = new Set(dated.flatMap((row) => Object.keys(row)));
      for (const key of keys) {
        const values = dated.map((row) => numericValue(row[key])).filter((item): item is number => item != null);
        if (values.length === 0) continue;
        const sum = values.reduce((total, item) => total + item, 0);
        const minimum = Math.min(...values);
        const maximum = Math.max(...values);
        const delta = values.at(-1)! - values[0];
        [sum, sum / values.length, minimum, maximum, maximum - minimum, Math.abs(delta)].forEach((item) => addNumberVariants(output, item));
        if (values[0] !== 0) addNumberVariants(output, Math.abs(delta / values[0] * 100));
        if (/minutes?$/i.test(key)) {
          values.forEach((item) => addNumberVariants(output, item / 60));
          addNumberVariants(output, (sum / values.length) / 60);
        }
      }
    }
    value.forEach((item) => collectDerivedEvidenceNumbers(item, output, visited));
    return;
  }
  const item = record(value);
  if (!item) return;
  const period = record(item.period);
  const start = typeof period?.start === "string" ? period.start : null;
  const end = typeof period?.end === "string" ? period.end : null;
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    addNumberVariants(output, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
  }
  Object.values(item).forEach((child) => collectDerivedEvidenceNumbers(child, output, visited));
}

function addNumberVariants(output: Set<string>, value: number) {
  if (!Number.isFinite(value)) return;
  [value, Math.round(value), Math.round(value * 10) / 10, Math.round(value * 100) / 100]
    .forEach((item) => output.add(normalizeNumberToken(String(Math.abs(item)))));
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectDatedRows(value: unknown, rows: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectDatedRows(item, rows));
    return rows;
  }
  const item = record(value);
  if (!item) return rows;
  if (typeof item.record_date === "string") rows.push(item);
  Object.values(item).forEach((child) => collectDatedRows(child, rows));
  return rows;
}

function normalizeNumberToken(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/^\s*(?:[-•·]|\d+[.、)])\s*/u, "").replace(/\s+/g, " ").replace(/…|\.\.\./g, "").trim()
    : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
