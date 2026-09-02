import assert from "node:assert/strict";
import test from "node:test";
import { resolveConsentFlag as resolveFrontendConsent } from "../src/services/consent.ts";
import { consentFlagsFromProfile, resolveConsentFlag as resolveBackendConsent } from "../supabase/functions/_shared/consent.ts";
import { assertOwnedStoragePath } from "../supabase/functions/_shared/storage-ownership.ts";
import { sourceFingerprint } from "../supabase/functions/_shared/source-fingerprint.ts";

test("an explicit consent revocation overrides a legacy onboarding true value", () => {
  assert.equal(resolveFrontendConsent(false, true), false);
  assert.equal(resolveBackendConsent(false, true), false);
  assert.deepEqual(consentFlagsFromProfile({
    ai_personalization_consent: false,
    health_data_consent: false,
    onboarding_answers: { aiPersonalizationConsent: true, healthDataConsent: true },
  }), { aiPersonalization: false, healthSync: false });
});

test("legacy consent is used only when the dedicated column is absent", () => {
  assert.equal(resolveFrontendConsent(undefined, true), true);
  assert.equal(resolveBackendConsent(null, true), true);
  assert.equal(resolveBackendConsent(undefined, false), false);
});

test("private storage paths must stay under the authenticated user prefix", () => {
  assert.doesNotThrow(() => assertOwnedStoragePath("user-a/2026-09-02/photo.jpg", "user-a", "照片"));
  assert.throws(() => assertOwnedStoragePath("user-b/2026-09-02/photo.jpg", "user-a", "照片"), /当前登录账号/);
  assert.throws(() => assertOwnedStoragePath("user-a/../user-b/photo.jpg", "user-a", "照片"), /当前登录账号/);
});

test("source fingerprints are stable by object key and change with source data", async () => {
  const first = await sourceFingerprint({ records: [{ date: "2026-09-02", value: 72 }], profile: { goal: "sleep" } });
  const same = await sourceFingerprint({ profile: { goal: "sleep" }, records: [{ value: 72, date: "2026-09-02" }] });
  const changed = await sourceFingerprint({ profile: { goal: "sleep" }, records: [{ value: 73, date: "2026-09-02" }] });
  assert.equal(first, same);
  assert.notEqual(first, changed);
});
