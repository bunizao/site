# 033 — Mood architecture: external-server dependency audit

Companion to plan 032. Full sweep of the mood implementation (site + site-api)
for anything that depends on the external VPS, prompted by the 2026-08-11 timer
death.

## Inventory

| Component | Runs where | Status | Failure visibility |
| --- | --- | --- | --- |
| Ingest (`/v2/webhooks/telegram`) | Worker | serverless | Telegram retries; posts missing is loud |
| Read path (D1 archive + live t.me merge) | Workers | serverless | — |
| v1 image proxy (`image.buxx.me`, embed scrape) | Worker | serverless | — |
| v2 media proxy (R2 → Bot API fallback) | Worker | serverless | — |
| Stats refresh, sentiment, notify crons | Worker | serverless | — |
| **`mood-reconcile`** (previews, tombstones, watermarks) | **VPS systemd** | dead since 08-11 | silent (bare links) — plan 032 |
| **`mood-media-sync`** (media → R2 archive) | **VPS systemd** | **presumed dead since 08-11 — verify** | mostly silent (Bot API fallback masks it) |
| `/v2/webhooks/telegram/deletions` endpoint | Worker (signed) | **orphaned** — no caller in either repo; predates the reconciler | n/a |
| Ops health tests | GitHub Actions, hourly | not the VPS | **ineffective — see below** |

Third-party (not the VPS, listed for honesty): Telegram itself (webhook, Bot
API, t.me scraping), OpenAI (sentiment), GitHub Actions (ops schedule).
Backfill/configure scripts under `scripts/` are manual one-offs, not standing
dependencies.

## Finding 1 — `mood-media-sync` is the second VPS dependency

`site-api/scripts/mood-media-sync/` is a second systemd timer on the same
box: MTProto streams original media into the `mood-images` R2 bucket
(`/v2/mood/media-sync/work` → upload → `/v2/mood/media-sync/report`). It
exists because Bot API `getFile` refuses downloads above 20 MB, and media
archiving must not share the reconciler's one-MTProto-read budget.

If the box died on 08-11, this timer died too. Degradation chain
(`telegram-media-proxy.ts`): R2 miss → D1 fileId → Bot API `getFile` proxy.

Consequences while it is down:

- Photos and media ≤ 20 MB: served live from Telegram — looks fine, **but
  nothing is archived**. Delete the Telegram post and the media is gone;
  the archive's durability promise is silently void.
- Media > 20 MB (long videos): `getFile` fails → `mediaUnavailable`. Broken
  today for any such post since 08-11.
- D1 media generations stuck `pending` forever; versioned immutable cache
  URLs never materialize.

Verify on the box: `systemctl status mood-media-sync.timer`, or count
`mood_media_objects` rows stuck in `pending` with old creation dates.

## Finding 2 — the monitoring verified the past, not the pipeline

`ops-health.yml` runs hourly in GitHub Actions and includes
`mood-media-rendering-health.test.ts` — which pins June posts 3608/3609/3618.
Those were archived before the outage, so the suite stayed green for 18 days
while every new post degraded. Pinned fixtures prove "what once converged
still serves"; they can never catch "the pipeline stopped converging".

Fix (extends plan 032 part 3): freshness invariants, not fixtures —

- `MAX(last_verified_at)` age (plan 032).
- Oldest `needs_preview` row age (plan 032).
- Oldest `pending` media generation age, and any `deferred-large` backlog.

Expose them on the existing authenticated mood health report and assert them
from the ops suite; alert via ops bot from the hourly cron. Keep the pinned
tests — they catch rendering regressions — but they are not pipeline monitors.

## Finding 3 — orphaned signed endpoint

`/v2/webhooks/telegram/deletions` (telegram-delete-sync.ts) has no caller in
either repo; the reconcile report supersedes it. Retire it with the other
reconcile endpoints in plan 032 step 5 (docs internal page in the same PR).

## Serverless direction for media-sync

The 20 MB Bot API limit splits the problem:

1. **≤ 20 MB (nearly all content): in-Worker.** On ingest (webhook
   `waitUntil`, with the 15-min cron as catch-up for missed ones): Bot API
   `getFile` → stream body into `R2 put` with known content length → mark
   generation `ready`. Retirement work is a plain R2 `DeleteObject` from the
   Worker. No MTProto, no VPS. Workers memory (128 MB) comfortably streams
   20 MB.
2. **> 20 MB: measure before designing.** Count affected posts first
   (`mood_media_objects` by size). If rare: mark `deferred-large`, alert
   through the hourly monitor, handle manually (or re-post compressed). If
   common: GitHub Actions cron running the existing `media-sync.mjs`
   unchanged (MTProto session in repo secrets) — same trade-offs as the
   rejected reconcile alternative, but here MTProto is genuinely required,
   so the external runner earns its keep. Decide on data, not taste.

End state: zero VPS. Worker handles previews, verification, tombstones, and
all normal media; the only conditional external piece is a GH Actions job for
oversized files, if the data says it is needed.

## Order

1. Verify media-sync timer status and pending-generation backlog (data first).
2. Plan 032 implementation (previews + verification + alerts) — unblocks the
   visible breakage.
3. In-Worker ≤ 20 MB media archiving; retire the VPS timer.
4. Size the > 20 MB tail; add the GH Actions runner only if justified.
5. Retire orphaned deletions endpoint alongside plan 032 step 5.
