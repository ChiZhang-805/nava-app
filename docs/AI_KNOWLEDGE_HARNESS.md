# NAVA AI knowledge harness

## Current deployment and conversation reset

The explicitly authorized releases on 2026-11-20 are `ai-chat-reply` ACTIVE v48
and `journal-assistant` ACTIVE v7. The latter only adds retrieved tone to the
explicit `review-conversation` purpose with a plain-text, non-vision shape;
extraction, translation and schema outputs retain their original path. Browser
feedback tests pass in Chromium/WebKit; live provider evaluation below covers
the main chat prompt, not a logged-in end-to-end journal interaction.

At the user's explicit request, only `ai_conversations` and
`ai_conversation_archives` were reset at 2026-11-20 11:50 UTC: 12 live messages
and 5 archives containing 22 actual chat messages were removed; both tables
read back zero in the transaction receipt. A verified Windows DPAPI CurrentUser
encrypted recovery snapshot and count-only receipt are under
`Build/TestRuns/App-Checks/ai-chat-reset` outside Git. No health records, journal,
accounts, rewards or media objects were removed. Existing old-version clients
can retain in-memory state; new clients replace history caches from successful
cloud reads and do not resurrect known deleted archives. New greetings or new
test conversations after the reset are expected and must not be deleted again
without a new request.

The runtime harness selects tools by detected domain and passes only compact,
structured evidence to the model. It never sends entire datasets or exposes a
hidden chain of thought.

## Conversational replies (2026-11-20 source change; deployment separate)

- Wamier (瓦咪儿) speaks as NAVA's virtual cat companion. Ordinary replies
  choose 1–6 natural short/long text bubbles according to content and emotion;
  an excited exchange can use 3–6, a brief acknowledgment can remain one. Acknowledgments
  need no forced advice or follow-up question.
  Chinese targets are 30 characters for greetings and 80 for ordinary chat;
  English targets are 18 and 45 words. These are ceilings to aim for, not quotas.
- Explicit explanations and genuinely complex requests may use up to 480
  Chinese characters / 240 English words. Facts, uncertainty, consent and
  urgent safety guidance take precedence over shortening. Voice keeps its
  separate short spoken contract, without visual emoji or kaomoji.
- A fitting emoji or kaomoji and an occasional lowercase “okk～” / “okkk~” are optional;
  distress and medical warnings use calm, plain language. The prompt does not
  diagnose, guess hidden feelings, exaggerate praise, claim human experiences,
  or suggest an exclusive relationship. Identity questions receive an honest
  answer without repeating an AI introduction in every turn.
- The server can request one shorter complete revision. A failed or still
  overlong revision preserves the complete original; no character/word slicing
  or sentence excerpt can remove its final warning. Empty output or a provider
  `finish_reason` other than `stop` is a visible failure, never a successful
  answer padded with punctuation. A custom provider can omit terminal metadata
  but must still return nonempty content.
- The current provider returns a complete answer. The SSE endpoint sends one
  `done` event as soon as that answer is ready; there is no artificial per-letter
  delay or fabricated streaming. Text output requests a JSON `segments` array:
  1–6 complete text entries and at most one allowlisted sticker (7 total).
  Stickers normally close the group, unless the context supports another place.
  These are model-authored thoughts, never chunks cut from one sentence. The
  compatible `reply` joins all text without exposing JSON or sticker markers;
  voice remains plain text. Provider/model and knowledge-trace metadata remain
  attached. Invalid structure receives at most one repair, then a visible error.
- Clients can store the validated group in a versioned `[nava-reply:v1]` envelope
  in the existing assistant content field. Only authenticated assistant history
  decodes it into text and fixed sticker semantics. User-supplied envelopes,
  unknown IDs and arbitrary URLs never become executable image instructions.
- Tone examples are authored for NAVA, contrasting excited romance, a funny
  anecdote, requested quiet support, an ambiguous scream and urgent symptoms.
  XSWL/okk/crush are optional contextual expressions, never a demographic
  assumption or a health record. Explicit requests for no slang/emoji are honored.
- Tone examples are retrieved from a separate reviewed catalog; the complete
  catalog never enters the model prompt. The deterministic pipeline filters
  locale and explicit preferences, narrows intent/emotion/register, excludes
  phrases recently used by the assistant, then samples without replacement
  with relevance weights and a message-ID seed. This selects 2–4 whole examples
  when available within a 1,800-character prompt cap; retries are stable and new
  turns can vary. Catalog source metadata is retained for audit, not sent to the
  model. Medical/urgent messages bypass examples. Low mood and voice permit
  plain/gentle examples only. Pet names, affection and dialect require expressed
  preference; romance words alone do not enable them. Preference history comes
  only from the existing authenticated consent-gated history loader.
- Unambiguous cues route locally. The existing context-router model call may
  supply allowlisted `toneIntent` / `toneEmotion` hints for ambiguous context;
  there is no extra style-classification API call. Program safety filters and
  explicit preferences override these hints. Examples guide a fresh response,
  never serve as direct canned replies or evidence about the current user.
- Sticker IDs and meanings are shared with the client in
  `supabase/functions/_shared/chat-stickers.ts`. Only an entire known marker
  (`[nava-sticker:<id>]`, allowing outside whitespace) becomes expressive text
  for the model. Unknown markers and markers embedded in prose remain plain
  text; they cannot supply a URL, an instruction, consent, or a health record.
  Current known stickers use the context-free smalltalk route. Authorized
  history is normalized in memory, retains timestamps and ordering, and removes
  the just-saved current turn before model submission. Persisted content is
  untouched; without personalization consent, history stays excluded.
- Archived continuation supplies only `archiveId` and the just-saved user
  `messageId`. The server validates UUID syntax and looks up the archive using
  both the authenticated user ID and archive ID. It never moves, deletes or
  reads the live `ai_conversations` table for an archived turn. With consent
  revoked it selects only the archive ID to verify ownership, without fetching
  messages; missing or foreign archives fail without falling back to today's
  chat. Archive metadata is excluded from model history. Current-turn removal
  uses the owned user-message ID (attachment display text can differ from the
  model input), so identical concurrent turns are not mistakenly dropped.

Design references: [Apple Writing](https://developer.apple.com/design/human-interface-guidelines/writing)
for clear, context-sensitive wording; [Apple Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai)
for control, transparent identity and honest processing feedback; and
[talk-skill](https://github.com/DeadAlmighty/talk-skill) as a comparison for
proportional conversation length and avoiding canned reassurance. These are
design inputs, not imported runtime instructions or claims of clinical quality.
Provider completion handling follows the
[DeepSeek Chat Completions contract](https://api-docs.deepseek.com/api/create-chat-completion/).
Chinese-context references reviewed by the release owner include
[CCNU's 2025 internet-language review](https://nlp.ccnu.edu.cn/news/148),
[Tsinghua LCCC](https://coai.cs.tsinghua.edu.cn/index.php/tools/6) for considering
multi-turn context, and the
[2019 account of established abbreviations](https://www.cac.gov.cn/2019-12/13/c_1577773266664736.htm).
These are context and methodology references, not a claim to identify the newest
2026 slang; no social-media corpus or third-party persona is imported.

Verification uses synthetic fixtures for prompt, route, history/consent and
completion behavior; it does not prove that every live model reply follows the
requested tone. Backend deployment remains a separate release action.

### Paid synthetic tone comparison (2026-11-20, source only)

`scripts/evaluate-chat-tone-live.mjs --paid-run` uses only the explicitly supplied
NAVA project credential. The operator loads `DEEPSEEK_API_KEY_NAVA` from Windows
User environment into this process; no other account/key fallback is allowed.
The default run is capped at 30 requests: 12 synthetic cases with/without retrieved
examples, plus three optional existing-router comparisons and their replies.
Use `--cases=meal,safety --skip-router` for bounded defect retests. Evidence never
contains authentication headers or credentials. No live-user records are read.

Two successful runs used `deepseek-v4-flash`, thinking disabled:

- `Build/TestRuns/App-Checks/chat-tone-live-eval/2026-11-20T11-42-34-377Z`:
  30 requests, 27 replies and three router decisions; 43,955 total tokens.
- `Build/TestRuns/App-Checks/chat-tone-live-eval/2026-11-20T11-45-13-628Z`:
  eight targeted replies after fixes; 13,118 total tokens.
- Combined provider-reported usage: 54,814 prompt + 2,259 completion = 57,073
  tokens; prompt cache hits 26,880, misses 27,934. This is token usage, not an
  inferred currency charge. An earlier sandbox DNS failure returned no provider
  responses and is retained separately, not counted as a completed paid run.
- All 35 completed replies validated as whole segments. Text-bubble counts were
  1/2/3/4/5 in respectively 1/21/9/3/1 replies; ten replies also used one known
  sticker. This does **not** demonstrate that every exchange uses 3–6 bubbles.
  Provider reply latency ranged 1,101–2,898 ms, median 1,573 ms and sample p95
  2,611 ms, excluding UI presentation and network/auth/DB work outside the provider.

Manual review found contextual humor and requested quiet support generally more
natural with examples, while many pairs were similar and some baseline replies
were equally good. Both paths respected no-emoji requests in these samples,
kept ambiguous screaming uncertain and used the supplied synthetic conversation
history. The three extra model hints did not show enough improvement to justify
an additional per-turn API call. They remain optional outputs of the existing
router only, with deterministic preferences/safety taking priority.

The run exposed and corrected three concrete defects:

1. The preference parser missed “网络词” / “正常聊天就行”; these now disable
   expressive examples before sampling, not merely rely on the final model.
2. Acute warning signals had received the ordinary 80-character target. They
   now take a deterministic complex route with no health-domain retrieval;
   essential safety guidance takes priority, and language does not establish an
   emergency number/location. Both targeted replies retained urgent help advice
   and fit the expanded target. The ordinary authenticated consent/history rules
   still apply; this is not an unauthenticated emergency service.
3. Food names without portions led to overconfident carbohydrate/stability claims.
   The prompt now explicitly requires uncertainty about quantities, balance and
   glucose effects. Both retests stated the amount was needed; neither asserted
   carbohydrate excess or a more stable blood-glucose response.

These are synthetic first-completion tests with preserved raw model/usage/latency,
prompt hashes, selected IDs and validated segments. They do not exercise live
account storage, endpoint authorization, optional rewrite/repair, voice delivery,
or health-record tool calls, and are not clinical or population-quality validation.
The separate deterministic endpoint tests cover authorization/history isolation.
This evaluation made no deployment. Title/duration utility requests use explicit
allowlisted `purpose` contracts, plain validated values and no tone/history/tools.

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
- The diet-photo vision function is a separate entry route: it estimates the
  *visible* portion rather than a standard serving, marks its nutrition as
  `vision_estimate`, and exposes low-confidence items for user correction.
  USDA evidence in text extraction must not be misrepresented as a verified
  database match for a photographed mixed dish.
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

## Generated dish display harness

Meal-photo recognition evidence and the polished dish image are deliberately
separate products. The original private photo is the only image evidence used
for dish recognition, visible portion estimation, nutrition matching, and user
correction. A generated plate asset is decorative presentation and must never be
fed back into nutrition extraction.

1. `diet-extract` returns nutrition candidates plus an evidence-bound visual
   plan: canonical dish name, only clearly visible ingredients, appearance,
   plating, and confidence. Confidence below `0.78` pauses for user correction.
2. `food-visualize` uses the original signed photo and confirmed plan with the
   domestic Alibaba Model Studio pipeline. The first attempt uses
   `wan2.7-image`; only a failed candidate escalates to `wan2.7-image-pro`.
   Because Wan PNG output does not guarantee a real alpha channel or exact
   dimensions, a separately configured domestic matting/normalization adapter
   must produce the final exact `1024×1024` transparent PNG: top-down dish,
   complete clean white ceramic plate, no table, text, watermark, hands,
   utensils, napkins, or props.
3. A two-image critic compares the evidence photo with the candidate. It must
   satisfy dish identity `>=0.90`, visible-ingredient recall `>=0.85`, unexpected
   ingredients `<=0.05`, artifacts `<=0.06`, and the binary composition/safety
   checks. At most two candidates are allowed; every rejected or critic-error
   asset is removed from private storage.
4. The iOS client independently recomputes dimensions, alpha presence,
   transparent-pixel ratio (`0.15...0.80`), and normalized foreground bounds
   (`0.06...0.94`). Server claims cannot bypass these local checks.
5. Only a candidate that passes both semantic and technical gates may be shown,
   and it is labeled as an AI-reconstructed display asset. Source and generated
   paths remain user-owned private objects and are included in account deletion.

The default renderer and two-image critic read only `DASHSCOPE_API_KEY_NAVA`;
food recognition reads only `NAVA_DIET_VISION_KEY` or that same NAVA-scoped
DashScope key. A custom renderer, critic, or matting service must use its own
`NAVA_FOOD_*` endpoint/key pair. No path may silently borrow a generic or
another project's credential. The production default intentionally contains no
foreign image-model fallback.

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
four focus AI actions use authenticated, dedicated `focusRequest` contracts and
display validated results in place rather than opening ordinary AI chat. The
daily `NAVA 当日洞察` value is intentionally not labeled AI: it is a persisted
`rhythm-score` action or a deterministic local fallback, not model-generated
prose.

Today's to-do duration estimation is another bounded auxiliary path. The client
first extracts an explicit duration from the user's task text (for example,
`48分钟` or `1小时20分`) so a clear user instruction is never discarded by a
model-format failure. Tasks without an explicit duration call the authenticated
`ai-chat-reply` boundary with the task as untrusted JSON data and require one
bounded `DURATION_SECONDS` value. The prompt asks DeepSeek for task-specific
minutes rather than mechanically rounding every result to five or ten minutes.
The parser accepts the named token when the provider wraps it in Markdown or a
small JSON object, but rejects decimals, zero and out-of-range values. If the
authenticated model boundary is unavailable, the UI labels and uses a stable,
bounded local fallback; it does not present that fallback as a DeepSeek result.
No health history or hidden reasoning is attached to this estimate.

The six journal voice-entry pages use one shared progressive draft contract.
Browser speech recognition remains the source of the transcript; raw audio is
not sent to DeepSeek. On release, a deterministic high-confidence pass may fill
only explicitly anchored values such as named meals/foods, named common
activities with stated units, two unambiguous sleep times, or an explicitly
phrased feeling/task. It does not estimate nutrition, diagnose health, infer an
unstated emotion, or invent a duration. The same authenticated
`journal-assistant` request then resolves open vocabulary and ambiguity. The
late result is merged through per-field version checks so edits made while the
request is pending win. When explicit local values already satisfy the required
schema, the form becomes editable/submittable while that single request remains
in the background; submission or another recording aborts the stale request.
Neither stage saves without confirmation. Text-only
responses have category-sized output caps of 420–720 tokens; photo analysis
keeps its independent 1,800-token budget. Sanitized in-memory timing traces may
contain category, stage, relative milliseconds, and bounded error codes, but no
transcript, field values, image, user identity, prompt, provider body, or key.

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
  diet visual extraction and four-item diet report path. A follow-up authenticated
  cache exercise temporarily replaced only each generated report's fingerprint
  with a stale marker, never touching source health records. For all six scopes,
  the original unchanged request reused the cache, the stale fingerprint forced
  one new DeepSeek report and a subsequent unchanged request reused that new row.
  This exercises the same expected-fingerprint mismatch branch used after a
  consent-authorized source or profile change; all 18 cache checks passed.
- A separate no-user-data check showed that the developer-machine DeepSeek key
  currently has available balance and that `deepseek-v4-flash` returns valid
  JSON. Its digest does not match the production Supabase secret, so it is not
  evidence of the production key's numeric balance. The production error class
  above is the stronger evidence that the observed failures were validation
  failures rather than provider HTTP quota failures.

## 2026-09-14 current production acceptance

- The earlier numbered versions above are historical acceptance snapshots. The
  canonical project now has ACTIVE, JWT-verified `ai-health-report` function
  version 23 with model contract
  `deepseek-v4-flash-health-report-v9-grounded-evidence-repair`, and ACTIVE,
  JWT-verified `ai-diet-report` function version 23 with model contract
  `deepseek-v4-flash-15-18-plus-compact-seven-v11-single-item-repair`.
- The authorized account audit covers 2026-08-28 through 2026-09-13 inclusive:
  six report scopes have persisted DeepSeek reports on each date, while the
  diet report has a current-source DeepSeek v11 result on all 17 dates. A real
  login to each public site displayed the 2026-09-07–09-13 model-authored
  weekly report. The Sites diet page also displayed four meals and live AI
  feedback for 2026-09-13. These checks do not claim that merely viewing a
  cached historical report reran the model.
- Account audit/backfill scripts must end only their own auth session with
  `signOut({ scope: "local" })`; global sign-out had revoked valid browser
  sessions. The frontend passes the current session JWT to Edge Functions, and
  `requireUser` validates that request JWT. A revoked or expired session asks
  for a fresh login rather than claiming that AI itself is unavailable.
- Diet vision emits `vision_estimate` provenance and asks for verification of
  visible portions and high-uncertainty ingredients. User-edited grams/kcal
  become `user_corrected`; neither label claims an authoritative nutrition
  database match. App confirmation is still required before saving.
- In AI chat, a photographed meal now carries each visible item's estimated
  grams and calories into an editable confirmation card. The model receives
  the vision note as untrusted data and is asked to raise at most one material
  uncertainty. An explicit, item-named gram/kcal reply updates that same
  unsaved card; vague replies leave estimates unchanged for manual review.
  The card survives subsequent conversation turns and only confirmation writes
  the meal. Per-item source, weight and confidence are retained on save, and
  totals are recomputed from the edited items. No nutrition-database match is
inferred from the photo or from a user's vague answer.

## Dedicated focus AI contract (2026-09-15)

- `ai-chat-reply` accepts an authenticated `focusRequest` for priority, difficulty,
  starting cue and in-session encouragement. Ordinary chat retains its 600-character
  limit. Task input is bounded to 2–12 tasks and 300 Unicode characters per title;
  titles are not silently truncated or interpreted as instructions.
- The model must return a strict JSON schema. Priority is an exact permutation;
  starting cues are one sentence, at most 24 Chinese characters or 18 English words;
  encouragement is at most two sentences and 80 Chinese characters or 55 English
  words. Chinese counts include punctuation and spaces. Invalid output gets at most
  two repair attempts inside a 60-second **post-authentication/quota** generation
  deadline; malformed output is never shown
  or salvaged by extracting arbitrary numbers from prose.
- Each action has its own initial and repair rules. Only encouragement receives
  citation metadata; only priority receives permutation instructions. A previous
  unconditional “one task action, no numbers” rule contradicted priority/difficulty.
- Focus transport prefers `deepseek-v4-pro`, following measured flash body stalls
  with the same authenticated account/provider. The primary phase has a fixed
  30-second budget across repairs, then at most one **sequential**, cancelled-before-
  switching same-provider alternate. The entire run allows at most four HTTP calls,
  one transient transport retry, and no more than 60 seconds including evidence,
  headers, body and repair. Ordinary chat/report model selection is unchanged.
  `modelVersion` names the selected request model; no static fallback is called AI.
  A bounded UTF-8 reader rejects bodies above 64 KiB. Diagnostics contain only a
  random request ID, action/model names, phases, timings, status/counts, validation
  booleans and byte/whitespace flags—not tasks, evidence dates/values, provider text,
  user IDs, prompts or credentials. Authentication/quota latency is outside this
  generation timer; do not describe it as a 60-second end-to-end HTTP guarantee.
- Encouragement evidence is read on the server using the authenticated owner,
  explicit AI consent and the device-local seven-day window. Declined consent
  prevents health-table reads. Each citation binds domain, actual numeric value
  and original unit. The v2 contract gives the model domain names only and asks for
  one task action. The server appends two exact, original-date facts; this is task
  encouragement plus saved-record context, NOT model analysis of those values or
  a causal/cross-domain interpretation. No evidence means no personal health claim.
  The model action is limited to 24 Chinese characters / 18 English words, and the
  composed display to 80 characters / 55 words. Numeric/causal health claims are
  rejected with bounded repair. An exact task-title fragment may be quoted in 「」
  to distinguish a research subject from a claim about the user's health.
  Tests cover injected extra facts, original dates, no-evidence claims and ordinary
  English task steps. These guardrails are not proof of unrestricted semantic safety.
- Frontend validates the same contract, presents errors and retry, and cancels
  requests on pause/close/navigation. Backend cancellation is linked to the incoming
  request and the deadline also covers evidence reads. No focus/health save or reward
  occurs from these advice calls. Priority still requires explicit confirmation.
  Above 12 unfinished tasks the UI explains the limit and disables ordering; it
  does not silently submit only the first 12. Sorting an arbitrary larger list is
  not implemented by this limit fix.
- Earlier real authenticated model tests passed Chinese/English 2/5/12-task sorting, long-title
  difficulty and starting cues. Real account APP clicks passed all four entry points.
  Separate accelerated-clock tests cover opt-in intervals, pause/reset and the
  four-cue limit. Four viewport bounds passed. Temporary tasks were removed by exact
  IDs; browser `active_user_sessions` calls were isolated and the original cloud
  session was read back unchanged. No private model reply or credentials are logged.

### v149 final runtime qualification

Earlier in this turn the v2 API passed real Chinese/English priority, difficulty,
starting cue, encouragement and legacy response checks. Later encouragement calls
hit the 60-second deadline. Final APP priority clicks on BOTH v149 public sites
returned HTTP 504; subsequent UI actions were not reached. Both sites did pass real
form login and the expected bundle hash. Therefore the four-action end-to-end focus
acceptance was reopened at v149. Then-ACTIVE v39 returned a localized timeout
without invented advice or record writes. That historical success was not used as
evidence of current live-model availability.

### Focus provider recovery (2026-09-15)

v40 measured BOTH public APP priority calls: HTTP 200 headers at 327/478 ms, then
no complete body by 60 seconds; no schema validation ran. v41 byte-level checks
showed flash returned zero body bytes within its 30-second attempt. The sequential
pro alternate completed the same contracts in roughly 0.7–1.6 seconds of provider
work. Both sites then passed all four real form-login/click/display flows, with
original cloud focus sessions unchanged and exact temporary tasks removed.
Evidence: `Q:/NAVA-Workspace/Build/TestRuns/focus-ai-v40` and `focus-ai-v41`.
This isolates the observed stall to the flash response path, not missing login,
missing health records or the response-length validator. It does not establish the
provider's internal cause. [Provider documentation](https://api-docs.deepseek.com/quick_start/rate_limit/)
describes accepted connections waiting for inference, so HTTP 200 alone must not
be treated as a completed model reply.

Final **ACTIVE v42**, source `f908bf3c6bc151c9860d45e3706ee3392bc4aa25`, prefers
pro immediately. BOTH public sites passed all four real form-login/click/display
flows again: eight HTTP 200 replies, one model call each, client elapsed time
2,070–3,338 ms. Current Chinese/English 2/5/12-task API contract checks and the full
`npm run verify` also passed. Evidence is in `focus-ai-v42`; exact timings and
unchanged v150 frontend hashes are recorded in current handoff §77. These focus
results are not acceptance of ordinary chat, health/diet reports or photo models.

### Historical report and media acceptance (2026-09-15, current source)

The authenticated APP now has an independent as-of date selector for six-module
history, and a real regenerate action on history/overview insights. Client cache
keys include user/date/language/refresh; late results cannot label a different
day. Original records remain the source of truth. The secure account test passed
102 module/date combinations (2026-08-28 through 2026-09-13) and six overview
entries. Each latest-date scope was explicitly regenerated through the APP; valid
older provider caches are identified as caches, not new generations. Raw health
fields and existing activity sessions were unchanged. Evidence is metadata-only
in `Build/TestRuns/history-ai-acceptance/local-source.json`; this initial receipt
predates the stricter UI/response/database content-hash assertions added to the
script, and must not be described as that stronger assertion's result.

Real meal-photo testing exposed HTML number-step validation rejecting decimal
protein/carbohydrate/fat estimates before a submit request could occur. Decimal
nutrition and portion inputs now accept non-negative finite decimals (positive
portions); integer calorie/rating contracts are unchanged. Photo analysis never
means saved: the user must confirm a valid form. Uploaded names use random UUIDs
with no overwrite. The reversible account test encrypts its write-ahead snapshot
with Windows CurrentUser DPAPI; exact row/version ownership prevents recovery
from overwriting another device's edits. Account credentials are not journaled.

Observed `fdnb-recompute` 56-day calls returned HTTP 546 during verification.
That route ignores a supplied analysisDays parameter. The existing APP weekly
route supports an explicit 14-day analysis window; success there is not proof
that 56-day computation is repaired or all earlier dates were recomputed.
No new backend deployment or statistical-algorithm change is included here.
### 2026-09-15 餐照恢复复验

`meal-chain-acceptance/result.json` 保留首次原餐恢复后AI断言失败，不覆盖成通过。
随后 `recovery-result.json` 的09:40 UTC运行只做恢复核验，未再次改餐：真实APP表单
登录后，9/13饮食摘要的页面/HTTP响应/Supabase哈希一致，周报端点返回HTTP200和
9/7–9/13四段结构。原始早餐、14天派生数据及受保护其它账户状态均通过检查，DPAPI
恢复日志已标完成。没有手写AI文本，也没有用这次14天结果宣称56天研究入口已修好。
