import { useCallback, useMemo } from "react";
import ReportSharePreview from "./ReportSharePreview";
import { createDnbWeeklyPoster, type DnbWeeklyReport } from "../services/dnb";
import type { ReportCardOptions } from "../services/reportShareCard";
export default function WeeklySharePreview({ report, locale, startDate, endDate, onClose, onComplete }: { report: DnbWeeklyReport; locale: "zh" | "en"; startDate: string; endDate: string; onClose: () => void; onComplete: () => void }) {
  const options = useMemo<ReportCardOptions>(() => ({ module: "weekly", moduleLabel: locale === "zh" ? "节律周报" : "Weekly rhythm", locale, endDate, entries: [], insights: report.summary ? [report.summary] : [], insightsAreDemo: report.modelVersion?.includes("demo"), valueFormatter: String }), [endDate, locale, report.summary, report.modelVersion]);
  const createImage = useCallback((privacy: { includeDates: boolean; includeInsights: boolean }) => createDnbWeeklyPoster(report, locale, `${startDate} – ${endDate}`, privacy), [endDate, locale, report, startDate]);
  return <ReportSharePreview options={options} createImage={createImage} onClose={onClose} onComplete={onComplete} />;
}
