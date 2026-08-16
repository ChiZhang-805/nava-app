# Canonical Supabase readiness

The canonical NAVA APP backend is Supabase project `wxteapvwagvhhtrjrbim`. The local review build (`.env.review`, `?demo=1`) is intentionally isolated and never writes to this project. The public build uses `npm run build:pages` and connects through the local, gitignored `.env`.

Run the read-only target and contract check before every backend or public frontend deployment:

```powershell
npm run supabase:verify-shared
```

The check is read-only. It verifies that APP `.env` and the Supabase CLI link both target the canonical project, then checks Auth availability, required table contracts, Storage API reachability, and Edge Function endpoints without printing credentials. It reports Web alignment separately because `navarhythm.site` still targets the legacy backend until the Web team migrates and redeploys it.

## Compatibility tiers

- Core shared data: `profiles`, mood, sleep, exercise, nutrition, focus, tasks, and AI conversations.
- APP extensions: face records, rhythm scores, HealthKit snapshots, Watch snapshots, and sync jobs.
- Shared functions: AI extraction/reply, diet, face, and SMS endpoints.
- APP functions: Health ingest, Watch sync, rhythm scoring, and account data export.

Missing APP extensions no longer prevent the core Today and Trends screens from loading. Their full production features still require the Web backend owner to deploy the corresponding migrations, Storage buckets, RLS policies, and Edge Functions from this repository.

The shared project does not yet expose `nava_password_matches_current`. Password reset therefore still updates the authenticated account, but strict rejection of password reuse becomes active only after the backend owner deploys `202607190001_password_reuse_guard.sql`.

The shared project currently has no `diet-photos`, `face-photos`, or `profile-avatars` bucket. Until they are deployed, diet and face analysis send the current image directly to the Web team's existing AI functions and do not persist the source image. Avatar selection remains complete in review mode; cross-device avatar persistence requires the Web backend owner to deploy `profile-avatars` and its RLS policies.
