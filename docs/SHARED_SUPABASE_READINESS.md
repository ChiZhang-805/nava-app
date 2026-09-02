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
- APP extensions: face records, rhythm scores, HealthKit snapshots, Watch snapshots, and sync jobs.
- Shared functions: AI extraction/reply, diet, face, and SMS endpoints.
- APP functions: Health ingest, Watch sync, rhythm scoring, and account data export.

Apple Health clients must use the authenticated `health-sync-ingest` contract. The
legacy remote `health-auto-export` function and `HEALTH_EXPORT_API_KEY` belong to an
older web-team prototype; they are not Apple credentials and must be retired only
after any required historical `health_imports` data has been reviewed and migrated.
The source migration `202609020002_health_sync_realtime.sql` publishes only sync-job
changes; existing RLS still limits each authenticated subscriber to its own rows.

Missing APP extensions no longer prevent the core Today and Trends screens from loading. Their full production features still require the Web backend owner to deploy the corresponding migrations, Storage buckets, RLS policies, and Edge Functions from this repository.

The shared project does not yet expose `nava_password_matches_current`. Password reset therefore still updates the authenticated account, but strict rejection of password reuse becomes active only after the backend owner deploys `202607190001_password_reuse_guard.sql`.

The shared project currently exposes the `diet-photos`, `face-photos`, and
`profile-avatars` storage routes, and the corresponding migrations define
private buckets plus account-prefix policies. New diet and face analysis never
falls back to sending a raw client `data:` image. The authenticated client must
first upload under `<user-id>/...`; the Edge Function validates that ownership
prefix and gives the configured vision provider a ten-minute signed URL. If
private upload or signing is unavailable, the feature reports an error instead
of pretending that analysis succeeded or bypassing the privacy boundary.
