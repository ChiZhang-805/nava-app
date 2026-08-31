# NAVA Codex handoff — 2026-08-31

## 1. Purpose and authority

This document replaces reliance on one very large Codex conversation. It records
verified project state, durable product decisions, release provenance, known
human-only steps, and safe continuation rules as of 2026-08-31 (Asia/Shanghai).

Read in this order:

1. `Q:\NAVA-Workspace\nava-app\AGENTS.md`
2. this document
3. `README.md`
4. only the feature documents and source files relevant to the new request

The older `CODEX_HANDOFF_2026-08-29.md` is historical. Its v55/v56 deployment,
ahead/behind, and dirty-worktree statements are superseded.

## 2. Repository and workspace map

| Path | Role | Mutation rule |
| --- | --- | --- |
| `Q:\NAVA-Workspace\nava-app` | Private primary source repository | All product development happens here |
| `Q:\NAVA-Workspace\nava-app-preview` | Public compiled GitHub Pages mirror | Generated one-way from source; never edit as source |
| `Q:\NAVA-Workspace\Build\Sites\Packages` | Archived Sites packages | Evidence/staging only, not runtime source |
| `Q:\NAVA-Workspace\Build\TestRuns` | Cross-project test output | Use for new durable test evidence |
| `Q:\CodexData\Migration\NAVA-chat-recovery-2026-08-31.md` | Codex transcript recovery receipt | Preserved evidence; do not edit as project state |

Source Git state verified before this handoff:

- Branch: `main`
- Local HEAD and `origin/main`:
  `88df0cfb7197d19ba3b10a12bfd9c774decaf6a1`
- Commit title: `Reduce mobile startup latency with route splitting`
- Worktree: clean before handoff documentation edits
- Remote: `https://github.com/ChiZhang-805/nava-app.git`
- Repository is private; an anonymous GitHub request returns 404.

Preview Git state verified before this handoff:

- Branch: `main`
- Local HEAD and `origin/main`:
  `759f0f0090fd91e03ac653dac036024e9cfd5ee2`
- Commit title: `Publish NAVA preview v76`
- Worktree: clean
- Remote: `https://github.com/ChiZhang-805/nava-app-preview.git`
- `source.json` points to source commit
  `88df0cfb7197d19ba3b10a12bfd9c774decaf6a1`, release `v76`.

## 3. Public deployment state

### ChatGPT Sites

- Project ID: `appgprj_6a5de710811c8191af8ce2681358d518`
- Project title: `NAVA App`
- Access: public
- Live URL:
  `https://nava-app-preview-cz.chizhang1031.chatgpt.site`
- Latest and live version: 76
- Version 76 source commit:
  `88df0cfb7197d19ba3b10a12bfd9c774decaf6a1`
- HTTP check on 2026-08-31 returned 200.

### GitHub Pages

- Public repository:
  `https://github.com/ChiZhang-805/nava-app-preview`
- Live URL:
  `https://chizhang-805.github.io/nava-app-preview/`
- Published mirror commit:
  `759f0f0090fd91e03ac653dac036024e9cfd5ee2`
- Embedded source provenance: source commit
  `88df0cfb7197d19ba3b10a12bfd9c774decaf6a1`, release `v76`
- HTTP check on 2026-08-31 returned 200.

The hosting systems do not have byte-identical packaging: Sites serves an
inlined worker document while GitHub Pages serves static chunks. They are built
from the same source release and public Supabase configuration, so product
features, visual source, accounts, and persisted data are intended to match.
Every future product release must update and verify both sites from one source
commit.

No public deployment was performed while writing this handoff because no
business code changed.

## 4. Application architecture

- React 18 + TypeScript + Vite 8 frontend.
- Capacitor 7 iOS project with HealthKit, motion, speech, and Watch companion
  source contracts.
- Portrait mobile shell with hash routes for tabs, record modules, and nested
  views.
- Startup was split in v76: authentication renders before the authenticated App
  bundle, and large Records, AI, growth, and profile screens load lazily.
- Primary experiences include authentication, onboarding, Today, six record
  domains, AI conversation and confirmation cards, trends and weekly reports,
  growth tasks/rewards, profile, calendar, daily report, and detailed settings.
- The device-date hook refreshes date-dependent data when the local calendar day
  changes.

Important implementation roots:

- `src/AppBootstrap.tsx`: config, auth-first boot, lazy authenticated app.
- `src/App.tsx`: mobile shell, hash navigation, global interactions, lazy routes.
- `src/features/`: page and module UI.
- `src/services/`: Supabase records, AI, reports, dates, charts, rewards, media,
  native bridges, and presentation rules.
- `src/styles/figma-v2.css`: primary visual implementation.
- `supabase/functions/`: authenticated Edge Functions and AI harness.
- `supabase/migrations/`: append-only database contracts.
- `tests/`: presentation, routing, AI, extraction, and algorithm tests.

## 5. Authentication and shared data

Canonical Supabase project:

- Project ref: `wxteapvwagvhhtrjrbim`
- URL: `https://wxteapvwagvhhtrjrbim.supabase.co`
- `.env.review` is the public build source and keeps
  `VITE_ENABLE_REVIEW_DEMO=false`.

Verified production contract on 2026-08-31:

- public demo bypass disabled;
- current-tab session persistence through `sessionStorage`;
- email registration enabled with confirmation;
- `auth-account-status`, `aliyun-sms-send`, and `aliyun-sms-verify` preflight
  routes reachable;
- ChatGPT Sites and GitHub Pages both target the same project.

Consequences:

- Opening a public URL without a session shows the account/password page.
- A login in one browser tab is not deliberately copied to a new tab or a
  different browser; that user must log in again.
- Once authenticated, both sites read and write the same user-owned Supabase
  tables, so an account and its persisted records are shared across the sites.

Core persisted domains include `profiles`, `mood_records`, `sleep_records`,
`exercise_records`, `nutrition_records`, `focus_records`, `face_records`,
`tasks`, `ai_conversations`, `daily_rhythm_scores`, weekly reports, drafts,
notifications, health snapshots, growth rewards, badges, and private media.

Email OTP uses Supabase Auth. Mainland-China phone OTP uses the NAVA Aliyun SMS
functions but still converges on the same Supabase identity model. Reachability
does not prove real SMS delivery. Strict custom SMTP inspection also requires a
Supabase management access token and was not performed in this handoff.

## 6. AI and knowledge harness

The AI flow is not one unscoped prompt:

1. Extract structured records and detect one or more domains.
2. Route intent to sleep, exercise, mood, nutrition, focus, face, or rhythm.
3. Choose a bounded lookback of 1, 3, 6, 7, 14, or 30 days.
4. Load only the authenticated user's consent-authorized profile and matching
   recent records.
5. Invoke relevant knowledge tools and retain compact evidence and audit traces.
6. Calibrate estimates and produce a bounded final reply.

Current tools include USDA FoodData Central, a bounded common-serving nutrition
fallback, mood intensity rubric, AASM sleep reference, physical activity MET
reference, face-analysis diversity/bias safety references, and consent-gated
profile style policy. See `docs/AI_KNOWLEDGE_HARNESS.md`.

DeepSeek is the default real text-provider path when its server secret is
configured; a custom provider may override it. Provider keys remain in Supabase
Secrets. When a real provider is unavailable, the UI must say so rather than
pretending a model answered.

The displayed processing steps are staged product status text. They must not be
described or exposed as model chain-of-thought. Multi-domain input can create
multiple editable confirmation records. Reward feedback is shown only after the
user confirms and the record is saved.

## 7. Durable visual and interaction decisions

These decisions came from completed design iterations and should not be casually
reverted:

- Public entry is authentication-first; production never opens directly into a
  fake signed-in home state.
- The home hamburger controls the visibility of the three shortcut icons below
  it. It is horizontally aligned with the Today rhythm and points indicators.
- An upward swipe of roughly one-sixth of the screen opens the home semicircular
  action tray; tapping anywhere outside closes it.
- The home calendar opens a month view with previous/next month navigation and
  tappable daily visual reports. The profile shortcut opens detailed profile
  settings, not the AI page.
- Calendar summary labels and values stay on one line where space permits.
- Record overview cards use the established right-aligned icon-plus-text action
  style such as Add, Update, or Device.
- Sleep summary spacing places the timeline below the header and the legend
  between the visualization and score without clipping.
- Sleep editing is a one-screen mobile composition; the note field absorbs the
  lower free space so the main card approaches the fixed bottom navigation.
- Weekly reports roll from the device date. A small custom two-line swap icon
  toggles the trend curve and six-dimensional radar. Radar averages use recorded
  days only and render zero only when the entire week is missing.
- Single-line trend charts use the established soft area gradient where it
  improves readability; chart guides must be intentional rather than accidental
  scaling artifacts.
- When today's module data is absent, the AI insight area shows a centered crying
  mascot and a cute module-specific prompt. It does not generate or share a
  report as if today's data existed. Once today's record exists, normal insights
  and sharing return.
- AI processing steps each remain visible at least one second. The last step stays
  until the reply is ready, then clears when progressive text begins.
- AI recognition cards appear directly after the matching assistant message with
  conversation-consistent spacing. Points/reward celebration waits until Confirm
  Save succeeds.

Visual checks must cover at least 360x740, 375x812, 390x844, and 430x932 CSS
pixels, plus empty/populated states and fixed bottom navigation.

## 8. Completed release sequence since the old handoff

The current v76 lineage includes:

- data-driven health insights and charts;
- refined mood, focus, exercise, diet, face, and weekly report experiences;
- device-date rolling seven-day reports;
- missing-today mascot states and share gating;
- AI response flow, multi-record extraction, nutrition estimation, scoped intent
  routing, history context, consent-based style, and auditable knowledge tools;
- public repository rename to `nava-app-preview`;
- tab-scoped production authentication;
- weekly radar/curve switching and sleep layout work;
- unified record-card header actions;
- home calendar, daily report, shortcut menu, and advanced profile experiences;
- mobile startup route splitting and a smaller first-load path.

Do not repeat these as unfinished work without first reproducing a concrete bug.

## 9. Verified baseline

On 2026-08-31, `npm run verify` completed successfully:

- production build;
- ESLint;
- npm audit: 0 vulnerabilities;
- motion and mascot tests;
- rhythm and FDNB algorithm tests;
- AI prompt, routing, profile-consent, and review-origin tests;
- structured multi-record extraction tests;
- backend contract and frontend secret scan;
- Deno type checks for 16 Edge Functions;
- knowledge-tool and phone OTP security/signing tests: 12 passed;
- iOS project contract.

`npm run auth:verify:production` also passed the public project, demo-bypass,
tab-session, email-registration, and phone-function reachability checks. Custom
SMTP was not strictly inspected because no management token was supplied.

## 10. Remaining work and human-only boundaries

There is no known half-written product change in the main worktree. The next
Codex task should begin from a fresh user requirement, not invent a continuation
from the old transcript.

Known follow-ups that require user choice, credentials, hardware, or field tests:

1. **Phone OTP real delivery:** the user planned to sign in to Alibaba Cloud SMS
   so provider configuration, approved signature/template, secrets, and live
   delivery can be verified together. Never ask the user to paste secrets into
   chat or commit them.
2. **Email production delivery:** perform strict SMTP verification only when the
   user securely supplies the required management environment.
3. **Mobile latency field test:** v76 improved the startup path, but the friend's
   actual phone/network should retest both sites. Diagnose geography, DNS, asset
   caching, and network path from evidence before removing functionality.
4. **Custom domain:** the user owns a domain but its exact name and desired host
   are not recorded here. Domain/DNS configuration needs that choice and explicit
   publishing authorization.
5. **Production account history:** records are mutable external data. Do not
   assume which dates are filled. Use secure account audit/backfill scripts only
   on an explicit request and verify every affected domain and date.
6. **iPhone/Watch release:** Windows static contracts pass; signing, TestFlight,
   HealthKit hardware behavior, and creation of the watchOS target require Mac,
   Xcode, Apple Developer access, and real devices.

`docs/next-development-queue.md` is an older broad roadmap. It is useful for
long-term ideas but is not the current task list and contains items that may now
be partially or fully implemented.

## 11. Safe release procedure

For a user-authorized product release:

1. Inspect status and preserve unrelated work.
2. Implement and verify in `nava-app`.
3. Run relevant tests, then `npm run verify` and
   `npm run auth:verify:production` for a release candidate.
4. Commit and push the exact clean source state.
5. Build the GitHub Pages artifact and update `source.json` with the same source
   commit; copy it one-way to `nava-app-preview`, commit, and push.
6. Build/package Sites from the same source commit, save a version to the existing
   Sites project, and deploy that saved version.
7. Confirm the Sites live version source SHA, Pages `source.json`, both public
   HTTP responses, authentication entry, and key responsive screens.
8. Update this handoff when the release anchor changes.

Do not create a new Sites project, deploy only one site, use preview as source,
or report success solely because a command exited zero.

## 12. Codex task continuity

The previous Codex transcript reached about 206 MB and the desktop UI began
replaying an old in-progress turn while later local records still existed. The
recovery receipt is at:

`Q:\CodexData\Migration\NAVA-chat-recovery-2026-08-31.md`

Future tasks should use milestone-based handoffs:

- one coherent outcome per task, not one microscopic edit per task;
- keep related UI, data, tests, and dual-site release in the same task;
- start a new task after a major release or when the UI becomes slow/unreliable;
- update the repository handoff before switching;
- do not run two writers against the same checkout.

The handoff files, Git history, tests, and source are the durable memory. The old
chat transcript is recovery evidence, not the primary operating context.
