# NAVA Codex handoff — 2026-09-05

This document is the current continuation of
[`CODEX_HANDOFF_2026-09-03.md`](./CODEX_HANDOFF_2026-09-03.md). Read the older
handoff and the repository-level [`AGENTS.md`](../AGENTS.md) for the full product,
Supabase, Apple Health/Watch, and release baseline.

## 1. Current release anchor

- Editable source repository: `Q:\NAVA-Workspace\nava-app`
- Released source commit:
  `83c8ae8c2fa9ab11911f3d5d3a3e32694ff09123`
- ChatGPT Sites project:
  `appgprj_6a5de710811c8191af8ce2681358d518`
- ChatGPT Sites version: 94
- ChatGPT Sites version ID:
  `appgprj_6a5de710811c8191af8ce2681358d518~appgver_bee740d3dcf88191a26fb8c08dbca32c`
- ChatGPT Sites deployment:
  `appgdep_6a9b83eb41f08191bd1d090400f54d71`
- ChatGPT Sites URL:
  `https://nava-app-preview-cz.chizhang1031.chatgpt.site`
- GitHub Pages generated mirror commit:
  `41eda95eebd968c40740d886b6099daa80246ad8`
- GitHub Pages URL:
  `https://chizhang-805.github.io/nava-app-preview/`
- Sites package:
  `Q:\NAVA-Workspace\Build\Sites\Packages\nava-v94.tar.gz`
- Canonical Supabase project: `wxteapvwagvhhtrjrbim`

Version 89 was an intermediate release from source commit
`9420a45932776f164bc16c7a3b2a1478b1406b2d`. Its compact-card source was valid,
but the 360x740 layout exposed a real fourth-line clipping regression that the
previous visual test did not detect. Version 90 replaces it and is the
responsive-card baseline; version 91 preserves that layout and adds the
performance and media improvements described below. Version 92 adds the
authenticated transition correction described in section 8. Version 94 adds
the five record-editor flows described in section 9 and is the current release
anchor.

## 2. Six-card copy and AI-report contract

The Health Report module cards now have two intentionally separate content
contracts:

- an empty module shows its established, module-specific four-line dictionary;
- a recorded module may show four independently generated compact AI lines;
- every Chinese compact line is exactly seven Han characters, with no spaces,
  digits, Latin text, or punctuation;
- the normal detailed AI bullets remain separate and continue to appear in
  detailed/history report locations. The compact card output is not obtained by
  truncating the normal report;
- old cached/backend responses that do not contain `compactBullets` remain
  readable. The frontend falls back to facts derived from the authenticated
  record rather than inventing an AI result.

The implementation and tests are in:

- `src/services/reportSummaryContract.ts`
- `src/services/healthReport.ts`
- `src/services/dietReport.ts`
- `src/services/healthReportPresentation.ts`
- `src/features/RecordsScreen.tsx`
- `supabase/functions/ai-health-report/index.ts`
- `supabase/functions/ai-diet-report/index.ts`
- `tests/ai-compact-summary.test.ts`
- `tests/health-report-presentation.test.ts`

The response is cached inside existing JSON fields, so no database migration is
required.

## 3. Responsive layout correction and permanent visual gate

The six-card layout now has a dedicated short-screen profile for widths up to
430 CSS pixels and heights up to 760 CSS pixels. It reduces card/grid gaps,
padding, title size, icon size, body size, and arrow offsets together. Taller
screens keep progressively more generous proportions rather than inheriting the
short-screen compression.

`scripts/verify-module-progress-ui.mjs` now fails when any of the following is
true:

- any card has other than four visible summary lines;
- a line is horizontally or vertically truncated;
- title and progress icon intersect;
- text and arrow intersect or lose their safety gap;
- card children escape their card;
- two cards intersect or lose their gap;
- the date selector intersects the grid;
- the card grid intersects the fixed navigation or loses its 8px safety gap;
- the document or phone frame overflows horizontally;
- a card develops excessive unused space below its content.

The script checks 360x740, 375x812, 390x844, and 430x932 in both populated and
empty local states. It is now stage 7 of `npm run verify`, so future release
candidates cannot silently skip this geometry gate.

Local evidence is under:

- `Q:\NAVA-Workspace\Build\TestRuns\nava-module-progress-20260905`

The complete 22-stage `npm run verify` passed after correcting a test-only
UTC/Asia-Shanghai cross-midnight mismatch. The Playwright context is now pinned
to `Asia/Shanghai`, and its restore date is read from the same browser-local
clock as the application.

## 4. Version 91 performance and real-data audit

Version 91 improves record-page runtime cost without removing or simplifying
the established animation, glass, mascot, skeleton, or responsive effects:

- `RecordsScreen` now coalesces identical profile, snapshot, and trend requests
  by authenticated user and local date. Explicit retry, successful save, and
  foreground refresh still force new Supabase reads, so reuse cannot conceal
  new persisted data;
- closely paired `focus` and `visibilitychange` browser events are coalesced to
  prevent duplicate refresh bursts;
- `RecordModuleDashboard` is loaded only after a record module is opened, using
  the existing record-detail skeleton during its async boundary;
- seven mascot PNG files were converted to lossless WebP. Decoded RGBA pixels
  were compared one by one and are identical. Media size fell from 6,823,660 to
  3,550,388 bytes (48%); the deleted PNG copies remain recoverable from Git;
- unused direct `three` and `@types/three` dependencies were removed;
- the initial records chunk fell from about 163.63 kB (51.20 kB gzip) in v90 to
  59.67 kB (19.30 kB gzip), with the 91.96 kB (29.10 kB gzip) detail dashboard
  split out for on-demand loading;
- `tests/single-request-cache.test.ts` and `npm run performance:test` permanently
  cover request sharing, forced refresh, key changes, and failure eviction.

A repository-wide production scan found no frontend service-role/model secret,
no production hard-coded application date, and no public demo authentication
bypass. Production records, profiles, onboarding state, productivity data,
health/watch data, reports, and AI requests continue through the shared
Supabase/backend contracts. Browser storage occurrences are limited to
tab-scoped authentication, local-only demo support, recoverable client queues or
drafts, and last-sync caches; they do not replace remote production records.
No migration, Edge Function, production seed, secret, or access-policy mutation
was performed in v91.

## 5. Post-deployment verification

Both public origins were tested with the user-authorized production account at
all four required portrait viewports. All eight authenticated combinations
passed the same strict geometry rules, including four visible lines, no text
truncation, no icon/text/arrow/card intersection, navigation safety, no excessive
bottom whitespace, and no horizontal overflow. Both extreme viewport screenshots
were also inspected directly and the two origins match.

Version 94 was re-tested on both origins with the user-authorized production
account after deployment. Public release evidence is under:

- `Q:\NAVA-Workspace\Build\TestRuns\nava-v94-public`

The account had no recorded module data for 2026-09-05 during this acceptance
run, so the public checks exercised all six real missing states and confirmed
the exact four-line dictionaries. The populated compact state is covered by the
local persisted-demo geometry run and the compact-output unit/contract tests;
no production account records were mutated for acceptance.

`npm run auth:verify:production` also passed after release: both public builds target the
canonical Supabase project, public demo bypass remains disabled, and browser
authentication remains scoped to the current tab.

## 6. Remaining backend boundary

The updated source for `ai-health-report` and `ai-diet-report` contains the new
dual normal-plus-compact model output, strict validation, one bounded repair
attempt, and cache versioning. `diet-extract` now also contains a dish-level
recognition prompt that keeps a composite dish such as salad as one item while
describing clearly visible ingredients in parentheses. These three changed Edge
Functions were not deployed through version 94. Standing frontend release
authorization does not cover Edge Function deployment.

Therefore:

- the fixed empty dictionaries and responsive visual correction are live now;
- the frontend accepts compact AI output when the backend provides it;
- production generation of the new exact-seven-character AI card summaries is
  not claimed live until the user explicitly authorizes deployment of those two
  Edge Functions and their live boundary is verified;
- production dish-level photo recognition is not claimed live until the user
  explicitly authorizes deployment of the changed `diet-extract` function.

No migration, production seed, secret change, or access-policy change is needed
for that deployment.

## 7. Future visual acceptance rule

For every later visual modification, treat all four required portrait viewports
as separate layouts. Validate element intersections, clipping, fixed navigation,
touch targets, text fit, empty and populated states, and whitespace distribution.
A build pass or one screenshot is never sufficient visual evidence.

## 8. Version 92 authenticated transition correction

The v91 public build reproduced a real post-login flash. Supabase authentication
succeeded, but React then created a new `AuthScreen` while the lazy authenticated
bundle loaded and while `loadOnboardingStatus` read the remote profile. The new
component had empty local fields but inherited the parent transition flag, so it
rendered an empty email/password form labeled “处理中”. This was a UI state
handoff defect, not an authentication or account-data failure.

Version 92 now:

- retains the exact submitted `AuthScreen` instance, including its in-memory
  field values, until the authenticated route and onboarding decision are both
  ready;
- keeps the authenticated application hidden while it prepares, then swaps the
  two surfaces in one React commit;
- preloads the authenticated application bundle after the signed-out screen is
  ready, reducing the normal waiting interval without changing visual effects;
- preserves the existing skeleton for a restored tab session, where there is no
  submitted form to retain;
- expands the interaction gate to fail if a processing form ever loses or
  replaces the submitted account value.

The local delay test intentionally held the authenticated bundle for two seconds
at 360x740, 375x812, 390x844, and 430x932. Every viewport retained the submitted
fields, displayed the original processing button, had zero horizontal overflow,
and reached the authenticated destination. Evidence is under:

- `Q:\NAVA-Workspace\Build\TestRuns\nava-auth-transition-local`

After deployment, the production account was used without record mutation on
both public origins. The Sites transition produced 572 ten-millisecond samples
and the Pages transition produced 403; neither observed a reset. Both origins
then passed the four authenticated record-page viewports with zero runtime or
overflow failures. The full 22-stage verification, 11-group interaction suite,
and post-release production-auth contract also passed.

## 9. Version 94 record-editor redesign

Version 94 completes the requested editor behavior without changing production
data contracts:

- mood and sleep are one-screen layouts whose note areas absorb available height;
- the sleep presets are three compact icon actions aligned with the card title;
- diet uses four title-row shortcut icons and an auto-growing, multiline dish
  field. Structured AI items remain structured when saved rather than being
  collapsed into one display string;
- focus setup supports count-up or countdown, 25/45/60-minute shortcuts, a task,
  and a private planning note. “Start focus” launches the existing immersive
  timer, and no Supabase focus record is written until the timer finishes;
- face capture no longer repeats the onboarding consent control or the removed
  guidance paragraph. It adds a one-screen AI evaluation card derived from the
  actual face-analysis feedback and annotations, retains the non-diagnostic
  boundary, and uses `src/assets/mascot/nava-face-insight-v2.webp` generated for
  this state.

`scripts/verify-mood-editor-layout.mjs` checks all five editors at 360x740,
375x812, 390x844, and 430x932 plus a keyboard-height proxy. It verifies overflow,
card/navigation gaps, title/action alignment, shortcut behavior, multiline dish
growth, real focus-timer launch, and face before/after states. The production
account then passed both public origins: no blank processing-form flash, canonical
Supabase project observed, no horizontal overflow, no shifted page, and face
editor vertical overflow of at most one rounding pixel.

No production record was mutated by the public acceptance run. Version 94 uses
source commit `83c8ae8c2fa9ab11911f3d5d3a3e32694ff09123`, Sites version 94, and Pages
mirror commit `41eda95eebd968c40740d886b6099daa80246ad8`.
