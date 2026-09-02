# NAVA Codex handoff — 2026-09-02

## 1. Authority and baseline

This is the current continuation handoff. Read it together with:

1. `Q:\NAVA-Workspace\nava-app\AGENTS.md`
2. `docs/CODEX_HANDOFF_2026-08-31.md` for the full architecture, release,
   authentication, data, AI, and deployment baseline
3. the feature documentation relevant to the next requested batch

The public release facts remain unchanged from 2026-08-31. This batch was not
deployed and did not change Supabase, migrations, Edge Functions, Sites access,
or the GitHub Pages mirror.

## 2. Local source state

Starting source HEAD for this batch:

- Branch: `main`
- Commit: `7cb9745ffe18b691649d0291c839bbb7c38165de`
- Commit title: `docs: clarify release and handoff commits`

The 2026-09-02 product batch is intentionally left as local source changes for
user review. It is not committed or published at this handoff point.

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

No deployment, migration application, Edge Function deployment, production
seed, or Sites access change was performed.

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
