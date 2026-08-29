import { supabase } from "./supabaseClient";

export type HealthReportScope = "mood" | "sleep" | "exercise" | "focus" | "face" | "weekly";

export interface HealthAiReport {
  bullets: string[];
  provider: "deepseek";
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

