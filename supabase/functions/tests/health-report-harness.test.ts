import { calculateHealthAssociations } from "../_shared/health-report-harness.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function dated(domain: string, values: number[]) {
  return values.map((value, index) => ({
    record_date: `2026-08-${String(24 + index).padStart(2, "0")}`,
    [domain]: value,
  }));
}

Deno.test("health report harness computes bounded same-date associations", () => {
  const result = calculateHealthAssociations({
    sleep: dated("rhythm_score", [60, 65, 70, 75, 80]),
    focus: dated("total_minutes", [20, 30, 40, 50, 60]),
  });
  const association = result.results[0];
  assert(association?.correlation === 1, "Expected a perfect same-direction fixture correlation.");
  assert(association.overlapDays === 5, "Expected five exact overlapping record dates.");
  assert(association.confidence === "medium", "A five-day observational association should be medium, never high confidence.");
  assert(result.interpretation.includes("never causal"), "The non-causal interpretation guard is missing.");
});

Deno.test("health report harness refuses sparse or constant series", () => {
  const sparse = calculateHealthAssociations({
    mood: dated("mood_score", [60, 70]),
    exercise: dated("steps", [3000, 5000]),
  });
  assert(sparse.results.length === 0, "Two overlapping dates must not produce an association.");

  const constant = calculateHealthAssociations({
    face: dated("overall_score", [70, 70, 70, 70, 70]),
    sleep: dated("rhythm_score", [50, 60, 70, 80, 90]),
  });
  assert(constant.results.length === 0, "A zero-variance series must not produce a correlation.");
});

Deno.test("module reports receive only associations involving their primary domain", () => {
  const result = calculateHealthAssociations({
    face: dated("overall_score", [60, 65, 70, 75, 80]),
    sleep: dated("rhythm_score", [50, 60, 70, 80, 90]),
    mood: dated("mood_score", [40, 50, 60, 70, 80]),
  }, "face");
  assert(result.results.length === 2, "Expected face-to-sleep and face-to-mood associations only.");
  assert(result.results.every((item) => item.domains.includes("face")), "An unrelated companion-only association leaked into a module report.");
});
