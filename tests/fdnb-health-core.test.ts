import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFdnbHealth,
  fdnbHealthModelVersion,
  type FdnbHealthObservation,
  type FdnbModule,
} from "../supabase/functions/_shared/fdnb-health-core.ts";
import { buildFdnbHealthObservations } from "../supabase/functions/_shared/fdnb-health-features.ts";

const features: Array<[string, FdnbModule]> = [
  ["sleep.duration_minutes", "sleep"],
  ["sleep.midpoint_minutes", "sleep"],
  ["activity.steps", "activity"],
  ["recovery.hrv_sdnn", "recovery"],
  ["mood.score", "mood"],
  ["nutrition.energy_kcal", "nutrition"],
  ["focus.minutes", "focus"],
  ["face.state_score", "face"],
];

function dateAt(index: number) {
  const date = new Date("2026-06-01T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function synthetic(days: number, transitionAt = 32): FdnbHealthObservation[] {
  return Array.from({ length: days }, (_, day) => ({
    date: dateAt(day),
    features: Object.fromEntries(features.map(([key, module], feature) => {
      const wave = Math.sin(day / 5 + feature * 0.7) * 0.18;
      const transition = day >= transitionAt - 4 && day <= transitionAt + 4
        ? (day - transitionAt) * (0.35 + feature * 0.03)
        : 0;
      return [key, {
        value: 50 + feature * 4 + wave + transition,
        reliability: feature === 7 ? 0.55 : 0.86,
        module,
        source: feature === 7 ? "derived-only" : "synthetic-test",
      }];
    })),
  }));
}

test("requires longitudinal coverage instead of forcing a peak", () => {
  const result = calculateFdnbHealth(synthetic(7));
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.requiredDays, 14);
  assert.match(result.reason ?? "", /至少需要/);
});

test("returns explicit evidence, quality, provenance, and bounded scores", () => {
  const result = calculateFdnbHealth(synthetic(56));
  assert.equal(result.status, "ready");
  assert.equal(result.modelVersion, fdnbHealthModelVersion);
  assert.ok(result.disclaimer.includes("不构成医疗诊断"));
  assert.ok((result.score ?? -1) >= 0 && (result.score ?? 101) <= 100);
  assert.ok((result.transitionScore ?? -1) >= 0 && (result.transitionScore ?? 101) <= 100);
  assert.ok((result.confidence ?? -1) >= 0 && (result.confidence ?? 2) <= 1);
  assert.ok(["supported", "candidate", "no_support"].includes(result.evidenceLevel ?? ""));
  assert.ok(result.diagnostics && result.diagnostics.nullPermutations > 0);
  assert.ok(result.diagnostics && result.diagnostics.bootstrapPeakInterval.length === 2);
  assert.ok(result.peak && result.peak.centerPosition >= 0 && result.peak.centerPosition <= 1);
});

test("is deterministic for the same personal time series", () => {
  const first = calculateFdnbHealth(synthetic(56));
  const second = calculateFdnbHealth(synthetic(56));
  assert.deepEqual(first, second);
});

test("feature adapter excludes raw images and preserves derived face scalars", () => {
  const records = {
    mood_records: [{ record_date: "2026-08-20", mood_score: 70, factors: ["work"] }],
    sleep_records: [{ record_date: "2026-08-20", sleep_duration_minutes: 450, sleep_start: "23:30", sleep_end: "07:00" }],
    exercise_records: [{ record_date: "2026-08-20", steps: 8000, exercise_minutes: 35, calories: 360 }],
    nutrition_records: [{ record_date: "2026-08-20", total_calories: 1800, protein_grams: 80 }],
    focus_records: [{ record_date: "2026-08-20", total_minutes: 50, completed_sessions: 2 }],
    face_records: [{ record_date: "2026-08-20", image_path: "private/user/face.jpg", overall_score: 76, analysis_confidence: 0.6 }],
    health_metric_snapshots: [{ record_date: "2026-08-20", resting_heart_rate: 62, heart_rate_variability_sdnn: 48 }],
  };
  const result = buildFdnbHealthObservations(records, "2026-08-20", "2026-08-20");
  assert.equal(result.length, 1);
  assert.equal(result[0].features["face.state_score"].value, 76);
  assert.equal(result[0].features["face.state_score"].source, "derived-only");
  assert.ok(!JSON.stringify(result).includes("private/user/face.jpg"));
});
