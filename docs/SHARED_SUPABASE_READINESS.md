# Canonical Supabase readiness

The canonical NAVA APP backend is Supabase project `wxteapvwagvhhtrjrbim`. The local review build (`.env.review`, `?demo=1`) is intentionally isolated and never writes to this project. The public build uses `npm run build:pages` and connects through the local, gitignored `.env`.

2026-10-13: the follow-up wardrobe source migration
`202610130002_mascot_wardrobe_multi_accessories.sql` adds a bounded multi-accessory
preference and an atomic whole-look selection RPC while retaining the legacy single-accessory
field for rolling compatibility. It must be applied selectively so the intentionally pending
`202609270001` migration is not included; the production receipt is recorded after deployment.

2026-10-13: after explicit authorization, migration `202610130001_mascot_wardrobe.sql`
was applied and recorded without applying the intentionally pending `202609270001` migration.
Read-only production verification found 12 wardrobe catalog rows, both account-owned
wardrobe tables, and all three wardrobe RPCs; linked schema lint returned no errors.
`export-user-data` schema 1.4.0 was deployed as ACTIVE v28 with JWT verification and now
includes wardrobe unlocks and preferences. Verification did not create an unlock, alter a
user's current outfit, or spend account points.

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

2026-09-28: the user explicitly authorized only `202609280002_admin_product_catalog.sql`.
It and its migration-history receipt were committed in one database transaction. Bilingual
catalog fields, three listing states and reversible administrator-only archival are active.
Purchase guards reject upcoming/archived items at cart and order-item boundaries, including
legacy clients; failures roll back checkout writes. Accounts, ledger rows, orders and catalog
counts remained 2/5/4/4 respectively; no product was archived by the migration. Schema lint
reported no errors. `202609270001` remains unapplied. No new Edge deployment or role change.

2026-09-27: migrations `202609270002_admin_role_management.sql`,
`202609270003_admin_role_concurrency_guard.sql`, and
`202609270004_admin_role_lint_cleanup.sql` were explicitly authorized and applied
without applying pending reward migration `202609270001_journal_growth_rewards.sql`.
They add admin-only account lookup and audited role changes, reject self-demotion and
last-admin removal, and serialize concurrent demotions. Remote schema lint reports no
warnings. Production currently has two registered accounts and two administrators;
verification did not mutate either role. `admin-notification-publish` v2 chooses delivery
server-side: in-app inbox is always persisted, while remote push is added only when the
dispatch capability is configured. The current canonical project has no NAVA dispatch
secret or APNs provider configuration, so the honest deployed capability is in-app only.
The same clean source `a0776643bfce7cf85ba7383f3a5ab13f61c21712` is deployed to
Sites v176 and GitHub Pages, with public provenance and authentication gates verified.

2026-09-27: migration `202609260001_admin_console.sql` was explicitly authorized and
applied without applying the still-pending `202609270001` reward migration. It adds
server-owned member/admin roles, audited reward-product publishing, admin notification
batches, and an admin-only product image bucket. The two accounts present at migration
time were bootstrapped as administrators; later registrations default to member. The
authenticated `admin-notification-publish` function is deployed. No APNs/FCM/HMS or
internal dispatch secrets are configured, so remote system push stays unavailable while
in-app broadcast remains the implemented path.
The same clean source commit `aaff1829286350ac3331645191b05b9abbe74ed7`
was released to Sites v173 and the GitHub Pages mirror; public provenance and
the compiled administrator entry were fetched successfully from both origins.

2026-09-27: explicitly authorized development-account reset completed. One Auth
account and four reward-ledger rows were removed along with all associated data;
48 account-owned public tables are empty. Schema/constraints/RLS/functions,
bucket configuration, public catalog and migration-history fingerprints were
unchanged. Recovery evidence is DPAPI-encrypted under
`Q:/NAVA-Workspace/Build/TestRuns/account-reset-20260927`; do not remove it.
New reward rules remain a proposal pending the user's rule choice. Migration
`202609270001_journal_growth_rewards.sql` has NOT been applied; do not infer new
reward behavior from the frontend v170 deployment or this data reset.

2026-09-20: user explicitly approved the reminder-settings schema migration.
`202609200001_reminder_timing_modes.sql` was the only dry-run candidate and was
applied successfully. It adds fixed/smart timing and exercise/face reminder types,
preserving existing enabled/time values and all health records. The expanded
read-only shared contract probe including `timing_mode` passed. Native delivery
and iPhone wake-lock behavior remain separate device acceptance gates.
Actual APP form login and Supabase RLS acceptance passed for all eight types,
fixed/smart mode, independent off and reload. All original preferences were
restored exactly; health writes were zero and existing activity was preserved.
Post-release acceptance also passed on Sites v163 and GitHub Pages, both using
source `233ee3e87baa5a3d889fba7ada476608b8c61973`. Each loaded 23 matching product
JS/CSS assets; both receipts confirm real login, canonical project, exact
preference restoration, no health writes, and preserved existing activity.

2026-09-15: user explicitly authorized `202609150002_independent_reminders.sql`.
Dry run selected only that CHECK expansion; push succeeded, and all 30 local/remote
migrations match. The shared read-only contract check passed. The real account's
APP reminder settings saved/read back independently and were restored; health
writes were blocked and the existing active session remained unchanged. This is
not evidence of native lock-screen delivery or all AI-provider routes. Subsequent
Sites v151 and GitHub Pages real-account tests both passed, with original reminder
settings restored and the same read-only health/activity boundary preserved.

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
