# NAVA wearable and web integration decision — 2026-09-02

## Decision

NAVA will not promise that a public website can read an arbitrary watch merely
because the computer, phone, and watch share Wi-Fi or Bluetooth. Those transports
provide proximity or networking, not health-data authorization or a common data
protocol.

NAVA will support four explicit routes instead:

1. Apple Watch → Apple Health on iPhone → NAVA iOS companion → authenticated
   Supabase Edge Function.
2. Android watch/vendor app → Health Connect on Android → NAVA Android companion
   → authenticated Supabase Edge Function.
3. Vendor cloud → user OAuth consent in the NAVA website → Supabase callback,
   encrypted per-user tokens, webhook/polling sync.
4. Optional Web Bluetooth → only a nearby device that advertises a supported
   standard BLE GATT service, initially the Bluetooth Heart Rate Service. This
   route is for live focus-session measurements, not general watch history.

The user should sign into the same NAVA account on every surface. Same Wi-Fi is
not required for the native or cloud routes. Bluetooth is required only between
the watch and its phone, or for the optional direct BLE route.

## What the repository already has

- `native/ios/NavaHealthPlugin.swift` reads HealthKit activity, sleep, heart
  rate, resting heart rate, HRV, blood oxygen, sleep stages, and hourly activity.
- `src/services/health.ts` invokes the native bridge and uploads up to 14 days of
  summaries to `health-sync-ingest`.
- `native/ios/NavaWatchBridgePlugin.swift` and `native/watch/` implement the
  WatchConnectivity message and offline queue source.
- `watch-sync` persists watch snapshots and idempotently applies quick mood and
  focus actions.
- `health-sync-ingest` writes authenticated data into `exercise_records`,
  `sleep_records`, `health_metric_snapshots`, and `health_sync_jobs`, then
  refreshes the user's rhythm result.
- `device_connections`, `watch_snapshots`, `watch_action_receipts`, and health
  snapshot contracts already exist with user ownership/RLS boundaries.
- The iOS target contains the HealthKit entitlement and permission copy.

These are real implementation assets, but they do not yet prove a shipped watch
integration. The Xcode project contains only the iPhone App target; the sources
under `native/watch/` still need a real watchOS target. The HealthKit bridge also
needs signing, a physical-device permission test, background delivery decisions,
and App Store review.

## Why the public website cannot directly read Apple Watch history

Apple describes HealthKit as the iPhone/Apple Watch health repository and
requires a signed app with the HealthKit capability plus fine-grained user
authorization. It is not a browser API:

- https://developer.apple.com/documentation/healthkit
- https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- https://developer.apple.com/documentation/healthkit/setting-up-healthkit

The correct Apple route is therefore the existing iPhone companion. Once the
phone uploads normalized data to Supabase, both public websites can display it
for the same authenticated user. The website and phone do not need the same
Wi-Fi after that upload.

## Android route

Health Connect is an on-device Android datastore/API with per-app permissions;
it supports foreground and authorized background reads. It requires an Android
client application and manifest permissions, not ordinary website JavaScript:

- https://developer.android.com/health-and-fitness/health-connect
- https://developer.android.com/health-and-fitness/health-connect/read-data
- https://developer.android.com/health-and-fitness/health-connect/ui/permissions

An Android Capacitor plugin should normalize Health Connect records into the
same `HealthTodayNativeSummary` contract already used by iOS, so the current
`health-sync-ingest` function and ChronoState pipeline can be reused.

Samsung Health can synchronize selected data through Health Connect. Direct use
of Samsung's Health Data SDK is an alternative but public distribution requires
Samsung partner/signature registration:

- https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect
- https://developer.samsung.com/health/data/guide/app-verification.html

Huawei Health Kit advertises Android, iOS, Web, Quick App, and HarmonyOS access,
but still requires a Huawei developer application, approved scopes, Huawei ID
authorization, and the user's consent:

- https://developer.huawei.com/consumer/en/hms/huaweihealth/

## Vendor-cloud route for the current website

This is the only broad integration that can begin from today's GitHub Pages or
ChatGPT Sites UI without first shipping NAVA as a phone app. The browser opens a
provider authorization page; the Supabase Edge Function exchanges the callback
code, stores the user's tokens securely, and imports data. The watch first syncs
to its normal vendor phone app/cloud.

Current official options include:

| Provider | Web route | Constraint |
| --- | --- | --- |
| Fitbit | Web API and user OAuth 2.0 | Register a Fitbit developer application and request only required scopes. |
| Garmin | Garmin Health API | Approval/evaluation is required; commercial use may require a license. |
| Withings | Public Health Data API, OAuth 2.0 and webhooks | Works for individual users; device data first syncs through the Withings app/cloud. |
| Oura | Cloud API v2 and OAuth 2.0 | Client ID/secret and scoped authorization are required; personal access tokens are deprecated. |
| Huawei | Health Kit app/service access | Developer registration, approved data scopes, and Huawei authorization are required. |

Official references:

- https://dev.fitbit.com/build/reference/web-api/explore/
- https://developer.garmin.com/gc-developer-program/health-api/
- https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/get-access/oauth-web-flow/
- https://cloud.ouraring.com/v2/docs

## Direct Web Bluetooth route

Web Bluetooth can connect a secure HTTPS page to a nearby BLE GATT server after
a user gesture and browser device-selection prompt. It is not automatic pairing
and is not supported uniformly across browsers:

- https://developer.chrome.com/docs/capabilities/bluetooth
- https://webbluetoothcg.github.io/web-bluetooth/
- https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/

The first safe experimental scope is a device that explicitly advertises the
standard `heart_rate` service. NAVA could subscribe to live heart-rate
notifications during a focus session and later upload a bounded aggregate. It
must not claim compatibility with Apple Watch or any watch that does not expose
that GATT service. It also cannot replace historical HealthKit/Health Connect or
vendor-cloud synchronization.

Sharing Wi-Fi is similarly insufficient. A watch would need to run a documented
HTTP/WebSocket service itself, and the browser would still face explicit local
network permission, origin, TLS, and device authentication requirements:

- https://developer.chrome.com/blog/local-network-access

## Production secret audit

The 2026-09-02 read-only Supabase secret-name audit found no Fitbit, Garmin,
Withings, Oura, Huawei, or Samsung developer credentials. Existing model, SMS,
Supabase, review, USDA, and `HEALTH_EXPORT_API_KEY` names were present.
`HEALTH_EXPORT_API_KEY` has no reference in the current repository, so it must
not be treated as a working watch credential until its owner and contract are
identified.

Apple HealthKit and Android Health Connect do not use a generic Supabase API key.
They require signed apps and user-granted OS permissions. Vendor-cloud
integrations require credentials issued by that vendor, for example:

- `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`
- `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`
- `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`
- Garmin/Huawei identifiers and secrets matching the approved developer program

Provider client secrets belong in Supabase Edge Function secrets, never in the
frontend. Supabase documents the default/public versus secret key boundary and
production secret management here:

- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/database/vault

Per-user access and refresh tokens are different from application secrets. They
need an account-owned connection table, encrypted token payloads, minimal
service-role access, revocation state, rotation timestamps, and an audit trail.

## Required backend additions for vendor OAuth

Use append-only migrations and preserve existing user ownership:

1. `wearable_connections`: user, provider, external subject hash, scopes,
   status, last sync, token expiry, and consent timestamps.
2. Encrypted provider-token storage accessible only to service functions.
3. `wearable_samples`: timestamped, normalized measurements with source,
   unit, device, provider record ID, timezone, and quality/provenance.
4. `focus_session_metrics`: focus record, sample window, average heart rate,
   sample count, coverage, and a descriptive stability statistic.
5. OAuth start/callback, revoke, webhook, and sync Edge Functions with PKCE/state,
   webhook signature verification, replay protection, rate limits, and
   idempotent provider record IDs.

Daily `health_metric_snapshots` can continue to feed ChronoState. It is not
sufficient for the Focus hardware row because focus analysis needs samples
aligned to the exact session start/end timestamps.

## Recommended delivery order

1. Finish the existing Apple path first: create the watchOS target, sign the
   iPhone/watch apps, perform HealthKit permission and real-device tests, then
   verify that one real account's uploads appear on both websites.
2. Add Android Health Connect by reusing the same normalized ingest contract.
3. After the user's watch brand is known, add one vendor-cloud OAuth provider;
   do not create five untested connectors at once.
4. Add optional Web Bluetooth live heart-rate support only for explicitly
   compatible BLE devices, with a capability check and truthful fallback copy.
5. Only then mark the PRD Focus hardware row complete, after a physical-device
   session proves timestamp alignment, persistence, account isolation, and the
   displayed aggregate.
