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
- When consent is enabled, the compact profile context may include age group,
  gender, height, weight, occupation, MBTI, hobbies, goal, sleep schedule,
  exercise pattern, diet preferences and stress factors. Missing fields remain
  missing; query failures stop the request instead of silently producing an
  answer from an incomplete context.
- Per-module and weekly health reports read the authenticated user's persisted
  records, run the bounded same-date association harness, and require real
  primary evidence. Weekly generation requires at least five distinct recorded
  days.
- AI chat and health reports also read the authenticated user's meaningful
  `health_metric_snapshots` rows: heart rate, resting heart rate, HRV, blood
  oxygen, activity bins/coverage, sleep stages/times and sleep efficiency.
  Empty legacy snapshot rows do not count as report evidence.
- Health and diet report caches carry a SHA-256 fingerprint of the normalized
  source profile and records. A source change invalidates the cached prose.
- Invalid or incomplete structured report output receives bounded model repair.
  `ai-health-report` now allows at most three total attempts inside a 65-second
  request budget and retries transient network, 408, 429 and provider 5xx
  failures with short backoff. Its repair turns receive the previous
  JSON draft and non-sensitive validation issue codes, so it can correct the
  actual failed fields instead of blindly generating the same shape again.
  Numeric evidence grounding and association-confidence checks remain mandatory.
  If the contract still fails, the request fails visibly; no fixed production
  prose replaces the model.
- The four compact labels are a secondary presentation shape, not evidence.
  When the model has already returned a valid grounded normal report but a
  compact label misses the exact seven-Han / 2–4-word constraint, the function
  normalizes that label from the same model-authored label or section headline.
  It does not discard the otherwise valid report or introduce new facts.
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

## Frontend AI surface inventory

The report UI has 20 distinct prose placements, all routed through authenticated
report services rather than local production copy:

- six module trend insight panels: mood, sleep, exercise, diet, focus and face;
- six module overview instant-feedback panels for the same modules;
- six compact summaries on the record-hub module cards;
- one record-hub rhythm overview; and
- one weekly rhythm insight.

Mood, sleep, exercise, focus, face and weekly placements call
`loadHealthAiReport`, which invokes `ai-health-report`; diet placements call
`loadDietAiReport`, which invokes `ai-diet-report`. The normal and compact
phrasing come from the same validated model result and source fingerprint.
Unavailable model output is shown as unavailable and is never replaced by
fixed production advice. The module overview preserves the safe server error
message and a retry action, so authentication, rate-limit, provider, and format
failures do not collapse into one misleading generic “AI unavailable” state.

The auxiliary AI paths are separate and remain wired as follows: AI chat uses
`ai-extract-data` followed by streamed `ai-chat-reply`; meal-photo recognition
uses private `diet-photos` storage followed by `diet-extract`; face-photo
feedback uses private `face-photos` storage followed by `face-analyze`; and the
two focus AI actions open AI chat with the authenticated task context. The
daily `NAVA 当日洞察` value is intentionally not labeled AI: it is a persisted
`rhythm-score` action or a deterministic local fallback, not model-generated
prose.

AI conversation titles reuse the authenticated `ai-chat-reply` boundary only
after the user's AI-personalization consent is true. The title request contains
at most the latest 12 messages and 2,800 characters, marks the transcript as
reference data rather than instructions, and asks for an output-only summary of
8–10 Han characters or 3–6 English words. The client applies a second length and
character contract before accepting the result. Without consent, with an
unavailable provider, or with invalid output, history keeps an explicitly dated
local fallback title. Title generation never blocks the prior archive write or
causes the active conversation to be deleted before that archive succeeds.

## 2026-09-05 production diagnosis through 2026-09-10 deployment

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
- The repaired source identifies itself as
  `deepseek-v4-flash-health-report-v5-targeted-repair`, includes the targeted
  bounded repair described above, and logs only issue codes. On 2026-09-06 it
  was deployed to the canonical Supabase project as active function version 9
  with JWT verification enabled. A read-only production download matched the
  local `index.ts` SHA-256 exactly, and an unauthenticated canonical endpoint
  call was rejected with `请先登录后再调用 App 后端。`
- On 2026-09-07 the health-report contract advanced to
  `deepseek-v4-flash-health-report-v6-health-metrics`: HealthKit snapshots and
  the expanded consent-authorized profile are part of the source fingerprint,
  and numeric evidence that cites a date must be grounded in rows for that date.
  It is deployed as ACTIVE version 10 with JWT verification. The matching diet
  calendar-window report is ACTIVE version 7 and AI chat context is ACTIVE
  version 20; both also have JWT verification enabled.
- On 2026-09-09 the contract advanced to
  `deepseek-v4-flash-health-report-v7-retry-resilience` and was deployed as
  ACTIVE version 19 with JWT verification. It preserves the grounded schema,
  source fingerprint and targeted repair contract while allowing up to three
  total attempts within 65 seconds. The frontend now renders the safe server
  error and an explicit retry action instead of collapsing all failures into
  “AI unavailable”. A production download matched local source byte-for-byte;
  the secret name exists, but its value was never read or exposed.
- At the version 19 deployment, deployment identity and the unauthenticated
  boundary were verified, but an authenticated production session was not yet
  available. The later account acceptance run described below supersedes that
  limitation for generation and persistence.
- On 2026-09-10 an authenticated six-scope run showed that v7 systematically
  rejected valid model evidence whenever the model rendered an exact derived
  statistic (for example a correlation coefficient as a percentage) rather
  than copying a raw JSON token. The v8 contract,
  `deepseek-v4-flash-health-report-v8-derived-evidence-normalization`, keeps the
  same evidence and association safety boundaries but allowlists only values
  that the server can deterministically recompute from consent-authorized rows:
  counts, period length, range, mean, median, standard deviation, first/last
  change, bounded ratios, minute/hour conversion and correlation percentage.
  Unsupported numeric tokens remain rejected and are returned to the bounded
  repair prompt as numeric-only issue codes. Short display headings may be
  normalized only by reusing the model-authored heading, explanation and action;
  the server does not introduce new claims.
- That v8 source was deployed only as `ai-health-report` to canonical Supabase
  ACTIVE version 21 with `verify_jwt=true`; an unauthenticated call returned
  HTTP 401. A subsequent forced authenticated run generated and persisted
  structured DeepSeek v8 reports for mood, sleep, exercise, focus, face and
  weekly scopes (6/6). The same run also independently confirmed the existing
  diet visual extraction and four-item diet report path. Cache invalidation after
  a new source-data write remains a separate future acceptance boundary.
- A separate no-user-data check showed that the developer-machine DeepSeek key
  currently has available balance and that `deepseek-v4-flash` returns valid
  JSON. Its digest does not match the production Supabase secret, so it is not
  evidence of the production key's numeric balance. The production error class
  above is the stronger evidence that the observed failures were validation
  failures rather than provider HTTP quota failures.
