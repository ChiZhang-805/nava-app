import { calculateFdnbHealth, fdnbHealthSchemaVersion, type FdnbHealthResult } from "./fdnb-health-core.ts";
import { buildFdnbHealthObservations } from "./fdnb-health-features.ts";

type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns?: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  upsert: (value: unknown, options?: { onConflict?: string }) => QueryBuilder;
  update: (value: unknown) => QueryBuilder;
};
type SupabaseLike = { from: (table: string) => QueryBuilder };

const sourceTables = [
  "mood_records",
  "sleep_records",
  "exercise_records",
  "nutrition_records",
  "focus_records",
  "focus_time_distribution",
  "face_records",
  "health_metric_snapshots",
] as const;

export async function runFdnbHealthAnalysis(input: {
  userClient: unknown;
  userId: string;
  analysisStart: string;
  analysisEnd: string;
  reportStart?: string;
}) {
  const client = input.userClient as SupabaseLike;
  const records = Object.fromEntries(await Promise.all(sourceTables.map(async (table) => {
    const result = await client
      .from(table)
      .select("*")
      .eq("user_id", input.userId)
      .gte("record_date", input.analysisStart)
      .lte("record_date", input.analysisEnd)
      .order("record_date", { ascending: true });
    if (result.error) throw new Error(`读取 ${table} 失败：${errorMessage(result.error)}`);
    return [table, Array.isArray(result.data) ? result.data : []];
  })));

  const observations = buildFdnbHealthObservations(records, input.analysisStart, input.analysisEnd);
  const result = calculateFdnbHealth(observations);
  await persistAnalysis(client, input.userId, observations, result, input.reportStart ?? input.analysisStart, input.analysisEnd);
  return result;
}

async function persistAnalysis(
  client: SupabaseLike,
  userId: string,
  observations: ReturnType<typeof buildFdnbHealthObservations>,
  result: FdnbHealthResult,
  reportStart: string,
  reportEnd: string,
) {
  const featureRows = observations
    .filter((row) => Object.keys(row.features).length > 0)
    .map((row) => ({
      user_id: userId,
      record_date: row.date,
      schema_version: fdnbHealthSchemaVersion,
      features: row.features,
      feature_count: Object.keys(row.features).length,
      data_quality: featureQuality(row.features),
      updated_at: new Date().toISOString(),
    }));

  if (featureRows.length) {
    await optionalWrite(
      client.from("health_feature_snapshots").upsert(featureRows, { onConflict: "user_id,record_date,schema_version" }),
      "health_feature_snapshots",
    );
  }

  const scoreRow = {
    user_id: userId,
    analysis_start: result.analysisStart ?? reportStart,
    analysis_end: result.analysisEnd ?? reportEnd,
    report_start: reportStart,
    report_end: reportEnd,
    status: result.status,
    evidence_level: result.evidenceLevel ?? null,
    stability_score: result.stabilityScore ?? null,
    transition_score: result.transitionScore ?? null,
    peak_score: result.peakScore ?? null,
    confidence: result.confidence ?? null,
    data_quality: result.dataQuality ?? null,
    accepted: result.accepted ?? false,
    peak: result.peak ?? {},
    contributors: result.contributors,
    diagnostics: result.diagnostics ?? {},
    summary: result.summary ?? null,
    recommendations: result.recommendations,
    reason: result.reason ?? null,
    model_version: result.modelVersion,
    schema_version: result.schemaVersion,
    generated_at: new Date().toISOString(),
  };
  await optionalWrite(
    client.from("fdnb_health_scores").upsert(scoreRow, { onConflict: "user_id,report_end,model_version" }),
    "fdnb_health_scores",
  );

  await optionalWrite(
    client.from("weekly_health_reports").upsert({
      user_id: userId,
      week_start: reportStart,
      week_end: reportEnd,
      status: result.status,
      score: result.score ?? null,
      confidence: result.confidence ?? null,
      evidence_level: result.evidenceLevel ?? null,
      summary: result.summary ?? null,
      recommendations: result.recommendations,
      algorithm_payload: result,
      model_version: result.modelVersion,
      generated_at: new Date().toISOString(),
    }, { onConflict: "user_id,week_start,week_end" }),
    "weekly_health_reports",
  );

  await optionalWrite(
    client.from("fdnb_recompute_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), last_error: null })
      .eq("user_id", userId)
      .lte("requested_date", reportEnd)
      .eq("status", "pending"),
    "fdnb_recompute_jobs",
  );
}

async function optionalWrite(builder: QueryBuilder, resource: string) {
  const result = await builder;
  if (!result.error) return;
  const message = errorMessage(result.error);
  if (/does not exist|could not find the table|schema cache|PGRST205|42P01/i.test(message)) {
    console.warn(`${resource} is not migrated yet; analysis result will still be returned.`);
    return;
  }
  throw new Error(`写入 ${resource} 失败：${message}`);
}

function featureQuality(features: Record<string, { reliability?: unknown }>) {
  const values = Object.values(features)
    .map((value) => Number(value.reliability))
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
