# NAVA Codex handoff — 2026-09-02

## 1. Authority and baseline

This is the current continuation handoff. Read it together with:

1. `Q:\NAVA-Workspace\nava-app\AGENTS.md`
2. `docs/CODEX_HANDOFF_2026-08-31.md` for the full architecture, release,
   authentication, data, AI, and deployment baseline
3. the feature documentation relevant to the next requested batch

The verified PRD batch was first released as public version 77. Its subsequent
full-code and visual-audit fixes were released as public version 78. A further
real-data, natural-week, resilience, and visual-completeness audit is now
released as public version 79 on both ChatGPT Sites and GitHub Pages. None of
these releases changed Supabase, migrations, Edge Functions, or Sites access.

## 2. Local source state

Starting source HEAD for this batch:

- Branch: `main`
- Commit: `7cb9745ffe18b691649d0291c839bbb7c38165de`
- Commit title: `docs: clarify release and handoff commits`

Released source state for the 2026-09-02 product batch:

- Source commit: `0adf2824496c86ceb41fdd9477281a7502edc769`
- Commit title: `fix: ground health insights in real records`
- ChatGPT Sites: public version 79
- GitHub Pages mirror: v79, commit `1474f92ffce9d1f2de939fdcf46ab099cbfbb378`

## 3. First PRD gap-closure batch

Implemented locally:

- Health report module cards now derive their four summary rows from the
  selected date's persisted `TodaySnapshot` instead of fixed translation copy.
- Missing module cards use a muted gray state, explicitly say that data is
  missing, and still open the corresponding module for entry.
- When all six modules are actually recorded, the report hub requests the
  existing authenticated weekly AI report and shows one real overview insight.
  Failure is labeled and does not block the module reports. Demo mode remains
  explicitly labeled as demo.
- The weekly score strip now uses a real recorded-day average or the ready DNB
  stability score and compares it with the previous rolling seven-day period.
  Missing prior-period data displays `--`; missing days are not divided as zero.
- Focus now has 25/45/60-minute presets in overview and immersive countdown
  states.
- Focus immersive mode now hides the application header and bottom navigation,
  provides its own exit action, retains the editable progress timer and
  interruption controls, and includes the established NAVA reading mascot.

No claim was made that a provider call succeeded merely because the UI loaded.
No secrets or fabricated health values were introduced.

## 4. Verification evidence

Verified on 2026-09-02:

- `npm run verify`: passed completely, including build, lint, audit, motion,
  rhythm, FDNB, AI prompt, structured entry, backend contract, all Edge Function
  type checks, Deno backend tests, and the iOS project contract.
- Targeted presentation and weekly tests: 8 passed.
- Local headless Playwright visual/interaction check: passed at 360x740,
  375x812, 390x844, and 430x932 with zero browser errors and no horizontal
  overflow. It verified six real-data cards, the all-complete AI overview,
  weekly comparison labeling, the 45-minute preset mutation, full-screen shell
  behavior, mascot visibility, exit visibility, and no immersive vertical
  overflow.
- Evidence is under ignored repository-local
  `artifacts/test-runs/batch1-20260902/`.

## 5. PRD audit delta

The previous audit was 21 complete / 31 incomplete across 52 priority rows.
This batch moves six rows to complete:

- Focus T0: 25/45/60 presets
- Focus T0: true immersive full-screen timer with mascot and progress
- Health report T0: real six-module summaries
- Health report T1: gray missing state and module entry
- Health report T2: all-six-complete AI overview prompt
- Health report T1: comparison with the previous rolling seven-day period

Current audited priority count: **27 complete / 25 incomplete**.

The durable rolling device-date report decision is preserved. The PRD's separate
natural-week wording remains unresolved and must not be silently substituted for
the current rolling semantics.

## 6. Broad PRD closure batch

The same local, uncommitted 2026-09-02 batch now also implements:

- Real to-dos inside Focus, backed by the existing `tasks` service. Users can
  add tasks, switch between list and seven-day calendar views, select a task to
  populate the timer, and automatically strike it through when its focus
  session completes.
- Editable AI to-do suggestions for focus minutes and session count. The values
  persist through `tasks.estimated_minutes`; local-only metadata remains a safe
  fallback where the optional backend column is unavailable.
- Focus trend, time-of-day distribution, category distribution, category-aware
  session saves, AI starting/task-breakdown entry, and direct DNB weekly entry.
- A shared per-module `Ask NAVA` entry that prefills a consent-bounded prompt,
  plus a direct DNB weekly-report entry for all six record modules.
- Sleep presets, duration/self-rating chart switching, and a user-selected
  notification time that is passed to the real notification preference and
  native scheduling service.
- Multi-select mood factors and a non-diagnostic three-record low-mood pattern
  alert derived only from persisted records.
- Clearly labeled estimated quick foods, a real macro-energy ring, a
  recorded-day seven-day calorie reference range, and an outlier prompt that
  never treats missing days as zero.
- Face capture settings persisted for the tab session, accurate private-upload
  guidance, retake and library replacement, automatic post-save navigation,
  today feedback, prior-result comparison, repeated-low-state prompting, and
  reward reconciliation after a durable save.
- Completed profile growth tasks disappear permanently; completed daily tasks
  remain in their group with a strikethrough.

The batch was deployed to both public sites from the same source commit. A
post-deployment headless Playwright check passed for both URLs at 360x740,
375x812, 390x844, and 430x932; the public login entry, horizontal fit, Pages
`source.json`, and production authentication contract were verified. No
migration application, Edge Function deployment, production seed, or Sites
access change was performed.

## 7. Current priority audit

The 52-row Face / Focus / Health Report / Growth priority audit is now:

- Face: 13 complete / 3 incomplete
- Focus: 19 complete / 1 incomplete
- Health report: 11 complete / 0 incomplete
- Growth tasks: 4 complete / 1 incomplete
- Total: **47 complete / 5 incomplete**

The five intentionally unresolved rows require a capability or contract that
must not be simulated in frontend code:

1. The Face “local-only analysis” promise conflicts with the actual secure
   private-upload architecture. The psychological guidance is implemented, but
   the row remains incomplete until product/privacy wording is reconciled.
2. Makeup-level detection needs a validated model output and mismatch contract.
3. Restoring an interrupted, unsaved face photo needs a reviewed secure draft
   policy; only mode and consent state are restored now.
4. Focus-session hardware metrics need timestamp-aligned wearable samples.
5. Growth shop redemption needs an authoritative spending ledger, catalog, and
   idempotent redemption backend.

## 8. Final verification for the broad batch

Verified on 2026-09-02 after the broad batch:

- `npm run verify`: passed, including production build, lint, zero npm audit
  findings, motion, rhythm, FDNB, AI prompt, structured entry, backend contract,
  all Edge Function type checks, Deno backend tests, and iOS contract.
- `npm run structured:test`: 11 passed, including editable focus suggestions on
  recognized AI to-dos.
- `npm run prd-batch:test`: passed at 360x740, 375x812, 390x844, and 430x932.
  It checks Focus task/calendar/stat views, Sleep chart switching, Mood
  multi-select, Diet context visuals, Face summary, Growth completion behavior,
  runtime errors, and horizontal overflow.
- Visual evidence is outside the repository at
  `Q:\NAVA-Workspace\Build\TestRuns\nava-prd-batch-20260902`.
- The older full interaction suite advanced through the changed record paths
  but remains flaky at an unrelated Home swipe gesture; the new bounded batch
  verifier is the authoritative UI evidence for these changes.

## 9. Full-code and visual audit follow-up (released as v78)

A subsequent 2026-09-02 audit re-read this handoff, the 2026-08-31 architecture
handoff, the technical product requirements, and the full tracked-code
inventory. It then ran static, production-build, backend, interaction, and
four-viewport visual checks. The following fixes were released in public v78:

- The document root opts out of automatic page translation and marks the React
  root as `notranslate`. This reduces external translation scripts mutating
  React-owned nodes, the reproduced class of failure behind the reported
  `removeChild` page exception. The existing home glyph is also emitted as the
  favicon.
- Upward Home swipes now work when they begin on the mascot, while a completed
  swipe suppresses the mascot click that would otherwise start an animation.
  Other interactive controls still reject page gestures.
- Auth session initialization now always leaves the loading state on Supabase
  error or rejected promises and ignores callbacks after unmount.
- Onboarding transition/completion timers are cleaned up safely, including
  React Strict Mode's development effect replay.
- Mood entry content no longer spills out of its card at 430x932.
- The compact Diet macro row extends through 430px and uses narrow-field
  typography that keeps values such as `2100 ml` fully visible while avoiding
  fixed-navigation clipping.
- Focus keeps a stable component position between immersive and overview
  states, so the real post-save success state remains visible.
- Successful Face analysis replaces the editor route instead of pushing a new
  overview entry, so Back returns to the six-module hub rather than reopening
  the completed editor.
- The headless screenshot and interaction suites were updated to the current
  onboarding, module, editor, and accessibility structure. Screenshot evidence
  now uses the governed `Q:\NAVA-Workspace\Build\TestRuns` root.
- Two unused callback parameters were removed; no runtime behavior changed.

Verification after these fixes:

- `npm run verify`: passed completely, including production build, lint, zero
  npm audit findings, algorithms, AI contracts, backend secret/contract checks,
  all 16 Edge Function type checks, 12 Deno tests, and the iOS contract.
- Strict TypeScript unused-symbol check: passed.
- `npm run interaction:test`: all 9 groups passed, including password, OTP,
  registration, Home gestures, six record modules, AI, Profile, and sign-out.
  The previously documented Home swipe flake is resolved.
- `npm run screenshots`: 92 states passed across 360x740, 375x812, 390x844,
  and 430x932. Evidence is at
  `Q:\NAVA-Workspace\Build\TestRuns\nava-figma-pages`.
- `npm run prd-batch:test`: passed at all four required viewports. Evidence
  remains at `Q:\NAVA-Workspace\Build\TestRuns\nava-prd-batch-20260902`.

The authorized dual-site release used source commit
`85b56d22a7e758ff0afdfd022292f2fa41471bd5` for both artifacts. ChatGPT Sites
version 78 and GitHub Pages v78 (`75f71a5b43af9d32845dad82de543a29c047139e`)
both returned HTTP 200 and passed headless Playwright checks at 360x740,
375x812, 390x844, and 430x932 with the real login entry, no horizontal
overflow, no page exceptions, and the translation-mutation guard present.
Pages `source.json`, Sites source provenance, and the canonical Supabase project
`wxteapvwagvhhtrjrbim` were verified. No migration, Edge Function deployment,
production account mutation, or Sites access change was performed.

## 10. Real-data and natural-week follow-up (released as v79)

The next audit removed several remaining ways that suggested values, stale
snapshots, sparse records, or generic copy could be mistaken for real user
results:

- Record loading failures now clear stale snapshots and trends, expose retry
  states, and cannot arm draft autosave. Suggested entry values therefore cannot
  be silently persisted after a failed Supabase read.
- The weekly report is a device-local natural week (Monday through Sunday),
  compares with the previous natural week, renders all seven date slots, and
  excludes missing days from averages. Future dates in the current week remain
  empty, and backend report requests are clamped to the device date.
- Cross-module weekly AI requires at least five distinct recorded days. Sparse
  periods explain that more records are needed instead of presenting a generic
  AI conclusion as a completed personal report.
- Mood saves a formal record only after the factor and diary are complete, and
  its suggested score is not shown as a measured result before a real record
  exists.
- Exercise comparisons use the user's real recorded-day average rather than a
  fixed calorie target. Sports planning and the heatmap use the selected day's
  actual records and are explicitly descriptive, not medical or training
  prescriptions.
- Sleep no longer substitutes the latest record for an unrecorded selected day.
  Diet and Face empty states show missing values rather than plausible-looking
  defaults.
- Per-module immediate AI uses the existing authenticated report services and
  has an explicit provider-failure state; no fixed fallback report is presented
  as a model result. Demo output remains labeled as demo.
- Focus timer state is restored from tab-scoped `sessionStorage`; leaving the
  immersive view pauses rather than discards it. The simulated incoming-call
  control is development-only.
- Growth task load failures expose a retry state instead of showing cached local
  completion as cloud truth. Real zero reward totals remain zero.
- Exercise, sports, heatmap, sleep, weekly, and hub layouts were rechecked and
  adjusted to avoid clipped content, weak contrast, oversized blank regions,
  and narrow-screen overflow.

Verification for v79:

- `npm run verify`: passed completely, including production build, lint, zero
  npm audit findings, algorithm and AI contracts, all Edge Function type checks,
  12 Deno tests, and the iOS contract.
- `npm run interaction:test`: all 9 groups passed, including restored Focus
  state and the reachable Sports detail route.
- `npm run weekly-report:test`: 5 passed for natural-week date behavior.
- `npm run prd-batch:test`: passed at 360x740, 375x812, 390x844, and 430x932.
- `npm run screenshots`: 92 states captured at the same four viewports. Durable
  evidence is under `Q:\NAVA-Workspace\Build\TestRuns`.
- After deployment, local headless Playwright passed both public URLs at all
  four viewports: HTTP 200, real auth-first entry even with `?demo=1`, no page or
  console errors, no horizontal overflow, and the translation guard present.
- `npm run auth:verify:production` passed the canonical Supabase project,
  disabled public demo bypass, tab-scoped session, email registration, and
  phone-function reachability contracts. Strict SMTP inspection was not run
  because no management token was supplied.

Release provenance:

- Source commit: `0adf2824496c86ceb41fdd9477281a7502edc769`
- Sites version 79; deployment `appgdep_6a97c99c02c48191bebd25bb0be49c83`
- GitHub Pages v79; mirror commit
  `1474f92ffce9d1f2de939fdcf46ab099cbfbb378`

At the v79 milestone, the five capability/contract boundaries in section 7
remained intentionally unresolved. Section 11 records which of them were closed
in v80. No production account was seeded or mutated, so actual per-user records,
provider responses, OTP delivery, and wearable hardware behavior still require
their real authenticated or physical boundaries to prove them.

## 11. Grounded AI reports, face recovery, and Focus planning (released as v80)

This batch replaces the remaining fixed or shallow report paths that could be
mistaken for personalized AI analysis:

- `ai-health-report` now uses production DeepSeek output under a strict v2 JSON
  contract: overview plus trend, variation, association, and action sections.
  Each section contains a headline, long explanation, evidence, action, and
  confidence. The complete report is persisted in the existing
  `ai_health_reports.bullets` JSONB field; legacy v1 cache entries are
  regenerated.
- The new shared health-report harness derives same-date, consent-authorized
  cross-module evidence from real persisted records. It requires at least three
  overlapping dates, keeps the analysis descriptive and non-causal, caps
  confidence for a seven-day window, and rejects model-generated numeric
  evidence that is absent from the supplied context.
- Weekly summary rows are real buttons. They open a polished long-form detail
  sheet showing the model explanation, evidence, action, confidence, and
  non-diagnostic notice. The overall AI bubble appears only for a grounded
  medium-or-higher-confidence association.
- Per-module immediate AI reports receive consent-authorized companion records
  while still requiring a real primary-module record. Provider failure is an
  explicit error; production never substitutes fixed fallback prose.
- `face-analyze` now returns model-derived `makeup_level` and
  `makeup_confidence`. A confident mismatch with the user's selected capture
  mode requires confirmation rather than deterministic remapping.
- Interrupted Face analysis is recoverable for 30 minutes from an AES-GCM
  encrypted IndexedDB draft. Its key exists only in tab-scoped
  `sessionStorage`; closing the tab makes retained ciphertext unusable.
- Focus todo planning persists `reminder_at`, per-session minutes, and the new
  append-only `tasks.focus_sessions` column. A task completes only when the
  required number of real `focus_records` exists.
- Missing weekly-module cards now route directly to the corresponding real
  entry editor, and sparse weekly layouts no longer reserve an oversized empty
  chart region.

Production backend state:

- Migration `202609020001_focus_todo_plan.sql` is applied to canonical project
  `wxteapvwagvhhtrjrbim`; REST confirms `tasks.focus_sessions` is available.
- `ai-health-report` is active at version 7 and `face-analyze` at version 14.
- Required model-secret names are present. Secret values were not printed.

Verification:

- `npm run verify`: passed completely, including production build, lint, zero
  npm audit findings, 9 motion tests, 5 rhythm tests, 4 FDNB tests, 18 AI prompt
  tests, 11 structured-entry tests, all 16 Edge Function type checks, 15 Deno
  backend tests, and the iOS contract.
- `npm run weekly-report:test`: 8 passed.
- `npm run backend:test`: 15 passed.
- `npm run interaction:test`: all 9 groups passed.
- `npm run auth:verify:production`: passed canonical-project, public-demo,
  tab-session, email-registration, and phone-function checks. SMTP delivery was
  not inspected.
- `npm run prd-batch:test`: passed at 360x740, 375x812, 390x844, and 430x932.
  Evidence is at
  `Q:\NAVA-Workspace\Build\TestRuns\nava-prd-batch-20260902`.
- Post-deployment local headless Playwright passed both public URLs at all four
  viewports: HTTP 200, real login even with `?demo=1`, no page or console errors,
  and no horizontal overflow. Screenshots are under
  `Q:\NAVA-Workspace\Build\TestRuns\nava-public-v80`.

Release provenance:

- Source commit: `5e1efe81de9950cb054c469a987995501a911052`
- Sites version 80; deployment `appgdep_6a97fd4d61b08191af1dada00d5d5482`
- GitHub Pages v80; mirror commit
  `a9de53240480978b398e2f36d50fbf47e8aa21c2`

At the v80 release point, three strict PRD boundaries remained unresolved: the
Face "photo only analyzed locally" promise conflicted with the current private
Supabase-upload architecture; Focus did not ingest timestamp-aligned wearable
hardware metrics; and Growth had no reward-store catalog, redemption ledger, or
idempotent spending transaction. The later product decision in section 12
resolves the Face contract. No production account was seeded or mutated, so live
per-user provider wording remains an authenticated-boundary check rather than a
fabricated verification claim.

## 12. Face privacy decision and wearable-web research

The product owner explicitly replaced the old Face "local-only analysis"
promise with the actual secure architecture: after explicit consent, the photo
is encrypted in transit to account-isolated private Supabase storage; a
controlled server uses a ten-minute signed URL for the requested non-diagnostic
analysis. User-facing consent, Face detail copy, and the privacy policy now state
that contract. This closes the Face T0 privacy row and moves the strict source
audit to **50/52**: Face 16/16, Focus 19/20, Health 11/11, Growth 4/5.

The wearable research and delivery decision is recorded in
`docs/WEARABLE_WEB_INTEGRATION_2026-09-02.md`. Important findings:

- The repository already has an iOS HealthKit Capacitor bridge, HealthKit
  entitlement and permission copy, WatchConnectivity bridge/source, authenticated
  `health-sync-ingest`, idempotent `watch-sync`, device/snapshot tables, and the
  ChronoState pipeline.
- The Xcode project still has only an iPhone target. `native/watch/` is source
  material, not a built and signed watchOS target, and no physical-device
  HealthKit/Watch verification has occurred.
- Shared Wi-Fi or Bluetooth is not a general health-data protocol. Apple Watch
  history requires HealthKit/native authorization; Android history requires a
  Health Connect/native client; vendor cloud access requires user OAuth.
- Web Bluetooth is a bounded optional route for devices that advertise a
  supported standard GATT service, such as live Heart Rate Service data. It does
  not imply Apple Watch compatibility or historical sleep/HRV access.
- The production Supabase secret-name audit found no Fitbit, Garmin, Withings,
  Oura, Huawei, or Samsung credentials. `HEALTH_EXPORT_API_KEY` is present but
  unreferenced in the repository, so it is not treated as a functional wearable
  credential.
- The remaining Focus hardware row needs timestamped samples aligned to an
  actual focus session; daily health snapshots alone are insufficient.

These post-v80 source/document updates were not published in this turn because
the user did not explicitly authorize another public deployment.

## 13. Apple Health / Apple Watch delivery implementation

The formal delivery plan is now
`docs/APPLE_HEALTH_WATCH_DELIVERY_PLAN_2026-09-02.md`. It defines the only
supported historical-data path as Apple Watch -> iPhone HealthKit -> NAVA iOS
client -> authenticated `health-sync-ingest` -> normalized Supabase records ->
all clients. Shared Wi-Fi/Bluetooth is not treated as a HealthKit transport.

Implemented in the source checkout after v80:

- Native Supabase auth now uses an app-isolated iOS Keychain Capacitor plugin;
  browser auth remains current-tab `sessionStorage`. Native storage errors do
  not silently downgrade to browser storage.
- HealthKit no-sample values are omitted instead of forced to zero. Payload
  metadata records available metrics and the native collector schema.
- The local ingest source preserves previously stored fields during partial
  permission reads, does not create a new legacy exercise row unless the
  activity tuple is complete, and counts only actual normalized writes. The
  public v10 Function predates this patch and still requires an authorized
  deployment plus real-account verification.
- The client no longer falls back to direct table writes after an ingest
  failure. All native health uploads require the logged-in user's JWT and the
  `health-sync-ingest` boundary.
- An iOS HealthKit observer registers hourly background delivery, persists only
  a pending-change marker, not health values, and acknowledges the marker only
  after the corresponding sync succeeds. App start, foreground, and live
  observer events trigger a deduplicated sync with a cooldown.
- A successful, account-filtered `health_sync_jobs` Realtime event refreshes
  app data only when `sample_count > 0`. Profile sync status uses the server's actual `finished_at` time and
  distinguishes cloud data, recent/stale sync, authorization requested, and
  no-data/error outcomes.
- Append-only migration `202609020002_health_sync_realtime.sql` prepares the
  Realtime publication. It is intentionally not applied to production without
  explicit migration authorization.
- The Mac release helper, real-account boundary verifier, production Function
  audit, true-device acceptance template, and native cross-layer contract test
  are now checked in.
- The fixed screenshot suite now includes the Profile Health/Watch device area
  at 360x740, 375x812, 390x844, and 430x932.

Verification completed on Windows:

- `npm run verify`: passed, including frontend build/lint/audit, algorithms,
  AI contracts, 16 Edge Function type checks, 15 backend tests, native health
  contracts, and iOS project contracts.
- `npm run interaction:test`: passed all 9 groups with no console errors.
- `npm run screenshots`: captured 96 states at the four required viewports,
  with no console/page errors or horizontal overflow; the four new Profile
  device screenshots were visually inspected.
- `npm run auth:verify:production`: passed.
- `npm run supabase:verify-shared`: canonical APP, CLI, and generated Web mirror
  alignment passed together with the backend contract probes.
- `npm run health:audit:production`: secure `health-sync-ingest` is active with
  JWT verification; legacy `health-auto-export` remains active without JWT and
  therefore must be retired only after its clients/history are audited.
- `npm run cap:sync`: Web assets and native project synchronization passed;
  CocoaPods/Xcode compilation was correctly unavailable on Windows.

The earlier secret-name wording needs this qualification: `HEALTH_EXPORT_API_KEY`
is not referenced by this APP repository, but the audited web-team prototype
uses that shared-key contract with legacy `health-auto-export`. It is not an
Apple/vendor credential and is not safe as the final ingest identity boundary.

Only external/human gates remain for a truthful Apple Watch release claim:
bundle ID/Developer Team selection, Mac/Xcode Swift compilation and signing,
deployment of the updated ingest Function, production Realtime migration,
real iPhone/Apple Watch permission and value
comparison, authenticated RLS boundary execution, TestFlight/App Store work,
then legacy Function retirement and secret rotation. The later v81 release in
section 14 publishes the web frontend, but does not change those backend or
physical-device gates.

## 14. Full real-data, AI, transfer, and visual audit

The post-Apple implementation audit is recorded in
`docs/FULL_PRODUCT_RUNTIME_AUDIT_2026-09-02.md`. The complete tracked source
inventory, frontend service boundaries, Supabase Functions/migrations, native
sources, and required portrait states were rescanned.

Corrections completed in source include:

- Dedicated consent columns are authoritative; an old onboarding `true` can no
  longer cancel a later explicit revocation. Chat history, stored health
  context, health reports, image analysis, and HealthKit ingest enforce their
  relevant consent and ownership boundaries.
- Health/diet AI report caches now validate a SHA-256 fingerprint of normalized
  source rows and profile context. Weekly AI requires five distinct recorded
  days. Diet and health reports have bounded structured-output repair rather
  than fixed fallback prose.
- Production structured entry no longer merges a local health guess into the
  model result or invents sleep clock times. Duration-only sleep is saved as a
  duration summary.
- Diet/face images must exist in the authenticated user's private Storage
  prefix. Functions create ten-minute signed URLs; raw base64 fallback and
  cross-account paths are rejected.
- Todos, growth points, onboarding, notifications, export, Face saves, Watch
  snapshots, and report displays no longer turn missing Supabase contracts into
  local production success. The fixed no-data diet score was removed.
- Health ingest validates ranges and preserves prior values when HealthKit
  permissions return only a partial metric set. Account deletion recursively
  removes nested private objects.
- Stale async screen updates, listener setup races, and timer cleanup were
  corrected across Today, Records, AI, Profile, Utility, launch, share, and
  native-sync paths.

Verification after these changes passed `npm run verify`, all nine interaction
groups, the PRD four-viewport batch, the 96-state screenshot run, navigation
icons, production Auth, shared Supabase alignment, and the production health
Function audit. The generated GitHub Pages mirror, APP environment, and CLI
link all resolve to `wxteapvwagvhhtrjrbim`.

The Edge Function source changes and migration
`202609020002_health_sync_realtime.sql` remain staged until explicit production
backend authorization. Publishing the frontend does not make those server
changes live. Physical Apple device acceptance, Focus-session wearable
correlation, and the product-deferred points store remain outside the completed
source audit.

Release provenance for this batch:

- Source commit: `445ccdc0cb16a22289f65ea8de6fa382c5356cd5`
- ChatGPT Sites version 81; deployment
  `appgdep_6a982c92ed8c8191b08a0f3927e26a2e`
- GitHub Pages v81; mirror commit
  `e2446154f0c5a2f36848949a141f37e002c85884`
- Post-deployment headless verification passed both public URLs at 360x740,
  375x812, 390x844, and 430x932 with auth-first entry, canonical Supabase,
  no console/page errors, and no horizontal overflow. Evidence is at
  `Q:\NAVA-Workspace\Build\TestRuns\nava-public-v81`.

## 15. Production backend and embedded Watch target completion

After explicit authorization to finish all non-human work and deploy, the
remaining Windows-side Apple/backend work was completed:

- `ios/App/App.xcodeproj` now contains an actual `NAVA Watch` watchOS target,
  its three Swift sources, localizations, app icon asset, build phases, target
  dependency, and `Embed Watch Content` phase. Both products derive from the
  single project setting `NAVA_APP_BUNDLE_ID`; the companion product uses the
  required `.watchkitapp` suffix and companion identifier key.
- The iPhone Watch bridge persists every received action in a protected
  Application Support JSON queue before notifying Capacitor. JavaScript drains
  that queue into the current user's local pending queue and acknowledges the
  native copy only after the durable handoff, preventing loss when the WebView
  was not ready. Server `actionId` receipts remain the final idempotency boundary.
- Production migration `202609020002_health_sync_realtime.sql` is applied in
  canonical Supabase project `wxteapvwagvhhtrjrbim`.
- Updated production Functions were deployed and confirmed ACTIVE:
  `ai-chat-reply` v19, `ai-diet-report` v6, `ai-extract-data` v18,
  `ai-health-report` v8, `diet-extract` v16, `face-analyze` v15,
  `delete-account` v8, `export-user-data` v13, `health-sync-ingest` v11, and
  `watch-sync` v11. Protected endpoints still verify JWT.
- The legacy `health-auto-export` v13 remains online deliberately. It must not
  be deleted or have its shared secret rotated until the separate web client
  and any `health_imports` history have been reviewed.

Final source verification for this batch passed `npm run verify`, all 9
interaction groups, the PRD batch at 360x740/375x812/390x844/430x932, 96 final
screenshots, icons, production Auth, shared Supabase alignment, production
Health Function audit, Capacitor sync, iOS/Watch static contracts, and an
independent PBX parser. Representative onboarding, records, immersive focus,
diet editor, weekly report, and device screenshots were visually inspected.

Only human/external Apple acceptance remains: choose the already registered
bundle identity, select the Developer Team and signing in Xcode, compile and
Archive on a Mac, exercise real iPhone/Apple Watch authorization and data
comparisons, execute the prepared two-account RLS check, then distribute through
TestFlight/App Store. These gates are not marked complete without evidence.
Focus-session hardware correlation and the points store remain intentionally
deferred by the product owner.

Release provenance for this completion batch:

- Source commit: `0b009010cab5a9a8e9e2991ec038a5ee1186c450`
- ChatGPT Sites version 82; deployment
  `appgdep_6a983a34523881918d07de4750482441`
- GitHub Pages v82; mirror commit
  `af2dda3fe3e16da715c734d089bf9f6e7e4d779f`
- Both public URLs passed 8/8 post-deployment checks at all four required
  viewports: HTTP 200, auth-first behavior even with `?demo=1`, canonical
  Supabase marker, no console/page error, and no horizontal overflow. Evidence:
  `Q:\NAVA-Workspace\Build\TestRuns\nava-public-v82`.
