import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";

type DnbInput = {
  startDate?: unknown;
  endDate?: unknown;
};

const sourceTables = [
  "mood_records",
  "sleep_records",
  "exercise_records",
  "nutrition_records",
  "focus_records",
  "face_records",
  "health_metric_snapshots",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    const body = await readJson<DnbInput>(req);
    const startDate = dateValue(body.startDate, "startDate");
    const endDate = dateValue(body.endDate, "endDate");
    assertPeriod(startDate, endDate);

    const endpoint = Deno.env.get("DNB_API_URL");
    if (!endpoint) {
      return jsonResponse({
        status: "unavailable",
        recommendations: [],
        reason: "DNB_API_URL 尚未配置，当前仅展示基础健康统计。",
      });
    }

    const records = Object.fromEntries(await Promise.all(sourceTables.map(async (table) => {
      const result = await userClient
        .from(table)
        .select("*")
        .eq("user_id", user.id)
        .gte("record_date", startDate)
        .lte("record_date", endDate)
        .order("record_date");
      if (result.error) throw new Error(`读取 ${table} 失败：${result.error.message}`);
      return [table, result.data ?? []];
    })));

    const availableDays = countAvailableDays(records);
    const apiKey = Deno.env.get("DNB_API_KEY");
    const algorithmResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        schemaVersion: "nava.dnb.weekly.v1",
        subject: { userId: user.id },
        period: { startDate, endDate, availableDays },
        records,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await safeJson(algorithmResponse);
    if (!algorithmResponse.ok) {
      return jsonResponse({
        status: payload?.status === "insufficient_data" ? "insufficient_data" : "unavailable",
        recommendations: [],
        availableDays,
        requiredDays: numberValue(payload?.requiredDays ?? payload?.required_days),
        reason: stringValue(payload?.reason ?? payload?.error)
          ?? `DNB 算法服务返回 ${algorithmResponse.status}。`,
      });
    }

    return jsonResponse(normalizeAlgorithmPayload(payload, availableDays));
  } catch (error) {
    return errorResponse(error);
  }
});

function dateValue(value: unknown, field: string) {
  const date = stringValue(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${field} 必须是 YYYY-MM-DD。`);
  return date;
}

function assertPeriod(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 31) throw new Error("DNB 分析周期必须在 1 到 31 天之间。");
}

function countAvailableDays(records: Record<string, unknown>) {
  const dates = new Set<string>();
  Object.values(records).forEach((rows) => {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const date = stringValue((row as Record<string, unknown>).record_date);
      if (date) dates.add(date.slice(0, 10));
    });
  });
  return dates.size;
}

async function safeJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeAlgorithmPayload(payload: Record<string, unknown> | null, availableDays: number) {
  if (!payload) {
    return { status: "unavailable", recommendations: [], availableDays, reason: "DNB 算法服务未返回 JSON。" };
  }
  const rawStatus = stringValue(payload.status);
  const requiredDays = numberValue(payload.requiredDays ?? payload.required_days);
  if (rawStatus === "insufficient_data") {
    return {
      status: "insufficient_data",
      recommendations: [],
      availableDays,
      requiredDays,
      reason: stringValue(payload.reason),
    };
  }
  if (rawStatus === "unavailable") {
    return {
      status: "unavailable",
      recommendations: [],
      availableDays,
      requiredDays,
      reason: stringValue(payload.reason) ?? "DNB 算法服务当前不可用。",
    };
  }
  if (rawStatus && rawStatus !== "ready") {
    return {
      status: "unavailable",
      recommendations: [],
      availableDays,
      reason: `DNB 算法服务返回了不支持的状态：${rawStatus}。`,
    };
  }

  const score = numberValue(payload.score);
  if (score === undefined || score < 0 || score > 100) {
    return {
      status: "unavailable",
      recommendations: [],
      availableDays,
      reason: "DNB 算法服务未返回 0 到 100 之间的有效 score。",
    };
  }

  return {
    status: "ready",
    score,
    confidence: numberValue(payload.confidence),
    summary: stringValue(payload.summary ?? payload.insight),
    recommendations: Array.isArray(payload.recommendations)
      ? payload.recommendations
        .map((item) => stringValue(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, 3)
      : [],
    modelVersion: stringValue(payload.modelVersion ?? payload.model_version),
    availableDays,
    requiredDays,
    generatedAt: stringValue(payload.generatedAt ?? payload.generated_at) ?? new Date().toISOString(),
    reason: stringValue(payload.reason),
  };
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}
