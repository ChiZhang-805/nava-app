# NAVA current Codex handoff

Current handoff date: **2026-09-05**

The authoritative current handoff is:

- [`CODEX_HANDOFF_2026-09-05.md`](./CODEX_HANDOFF_2026-09-05.md)

Read it together with the repository-level [`AGENTS.md`](../AGENTS.md), then
follow its links to the 2026-09-03 and 2026-09-02 baselines when changing the
affected area. Older dated handoffs are historical evidence rather than the
current release state.

Current public release anchor:

- Source release commit: `3ceaad3f1c7720fe0bfa9bcf7c26ea9bad6eb2fc`
- ChatGPT Sites: version 91, public
- GitHub Pages mirror: v91 at
  `cd5fbfcc59c9ba4f0eedc1286c0c36c72203b2af`
- Canonical Supabase project: `wxteapvwagvhhtrjrbim`

The six Health Report cards now keep four complete lines at every required
portrait viewport. Release verification includes element-level clipping,
intersection, safety-gap, overflow, and excessive-whitespace checks for both
populated and empty local states plus the authenticated public state on both
origins.

Version 91 keeps the v90 responsive layout while reducing repeated Supabase
reads, lazily loading record-detail code, and shrinking lossless mascot media.
Both public origins passed authenticated 360/375/390/430px acceptance checks.

The dual normal/compact AI-report contract is implemented in source. The two
changed Edge Functions have **not** been deployed as part of v89/v90/v91 because
backend deployment requires separate explicit authorization. See the dated
handoff for the exact boundary and remaining action.
