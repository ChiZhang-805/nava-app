# NAVA current Codex handoff

Current handoff date: **2026-09-05**

The authoritative current handoff is:

- [`CODEX_HANDOFF_2026-09-05.md`](./CODEX_HANDOFF_2026-09-05.md)

Read it together with the repository-level [`AGENTS.md`](../AGENTS.md), then
follow its links to the 2026-09-03 and 2026-09-02 baselines when changing the
affected area. Older dated handoffs are historical evidence rather than the
current release state.

Current public release anchor:

- Source release commit: `60f877cbb6f6ea2a40fad576a164183b06c1c3a9`
- ChatGPT Sites: version 96, public
- GitHub Pages mirror: v96 at
  `419a8bd7590a4d64f3f6d61700f172a18aa9543b`
- Canonical Supabase project: `wxteapvwagvhhtrjrbim`

The six Health Report cards now keep four complete lines at every required
portrait viewport. Release verification includes element-level clipping,
intersection, safety-gap, overflow, and excessive-whitespace checks for both
populated and empty local states plus the authenticated public state on both
origins.

Version 91 keeps the v90 responsive layout while reducing repeated Supabase
reads, lazily loading record-detail code, and shrinking lossless mascot media.
Version 92 fixes the post-login blank-form flash by preserving the submitted
form until the authenticated destination is ready. Version 94 redesigns the
mood, sleep, diet, focus, and face record editors. Version 95 tightens their
short-screen geometry, removes a diet-page gap, and prevents face-insight text
from being clipped. Version 96 adds real profile-avatar capture/library upload,
a functional profile menu, simplified focus setup, compact face-mode icons, and
target-page-specific record-editor skeletons. The strict four-viewport gates and
real-account checks pass on both public origins.

The dual normal/compact AI-report contract and dish-level diet-recognition prompt
are implemented in source. The three changed Edge Functions have **not** been
deployed because backend deployment requires separate explicit authorization.
See the dated handoff for the exact boundary and remaining action.
