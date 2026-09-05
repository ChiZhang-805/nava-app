# NAVA current Codex handoff

Current handoff date: **2026-09-05**

The authoritative current handoff is:

- [`CODEX_HANDOFF_2026-09-05.md`](./CODEX_HANDOFF_2026-09-05.md)

Read it together with the repository-level [`AGENTS.md`](../AGENTS.md), then
follow its links to the 2026-09-03 and 2026-09-02 baselines when changing the
affected area. Older dated handoffs are historical evidence rather than the
current release state.

Current public release anchor:

- Source release commit: `c01b7fab4cffb987416e9c2df1c6d1e49391cfcc`
- ChatGPT Sites: version 95, public
- GitHub Pages mirror: v95 at
  `8e95241418ebbc4d6590d6ef4d6f1919a0f90c64`
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
from being clipped. The strict four-viewport gates and real-account checks pass
on both public origins.

The dual normal/compact AI-report contract and dish-level diet-recognition prompt
are implemented in source. The three changed Edge Functions have **not** been
deployed because backend deployment requires separate explicit authorization.
See the dated handoff for the exact boundary and remaining action.
