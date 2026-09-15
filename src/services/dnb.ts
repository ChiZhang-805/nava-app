import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { naturalWeekDateRange, todayISO } from "./date";

export type DnbStatus = "ready" | "insufficient_data" | "unavailable";
export type DnbEvidenceLevel = "supported" | "candidate" | "no_support";

export type DnbContributor = {
  feature: string;
  module: "sleep" | "activity" | "recovery" | "mood" | "nutrition" | "focus" | "face";
  strength: number;
  direction: "up" | "down" | "mixed";
  reliability: number;
};

export type DnbWeeklyReport = {
  status: DnbStatus;
  score?: number;
  stabilityScore?: number;
  transitionScore?: number;
  peakScore?: number;
  confidence?: number;
  dataQuality?: number;
  accepted?: boolean;
  evidenceLevel?: DnbEvidenceLevel;
  summary?: string;
  recommendations: string[];
  contributors?: DnbContributor[];
  disclaimer?: string;
  peak?: { centerDate: string; centerPosition: number; windowDays: number; atEndpoint: boolean };
  diagnostics?: {
    empiricalPValue?: number;
    nullZScore?: number;
    multiscaleAgreement?: number;
    bootstrapStability?: number;
    guardrails?: string[];
  };
  modelVersion?: string;
  availableDays?: number;
  requiredDays?: number;
  generatedAt?: string;
  reason?: string;
};

export function currentSevenDayPeriod(reference = new Date()) {
  return naturalWeekDateRange(reference);
}

export async function loadDnbWeeklyReport(reference = new Date(), locale: "zh" | "en" = "zh"): Promise<DnbWeeklyReport> {
  if (isDemoMode()) {
    return {
      status: "ready",
      score: 82,
      stabilityScore: 82,
      transitionScore: 26,
      peakScore: 61,
      confidence: 0.58,
      dataQuality: 0.76,
      accepted: false,
      evidenceLevel: "candidate",
      summary: locale === "zh"
        ? "公开演示数据出现一个待验证的多模块波动候选；它没有通过全部稳定性门禁。"
        : "The demo data shows a multi-module change candidate that has not passed every stability gate yet.",
      recommendations: [locale === "zh"
        ? "继续连续记录睡眠、活动和情绪，以确认候选波动是否持续。"
        : "Keep logging sleep, activity, and mood to see whether this change persists."],
      contributors: [
        { feature: "sleep.midpoint_minutes", module: "sleep", strength: 0.72, direction: "up", reliability: 0.86 },
        { feature: "recovery.hrv_sdnn", module: "recovery", strength: 0.61, direction: "down", reliability: 0.82 },
        { feature: "focus.minutes", module: "focus", strength: 0.48, direction: "mixed", reliability: 0.72 },
      ],
      disclaimer: locale === "zh"
        ? "公开演示结果；研究性健康状态转变提示，不构成医疗诊断。"
        : "Public demo result; a research health-state signal, not a medical diagnosis.",
      modelVersion: "nava-fdnb-health-research-v0.1-demo",
      availableDays: 56,
      requiredDays: 14,
      generatedAt: new Date().toISOString(),
    };
  }

  const period = currentSevenDayPeriod(reference);
  const availableEndDate = period.endDate > todayISO() ? todayISO() : period.endDate;
  const response = await supabase.functions.invoke<Partial<DnbWeeklyReport>>("dnb-weekly-report", {
    body: { startDate: period.startDate, endDate: availableEndDate, analysisDays: 56, locale },
  });

  if (response.error) {
    return {
      status: "unavailable",
      recommendations: [],
      reason: response.error.message || (locale === "zh" ? "DNB 算法服务暂时不可用。" : "The DNB analysis service is temporarily unavailable."),
    };
  }

  return normalizeDnbWeeklyReport(response.data);
}

export async function createDnbWeeklyPoster(report: DnbWeeklyReport, locale: "zh" | "en", periodLabel: string, privacy: { includeDates: boolean; includeInsights: boolean }) {
  const score = report.stabilityScore ?? report.score;
  if (privacy.includeInsights && privacy.includeDates && (report.summary?.length ?? 0) > 4000) throw new Error(locale === "zh" ? "摘要过长，请关闭摘要后生成。" : "Insights are too long. Hide them and retry.");
  if (report.status !== "ready" || score == null || !Number.isFinite(score) || score < 0 || score > 100) throw new Error("No valid weekly score to share.");
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法生成周报海报。");
  context.font = "500 28px system-ui, sans-serif";
  const summaryLines = privacy.includeInsights && privacy.includeDates ? canvasTextLines(context, report.summary ?? "", 770) : [];
  const height = Math.max(1060, summaryLines.length ? 1100 + summaryLines.length * 44 : 1060);
  if (height > 4096) throw new Error(locale === "zh" ? "摘要过长，请关闭摘要后生成。" : "Insights are too long. Hide them and retry.");
  canvas.height = height;
  const gradient = context.createLinearGradient(0, 0, 1080, canvas.height);
  gradient.addColorStop(0, "#effbff");
  gradient.addColorStop(1, "#b8e8f6");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, canvas.height);
  context.fillStyle = "rgba(255,255,255,.78)";
  roundRect(context, 90, 100, 900, canvas.height - 230, 48);
  context.fill();
  context.fillStyle = "#0a5778";
  context.font = "700 38px system-ui, sans-serif";
  context.fillText("NAVA · WEEKLY RHYTHM", 150, 190);
  if (report.modelVersion?.includes("demo")) {
    context.font = "700 26px system-ui, sans-serif";
    context.fillText("演示数据 / Demo", 150, 295);
  }
  context.fillStyle = "#6b8793";
  context.font = "500 28px system-ui, sans-serif";
  if (privacy.includeDates) context.fillText(periodLabel, 150, 245);
  context.fillStyle = "#0b3347";
  context.font = `${locale === "zh" ? 76 : 68}px system-ui, sans-serif`;
  context.fillText(locale === "zh" ? "我的节律周记" : "My rhythm journal", 150, 385);
  context.fillStyle = "#1780a9";
  context.font = "800 190px system-ui, sans-serif";
  context.fillText(String(Math.round(score)), 145, 650);
  context.font = "700 32px system-ui, sans-serif";
  context.fillText(locale === "zh" ? "本周稳定度" : "WEEKLY STABILITY", 155, 710);
  context.fillStyle = "#244e60";
  context.font = "650 34px system-ui, sans-serif";
  const keyword = report.evidenceLevel === "supported"
    ? (locale === "zh" ? "关键词：值得关注的转变" : "Keyword: supported change")
    : report.evidenceLevel === "candidate"
      ? (locale === "zh" ? "关键词：继续观察" : "Keyword: keep observing")
      : (locale === "zh" ? "关键词：证据有限" : "Keyword: limited evidence");
  if (privacy.includeInsights && privacy.includeDates) context.fillText(keyword, 150, 820);
  context.fillStyle = "#537381";
  context.font = "500 28px system-ui, sans-serif";
  summaryLines.forEach((line, index) => context.fillText(line, 150, 900 + index * 44));
  context.fillStyle = "#78909a";
  context.font = "500 21px system-ui, sans-serif";
  canvasTextLines(context, locale === "zh" ? "研究性健康状态提示，不构成医疗诊断。" : "Research health-state signal; not a medical diagnosis.", 770).forEach((line, index) => context.fillText(line, 150, canvas.height - 210 + index * 32));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("海报生成失败。")), "image/png"));
  return blob;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function canvasTextLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const characters = [...text];
  let line = "";
  const lines: string[] = [];
  for (const character of characters) {
    const next = line + character;
    if (character === "\n" || (context.measureText(next).width > maxWidth && line)) {
      lines.push(line);
      line = character === "\n" ? "" : character;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function refreshFdnbHealth(endDate = todayISO()) {
  if (isDemoMode()) return null;
  const response = await supabase.functions.invoke("fdnb-recompute", {
    body: { endDate, analysisDays: 56 },
  });
  if (response.error) throw response.error;
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
    stabilityScore: finiteNumber(value?.stabilityScore),
    transitionScore: finiteNumber(value?.transitionScore),
    peakScore: finiteNumber(value?.peakScore),
    confidence: finiteNumber(value?.confidence),
    dataQuality: finiteNumber(value?.dataQuality),
    accepted: value?.accepted === true,
    evidenceLevel: validEvidenceLevel(value?.evidenceLevel) ? value.evidenceLevel : undefined,
    summary: cleanText(value?.summary),
    recommendations: Array.isArray(value?.recommendations)
      ? value.recommendations.map(cleanText).filter((item): item is string => Boolean(item)).slice(0, 3)
      : [],
    modelVersion: cleanText(value?.modelVersion),
    contributors: Array.isArray(value?.contributors)
      ? value.contributors.filter(validContributor).slice(0, 5)
      : [],
    disclaimer: cleanText(value?.disclaimer),
    peak: validPeak(value?.peak) ? value.peak : undefined,
    diagnostics: value?.diagnostics && typeof value.diagnostics === "object" ? value.diagnostics : undefined,
    availableDays: finiteNumber(value?.availableDays),
    requiredDays: finiteNumber(value?.requiredDays),
    generatedAt: cleanText(value?.generatedAt),
    reason: status === "unavailable"
      ? cleanText(value?.reason) ?? (requestedStatus === "ready" ? "DNB 算法服务未返回 0 到 100 之间的有效评分。" : undefined)
      : cleanText(value?.reason),
  };
}

function validEvidenceLevel(value: unknown): value is DnbEvidenceLevel {
  return value === "supported" || value === "candidate" || value === "no_support";
}

function validContributor(value: unknown): value is DnbContributor {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DnbContributor>;
  return typeof item.feature === "string" && typeof item.module === "string" && finiteNumber(item.strength) !== undefined;
}

function validPeak(value: unknown): value is NonNullable<DnbWeeklyReport["peak"]> {
  if (!value || typeof value !== "object") return false;
  const peak = value as NonNullable<DnbWeeklyReport["peak"]>;
  return typeof peak.centerDate === "string" && finiteNumber(peak.centerPosition) !== undefined && finiteNumber(peak.windowDays) !== undefined;
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
