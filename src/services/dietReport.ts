import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import { validCompactReportBullet, type CompactSummary } from "./reportSummaryContract";

export interface DietAiReport {
  bullets: string[];
  compactBullets?: CompactSummary;
  generatedAt?: string;
  modelVersion?: string;
}

const pendingReports = new Map<string, Promise<DietAiReport>>();

function isReportBulletValid(value: string) {
  const hanCount = value.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (hanCount > 0) return hanCount >= 15 && hanCount <= 18;
  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  return wordCount >= 5 && wordCount <= 10;
}

export function parseDietAiReport(value: unknown, locale: "zh" | "en" = "zh"): DietAiReport | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DietAiReport>;
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((item): item is string => typeof item === "string" && isReportBulletValid(item)).slice(0, 4)
      : [];
    const compactBullets = Array.isArray(parsed.compactBullets)
      ? parsed.compactBullets.filter((item): item is string => typeof item === "string" && validCompactReportBullet(item, locale)).slice(0, 4)
      : undefined;
    return bullets.length === 4 && (compactBullets == null || compactBullets.length === 4)
      ? { ...parsed, bullets, compactBullets: compactBullets as [string, string, string, string] | undefined }
      : null;
  } catch {
    return null;
  }
}

export async function loadDietAiReport(input: { date: string; locale: "zh" | "en"; refresh?: boolean }) {
  if (isDemoMode()) {
    return {
      bullets: input.locale === "zh"
        ? ["近七日能量摄入整体稳定且波动适中", "蛋白质摄入分布均衡度仍需持续提升", "饮水节奏建议均匀分散至全天时段", "下一餐优先增加蔬菜与优质蛋白质"]
        : ["Energy intake is fairly steady", "Spread protein more evenly", "Space hydration across the day", "Prioritize vegetables next meal"],
      compactBullets: input.locale === "zh"
        ? ["近周能量较平稳", "蛋白分布待改善", "饮水节奏需均匀", "下餐增加好蛋白"]
        : ["Energy stays steady", "Improve protein balance", "Space water evenly", "Add quality protein"],
      generatedAt: new Date().toISOString(),
      modelVersion: "demo-only",
    } satisfies DietAiReport;
  }

  const cacheKey = `${input.date}:${input.locale}:${input.refresh ? "refresh" : "load"}`;
  const existing = pendingReports.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    const response = await supabase.functions.invoke<DietAiReport>("ai-diet-report", {
      body: { date: input.date, lang: input.locale, refresh: input.refresh === true },
    });
    if (response.error) throw response.error;
    const compactBulletsValid = response.data?.compactBullets == null
      || (response.data.compactBullets.length === 4 && response.data.compactBullets.every((bullet) => validCompactReportBullet(bullet, input.locale)));
    if (!response.data || !Array.isArray(response.data.bullets) || response.data.bullets.length !== 4 || !response.data.bullets.every(isReportBulletValid) || !compactBulletsValid) {
      throw new Error(input.locale === "zh" ? "AI 饮食报告格式无效，请稍后重试。" : "The AI diet report was not valid. Please try again.");
    }
    return response.data;
  })();
  pendingReports.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingReports.delete(cacheKey);
  }
}
