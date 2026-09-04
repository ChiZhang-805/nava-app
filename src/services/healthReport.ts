import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { shiftDateISO } from "./date";
import { validCompactReportBullet, type CompactSummary } from "./reportSummaryContract";

export type HealthReportScope = "mood" | "sleep" | "exercise" | "focus" | "face" | "weekly";

export type HealthReportSection = {
  id: "trend" | "variation" | "association" | "action";
  title: string;
  headline: string;
  explanation: string;
  evidence: string[];
  action: string;
  confidence: "high" | "medium" | "low";
};

export interface HealthAiReport {
  bullets: string[];
  compactBullets?: CompactSummary;
  overview: string;
  sections: HealthReportSection[];
  provider: "deepseek" | "demo";
  modelVersion: string;
  generatedAt: string;
  sourceCount: number;
  periodStart: string;
  periodEnd: string;
}

const pending = new Map<string, Promise<HealthAiReport>>();

const demoCompactByScope: Record<HealthReportScope, { zh: CompactSummary; en: CompactSummary }> = {
  mood: {
    zh: ["近周情绪较平稳", "压力波动较温和", "睡眠情绪同步变", "继续记录触发源"],
    en: ["Mood stays steady", "Stress shifts mildly", "Sleep tracks mood", "Keep logging triggers"],
  },
  sleep: {
    zh: ["近周睡眠较规律", "夜间恢复较稳定", "睡眠活动同步变", "继续固定入睡点"],
    en: ["Sleep stays regular", "Recovery remains steady", "Sleep tracks activity", "Keep bedtime consistent"],
  },
  exercise: {
    zh: ["近周活动较平稳", "运动负荷较温和", "活动睡眠同步变", "继续保持轻运动"],
    en: ["Activity stays steady", "Load remains moderate", "Activity tracks sleep", "Keep moving gently"],
  },
  focus: {
    zh: ["近周专注较平稳", "中断次数较温和", "专注睡眠同步变", "继续分段做任务"],
    en: ["Focus stays steady", "Interruptions remain mild", "Focus tracks sleep", "Keep tasks segmented"],
  },
  face: {
    zh: ["近周面部较平稳", "拍摄质量较稳定", "面部睡眠同步变", "继续同光线拍摄"],
    en: ["Face state steady", "Capture quality stable", "Face tracks sleep", "Keep lighting consistent"],
  },
  weekly: {
    zh: ["近周节律较平稳", "睡眠活动同步变", "午后活动助稳定", "继续规律做记录"],
    en: ["Rhythm stays steady", "Sleep tracks activity", "Movement supports rhythm", "Keep logging consistently"],
  },
};

function validBullet(value: string, locale: "zh" | "en") {
  if (locale === "en") {
    const words = value.trim().split(/\s+/).filter(Boolean).length;
    return words >= 5 && words <= 12;
  }
  const han = value.match(/\p{Script=Han}/gu)?.length ?? 0;
  return han >= 15 && han <= 24;
}

function validLongText(value: string, locale: "zh" | "en") {
  if (locale === "en") return value.trim().split(/\s+/).filter(Boolean).length >= 20;
  return (value.match(/\p{Script=Han}/gu)?.length ?? 0) >= 30;
}

function validStructuredReport(report: HealthAiReport, locale: "zh" | "en") {
  const ids = ["trend", "variation", "association", "action"];
  return validLongText(report.overview, locale)
    && report.sections.length === 4
    && report.sections.every((section, index) => section.id === ids[index]
      && Boolean(section.title.trim())
      && validBullet(section.headline, locale)
      && validLongText(section.explanation, locale)
      && section.evidence.length >= 1
      && section.evidence.length <= 3
      && section.evidence.every((entry) => Boolean(entry.trim()))
      && Boolean(section.action.trim())
      && ["high", "medium", "low"].includes(section.confidence));
}

export async function loadHealthAiReport(input: {
  scope: HealthReportScope;
  endDate: string;
  locale: "zh" | "en";
  refresh?: boolean;
}) {
  if (isDemoMode()) {
    const sections: HealthReportSection[] = input.locale === "zh"
      ? [
          { id: "trend", title: "整体节律", headline: "近七日节律记录整体平稳且连续性良好", explanation: "这是本地评审模式的示例说明，用于检查长报告展开、滚动和排版，不代表真实用户结论，也没有调用生产模型。公开版本不会展示这段演示内容。", evidence: ["本地评审数据：近七日共有七个演示记录日"], action: "继续使用评审数据检查交互。", confidence: "high" },
          { id: "variation", title: "波动范围", headline: "睡眠与活动变化和每日状态呈同步趋势", explanation: "这是显式标注的本地演示解释，仅用于确认每一个摘要都能打开对应的详细内容、证据和行动区域，不应被理解为健康判断。", evidence: ["本地评审数据：睡眠与活动演示记录均已填充"], action: "不要把演示结论用于真实健康决策。", confidence: "medium" },
          { id: "association", title: "跨模块关联", headline: "午后活动增加时整体节律表现更稳定", explanation: "关联模块在演示环境中只验证信息结构。生产环境会由服务端模型读取当前账号授权的同期真实记录，并区分共同变化与因果关系。", evidence: ["本地评审数据：活动和节律使用同一演示日期窗口"], action: "上线验收时使用真实账号重新生成。", confidence: "low" },
          { id: "action", title: "下一步", headline: "建议继续规律记录并观察周末作息变化", explanation: "这条行动建议只用于视觉测试。真实周报会结合数据覆盖范围、变化幅度和置信度生成个性化行动，不会用本段固定文字替代模型结果。", evidence: ["本地评审模式不会写入生产健康记录"], action: "完成至少五个真实记录日后查看生产周报。", confidence: "medium" },
        ]
      : [
          { id: "trend", title: "Overall rhythm", headline: "Seven-day rhythm records remain broadly stable", explanation: "This is explicitly labeled local review copy for testing the expanded report layout. It is not a real user conclusion and does not call the production model.", evidence: ["Review fixture contains seven demonstration days"], action: "Use this fixture only for interaction review.", confidence: "high" },
          { id: "variation", title: "Variation", headline: "Sleep and activity changes track daily status", explanation: "This demonstration explanation only verifies that each summary opens its matching detail, evidence, and action area. It is not health guidance.", evidence: ["Review sleep and activity fixtures are populated"], action: "Do not use demo conclusions for health decisions.", confidence: "medium" },
          { id: "association", title: "Associations", headline: "Afternoon movement aligns with steadier rhythm scores", explanation: "In production the server model reads consent-authorized records for the signed-in account and distinguishes co-variation from causation. This fixture tests structure only.", evidence: ["Review activity and rhythm use the same fixture dates"], action: "Regenerate with a real account during release validation.", confidence: "low" },
          { id: "action", title: "Next step", headline: "Keep logging consistently through the weekend", explanation: "This action is visual-test copy. A production report generates personalized actions from real coverage, changes, and confidence rather than substituting this fixed sentence.", evidence: ["Review mode never writes production health records"], action: "Log at least five real days before viewing a production report.", confidence: "medium" },
        ];
    return {
      bullets: sections.map((section) => section.headline),
      compactBullets: demoCompactByScope[input.scope][input.locale],
      overview: input.locale === "zh"
        ? "这是明确标注的本地评审周报，只用于验证详细解读的页面结构、点击展开和移动端排版。它没有读取生产用户记录，也没有调用真实模型，公开版本不会把它作为用户结论。"
        : "This explicitly labeled local review report tests the detailed report structure, expansion behavior, and mobile layout. It does not read production records or call the production model, and public builds never present it as a user conclusion.",
      sections,
      provider: "demo",
      modelVersion: "review-demo-health-report-v1",
      generatedAt: new Date().toISOString(),
      sourceCount: 7,
      periodStart: shiftDateISO(input.endDate, -6),
      periodEnd: input.endDate,
    } satisfies HealthAiReport;
  }

  const key = `${input.scope}:${input.endDate}:${input.locale}:${input.refresh ? "refresh" : "cached"}`;
  const active = pending.get(key);
  if (active) return active;
  const request = (async () => {
    const response = await supabase.functions.invoke<HealthAiReport>("ai-health-report", {
      body: { scope: input.scope, endDate: input.endDate, lang: input.locale, refresh: input.refresh === true },
    });
    if (response.error) throw response.error;
    const report = response.data;
    const compactBulletsValid = report?.compactBullets == null
      || (report.compactBullets.length === 4 && report.compactBullets.every((bullet) => validCompactReportBullet(bullet, input.locale)));
    if (!report || report.provider !== "deepseek" || report.bullets.length !== 4 || !report.bullets.every((bullet) => validBullet(bullet, input.locale)) || !compactBulletsValid || !validStructuredReport(report, input.locale)) {
      throw new Error(input.locale === "zh" ? "AI 健康报告格式无效，请稍后重试。" : "The AI health report was invalid. Please retry.");
    }
    return report;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
