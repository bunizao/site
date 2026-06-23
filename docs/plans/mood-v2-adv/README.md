# Mood V2 Advanced — Phased Execution Plan

Execution plans for [`MOOD-V2-ADV-PRD.md`](../../MOOD-V2-ADV-PRD.md). Read the PRD for
architecture, data model, and invariants. Each phase below is **independently shippable and
verifiable** — small steps, not a big bang. Do them in order; later phases assume earlier ones
are merged.

| Phase | File | Ships | AI? | Depends on |
| --- | --- | --- | --- | --- |
| 0 | [`phase-0-foundations.md`](./phase-0-foundations.md) | contracts + D1 migration `0003` | no | — |
| 1 | [`phase-1-tags.md`](./phase-1-tags.md) | click-to-filter tags, end to end | no | P0 |
| 2 | [`phase-2-activity-analytics.md`](./phase-2-activity-analytics.md) | `/mood/stats` minus sentiment | no | P0 |
| 3 | [`phase-3-ai-sentiment.md`](./phase-3-ai-sentiment.md) | AI stack + model selector + sentiment timeline + backfill | yes | P0, P2 |
| 4 | [`phase-4-dev-portal.md`](./phase-4-dev-portal.md) | ingest health + FTS search console | no | P0 |

## Conventions

- **Two repos.** `site` = canonical/public; `site-api` = private (D1/KV/ingest/cron/admin/AI).
  Each step notes its repo.
- **Contracts** are edited in `site` first, then `bun run sync:contracts` in `site-api`. Copies
  stay byte-identical.
- **Gates per step:** `bun run check`, `bun run test:unit`, `bun run build`. UI steps may add
  `bun run test:e2e:site`.
- **Invariants** from PRD §10 apply to every phase — public path never touches D1, AI only at
  ingest/backfill/cron, BYOK key server-side only, empty-data correctness.

## Suggested PR boundaries

One PR per phase (P0–P4). Phases 1 and 2 can be developed in parallel after P0 merges; phase 3
needs P2's snapshot/aggregation in place; phase 4 only needs P0.
