# NAVA Codex handoff — 2026-09-03

## 1. Continuation baseline

Read this incremental handoff together with:

1. `Q:\NAVA-Workspace\nava-app\AGENTS.md`
2. `docs/CODEX_HANDOFF_2026-09-02.md` for the complete architecture, product,
   real-data, AI, Supabase, iOS, and Watch state
3. the feature documentation relevant to the next requested change

The 2026-09-02 handoff remains the full project baseline. This document records
the public browser-translation crash correction and v83 dual-site release.

## 2. User-visible incident and verification gap

The public ChatGPT Sites build showed the authenticated Today route's error
boundary with:

`Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.`

The v82 public smoke check had verified the unauthenticated auth-first entry at
four viewports. It did not reuse a real signed-in production tab and therefore
was not proof that the authenticated Today transition was immune to an external
browser extension mutating React-owned DOM. That earlier conclusion was too
broad.

Local headless Playwright now deterministically reproduces the exact
`removeChild` exception: a Chrome/Edge-style translator replaces a React-owned
text node with nested `font` wrappers, then React 18 changes adjacent conditional
text. This matches the long-standing upstream React failure class documented in
facebook/react#11538 and facebook/react#26048. The repository itself contains
no direct `removeChild` call in the application UI path.

## 3. Implemented correction

- `translation-resilience` 0.3.0 is exact-pinned and installed before
  `ReactDOM.createRoot`. It lazily activates only when it detects browser
  translation activity, restores displaced renderer-owned text nodes, and then
  allows the native React mutation to proceed. The existing `notranslate`
  document hints remain as the first line of defense.
- Startup catches an unexpected resilience-installation failure so that an
  unsupported browser cannot turn the optional compatibility layer into a new
  bootstrap outage.
- `npm run translation:test` covers both major translator signatures: a
  `translated-ltr` document marker and extension-style `font` insertion without
  a document marker. It also exercises the real auth screen and the real Today
  asynchronous score transition.
- The translation test is part of `npm run verify`, so a release can no longer
  pass the main suite while regressing this failure class.
- The dependency has no runtime dependencies and is locked by package integrity.
  The same install surfaced a newly published transitive `@xmldom/xmldom`
  advisory in the Capacitor CLI chain; the lockfile now selects fixed version
  0.9.12. `npm audit` returns zero vulnerabilities.

No Supabase schema, Edge Function, authentication, persisted-data, AI, iOS, or
Watch behavior changed in this correction.

## 4. Verification

Passed on 2026-09-03:

- `npm run verify`, including production build, lint, zero-vulnerability audit,
  algorithms, AI and real-data boundaries, all backend checks, HealthKit/Watch
  contracts, iOS project contracts, and browser-translation resilience.
- `npm run interaction:test`: all 9 groups passed.
- `npm run prd-batch:test`: passed at 360x740, 375x812, 390x844, and 430x932.
- `npm run auth:verify:production`: canonical project, public-demo rejection,
  tab-scoped browser auth, email registration, and phone Function reachability
  passed. Custom SMTP delivery was not inspected.
- The pre-fix translation canary failed with the exact reported `removeChild`
  exception; the same canary passes after the correction, including the
  no-document-marker extension case.

Post-deployment evidence is under
`Q:\NAVA-Workspace\Build\TestRuns\nava-public-v83`. Both public URLs passed at
all four viewports (8/8): HTTP 200, auth-first behavior even with `?demo=1`, the
canonical Supabase marker, no console/page error, no horizontal overflow, and
a production-bundle translated-DOM state update that remained live.

Actual sign-in with the user's private production account was not automated:
browser auth is intentionally tab-scoped, and no credential was requested or
copied into the test harness. The deterministic failure path and the published
compatibility layer are verified; the user's original signed-in Chrome tab is
the final account-specific confirmation boundary.

## 5. v83 release provenance

- Released source commit:
  `e7da7104150e930762963304f70e3bca8e7cc208`
- ChatGPT Sites: version 83, deployment
  `appgdep_6a98d1a8cef48191b267fec19273a99e`
- GitHub Pages mirror: v83, commit
  `b26952b5ec7360f73eda76948a1999f9e4999761`
- ChatGPT Sites:
  `https://nava-app-preview-cz.chizhang1031.chatgpt.site`
- GitHub Pages:
  `https://chizhang-805.github.io/nava-app-preview/`

Both artifacts were built from the same pushed source commit. GitHub Pages
`source.json` and the Sites saved version both record that commit.

## 6. v84 authenticated Sites correction

The user confirmed that v83 still failed immediately after a real-account
sign-in on ChatGPT Sites. A sanitized headless production diagnostic then used
the explicitly authorized account on both public origins. GitHub Pages entered
the authenticated Today screen normally, while Sites first threw
`useAuth must be used inside AuthProvider`; the visible `removeChild` exception
was a second error while React removed the first error boundary tree.

The Sites worker had inlined Vite's entry module into its HTML while retaining
lazy chunks that imported the external entry asset. After authentication loaded
`App`, the browser therefore evaluated two entry-module identities and created
two different `AuthContext` singletons. `scripts/prepare-sites-build.mjs` now
keeps the entry as one external, deployment-root module. The lazy chunks and
the initial render consequently share the same module and context instance.
`npm run sites:artifact:test` guards this invariant and is included in
`npm run verify`.

Verification passed on 2026-09-03:

- complete `npm run verify`, including the new Sites artifact test;
- `npm run auth:verify:production` against canonical Supabase project
  `wxteapvwagvhhtrjrbim`;
- real-account public sign-in on both Sites and GitHub Pages;
- authenticated navigation through Today, Record, AI, Trends, and Profile at
  360x740, 375x812, 390x844, and 430x932 on both origins (40 combinations),
  with no page/console reconciliation error, error boundary, or horizontal
  frame overflow.

The acceptance run only signed in, loaded existing account-scoped data, and
navigated read-only screens. It did not save records, edit profile fields,
complete onboarding, seed data, invoke AI prompts, or change Supabase schema or
Functions. Credentials were passed to temporary local Playwright processes via
standard input and were not written to the repository, test artifacts, logs, or
handoff.

v84 provenance:

- released source commit:
  `0c4165568fbfb8c45b92b00a45315dbae44d43af`;
- ChatGPT Sites version 84, deployment
  `appgdep_6a98d6b1140c8191ba50aea5bb91e5af`;
- GitHub Pages mirror commit:
  `c9bafc4e7f1fcda150a20c9e282d14fb68413fb3`;
- Sites package:
  `Q:\NAVA-Workspace\Build\Sites\Packages\nava-sites-v84-0c41655.tgz`.

The v83 section above is retained as incident history; its earlier assertion
that translation mutation was the authenticated crash root cause is superseded
by this real-account v84 diagnosis. Translation resilience remains installed
for the separate, reproducible browser-translation mutation class.

## 7. Remaining boundaries

The human/external Apple gates listed in the 2026-09-02 handoff remain
unchanged. Focus-session wearable correlation and the points store remain
product-deferred. If the same Chrome profile still shows a DOM exception after
hard refresh on v83, record the enabled translation/content-rewrite extension
and browser console component stack; do not infer a new cause from the generic
error text alone.

## 8. v85 loading-state and weekly empty-chart release

The v85 release adds the following UI continuation after the v84 anchor:

- the sparse weekly rhythm view keeps exactly the same chart-card geometry as
  the six-dimension radar view and renders a static seven-date bar-chart shape
  without explanatory placeholder copy or invented numeric values;
- switching between the sparse rhythm chart and radar produces zero card-height,
  card-top, and following-card displacement at 360x740, 375x812, 390x844, and
  430x932;
- the generic authenticated loading interstitial has been replaced by
  destination-specific skeletons for auth, Today, record hub, record detail,
  AI, growth, profile, calendar, daily report, and advanced profile;
- unresolved AI summaries, history charts, Today scores, profile data, and
  Health/Watch connection state use matching local skeleton regions instead of
  temporary fixed copy, zero values, or a generic spinner;
- shimmer is limited to unresolved loading state and is disabled under reduced
  motion. The loaded sparse weekly chart is static and explicitly exposed to
  accessibility APIs as a no-data chart.

Verification passed locally on 2026-09-03:

- `npm run verify`;
- `npm run interaction:test`: 10 groups, including the auth plus nine-page
  skeleton regression;
- four-viewport skeleton geometry and shimmer review across all nine app
  variants, with no horizontal overflow;
- four-viewport weekly sparse/radar geometry comparison, with zero measured
  displacement at every required size.

Visual evidence is under
`Q:\NAVA-Workspace\Build\TestRuns\nava-loading-skeletons-20260903` and
`Q:\NAVA-Workspace\Build\TestRuns\nava-weekly-height-20260903`.

The continuation is published as v85 on both public sites.

v85 provenance:

- released source commit:
  `be8d81407a973e7d621b5291a8a3ad4d44129628`;
- ChatGPT Sites version 85, deployment
  `appgdep_6a98e619b26c819181343477f7eedc4e`;
- GitHub Pages mirror commit:
  `942e0efe1c6cf98273309b8697da1d5a7599f218`;
- Sites package:
  `Q:\NAVA-Workspace\Build\Sites\Packages\nava-sites-v85-be8d814.tgz`.

Post-deployment verification passed on both origins:

- unauthenticated auth-first entry, canonical Supabase project identity, HTTP
  200, no runtime errors, and no horizontal overflow at 360x740, 375x812,
  390x844, and 430x932;
- real-account sign-in followed by Today, Record, AI, Trends, and Profile at all
  four viewports: 40 authenticated origin/viewport/tab combinations with no
  runtime error, error boundary, or horizontal frame overflow;
- GitHub Pages `source.json` records the exact v85 source commit.

The first immediate authenticated Sites probe occurred while newly published
lazy assets were still propagating and received one transient dynamic-import
fetch failure. The asset became HTTP 200 moments later, and the complete
two-origin authenticated acceptance run then passed. No source change or
redeployment was needed.

## 9. v86 detailed-profile loading and navigation release

The published v86 release adds the following detailed-profile subpage correction
after v85:

- the account identity card is now gated by the same profile request as the
  form, so username, email, avatar initial, and completeness never render before
  the persisted profile has finished loading;
- the existing advanced-profile skeleton supplies the identity-card placeholder
  during both application bootstrap and in-page profile loading;
- the bottom five-button navigation is absent from this subpage in both loading
  and loaded states, and returns after navigating back to the Today root;
- the page uses reduced bottom padding without the removed navigation, avoiding
  a false empty footer.

Verification passed locally on 2026-09-03:

- `npm run lint` and `npm run build`;
- `npm run interaction:test`: all 10 groups, including loaded subpage navigation
  removal and loading-state regression assertions;
- loading and loaded screenshots at 360x740, 375x812, 390x844, and 430x932;
  all eight states have no horizontal overflow, loading exposes no account copy,
  and neither state renders the bottom navigation.

Evidence is under
`Q:\NAVA-Workspace\Build\TestRuns\nava-advanced-profile-shell-20260903`.

Release-level verification also passed:

- `npm run verify` and `npm run auth:verify:production`;
- eight unauthenticated dual-origin checks covering HTTP success, auth-first
  behavior, the canonical Supabase project, four required viewports, runtime
  errors, and horizontal overflow;
- 40 real-account dual-origin checks covering Today, Record, AI, Trends, and
  Profile at all four required viewports;
- eight focused real-account detailed-profile checks. Both public origins load
  the persisted account identity, render no bottom navigation or error boundary,
  and have no horizontal overflow at all four viewports.

The v86 publication provenance is:

- source commit: `77bcc10c635679596e9209c33e6367f6732d43c9`;
- ChatGPT Sites version 86, deployment
  `appgdep_6a98edea34d08191a013c23e166be6e5`;
- GitHub Pages mirror v86 commit
  `ed1d0a7f8d4c5d0682aef5d73b1216e5c2d7bdba`;
- Sites package:
  `Q:\NAVA-Workspace\Build\Sites\Packages\nava-sites-v86-77bcc10.tgz`;
- public and focused authenticated evidence:
  `Q:\NAVA-Workspace\Build\TestRuns\nava-public-v86`.
