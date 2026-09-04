# NAVA Codex handoff — 2026-09-05

This document is the current continuation of
[`CODEX_HANDOFF_2026-09-03.md`](./CODEX_HANDOFF_2026-09-03.md). Read the older
handoff and the repository-level [`AGENTS.md`](../AGENTS.md) for the full product,
Supabase, Apple Health/Watch, and release baseline.

## 1. Current release anchor

- Editable source repository: `Q:\NAVA-Workspace\nava-app`
- Released source commit:
  `93a787b991c45410c2662ca1d8ff100dd0f407e8`
- ChatGPT Sites project:
  `appgprj_6a5de710811c8191af8ce2681358d518`
- ChatGPT Sites version: 90
- ChatGPT Sites deployment:
  `appgdep_6a9aec06c3ac819195b939452f3a0769`
- ChatGPT Sites URL:
  `https://nava-app-preview-cz.chizhang1031.chatgpt.site`
- GitHub Pages generated mirror commit:
  `a1c730a22798a135eb880605a138dbb29a1cd1b6`
- GitHub Pages URL:
  `https://chizhang-805.github.io/nava-app-preview/`
- Sites package:
  `Q:\NAVA-Workspace\Build\Sites\Packages\nava-v90.tar.gz`
- Canonical Supabase project: `wxteapvwagvhhtrjrbim`

Version 89 was an intermediate release from source commit
`9420a45932776f164bc16c7a3b2a1478b1406b2d`. Its compact-card source was valid,
but the 360x740 layout exposed a real fourth-line clipping regression that the
previous visual test did not detect. Version 90 replaces it and is the only
current release anchor.

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

The complete 19-stage `npm run verify` passed after correcting a test-only
UTC/Asia-Shanghai cross-midnight mismatch. The Playwright context is now pinned
to `Asia/Shanghai`, and its restore date is read from the same browser-local
clock as the application.

## 4. Post-deployment verification

Both public origins were tested with the user-authorized production account at
all four required portrait viewports. All eight authenticated combinations
passed the same strict geometry rules, including four visible lines, no text
truncation, no icon/text/arrow/card intersection, navigation safety, no excessive
bottom whitespace, and no horizontal overflow. Both extreme viewport screenshots
were also inspected directly and the two origins match.

Public evidence is under:

- `Q:\NAVA-Workspace\Build\TestRuns\nava-public-v90`

The account had no recorded module data for 2026-09-05 during this acceptance
run, so the public checks exercised all six real missing states and confirmed
the exact four-line dictionaries. The populated compact state is covered by the
local persisted-demo geometry run and the compact-output unit/contract tests;
no production account records were mutated for acceptance.

`npm run auth:verify:production` also passed: both public builds target the
canonical Supabase project, public demo bypass remains disabled, and browser
authentication remains scoped to the current tab.

## 5. Remaining backend boundary

The updated source for `ai-health-report` and `ai-diet-report` contains the new
dual normal-plus-compact model output, strict validation, one bounded repair
attempt, and cache versioning. These two changed Edge Functions were not deployed
during versions 89 or 90. Standing frontend release authorization does not cover
Edge Function deployment.

Therefore:

- the fixed empty dictionaries and responsive visual correction are live now;
- the frontend accepts compact AI output when the backend provides it;
- production generation of the new exact-seven-character AI card summaries is
  not claimed live until the user explicitly authorizes deployment of those two
  Edge Functions and their live boundary is verified.

No migration, production seed, secret change, or access-policy change is needed
for that deployment.

## 6. Future visual acceptance rule

For every later visual modification, treat all four required portrait viewports
as separate layouts. Validate element intersections, clipping, fixed navigation,
touch targets, text fit, empty and populated states, and whitespace distribution.
A build pass or one screenshot is never sufficient visual evidence.
