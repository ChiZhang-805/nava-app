# NAVA full product/runtime audit — 2026-09-02

This audit follows the 2026-08-31 product handoff, the current 2026-09-02
handoff, and `产品需求文档-技术对接.md`. It covers the complete tracked source
inventory, frontend services and screens, Supabase migrations and Functions,
native iOS/Watch sources, automated tests, and the four required portrait
viewports. Local `?demo=1` fixtures are used only for deterministic visual and
interaction testing on localhost; they are not evidence of production data.

## Result

- Production frontend reads and writes authenticated Supabase data. Missing
  tables, columns, RPCs, private uploads, or Function calls now fail visibly
  instead of reporting a successful local substitute.
- Public hosts cannot enable the demo login or demo record path. Browser auth
  remains scoped to the current tab; the native iOS shell uses the app Keychain.
- User-visible report values, charts, Watch snapshots, todos, growth points,
  exports, and completion states are based on persisted rows or are explicitly
  labeled estimates. The former fixed diet score and stale local success paths
  were removed.
- AI chat, natural-language extraction, diet recognition, face analysis,
  per-module reports, and weekly reports require a real configured model in
  production. Fixed prose and seeded records remain only in isolated review
  mode and are visibly identified there.
- Account consent is enforced at both client and Edge boundaries. Explicit
  revocation overrides legacy onboarding JSON. Private image Functions accept
  only an object under the authenticated user's Storage prefix.
- Report caches are source-fingerprinted, so changed profile/health/nutrition
  rows invalidate prior generated text. Weekly AI requires five recorded days
  rather than turning a sparse day into a weekly conclusion.
- Apple Health uploads use the authenticated ingest Function; partial HealthKit
  reads preserve previously stored metrics, malformed ranges are rejected, and
  a sync-success event is account-filtered before refreshing the UI.
- Async screen loads, native listener registration, share timers, launch exit,
  and major animated views were reviewed for stale updates and lifecycle leaks.

## Real-data boundaries checked

| Area | Production source of truth | Failure behavior |
| --- | --- | --- |
| Today and module reports | Supabase mood/sleep/exercise/nutrition/focus/face/rhythm rows | Empty/error state; no seeded replacement |
| Todos and growth | `tasks`, focus records, reward ledger/RPCs | Backend error; local cache cannot claim completion or points |
| Watch snapshot | Authenticated `watch-sync` reconstruction from current-user rows | No client-supplied score accepted as server truth |
| Data export/delete | All required account tables and recursive private object prefixes | Partial table/storage failure is surfaced |
| Diet/face image AI | Account-owned private object plus short-lived signed URL | No raw base64 or cross-account path fallback |
| AI reports | Authenticated, consent-authorized persisted records | No model/fingerprint/evidence means no production report |
| Apple health | HealthKit -> JWT ingest -> normalized rows/sync job | No direct table-write or shared-key fallback |

## AI Model + Harness flow checked

1. Natural-language input first produces a rule candidate, then a real model
   extraction. Relevant knowledge tools are selected by domain; nutrition can
   query USDA FoodData Central, and an optional second calibration model call
   may correct supported estimates. The user confirms before any record saves.
2. Chat routing is deterministic when the intent is clear and otherwise uses a
   bounded model classifier. The final reply uses an anonymized provider ID,
   consent-gated recent context, compact evidence, timeout/retry handling, and
   a second model rewrite only when the response violates the length contract.
3. Health and diet reports use strict JSON schemas, real source counts,
   source-fingerprint cache invalidation, and one repair call for invalid model
   output. Provider failure is an error, not a canned answer.
4. Face analysis applies the non-diagnostic safety harness and auditable
   knowledge references. Model scores, confidence, makeup routing, and visible
   annotations are validated and bounded before display.

## Verification evidence

- `npm run verify`: passed completely, including zero npm audit findings,
  algorithms, prompts, structured entry, Edge type checks, 15 Deno backend
  tests, consent/storage/fingerprint contracts, HealthKit/Keychain contracts,
  and iOS project checks.
- `npm run interaction:test`: 9 interaction groups passed with no console or
  page errors.
- `npm run prd-batch:test`: passed at 360x740, 375x812, 390x844, and 430x932.
- `npm run screenshots`: captured 96 states across those four viewports with no
  reported horizontal overflow or runtime errors; representative reports,
  weekly detail, focus, and device screens were visually inspected.
- `npm run auth:verify:production`: canonical project, public-demo isolation,
  real registration settings, and phone endpoints passed. Strict SMTP delivery
  was not inspected because no management token was used.
- `npm run supabase:verify-shared`: APP, CLI, generated Web mirror, Auth, tables,
  Storage routes, and Function endpoints passed against project
  `wxteapvwagvhhtrjrbim`.
- `npm run health:audit:production`: JWT-protected `health-sync-ingest` is
  active at production version 10. The legacy `health-auto-export` remains an
  explicitly human-authorized retirement task.

## External/manual gates

The source fixes to consent enforcement, report cache fingerprints, strict
private-image processing, recursive deletion, validation, and Health ingest are
not production backend changes until the corresponding Edge Functions are
explicitly deployed. Migration `202609020002_health_sync_realtime.sql` is also
pending explicit production authorization. This audit does not claim those
staged server changes are live.

Physical Apple Health/Watch acceptance still needs a Mac, Xcode, signing,
Developer Team selection, a real iPhone and Watch, permission/value comparison,
RLS boundary execution, and TestFlight/App Store work. The points store and
Focus-session wearable correlation are product-deferred items, not disguised as
complete features.
