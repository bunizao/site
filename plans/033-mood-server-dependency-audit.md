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
| **`mood-reconcile`** (previews, tombstones, watermarks) | **VPS systemd** | stuck `activating` since 08-11 (confirmed 08-29) | silent (bare links) — plan 032 |
| **`mood-media-sync`** (media → R2 archive) | **VPS systemd** | **never deployed** (confirmed 08-29: unit not-found, `/opt/mood-media-sync` absent) | fully silent (Bot API fallback has carried it since launch) |
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

Confirmed 2026-08-29: it was never deployed at all — no unit, no `/opt`
directory, no process. Media archiving has never run. Degradation chain
(`telegram-media-proxy.ts`): R2 miss → D1 fileId → Bot API `getFile` proxy.

Consequences (standing since launch, not since 08-11):

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

## Division of labor (revised 2026-08-29)

Owner decisions: no GitHub Actions schedulers, no manual laptop runs. The
VPS stays for what only MTProto can do — hardened until it deserves trust —
and the Worker owns everything user-visible, so a VPS outage can never again
break the site, only delay archival durability.

1. **≤ 20 MB media (nearly all content): in-Worker, primary.** On ingest
   (webhook `waitUntil`, 15-min cron as catch-up): Bot API `getFile` →
   stream into `R2 put` with known content length → mark generation `ready`.
   Retirement is a plain R2 `DeleteObject`. Workers memory (128 MB)
   comfortably streams 20 MB. Durability stops depending on the VPS.
2. **VPS `mood-media-sync` (first actual deployment, hardened): the sweep.**
   Handles whatever is still `pending` — in practice the > 20 MB tail plus
   anything the Worker missed. No protocol change: the signed work endpoint
   simply stops handing out items the Worker already archived.
3. **VPS `mood-reconcile`: revive now, retire later.** The timeout fix below
   restores previews and watermarks immediately. Once plan 032's in-Worker
   path runs clean for a week, retire it and scope the VPS to media only.
   Keeping it for the stronger MTProto deletion signal is defensible; fewer
   moving parts on a box with this track record wins.

## VPS reliability engineering

Incident mechanics first, so fixes map to causes: with `Type=oneshot` and no
`TimeoutStartSec`, a hung ExecStart keeps the unit `activating` forever —
and a systemd timer does not trigger a unit that is already activating, so
every later tick is silently skipped. One hung MTProto connect (2026-08-11)
froze the pipeline for 18 days. The freeze was not "stopped running"; it was
"still running, therefore never re-run". Post-mortem detail from the kill on
08-29: the hung process had consumed **2w 3d 16h of CPU** — a GramJS
reconnect loop spinning at full burn, not a passive socket wait. A spinning
loop can starve in-process guards, which is why the external
`TimeoutStartSec` is the primary defense and the in-script watchdog only the
second layer. Note `Type=oneshot` defaults `TimeoutStartSec` to *infinity* —
the drop-in is mandatory, not optional hardening. After the kill, the
pending timer trigger fired immediately and the run completed in 3 s:
verified 100, previews 3 (posts 3765/3771/3779 confirmed healed in the
archive read path).

Checklist, both units:

- **`TimeoutStartSec=`** — 180 for reconcile, 1800 for media-sync (long
  uploads are legitimate). A hung run becomes a *failed* run; the next timer
  tick starts fresh. This one line prevents the entire incident class.
- **In-script hard watchdog** as the second layer: arm a kill timer at start
  (`setTimeout(() => process.exit(3), BUDGET)`), clear it on success. GramJS
  sockets are notorious for keeping a wedged event loop alive past
  `disconnect()`.
- **Timer hygiene**: `Persistent=true` (catch up runs missed across
  reboots), small `RandomizedDelaySec`.
- **`OnFailure=ops-alert@%n.service`** — a two-line unit that posts the
  failed unit name to the Telegram ops bot. The box screams on failure.
- **Worker-side dead-man switch stays authoritative** (plan 032 part 3, plus
  a `pending`-generation age check): the box screaming covers failed runs;
  the Worker alerting on *silence* covers the box dying, network loss, and
  stuck-activating. Two alarm paths, one per failure geometry — OnFailure
  cannot fire from a dead box, and the dead-man switch cannot name the
  failing unit.
- **Clock sync verified** (`timedatectl`): work/report auth is
  HMAC-over-timestamp; clock drift presents as mysterious 401s.

## Order (updated)

1. Unstick reconcile on the box: kill the hung run, read the journal to see
   where it hung, add the `TimeoutStartSec` drop-in, restart the timer. The
   62-post backlog and the three bare-link posts self-heal.
2. Plan 032 in-Worker path + dead-man alerts — ship in the same PR.
3. In-Worker ≤ 20 MB archiving.
4. Deploy hardened media-sync on the VPS (state backfill per its README;
   inspect the first work batch before enabling the timer).
5. After a clean week: retire VPS reconcile, the reconcile HTTP endpoints,
   and the orphaned deletions endpoint; update docs in the same PR.
