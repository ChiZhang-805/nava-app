import type { DnbWeeklyReport } from "./dnb";

type WeeklyInsightInput = {
  locale: "zh" | "en";
  weekChange: number;
  completedModules: number;
  loading: boolean;
  report: DnbWeeklyReport | null;
};

const recommendationByModule: Record<string, { zh: string; en: string }> = {
  sleep: {
    zh: "下周建议继续固定每日睡眠起居窗口",
    en: "Keep a consistent sleep and wake window next week.",
  },
  recovery: {
    zh: "下周建议兼顾规律运动与充分恢复",
    en: "Balance regular movement with enough recovery next week.",
  },
  activity: {
    zh: "下周建议保持规律运动与充分恢复",
    en: "Keep exercise regular and leave enough time to recover.",
  },
  nutrition: {
    zh: "下周建议保持均衡饮食并分散补水",
    en: "Keep meals balanced and spread hydration through the day.",
  },
  mood: {
    zh: "下周建议留意情绪变化并及时记录",
    en: "Notice mood changes and log them while they are fresh.",
  },
  focus: {
    zh: "下周建议安排专注时段并适度休息",
    en: "Plan focused blocks and protect short recovery breaks.",
  },
  face: {
    zh: "下周建议保持稳定光照并持续观察",
    en: "Use consistent lighting and keep observing the trend.",
  },
};

function trendInsight(weekChange: number, locale: "zh" | "en") {
  if (locale === "en") {
    if (weekChange > 1) return "Your weekly rhythm is moving upward steadily.";
    if (weekChange < -1) return "Your weekly rhythm eased back and deserves attention.";
    return "Your weekly rhythm stayed stable with limited variation.";
  }
  if (weekChange > 1) return "本周整体节律呈现稳定向上的改善趋势";
  if (weekChange < -1) return "本周整体节律略有回落仍需继续观察";
  return "本周整体节律保持平稳且波动幅度较小";
}

function evidenceInsight(report: DnbWeeklyReport | null, loading: boolean, locale: "zh" | "en") {
  if (locale === "en") {
    if (loading) return "The AI review is combining this week's health signals.";
    if (report?.status === "insufficient_data") return "Your data is still building a dependable baseline.";
    if (report?.status !== "ready") return "The weekly AI review is not ready yet; try again later.";
    if (report.evidenceLevel === "supported") return "Multiple signals support this week's observed change.";
    if (report.evidenceLevel === "candidate") return "The observed change needs more records for confirmation.";
    return "Signals across modules stayed within a stable range.";
  }
  if (loading) return "正在结合多维数据生成本周状态评价";
  if (report?.status === "insufficient_data") return "现有数据仍在建立可靠的个人基线";
  if (report?.status !== "ready") return "本周状态评价暂未完成请稍后再试";
  if (report.evidenceLevel === "supported") return "本周多维状态变化获得稳定数据支持";
  if (report.evidenceLevel === "candidate") return "本周状态变化仍需更多记录持续验证";
  return "本周多维状态信号保持在平稳区间";
}

export function buildWeeklyInsights({
  locale,
  weekChange,
  completedModules,
  loading,
  report,
}: WeeklyInsightInput) {
  const completeness = locale === "zh"
    ? (completedModules >= 6 ? "六项健康记录覆盖完整且连续性良好" : "当前健康记录仍有缺项建议及时补齐")
    : (completedModules >= 6 ? "All six health records are complete and consistent." : "Some health records are missing and worth completing.");
  const leadingModule = report?.contributors?.[0]?.module;
  const recommendation = recommendationByModule[leadingModule ?? "sleep"] ?? recommendationByModule.sleep;
  return [
    trendInsight(weekChange, locale),
    completeness,
    evidenceInsight(report, loading, locale),
    recommendation[locale],
  ];
}
