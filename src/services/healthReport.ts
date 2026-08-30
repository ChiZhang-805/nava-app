import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { shiftDateISO } from "./date";

export type HealthReportScope = "mood" | "sleep" | "exercise" | "focus" | "face" | "weekly";

export interface HealthAiReport {
  bullets: string[];
  provider: "deepseek" | "demo";
  modelVersion: string;
  generatedAt: string;
  sourceCount: number;
  periodStart: string;
  periodEnd: string;
}

const pending = new Map<string, Promise<HealthAiReport>>();

function validBullet(value: string, locale: "zh" | "en") {
  if (locale === "en") {
    const words = value.trim().split(/\s+/).filter(Boolean).length;
    return words >= 5 && words <= 10;
  }
  const han = value.match(/\p{Script=Han}/gu)?.length ?? 0;
  return han >= 15 && han <= 18;
}

export async function loadHealthAiReport(input: {
  scope: HealthReportScope;
  endDate: string;
  locale: "zh" | "en";
  refresh?: boolean;
}) {
  if (isDemoMode()) {
    return {
      bullets: input.locale === "zh"
        ? ["近七日节律记录整体平稳且连续性良好", "睡眠与活动变化和每日状态呈同步趋势", "午后活动增加时整体节律表现更稳定", "建议继续规律记录并观察周末作息变化"]
        : ["Seven-day rhythm records remain broadly stable", "Sleep and activity changes track daily status", "Afternoon movement aligns with steadier rhythm scores", "Keep logging consistently through the weekend"],
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
    if (!report || report.provider !== "deepseek" || report.bullets.length !== 4 || !report.bullets.every((bullet) => validBullet(bullet, input.locale))) {
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
