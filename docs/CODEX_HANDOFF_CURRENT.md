# NAVA current Codex handoff

Current handoff date: **2026-09-03**

The authoritative full handoff is:

- [`CODEX_HANDOFF_2026-09-03.md`](./CODEX_HANDOFF_2026-09-03.md)

Read it together with the repository-level [`AGENTS.md`](../AGENTS.md) before
changing code. The current handoff points to the 2026-09-02 full product and
Apple/Watch baseline. Older dated handoffs are historical evidence.

Current release anchor:

- Source commit: `ee102a979f1b788f2cd03a77fe869ac44bb8e101`
- ChatGPT Sites: version 87, public
- GitHub Pages mirror release: v87 (`a0176c5510e6262cf76e41d9bed70d588331e093`)
- Canonical Supabase project: `wxteapvwagvhhtrjrbim`
- The profile-switch containment, normalized sparse weekly bars, baseline
  alignment, and lower radar Focus caption are deployed to both public sites
  and verified with a real account at all four required mobile viewports.

Current continuation:

- Section 10 of the dated handoff records the published v87 visual correction:
  detailed-profile toggle knobs remain inside dedicated tracks,
  sparse weekly bars span a proportional 30%–100% plot range and meet their
  baseline, and the radar Focus caption plus score move down together. Lint,
  the full verification suite, all 10 interaction groups, eight public smoke
  checks, 40 real-account main-page checks, and 16 focused real-account visual
  checks pass across both public origins.

- Section 9 of the dated handoff records the published v86 detailed-profile
  release:
  unresolved account identity is fully skeletonized, the subpage omits the
  bottom five-button navigation in loading and loaded states, and the navigation
  returns on back. The full verification suite, production authentication
  check, all 10 interaction groups, local loading/loaded screenshots, eight
  public smoke checks, 40 real-account main-page checks, and eight focused
  real-account subpage checks pass.

- Section 8 of the dated handoff records the v85 loading-state and weekly
  empty-chart release. It adds auth plus nine destination-specific loading
  skeletons, local AI/history/device skeleton regions, and an equal-height
  static seven-day sparse rhythm chart. `npm run verify`, the 10-group
  interaction suite, four-viewport visual geometry checks, and the final
  40-combination real-account dual-origin acceptance run pass.

- Real-account production diagnostics showed the v83 Sites failure began with
  `useAuth must be used inside AuthProvider`; `removeChild` was a secondary
  cleanup error. The Sites worker had inlined the entry while lazy chunks
  imported a second external copy, duplicating `AuthContext`. v84 keeps one
  external entry-module identity and protects it with
  `npm run sites:artifact:test` inside the full verification suite.
- The explicitly authorized real account successfully entered both public
  sites and navigated Today, Record, AI, Trends, and Profile at all four required
  viewports (40 combinations), with no runtime/reconciliation error, error
  boundary, or horizontal frame overflow. Credentials were standard-input only
  and were not persisted.

- The full post-Apple source/runtime audit is
  `docs/FULL_PRODUCT_RUNTIME_AUDIT_2026-09-02.md`; section 14 of the 2026-09-02
  handoff records the real-data, consent, AI cache/harness, private-image,
  transfer, lifecycle, and four-viewport corrections.
- `npm run verify`, the nine-group interaction suite, the PRD four-viewport
  suite, 96-state screenshots, production Auth, shared Supabase alignment, and
  the production Health Function audit all pass in the current checkout.
- Updated Edge Function sources are live as new production versions, and
  migration `202609020002_health_sync_realtime.sql` is applied to canonical
  project `wxteapvwagvhhtrjrbim`. Section 15 of the 2026-09-02 handoff records
  exact versions and scope.
- The underlying public v82 baseline passed post-deployment headless verification at 360x740,
  375x812, 390x844, and 430x932: HTTP 200, auth-first entry even with
  `?demo=1`, canonical Supabase marker, no runtime errors, and no horizontal
  overflow. Evidence is under
  `Q:\NAVA-Workspace\Build\TestRuns\nava-public-v82`.

- Sections 9 through 11 of the 2026-09-02 handoff record the full-code audit, the
  real-data/natural-week corrections, the grounded AI health-report batch, and
  the dual-site v80 verification.

- Weekly report rows now open a detailed long-form explanation sheet backed by
  a strict real-model JSON contract. Production accepts only DeepSeek output;
  fixed demo prose is development-only and visibly labeled.
- The health-report harness computes bounded, same-date cross-module
  correlations from the authenticated user's consent-authorized persisted
  records. It requires enough overlap, forbids causal claims, caps confidence,
  and rejects invented numeric evidence.
- Face analysis now returns model-derived makeup level and confidence, asks for
  confirmation when the selected capture mode conflicts with a confident model
  result, and keeps interrupted photo drafts encrypted in IndexedDB with a
  tab-scoped AES-GCM key.
- Focus todo planning now persists its scheduled time, per-session minutes, and
  planned session count. Completion is based on actual saved focus records, not
  a local fake checkmark.
- Backend migration `202609020001_focus_todo_plan.sql` is applied. Production
  `ai-health-report` is active at version 7 and `face-analyze` at version 14.
- `npm run verify`, `npm run weekly-report:test`, `npm run backend:test`,
  `npm run interaction:test`, `npm run auth:verify:production`, and
  `npm run prd-batch:test` all passed. The public v80 sites passed local
  headless Playwright at all four required viewports with real auth-first entry,
  no console/page errors, and no horizontal overflow.
- Product has now resolved the Face privacy wording: with explicit consent,
  photos are encrypted in transit to account-isolated private Supabase storage
  and analyzed by a controlled server through a short-lived signed URL. The
  obsolete "local-only analysis" promise is no longer a requirement; this moves
  the strict audit to 50/52 in source/product terms.
- Wearable research is recorded in
  `docs/WEARABLE_WEB_INTEGRATION_2026-09-02.md`. The repository already contains
  the iOS HealthKit bridge, WatchConnectivity sources, authenticated ingest,
  watch action idempotency, and normalized health storage. A public website
  cannot generally read arbitrary watch history merely through shared Wi-Fi or
  Bluetooth. The recommended paths are Apple/Android native companions, vendor
  cloud OAuth, and a narrowly labeled optional Web Bluetooth live-HR route.
- No vendor-cloud credentials are currently configured. The existing
  `HEALTH_EXPORT_API_KEY` name is unused by this APP repository and is not
  evidence of a vendor connection. The audited web-team prototype does use it
  with the legacy non-JWT `health-auto-export` path, which remains online only
  until its clients/history can be audited and retired safely.
- The formal Apple delivery plan is
  `docs/APPLE_HEALTH_WATCH_DELIVERY_PLAN_2026-09-02.md`. Source now includes
  native Keychain session storage, missing-value-safe HealthKit collection,
  durable background-change observation, start/foreground/live auto-sync,
  JWT-only and partial-field-preserving ingest, account-filtered nonzero Realtime
  refresh, truthful server-timestamp
  status, the applied Realtime migration, Mac packaging helper, secure boundary
  verifier, production Function audit, and true-device acceptance template.
- The Xcode project now includes an embedded `NAVA Watch` watchOS target with
  shared bundle-ID root configuration, resources and app icon. iPhone-side
  Watch actions first enter a protected native queue and are acknowledged only
  after handoff to the account-scoped Web queue.
- Final Windows verification passed `npm run verify`, the 9-group interaction suite,
  production-auth/shared-Supabase/function audits, Capacitor sync, and a
  96-state four-viewport visual run including the Profile device area. Mac/Xcode
  compilation, physical iPhone/Watch checks, RLS real-account execution,
  signing/TestFlight, and legacy retirement remain
  explicitly unverified human/external gates.
- The embedded Watch target, durable bridge queue, audited backend changes and
  final frontend are committed and published at the v82 dual-site release
  anchor. Physical-device acceptance remains unverified.
