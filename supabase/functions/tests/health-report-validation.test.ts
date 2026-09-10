import { normalizeModelHeadline, numericEvidenceGrounded } from "../_shared/health-report-validation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sourceContext = {
  period: { start: "2026-09-03", end: "2026-09-09" },
  primaryDomain: "mood",
  primaryRecords: [
    { record_date: "2026-09-03", mood_score: 70 },
    { record_date: "2026-09-09", mood_score: 74 },
  ],
  consentAuthorizedCompanionRecords: {},
  associationHarness: { results: [] },
};

Deno.test("health report evidence accepts exact server-derived period and aggregate numbers", () => {
  assert(numericEvidenceGrounded("2026-09-03 至 2026-09-09 共 7 天，平均情绪 72 分。", sourceContext), "Expected exact period length and average to be grounded.");
  assert(!numericEvidenceGrounded("这段记录平均情绪 99 分。", sourceContext), "An unsupported number must remain rejected.");
});

Deno.test("health report normalizes model-authored display lengths without adding new copy", () => {
  const fallback = "两次记录显示状态存在轻微变化，目前样本仍然有限，因此只适合作为近期观察线索。";
  const normalized = normalizeModelHeadline("近期情绪平稳", fallback, "zh");
  const hanCount = normalized.match(/\p{Script=Han}/gu)?.length ?? 0;
  const authoredHan = (`近期情绪平稳${fallback}`.match(/\p{Script=Han}/gu) ?? []).join("");
  assert(hanCount >= 15 && hanCount <= 24, "The normalized headline must satisfy the display contract.");
  assert(authoredHan.includes(normalized), "Normalization must only reuse model-authored text.");
});
