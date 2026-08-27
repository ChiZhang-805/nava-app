import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";
import { runFdnbHealthAnalysis } from "../_shared/fdnb-health-service.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const { user, userClient } = await requireUser(req);
    const body = await readJson(req);
    const endDate = normalizeDate(body.endDate) ?? new Date().toISOString().slice(0, 10);
    const analysisStart = shiftDate(endDate, -55);
    const reportStart = shiftDate(endDate, -6);
    const result = await runFdnbHealthAnalysis({
      userClient,
      userId: user.id,
      analysisStart,
      analysisEnd: endDate,
      reportStart,
    });
    return jsonResponse({ status: result.status, evidenceLevel: result.evidenceLevel, generatedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
});

function normalizeDate(value: unknown) {
  const date = stringValue(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
