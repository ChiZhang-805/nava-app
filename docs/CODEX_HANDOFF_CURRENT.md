# NAVA current Codex handoff

Current handoff date: **2026-09-02**

The authoritative full handoff is:

- [`CODEX_HANDOFF_2026-09-02.md`](./CODEX_HANDOFF_2026-09-02.md)

Read it together with the repository-level [`AGENTS.md`](../AGENTS.md) before
changing code. The new handoff explicitly points back to the 2026-08-31 full
architecture and release baseline. Older dated handoffs are historical evidence.

Current release anchor:

- Source commit: `5e1efe81de9950cb054c469a987995501a911052`
- ChatGPT Sites: version 80, public
- GitHub Pages mirror release: v80 (`a9de53240480978b398e2f36d50fbf47e8aa21c2`)
- Canonical Supabase project: `wxteapvwagvhhtrjrbim`
- The 2026-09-02 PRD gap-closure and audit-fix batches are verified and deployed to both public sites.

Current continuation:

- Sections 9 through 11 of the dated handoff record the full-code audit, the
  real-data/natural-week corrections, the grounded AI health-report batch, and
  the dual-site v80 verification.

- Weekly report rows now open a detailed long-form explanation sheet backed by
  a strict real-model JSON contract. Production accepts only DeepSeek output;
  fixed demo prose is development-only and visibly labeled.
- The health-report harness computes bounded, same-date cross-module
  correlations from the authenticated user's consent-authorized persisted
  records. It requires enough overlap, forbids causal claims, caps confidence,
  and rejects invented numeric evidence.
- Face analysis now returns model-derived makeup level and confidence, asks for
  confirmation when the selected capture mode conflicts with a confident model
  result, and keeps interrupted photo drafts encrypted in IndexedDB with a
  tab-scoped AES-GCM key.
- Focus todo planning now persists its scheduled time, per-session minutes, and
  planned session count. Completion is based on actual saved focus records, not
  a local fake checkmark.
- Backend migration `202609020001_focus_todo_plan.sql` is applied. Production
  `ai-health-report` is active at version 7 and `face-analyze` at version 14.
- `npm run verify`, `npm run weekly-report:test`, `npm run backend:test`,
  `npm run interaction:test`, `npm run auth:verify:production`, and
  `npm run prd-batch:test` all passed. The public v80 sites passed local
  headless Playwright at all four required viewports with real auth-first entry,
  no console/page errors, and no horizontal overflow.
