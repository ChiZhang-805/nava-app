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

Three strict PRD boundaries remain unresolved after this batch: the Face
"photo only analyzed locally" promise conflicts with the current private
Supabase-upload architecture; Focus does not yet ingest timestamp-aligned
wearable hardware metrics; and Growth has no reward-store catalog, redemption
ledger, or idempotent spending transaction. No production account was seeded or
mutated, so live per-user provider wording remains an authenticated-boundary
check rather than a fabricated verification claim.
