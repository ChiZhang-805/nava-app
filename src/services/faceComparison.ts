import type { FaceRecord } from "../types.ts";

export function knownFaceMode(mode: unknown): mode is "bare_face" | "makeup" {
  return mode === "bare_face" || mode === "makeup";
}

/** Only observed, same-mode scores through the requested date are comparable. */
export function sameModeFaces(records: FaceRecord[], mode: unknown, throughDate: string) {
  if (!knownFaceMode(mode)) return [];
  return records.filter((record) => record.capture_mode === mode && record.record_date <= throughDate
    && record.overall_score != null && Number.isFinite(record.overall_score))
    .sort((a, b) => a.record_date.localeCompare(b.record_date));
}

export function previousComparableFace(records: FaceRecord[], current: FaceRecord | null | undefined) {
  if (!current || current.overall_score == null) return null;
  const previous = sameModeFaces(records, current.capture_mode, current.record_date)
    .filter((record) => record.record_date < current.record_date);
  return previous[previous.length - 1] ?? null;
}

export function latestKnownFaceMode(records: FaceRecord[], date: string) {
  const previous = records.filter((record) => record.record_date <= date && knownFaceMode(record.capture_mode))
    .sort((a, b) => a.record_date.localeCompare(b.record_date));
  return previous[previous.length - 1]?.capture_mode;
}
