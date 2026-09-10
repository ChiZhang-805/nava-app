import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const endDate = argument("end");
const requestedScope = argument("scope") ?? "all";
const validScopes = ["mood", "sleep", "exercise", "focus", "face", "weekly"];
const scopes = requestedScope === "all" ? validScopes : [requestedScope];
const expectedModelVersion = "deepseek-v4-flash-health-report-v8-derived-evidence-normalization";

if (!email || !password) throw new Error("请通过安全启动脚本提供目标 NAVA 账号。");
if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")) throw new Error("请提供 --end=YYYY-MM-DD。");
if (scopes.some((scope) => !validScopes.includes(scope))) throw new Error("scope 必须是 all 或六类健康报告之一。");

const periodStart = shiftDate(endDate, -6);
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;
const results = {};

try {
  for (const scope of scopes) results[scope] = await verifyScope(scope);
  console.log(JSON.stringify({
    endDate,
    scopes: results,
    allPassed: Object.values(results).every((result) => result.passed),
  }, null, 2));
} finally {
  await supabase.auth.signOut();
}

async function verifyScope(scope) {
  const original = await loadRow(scope);
  if (!hasStructuredReport(original.bullets) || original.model_version !== expectedModelVersion) {
    throw new Error(`${scope} 没有可用于缓存验收的结构化 v8 报告。`);
  }

  const baseline = await invoke(scope, false);
  const baselineReused = sameInstant(baseline.generatedAt, original.generated_at) && baseline.modelVersion === expectedModelVersion;
  const staleFingerprint = `cache-verification-stale-${scope}`;
  let staleInjected = false;
  let recovered = false;

  try {
    const staleBullets = { ...original.bullets, sourceFingerprint: staleFingerprint };
    const staleUpdate = await supabase.from("ai_health_reports").update({ bullets: staleBullets }).eq("id", original.id).select("id").single();
    if (staleUpdate.error) throw staleUpdate.error;
    staleInjected = true;

    const regenerated = await invoke(scope, false, 2);
    const afterRegeneration = await loadRow(scope);
    recovered = hasStructuredReport(afterRegeneration.bullets)
      && afterRegeneration.bullets.sourceFingerprint !== staleFingerprint
      && afterRegeneration.model_version === expectedModelVersion;
    const staleInvalidated = recovered
      && sameInstant(regenerated.generatedAt, afterRegeneration.generated_at)
      && !sameInstant(regenerated.generatedAt, original.generated_at);

    const reused = await invoke(scope, false);
    const afterReuse = await loadRow(scope);
    const regeneratedCacheReused = sameInstant(reused.generatedAt, regenerated.generatedAt)
      && sameInstant(afterReuse.generated_at, regenerated.generatedAt)
      && afterReuse.bullets.sourceFingerprint === afterRegeneration.bullets.sourceFingerprint;

    return {
      passed: baselineReused && staleInvalidated && regeneratedCacheReused,
      baselineReused,
      staleInvalidated,
      regeneratedCacheReused,
      structured: hasStructuredReport(afterReuse.bullets),
      provider: afterReuse.provider,
      modelVersion: afterReuse.model_version,
    };
  } finally {
    if (staleInjected && !recovered) {
      const restore = await supabase.from("ai_health_reports").update({
        bullets: original.bullets,
        provider: original.provider,
        model_version: original.model_version,
        source_count: original.source_count,
        generated_at: original.generated_at,
      }).eq("id", original.id);
      if (restore.error) throw restore.error;
    }
  }
}

async function loadRow(scope) {
  const result = await supabase.from("ai_health_reports")
    .select("id,bullets,provider,model_version,source_count,generated_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("period_start", periodStart)
    .eq("period_end", endDate)
    .eq("language", "zh")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function invoke(scope, refresh, attempts = 1) {
  let lastError = "request failed";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await supabase.functions.invoke("ai-health-report", {
      body: { scope, endDate, lang: "zh", refresh },
    });
    if (!result.error && hasStructuredResponse(result.data)) return result.data;
    lastError = result.error ? await safeFunctionMessage(result.error) : "未返回结构化健康报告。";
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`${scope}: ${lastError}`);
}

function hasStructuredReport(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof value.overview === "string"
    && value.overview.trim().length > 0
    && Array.isArray(value.sections)
    && value.sections.length === 4
    && typeof value.sourceFingerprint === "string"
    && value.sourceFingerprint.length > 0;
}

function hasStructuredResponse(value) {
  return Boolean(value)
    && typeof value.overview === "string"
    && Array.isArray(value.sections)
    && value.sections.length === 4
    && Array.isArray(value.bullets)
    && value.bullets.length === 4
    && typeof value.generatedAt === "string";
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

function shiftDate(date, offset) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function sameInstant(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function argument(name) {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}
