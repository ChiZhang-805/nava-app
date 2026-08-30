import {
  knowledgeForModel,
  markKnowledgeUsage,
  normalizeKnowledgeBundle,
  runKnowledgeTools,
} from "../_shared/knowledge-tools.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("USDA nutrition tool is invoked once and returns compact macro evidence", async () => {
  let calls = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert(body.query === "pizza cheese regular crust", "The normalized food query was not sent to USDA.");
    return new Response(JSON.stringify({
      foods: [{
        fdcId: 12345,
        description: "PIZZA, CHEESE, REGULAR CRUST",
        dataType: "Foundation",
        foodNutrients: [
          { nutrientNumber: "1008", nutrientName: "Energy", unitName: "KCAL", value: 266 },
          { nutrientNumber: "1003", nutrientName: "Protein", unitName: "G", value: 11.4 },
          { nutrientNumber: "1005", nutrientName: "Carbohydrate, by difference", unitName: "G", value: 33.3 },
          { nutrientNumber: "1004", nutrientName: "Total lipid (fat)", unitName: "G", value: 9.7 },
        ],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const bundle = await runKnowledgeTools({
    domains: ["nutrition"],
    message: "我今天吃了一片披萨",
    extraction: { dataType: "nutrition", extractedData: { items: [{ name: "披萨" }] } },
    usdaApiKey: "test-key",
    fetchImpl,
  });
  const trace = bundle.traces.find((item) => item.toolId === "usda_fooddata_central");
  const usda = bundle.evidence.find((item) => item.toolId === "usda_fooddata_central");
  assert(calls === 1, `Expected one USDA request, received ${calls}.`);
  assert(trace?.invoked === true && trace.status === "success", "USDA invocation was not recorded as successful.");
  assert(usda?.facts.caloriesKcal === 266 && usda.facts.proteinG === 11.4, "USDA macro values were not compacted correctly.");
  assert(JSON.stringify(knowledgeForModel(bundle)).length < 4000, "Model evidence exceeded the compact token envelope.");
});

Deno.test("irrelevant domains do not call USDA", async () => {
  let calls = 0;
  const bundle = await runKnowledgeTools({
    domains: ["mood"],
    message: "我今天高兴死了",
    fetchImpl: (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  assert(calls === 0, "A nutrition database was called for a mood-only message.");
  assert(bundle.evidence.some((item) => item.toolId === "nava_mood_intensity_rubric"), "Mood rubric was not selected.");
  assert(!bundle.traces.some((item) => item.toolId === "usda_fooddata_central"), "USDA trace should not exist outside nutrition.");
});

Deno.test("USDA failure is auditable and common-serving fallback remains usable", async () => {
  const bundle = await runKnowledgeTools({
    domains: ["nutrition"],
    message: "吃了披萨",
    usdaApiKey: "test-key",
    fetchImpl: (async () => new Response("rate limited", { status: 429 })) as typeof fetch,
  });
  const usda = bundle.traces.find((item) => item.toolId === "usda_fooddata_central");
  const fallback = bundle.traces.find((item) => item.toolId === "nava_common_food_reference");
  assert(usda?.status === "error" && usda.invoked, "USDA failure was not preserved in the audit trace.");
  assert(fallback?.status === "success", "The bounded common-serving fallback did not remain available.");
  assert(bundle.evidence.some((item) => item.toolId === "nava_common_food_reference" && item.facts.caloriesKcal === 270), "Pizza fallback was missing or incorrect.");
});

Deno.test("face references are selected as safety constraints, not diagnostic lookup", async () => {
  const bundle = await runKnowledgeTools({ domains: ["face"] });
  const ids = bundle.evidence.map((item) => item.toolId);
  assert(ids.includes("scin_face_reference") && ids.includes("fitzpatrick17k_bias_reference"), "Face coverage references were not selected.");
  const serialized = JSON.stringify(bundle.evidence);
  assert(serialized.includes("no nearest-neighbor diagnosis"), "SCIN runtime prohibition is missing.");
  assert(serialized.includes("performance can vary across skin types"), "Bias constraint is missing.");

  const used = markKnowledgeUsage(bundle, { suppliedToolIds: ids, usedToolIds: ids });
  assert(used.traces.every((item) => item.suppliedToModel && item.used), "Face safety references were not marked after prompt injection and output validation.");
});

Deno.test("knowledge input normalization rejects invented tool identities and unsafe links", () => {
  const normalized = normalizeKnowledgeBundle({
    evidence: [
      { toolId: "made_up_tool", domain: "nutrition", sourceTitle: "bad", sourceUrl: "javascript:alert(1)", facts: { calories: 1 }, confidence: 1 },
      { toolId: "aasm_sleep_duration_reference", domain: "sleep", sourceTitle: "AASM", sourceUrl: "https://www.aasm.org/reference", facts: { minimum: 7 }, confidence: 2 },
    ],
    traces: [],
  });
  assert(normalized.evidence.length === 1, "An unknown tool identity passed normalization.");
  assert(normalized.evidence[0].confidence === 1, "Confidence was not clamped.");
  assert(normalized.evidence[0].sourceUrl?.startsWith("https://"), "A safe HTTPS source was not preserved.");
});
