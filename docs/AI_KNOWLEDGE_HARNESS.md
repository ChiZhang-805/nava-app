# NAVA AI knowledge harness

The runtime harness selects tools by detected domain and passes only compact,
structured evidence to the model. It never sends entire datasets or exposes a
hidden chain of thought.

## Runtime flow

1. Detect one or more health domains from the user's message.
2. Load only the authorized recent records for those domains.
3. Produce an initial structured extraction.
4. Invoke only matching knowledge tools.
5. Send compact facts, confidence, serving basis, and source URLs to an evidence
   calibration call.
6. Preserve a trace for invocation, success/miss/error, model injection, and
   confirmed adoption.
7. Pass the calibrated record and compact evidence to the final reply model.

`suppliedToModel` means the evidence was included in a protected prompt section.
`used` is stricter: the calibration model returned a valid supplied tool ID, or
a deterministic policy was applied and its output validator passed. It is not a
claim that hidden model causality can be observed.

## Tool registry

- `usda_fooddata_central`: live FoodData Central food search. A production
  `USDA_FDC_API_KEY` is recommended. The public `DEMO_KEY` is limited and is not
  a production reliability strategy.
- `nava_common_food_reference`: bounded common-serving fallback for a small set
  of common foods, kept editable and explicitly estimated.
- `nava_mood_intensity_rubric`: NAVA-authored 0–100 intensity mapping. The NRC
  lexicon site is linked as methodology background; no licensed NRC lexicon rows
  are bundled.
- `aasm_sleep_duration_reference`: adult duration reference and uncertainty
  guardrails.
- `physical_activity_compendium_reference`: MET-method reference; calorie
  estimates require sufficient activity, duration, and body context.
- `scin_face_reference` and `fitzpatrick17k_bias_reference`: diversity, bias, and
  non-diagnostic constraints. Runtime face analysis does not search for similar
  people or diseases in these datasets.
- `nava_profile_style_policy`: consent-gated role style. It may change wording,
  never facts, confidence, or safety thresholds.

## Token and privacy controls

- At most three nutrition queries and eight evidence records are retained.
- Only compact nutrient values and source metadata are passed to models; raw
  database responses and full datasets are discarded.
- Trace data excludes the full user message and provider keys.
- External evidence is treated as untrusted data, never instructions.

## Verification

`npm run backend:test` checks selective invocation, successful USDA parsing,
failure fallback, face safety selection, tool identity normalization, and compact
evidence size. `npm run ai:prompt:test` checks that valid evidence reaches the
final prompt without becoming instructions.

## Report and consent contracts

- Dedicated `profiles.ai_personalization_consent` and
  `profiles.health_data_consent` columns are authoritative. Legacy onboarding
  JSON is consulted only for profiles that do not yet have a boolean value;
  an explicit revocation can never be overwritten by an old `true` answer.
- AI chat history and stored health context are loaded only when personalized
  AI consent is enabled. The current message can still be processed without
  historical personalization, but no prior health records are attached.
- Per-module and weekly health reports read the authenticated user's persisted
  records, run the bounded same-date association harness, and require real
  primary evidence. Weekly generation requires at least five distinct recorded
  days.
- Health and diet report caches carry a SHA-256 fingerprint of the normalized
  source profile and records. A source change invalidates the cached prose.
- Invalid or incomplete structured report output receives one bounded model
  repair attempt. For `ai-health-report`, the repair turn receives the previous
  JSON draft and non-sensitive validation issue codes, so it can correct the
  actual failed fields instead of blindly generating the same shape again.
  Numeric evidence grounding and association-confidence checks remain mandatory.
  If the contract still fails, the request fails visibly; no fixed production
  prose replaces the model.
- A successfully validated health report is reused in memory for the current
  authenticated user, scope, period and language only while the caller's local
  revision of the relevant report records and authorized profile is unchanged.
  HealthKit, Watch, Realtime or another refresh that changes those inputs changes
  the revision; confirmed record saves also use the explicit refresh path.
  Across reloads and devices, the Edge Function remains
  authoritative: it reuses the Supabase row only when the SHA-256 source
  fingerprint and model version still match, and calls the model only after the
  authorized source data or profile changes.
- The knowledge trace distinguishes evidence supplied to a model from evidence
  demonstrably adopted by a validated stage. It never presents hidden
  chain-of-thought as an audit record.

## 2026-09-05 production diagnosis

- Supabase production logs at 2026-09-05 15:08–15:09 UTC recorded two
  `ai-health-report` failures as `AI 未返回有效的结构化健康报告。` They did not
  record a DeepSeek HTTP error such as 402 or 429. This confirms that those
  requests reached the post-response schema validator; it does not expose or
  retain the model draft or private health context.
- The production function downloaded read-only for comparison is version 8 and
  identifies itself as `deepseek-v4-flash-health-report-v3`. Its second attempt
  resends the source data with a generic repair sentence but does not include
  the failed draft or identify which checks failed. Repeating that call can
  therefore reproduce the same invalid shape and never create a cache row.
- The local source now identifies itself as
  `deepseek-v4-flash-health-report-v5-targeted-repair`, includes the targeted
  bounded repair described above, and logs only issue codes. It is source-only
  until an explicitly authorized Edge Function deployment and a real-account
  verification are completed.
- A separate no-user-data check showed that the developer-machine DeepSeek key
  currently has available balance and that `deepseek-v4-flash` returns valid
  JSON. Its digest does not match the production Supabase secret, so it is not
  evidence of the production key's numeric balance. The production error class
  above is the stronger evidence that the observed failures were validation
  failures rather than provider HTTP quota failures.
