import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type DnbStatus = "ready" | "insufficient_data" | "unavailable";

export type DnbWeeklyReport = {
  status: DnbStatus;
  score?: number;
  confidence?: number;
  summary?: string;
  recommendations: string[];
  modelVersion?: string;
  availableDays?: number;
  requiredDays?: number;
  generatedAt?: string;
  reason?: string;
};

export function currentSevenDayPeriod(reference = new Date()) {
  const end = new Date(reference);
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function loadDnbWeeklyReport(): Promise<DnbWeeklyReport> {
  if (isDemoMode()) {
    return {
      status: "unavailable",
      recommendations: [],
      reason: "DNB 算法接口尚未连接到公开评审环境。",
    };
  }

  const period = currentSevenDayPeriod();
  const response = await supabase.functions.invoke<Partial<DnbWeeklyReport>>("dnb-weekly-report", {
    body: period,
  });

  if (response.error) {
    return {
      status: "unavailable",
      recommendations: [],
      reason: response.error.message || "DNB 算法服务暂时不可用。",
    };
  }

  return normalizeDnbWeeklyReport(response.data);
}

export function normalizeDnbWeeklyReport(value: Partial<DnbWeeklyReport> | null): DnbWeeklyReport {
  const requestedStatus: DnbStatus = value?.status === "ready" || value?.status === "insufficient_data"
    ? value.status
    : "unavailable";
  const score = finiteNumber(value?.score);
  const status: DnbStatus = requestedStatus === "ready" && !validScore(score)
    ? "unavailable"
    : requestedStatus;
  return {
    status,
    score: status === "ready" ? score : undefined,
    confidence: finiteNumber(value?.confidence),
    summary: cleanText(value?.summary),
    recommendations: Array.isArray(value?.recommendations)
      ? value.recommendations.map(cleanText).filter((item): item is string => Boolean(item)).slice(0, 3)
      : [],
    modelVersion: cleanText(value?.modelVersion),
    availableDays: finiteNumber(value?.availableDays),
    requiredDays: finiteNumber(value?.requiredDays),
    generatedAt: cleanText(value?.generatedAt),
    reason: status === "unavailable"
      ? cleanText(value?.reason) ?? (requestedStatus === "ready" ? "DNB 算法服务未返回 0 到 100 之间的有效评分。" : undefined)
      : cleanText(value?.reason),
  };
}

function validScore(value: number | undefined): value is number {
  return value !== undefined && value >= 0 && value <= 100;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
