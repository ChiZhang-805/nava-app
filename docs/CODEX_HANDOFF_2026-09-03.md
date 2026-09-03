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

## 6. Remaining boundaries

The human/external Apple gates listed in the 2026-09-02 handoff remain
unchanged. Focus-session wearable correlation and the points store remain
product-deferred. If the same Chrome profile still shows a DOM exception after
hard refresh on v83, record the enabled translation/content-rewrite extension
and browser console component stack; do not infer a new cause from the generic
error text alone.
