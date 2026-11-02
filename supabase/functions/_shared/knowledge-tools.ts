export type KnowledgeDomain = "nutrition" | "mood" | "sleep" | "exercise" | "face" | "style";

export type KnowledgeEvidence = {
  toolId: string;
  domain: KnowledgeDomain;
  sourceTitle: string;
  sourceUrl?: string;
  query?: string;
  facts: Record<string, unknown>;
  confidence: number;
  license?: string;
};

export type KnowledgeToolStatus = "success" | "miss" | "error" | "skipped";

export type KnowledgeToolTrace = {
  toolId: string;
  domain: KnowledgeDomain;
  invoked: boolean;
  status: KnowledgeToolStatus;
  resultCount: number;
  latencyMs: number;
  suppliedToModel: boolean;
  used: boolean;
  sourceUrls: string[];
  failureCode?: string;
};

export type KnowledgeBundle = {
  schemaVersion: "1.0.0";
  evidence: KnowledgeEvidence[];
  traces: KnowledgeToolTrace[];
};

export type RunKnowledgeToolsInput = {
  domains: KnowledgeDomain[];
  message?: string;
  extraction?: unknown;
  profile?: unknown;
  usdaApiKey?: string;
  allowUsdaDemoKey?: boolean;
  fetchImpl?: typeof fetch;
};

type CommonFoodReference = {
  pattern: RegExp;
  query: string;
  displayName: string;
  serving: string;
  caloriesKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
};

const USDA_SOURCE = "https://fdc.nal.usda.gov/api-guide/";
const NRC_SOURCE = "https://www.nrc.canada.ca/en/research-development/products-services/technical-advisory-services/sentiment-emotion-lexicons";
const AASM_SOURCE = "https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf";
const COMPENDIUM_SOURCE = "https://pacompendium.com/";
const SCIN_SOURCE = "https://github.com/google-research-datasets/scin/blob/main/README.md";
const FITZPATRICK_SOURCE = "https://openaccess.thecvf.com/content/CVPR2021W/ISIC/html/Groh_Evaluating_Deep_Neural_Networks_Trained_on_Clinical_Images_in_Dermatology_CVPRW_2021_paper.html";
const knownToolIds = new Set([
  "usda_fooddata_central",
  "nava_common_food_reference",
  "nava_mood_intensity_rubric",
  "aasm_sleep_duration_reference",
  "physical_activity_compendium_reference",
  "scin_face_reference",
  "fitzpatrick17k_bias_reference",
  "nava_profile_style_policy",
]);

const commonFoods: CommonFoodReference[] = [
  { pattern: /烤鸡|烧鸡|roast(?:ed)? chicken|chicken roasted/i, query: "chicken roasted meat and skin", displayName: "烤鸡", serving: "1份（约150克）", caloriesKcal: 359, proteinG: 41, carbohydrateG: 0, fatG: 20.4 },
  { pattern: /披萨|比萨|pizza/i, query: "pizza cheese regular crust", displayName: "普通芝士披萨", serving: "1片（常见单份）", caloriesKcal: 270, proteinG: 12, carbohydrateG: 33, fatG: 10 },
  { pattern: /鸡蛋|煮蛋|egg/i, query: "egg whole cooked", displayName: "鸡蛋", serving: "1个大号", caloriesKcal: 78, proteinG: 6.3, carbohydrateG: 0.6, fatG: 5.3 },
  { pattern: /香蕉|banana/i, query: "banana raw", displayName: "香蕉", serving: "1根中等", caloriesKcal: 105, proteinG: 1.3, carbohydrateG: 27, fatG: 0.4 },
  { pattern: /苹果|apple/i, query: "apple raw with skin", displayName: "苹果", serving: "1个中等", caloriesKcal: 95, proteinG: 0.5, carbohydrateG: 25, fatG: 0.3 },
  { pattern: /米饭|rice/i, query: "rice white cooked", displayName: "熟白米饭", serving: "1碗（约158克）", caloriesKcal: 205, proteinG: 4.3, carbohydrateG: 44.5, fatG: 0.4 },
  { pattern: /牛奶|milk/i, query: "milk whole fluid", displayName: "全脂牛奶", serving: "1杯（约244毫升）", caloriesKcal: 149, proteinG: 7.7, carbohydrateG: 11.7, fatG: 7.9 },
  { pattern: /酸奶|yogurt/i, query: "yogurt plain whole milk", displayName: "原味全脂酸奶", serving: "1杯（约245克）", caloriesKcal: 149, proteinG: 8.5, carbohydrateG: 11.4, fatG: 8 },
];

export async function runKnowledgeTools(input: RunKnowledgeToolsInput): Promise<KnowledgeBundle> {
  const domains = [...new Set(input.domains)];
  const evidence: KnowledgeEvidence[] = [];
  const traces: KnowledgeToolTrace[] = [];

  if (domains.includes("nutrition")) {
    const queries = collectNutritionQueries(input.message ?? "", input.extraction);
    const local = runCommonFoodReference(input.message ?? "", queries);
    evidence.push(...local.evidence);
    traces.push(local.trace);

    const usda = await runUsdaFoodSearch({
      queries,
      apiKey: input.usdaApiKey,
      allowDemoKey: input.allowUsdaDemoKey,
      fetchImpl: input.fetchImpl ?? fetch,
    });
    evidence.push(...usda.evidence);
    traces.push(usda.trace);
  }

  if (domains.includes("mood")) {
    evidence.push({
      toolId: "nava_mood_intensity_rubric",
      domain: "mood",
      sourceTitle: "NAVA 情绪强度标尺（NRC 情绪词典仅作方法学参考）",
      sourceUrl: NRC_SOURCE,
      facts: {
        scoreRange: "0-100",
        bands: ["0-20 severe distress", "21-40 low/anxious", "41-60 neutral/mixed", "61-75 calm-positive", "76-89 happy", "90-100 ecstatic"],
        intensifiers: { "非常/特别/very": "86-92", "高兴死了/开心爆棚/ecstatic": "92-96" },
        safeguards: ["instant mood is not a diagnosis", "mark language-derived scores as estimated", "do not copy licensed lexicon rows"],
      },
      confidence: 0.86,
      license: "NAVA-authored rubric; no NRC lexicon data is bundled",
    });
    traces.push(successTrace("nava_mood_intensity_rubric", "mood", 1, [NRC_SOURCE]));
  }

  if (domains.includes("sleep")) {
    evidence.push({
      toolId: "aasm_sleep_duration_reference",
      domain: "sleep",
      sourceTitle: "AASM/SRS adult sleep duration consensus",
      sourceUrl: AASM_SOURCE,
      facts: {
        adultRegularSleepHours: "7 or more per night",
        caveat: "individual needs vary; longer sleep may be appropriate in some circumstances",
        safeguard: "compare only when age and stated duration make the reference relevant; do not diagnose",
      },
      confidence: 0.95,
    });
    traces.push(successTrace("aasm_sleep_duration_reference", "sleep", 1, [AASM_SOURCE]));
  }

  if (domains.includes("exercise")) {
    evidence.push({
      toolId: "physical_activity_compendium_reference",
      domain: "exercise",
      sourceTitle: "Compendium of Physical Activities",
      sourceUrl: COMPENDIUM_SOURCE,
      facts: {
        purpose: "standard MET coding reference for physical activities",
        useRule: "estimate expenditure only when activity, duration, and sufficient body context are available",
        safeguard: "never present MET-derived calories as a measured value",
      },
      confidence: 0.92,
    });
    traces.push(successTrace("physical_activity_compendium_reference", "exercise", 1, [COMPENDIUM_SOURCE]));
  }

  if (domains.includes("face")) {
    evidence.push(
      {
        toolId: "scin_face_reference",
        domain: "face",
        sourceTitle: "Google SCIN dermatology image dataset documentation",
        sourceUrl: SCIN_SOURCE,
        facts: {
          intendedUse: "research and education across diverse skin tones",
          runtimeUse: "safety and coverage reference only; no nearest-neighbor diagnosis and no identity matching",
          allowedObservations: ["visible eye-area tiredness", "visible dryness", "tone evenness", "temporary puffiness"],
          prohibited: ["identity inference", "protected-trait inference", "disease diagnosis", "certainty from one photo"],
        },
        confidence: 0.94,
        license: "SCIN dataset terms must be reviewed before any future offline evaluation use",
      },
      {
        toolId: "fitzpatrick17k_bias_reference",
        domain: "face",
        sourceTitle: "Fitzpatrick17k dermatology benchmark paper",
        sourceUrl: FITZPATRICK_SOURCE,
        facts: {
          lesson: "clinical-image model performance can vary across skin types and training distribution",
          runtimeUse: "lower confidence under poor lighting or unsupported presentation; avoid diagnostic labels",
        },
        confidence: 0.92,
      },
    );
    traces.push(
      successTrace("scin_face_reference", "face", 1, [SCIN_SOURCE]),
      successTrace("fitzpatrick17k_bias_reference", "face", 1, [FITZPATRICK_SOURCE]),
    );
  }

  if (domains.includes("style")) {
    const role = readProfileRole(input.profile);
    evidence.push({
      toolId: "nava_profile_style_policy",
      domain: "style",
      sourceTitle: "NAVA consent-gated response style policy",
      facts: styleFacts(role),
      confidence: role ? 0.9 : 0.72,
      license: "NAVA internal policy",
    });
    traces.push(successTrace("nava_profile_style_policy", "style", 1, []));
  }

  return compactKnowledgeBundle({ schemaVersion: "1.0.0", evidence, traces });
}

export function markKnowledgeUsage(
  bundle: KnowledgeBundle,
  options: { suppliedToolIds?: string[]; usedToolIds?: string[] } = {},
): KnowledgeBundle {
  const supplied = new Set(options.suppliedToolIds ?? []);
  const available = new Set(bundle.evidence.map((item) => item.toolId));
  const used = new Set((options.usedToolIds ?? []).filter((id) => available.has(id)));
  return {
    ...bundle,
    traces: bundle.traces.map((trace) => ({
      ...trace,
      suppliedToModel: trace.suppliedToModel || supplied.has(trace.toolId),
      used: trace.used || used.has(trace.toolId),
    })),
  };
}

export function compactKnowledgeBundle(bundle: KnowledgeBundle, maxEvidence = 8): KnowledgeBundle {
  const evidence = bundle.evidence.slice(0, maxEvidence).map((item) => ({
    ...item,
    query: item.query ? cleanText(item.query, 80) : undefined,
    facts: compactFacts(item.facts),
    confidence: round(clamp(item.confidence, 0, 1), 3),
  }));
  const allowed = new Set(evidence.map((item) => item.toolId));
  const traces = bundle.traces
    .filter((trace) => allowed.has(trace.toolId) || trace.status !== "success")
    .slice(0, 12)
    .map((trace) => ({ ...trace, sourceUrls: trace.sourceUrls.slice(0, 3), latencyMs: Math.max(0, Math.round(trace.latencyMs)) }));
  return { schemaVersion: "1.0.0", evidence, traces };
}

export function normalizeKnowledgeBundle(value: unknown): KnowledgeBundle {
  const root = record(value);
  const rawEvidence = Array.isArray(root?.evidence) ? root.evidence : [];
  const evidence = rawEvidence.flatMap((item) => {
    const row = record(item);
    const toolId = cleanText(String(row?.toolId ?? ""), 60);
    const domain = cleanText(String(row?.domain ?? ""), 20) as KnowledgeDomain;
    const facts = record(row?.facts);
    if (!knownToolIds.has(toolId) || !isKnowledgeDomain(domain) || !facts) return [];
    const sourceUrl = safeSourceUrl(row?.sourceUrl);
    return [{
      toolId,
      domain,
      sourceTitle: cleanText(String(row?.sourceTitle ?? toolId), 120),
      sourceUrl,
      query: typeof row?.query === "string" ? cleanText(row.query, 80) : undefined,
      facts: compactFacts(facts),
      confidence: clamp(numeric(row?.confidence) ?? 0.5, 0, 1),
      license: typeof row?.license === "string" ? cleanText(row.license, 160) : undefined,
    } satisfies KnowledgeEvidence];
  });
  const rawTraces = Array.isArray(root?.traces) ? root.traces : [];
  const traces = rawTraces.flatMap((item) => {
    const row = record(item);
    const toolId = cleanText(String(row?.toolId ?? ""), 60);
    const domain = cleanText(String(row?.domain ?? ""), 20) as KnowledgeDomain;
    const status = cleanText(String(row?.status ?? ""), 20) as KnowledgeToolStatus;
    if (!knownToolIds.has(toolId) || !isKnowledgeDomain(domain) || !["success", "miss", "error", "skipped"].includes(status)) return [];
    const urls = Array.isArray(row?.sourceUrls) ? row.sourceUrls.map(safeSourceUrl).filter((url): url is string => Boolean(url)).slice(0, 3) : [];
    return [{
      toolId,
      domain,
      invoked: row?.invoked === true,
      status,
      resultCount: Math.max(0, Math.round(numeric(row?.resultCount) ?? 0)),
      latencyMs: Math.max(0, Math.round(numeric(row?.latencyMs) ?? 0)),
      suppliedToModel: row?.suppliedToModel === true,
      used: row?.used === true,
      sourceUrls: urls,
      failureCode: typeof row?.failureCode === "string" ? cleanText(row.failureCode, 80) : undefined,
    } satisfies KnowledgeToolTrace];
  });
  return compactKnowledgeBundle({ schemaVersion: "1.0.0", evidence, traces });
}

export function mergeKnowledgeBundles(...values: unknown[]): KnowledgeBundle {
  const normalized = values.map(normalizeKnowledgeBundle);
  const evidence = normalized.flatMap((bundle) => bundle.evidence);
  const traces = normalized.flatMap((bundle) => bundle.traces);
  const uniqueEvidence = [...new Map(evidence.map((item) => [`${item.toolId}:${item.query ?? ""}:${JSON.stringify(item.facts)}`, item])).values()];
  const traceMap = new Map<string, KnowledgeToolTrace>();
  for (const item of traces) {
    const current = traceMap.get(item.toolId);
    if (!current) {
      traceMap.set(item.toolId, item);
      continue;
    }
    traceMap.set(item.toolId, {
      ...current,
      invoked: current.invoked || item.invoked,
      status: statusRank(item.status) > statusRank(current.status) ? item.status : current.status,
      resultCount: current.resultCount + item.resultCount,
      latencyMs: current.latencyMs + item.latencyMs,
      suppliedToModel: current.suppliedToModel || item.suppliedToModel,
      used: current.used || item.used,
      sourceUrls: [...new Set([...current.sourceUrls, ...item.sourceUrls])].slice(0, 3),
      failureCode: current.failureCode ?? item.failureCode,
    });
  }
  return compactKnowledgeBundle({ schemaVersion: "1.0.0", evidence: uniqueEvidence, traces: [...traceMap.values()] });
}

export function knowledgeForModel(bundle: KnowledgeBundle) {
  return bundle.evidence.slice(0, 8).map(({ toolId, domain, sourceTitle, sourceUrl, query, facts, confidence }) => ({
    toolId,
    domain,
    sourceTitle,
    sourceUrl,
    query,
    facts,
    confidence,
  }));
}

export function knowledgeAuditSummary(value: unknown) {
  return normalizeKnowledgeBundle(value).traces.map(({ toolId, domain, invoked, status, resultCount, suppliedToModel, used, latencyMs, failureCode }) => ({
    toolId,
    domain,
    invoked,
    status,
    resultCount,
    suppliedToModel,
    used,
    latencyMs,
    failureCode,
  }));
}

async function runUsdaFoodSearch(input: {
  queries: string[];
  apiKey?: string;
  allowDemoKey?: boolean;
  fetchImpl: typeof fetch;
}): Promise<{ evidence: KnowledgeEvidence[]; trace: KnowledgeToolTrace }> {
  const started = Date.now();
  const key = cleanText(input.apiKey ?? "", 120) || (input.allowDemoKey ? "DEMO_KEY" : "");
  if (!key) {
    return {
      evidence: [],
      trace: trace("usda_fooddata_central", "nutrition", false, "skipped", 0, Date.now() - started, [USDA_SOURCE], "missing_api_key"),
    };
  }
  if (input.queries.length === 0) {
    return {
      evidence: [],
      trace: trace("usda_fooddata_central", "nutrition", false, "miss", 0, Date.now() - started, [USDA_SOURCE], "no_food_query"),
    };
  }

  try {
    const results = await Promise.all(input.queries.slice(0, 3).map(async (query) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6_500);
      try {
        const response = await input.fetchImpl(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, pageSize: 5, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"] }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`http_${response.status}`);
        const payload = await response.json() as Record<string, unknown>;
        const foods = Array.isArray(payload.foods) ? payload.foods : [];
        const food = foods.find((item) => record(item)) as Record<string, unknown> | undefined;
        return food ? usdaEvidence(query, food) : null;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const evidence = results.filter((item): item is KnowledgeEvidence => Boolean(item));
    return {
      evidence,
      trace: trace("usda_fooddata_central", "nutrition", true, evidence.length ? "success" : "miss", evidence.length, Date.now() - started, [USDA_SOURCE], evidence.length ? undefined : "no_result"),
    };
  } catch (error) {
    return {
      evidence: [],
      trace: trace("usda_fooddata_central", "nutrition", true, "error", 0, Date.now() - started, [USDA_SOURCE], safeFailureCode(error)),
    };
  }
}

function usdaEvidence(query: string, food: Record<string, unknown>): KnowledgeEvidence {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients.map(record).filter(Boolean) as Record<string, unknown>[] : [];
  return {
    toolId: "usda_fooddata_central",
    domain: "nutrition",
    sourceTitle: "USDA FoodData Central",
    sourceUrl: USDA_SOURCE,
    query,
    facts: {
      fdcId: numeric(food.fdcId),
      description: cleanText(String(food.description ?? ""), 100),
      dataType: cleanText(String(food.dataType ?? ""), 40),
      basis: "values reported by FoodData Central for the returned food entry; usually per 100 g unless the entry states otherwise",
      caloriesKcal: nutrientValue(nutrients, ["1008"], [/^energy$/i], "KCAL"),
      proteinG: nutrientValue(nutrients, ["1003"], [/protein/i], "G"),
      carbohydrateG: nutrientValue(nutrients, ["1005"], [/carbohydrate.*difference/i, /^carbohydrate$/i], "G"),
      fatG: nutrientValue(nutrients, ["1004"], [/total lipid|total fat/i], "G"),
    },
    confidence: food.dataType === "Foundation" || food.dataType === "SR Legacy" ? 0.94 : 0.88,
    license: "USDA FoodData Central data are public domain / CC0",
  };
}

function nutrientValue(nutrients: Record<string, unknown>[], numbers: string[], names: RegExp[], expectedUnit: string) {
  const item = nutrients.find((value) => {
    const number = String(value.nutrientNumber ?? value.number ?? "");
    const name = String(value.nutrientName ?? value.name ?? "");
    const unit = String(value.unitName ?? value.unit ?? "").toUpperCase();
    return (numbers.includes(number) || names.some((pattern) => pattern.test(name))) && (!unit || unit === expectedUnit);
  });
  return item ? numeric(item.value ?? item.amount) : null;
}

function runCommonFoodReference(message: string, queries: string[]) {
  const source = `${message} ${queries.join(" ")}`;
  const matches = commonFoods.filter((item) => item.pattern.test(source)).slice(0, 3);
  const evidence = matches.map<KnowledgeEvidence>((item) => ({
    toolId: "nava_common_food_reference",
    domain: "nutrition",
    sourceTitle: "NAVA common-serving nutrition reference (calibrated against USDA FoodData Central)",
    sourceUrl: USDA_SOURCE,
    query: item.query,
    facts: {
      foodName: item.displayName,
      serving: item.serving,
      caloriesKcal: item.caloriesKcal,
      proteinG: item.proteinG,
      carbohydrateG: item.carbohydrateG,
      fatG: item.fatG,
      useRule: "scale by stated quantity; keep editable and mark estimated when serving size is not explicit",
    },
    confidence: 0.78,
    license: "NAVA-authored bounded serving reference; source methodology linked",
  }));
  return {
    evidence,
    trace: trace("nava_common_food_reference", "nutrition", true, evidence.length ? "success" : "miss", evidence.length, 0, [USDA_SOURCE], evidence.length ? undefined : "no_reference_match"),
  };
}

function collectNutritionQueries(message: string, extraction: unknown) {
  const values = new Set<string>();
  for (const reference of commonFoods) if (reference.pattern.test(message)) values.add(reference.query);
  collectFoodNames(extraction, values, 0);
  return [...new Set([...values].map(toFoodQuery).filter(Boolean))].slice(0, 3);
}

function collectFoodNames(value: unknown, names: Set<string>, depth: number) {
  if (depth > 5 || names.size >= 6) return;
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item) => collectFoodNames(item, names, depth + 1));
    return;
  }
  const item = record(value);
  if (!item) return;
  for (const [key, child] of Object.entries(item)) {
    if ((key === "name" || key === "foodName" || key === "food_name" || key === "knowledgeQuery" || key === "knowledgeQueryEn" || key === "searchQuery") && typeof child === "string") {
      const cleaned = cleanText(child, 60);
      if (cleaned) names.add(cleaned);
    } else if (key === "items" || key === "records" || key === "extractedData" || key === "extracted_data") {
      collectFoodNames(child, names, depth + 1);
    }
  }
}

function toFoodQuery(value: string) {
  const reference = commonFoods.find((item) => item.pattern.test(value));
  return reference?.query ?? cleanText(value, 60);
}

function readProfileRole(profile: unknown) {
  const value = record(profile);
  const role = value?.occupation ?? value?.role;
  return typeof role === "string" ? cleanText(role, 30) : null;
}

function styleFacts(role: string | null) {
  const byRole: Record<string, string> = {
    student: "concise, equal, lightly cute or quest-like; fit classes, exams, and limited budget; never childish or inaccurate",
    employee: "direct and practical; fit commuting, meetings, and weekday constraints",
    freelance: "allow irregular schedules; offer self-set anchors and boundaries",
    caregiver: "low-burden actions that respect fragmented time and care load",
    retired: "clear everyday language around an autonomous rhythm; no workplace assumptions",
  };
  return {
    consentGate: "apply only when profile personalization consent is granted",
    role: role ?? "unknown",
    style: role && byRole[role] ? byRole[role] : "warm, precise, non-assumptive; ask at most one key clarification",
    safeguard: "style may change wording, never facts, safety thresholds, or confidence",
  };
}

function successTrace(toolId: string, domain: KnowledgeDomain, resultCount: number, sourceUrls: string[]) {
  return trace(toolId, domain, true, "success", resultCount, 0, sourceUrls);
}

function trace(
  toolId: string,
  domain: KnowledgeDomain,
  invoked: boolean,
  status: KnowledgeToolStatus,
  resultCount: number,
  latencyMs: number,
  sourceUrls: string[],
  failureCode?: string,
): KnowledgeToolTrace {
  return { toolId, domain, invoked, status, resultCount, latencyMs, suppliedToModel: false, used: false, sourceUrls, failureCode };
}

function safeFailureCode(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return cleanText(value.replace(/api_key=[^&\s]+/gi, "api_key=REDACTED"), 80) || "unknown_error";
}

function compactFacts(facts: Record<string, unknown>) {
  const entries = Object.entries(facts).slice(0, 16).map(([key, value]) => [cleanText(key, 60), compactValue(value, 0)]);
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function compactValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return cleanText(value, depth === 0 ? 220 : 120);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value == null) return value;
  if (depth >= 2) return null;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => compactValue(item, depth + 1)).filter((item) => item !== null && item !== undefined);
  const nested = record(value);
  if (nested) {
    return Object.fromEntries(Object.entries(nested).slice(0, 8).map(([key, item]) => [cleanText(key, 60), compactValue(item, depth + 1)]));
  }
  return null;
}

function cleanText(value: string, maxLength: number) {
  return Array.from(value)
    .map((character) => character === "<" || character === ">" || character.charCodeAt(0) < 32 ? " " : character)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isKnowledgeDomain(value: string): value is KnowledgeDomain {
  return value === "nutrition" || value === "mood" || value === "sleep" || value === "exercise" || value === "face" || value === "style";
}

function safeSourceUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? cleanText(url.toString(), 300) : undefined;
  } catch {
    return undefined;
  }
}

function statusRank(status: KnowledgeToolStatus) {
  return status === "success" ? 4 : status === "miss" ? 3 : status === "error" ? 2 : 1;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
