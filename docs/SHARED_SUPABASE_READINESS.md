# Canonical Supabase readiness

The canonical NAVA APP backend is Supabase project `wxteapvwagvhhtrjrbim`. The local review build (`.env.review`, `?demo=1`) is intentionally isolated and never writes to this project. The public build uses `npm run build:pages` and connects through the local, gitignored `.env`.

Run the read-only target and contract check before every backend or public frontend deployment:

```powershell
npm run supabase:verify-shared
```

The check is read-only. It verifies that APP `.env`, the Supabase CLI link, and
the generated GitHub Pages entry point all target the canonical project, then
checks Auth availability, required table contracts, Storage API reachability,
and Edge Function endpoints without printing credentials. The generated mirror
is inspected through its compiled public entry point; a production `.env` file
must never be copied into that repository.

## Compatibility tiers

- Core shared data: `profiles`, mood, sleep, exercise, nutrition, focus, tasks, and AI conversations.
- APP extensions: face records, rhythm scores, HealthKit snapshots, Watch snapshots, sync jobs,
  cloud preferences, notification inbox, AI archives, active focus/sleep sessions, and immutable
  focus-session events.
- Shared functions: AI extraction/reply, diet, face, and SMS endpoints.
- APP functions: Health ingest, Watch sync, rhythm scoring, and account data export.

Apple Health clients must use the authenticated `health-sync-ingest` contract. The
legacy remote `health-auto-export` function and `HEALTH_EXPORT_API_KEY` belong to an
older web-team prototype; they are not Apple credentials and must be retired only
after any required historical `health_imports` data has been reviewed and migrated.
The source migration `202609020002_health_sync_realtime.sql` publishes only sync-job
changes; existing RLS still limits each authenticated subscriber to its own rows.

The read-only shared-backend check passed again on 2026-09-07 after production migrations
`202609070001_focus_session_integrity` through `202609070005_remote_push_devices`: Auth, core tables, APP
extension tables, shared and APP function endpoints, and shared/private Storage
routes were all reachable on the canonical project. The linked migration list matched all 26 local
migrations and production schema lint returned no errors. The earlier cloud completeness migration
successfully enforced that every
current account-owned `user_id` table (and `profiles.id`) cascades from `auth.users`; it also
backfilled the one previously missing profile, so production now reports three Auth profiles for
three accounts. The updated `export-user-data` production v24 reports ACTIVE with JWT verification,
and the new `push-dispatch` production v1 reports ACTIVE with its intended internal-secret boundary;
real-account model output, actual archive
download, destructive account deletion, and Apple-device behavior still require their explicit
acceptance runs.

The production probe was extended after the source additions and now returns READY for the new
exercise recovery columns, `push_device_tokens`, `push_delivery_receipts`, and `push-dispatch` as
well as the existing APP/CLI project refs, Auth, functions, and Storage. This proves deployed schema
and endpoint reachability; the internal dispatch secret, APNs/FCM/HMS credentials, and real-device
acceptance remain separate gates.

Migration `202607190001_password_reuse_guard.sql` is present in the linked
production migration history. It grants `nava_password_matches_current` only to
authenticated users and denies anon/public execution. A real authenticated
password-reset acceptance test is still required whenever that flow changes;
migration parity alone is not proof of end-to-end email delivery or UI behavior.

The shared project currently exposes the `diet-photos`, `face-photos`, and
`profile-avatars` storage routes, and the corresponding migrations define
private buckets plus account-prefix policies. New diet and face analysis never
falls back to sending a raw client `data:` image. The authenticated client must
first upload under `<user-id>/...`; the Edge Function validates that ownership
prefix and gives the configured vision provider a ten-minute signed URL. If
private upload or signing is unavailable, the feature reports an error instead
of pretending that analysis succeeded or bypassing the privacy boundary.
