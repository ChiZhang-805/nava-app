import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export interface DietAiReport {
  bullets: string[];
  generatedAt?: string;
  modelVersion?: string;
}

const pendingReports = new Map<string, Promise<DietAiReport>>();

export function parseDietAiReport(value: unknown): DietAiReport | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DietAiReport>;
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
      : [];
    return bullets.length === 4 ? { ...parsed, bullets } : null;
  } catch {
    return null;
  }
}

export async function loadDietAiReport(input: { date: string; locale: "zh" | "en"; refresh?: boolean }) {
  if (isDemoMode()) {
    return {
      bullets: input.locale === "zh"
        ? ["能量摄入整体较为稳定", "蛋白质分配仍可更均匀", "饮水节奏建议分散全天", "下一餐优先补充蔬菜"]
        : ["Energy intake is fairly steady", "Spread protein more evenly", "Space hydration across the day", "Prioritize vegetables next meal"],
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
    if (!response.data || !Array.isArray(response.data.bullets) || response.data.bullets.length !== 4) {
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
