import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const endDate = argument("end");
const meal = argument("meal") ?? "lunch";
const photoOnly = argument("photo-only") === "true";

if (!email || !password) throw new Error("请通过安全启动脚本提供目标 NAVA 账号。");
if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")) throw new Error("请提供 --end=YYYY-MM-DD。");
if (!["breakfast", "lunch", "dinner", "pantry"].includes(meal)) throw new Error("meal 必须是 breakfast、lunch、dinner 或 pantry。");

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const storage = await supabase.storage.from("diet-photos").list(`${userId}/${endDate}`, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (storage.error) throw storage.error;
  const latestMealPhoto = (storage.data ?? []).find((item) => item.name.startsWith(`${meal}-`));
  let dietExtract = { attempted: false, succeeded: false, itemCount: 0, provider: null, error: "没有找到该日期和餐次的 APP 上传照片。" };
  if (latestMealPhoto) {
    const imagePath = `${userId}/${endDate}/${latestMealPhoto.name}`;
    const result = await supabase.functions.invoke("diet-extract", {
      body: { imagePath, meal, date: endDate, lang: "zh" },
    });
    dietExtract = result.error
      ? { attempted: true, succeeded: false, itemCount: 0, provider: null, error: await safeFunctionMessage(result.error) }
      : {
          attempted: true,
          succeeded: true,
          itemCount: Array.isArray(result.data?.items) ? result.data.items.length : 0,
          provider: typeof result.data?.provider === "string" ? result.data.provider : null,
          error: null,
        };
  }

  const reports = {};
  let dietReport = null;
  if (!photoOnly) {
    for (const scope of ["mood", "sleep", "exercise", "focus", "face", "weekly"]) {
      const result = await supabase.functions.invoke("ai-health-report", {
        body: { scope, endDate, lang: "zh", refresh: true },
      });
      reports[scope] = result.error
        ? { succeeded: false, structured: false, provider: null, modelVersion: null, error: await safeFunctionMessage(result.error) }
        : {
            succeeded: true,
            structured: hasStructuredHealthReport(result.data),
            provider: typeof result.data?.provider === "string" ? result.data.provider : null,
            modelVersion: typeof result.data?.modelVersion === "string" ? result.data.modelVersion : null,
            error: null,
          };
    }

    const dietReportResult = await supabase.functions.invoke("ai-diet-report", {
      body: { date: endDate, lang: "zh", refresh: true },
    });
    dietReport = dietReportResult.error
      ? { succeeded: false, bulletCount: 0, modelVersion: null, error: await safeFunctionMessage(dietReportResult.error) }
      : {
          succeeded: true,
          bulletCount: Array.isArray(dietReportResult.data?.bullets) ? dietReportResult.data.bullets.length : 0,
          modelVersion: typeof dietReportResult.data?.modelVersion === "string" ? dietReportResult.data.modelVersion : null,
          error: null,
        };
  }

  console.log(JSON.stringify({ endDate, meal, photoOnly, dietExtract, healthReports: reports, dietReport }, null, 2));
} finally {
  await supabase.auth.signOut();
}

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function hasStructuredHealthReport(data) {
  return Boolean(data)
    && typeof data.overview === "string"
    && data.overview.trim().length > 0
    && Array.isArray(data.sections)
    && data.sections.length === 4
    && Array.isArray(data.bullets)
    && data.bullets.length === 4;
}

async function safeFunctionMessage(error) {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context instanceof Response) {
    const body = await context.clone().text().catch(() => "");
    if (body.trim()) {
      try {
        const parsed = JSON.parse(body);
        const message = typeof parsed.error === "string" ? parsed.error : typeof parsed.message === "string" ? parsed.message : "";
        if (message.trim()) return message.trim();
      } catch {
        return `HTTP ${context.status}`;
      }
    }
    return `HTTP ${context.status}`;
  }
  return error instanceof Error ? error.message : "request failed";
}
