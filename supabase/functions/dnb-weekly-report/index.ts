import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";
import { runFdnbHealthAnalysis } from "../_shared/fdnb-health-service.ts";

type DnbInput = {
  startDate?: unknown;
  endDate?: unknown;
  analysisDays?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    const body = await readJson<DnbInput>(req);
    const reportStart = dateValue(body.startDate, "startDate");
    const reportEnd = dateValue(body.endDate, "endDate");
    assertReportPeriod(reportStart, reportEnd);
    const analysisDays = boundedInteger(body.analysisDays, 14, 84, 56);
    const analysisStart = shiftDate(reportEnd, -(analysisDays - 1));
    const result = await runFdnbHealthAnalysis({
      userClient,
      userId: user.id,
      analysisStart,
      analysisEnd: reportEnd,
      reportStart,
    });

    return jsonResponse({
      ...result,
      generatedAt: new Date().toISOString(),
      reportPeriod: { startDate: reportStart, endDate: reportEnd },
      analysisPeriod: { startDate: analysisStart, endDate: reportEnd, days: analysisDays },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

function dateValue(value: unknown, field: string) {
  const date = stringValue(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${field} 必须是 YYYY-MM-DD。`);
  return date;
}

function assertReportPeriod(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 31) throw new Error("周报展示周期必须在 1 到 31 天之间。");
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
