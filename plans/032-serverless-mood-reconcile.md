# 032 — Serverless mood reconcile

## Problem

The mood archive convergence pipeline (link preview unfurl, deletion tombstones,
reply-edge repair, `last_verified_at` watermarks) runs as `mood-reconcile.mjs`
on an external server under a systemd timer. That server is unreliable: the
timer died on 2026-08-11 and, because the read path degrades gracefully
(`fallback=0` renders bare links instead of cards), the outage was invisible
for 18 days. Two structural defects:

1. A single external machine is a hard dependency for a Cloudflare-native site.
2. Graceful degradation with no paired monitor turns pipeline death into
   "product behavior".

## Core insight

The external prober has three responsibilities, and only one of them actually
needs the external machine:

| Responsibility | Mechanism | Needs MTProto? |
| --- | --- | --- |
| Link preview unfurl | Plain HTTPS scrape of `t.me/<slug>/<id>?embed=1` | No |
| Deletion detection | `channels.GetMessages` → `MessageEmpty` | Yes (as built) |
| Reply-edge repair | Same MTProto response | Yes (as built) |

Bot-authorized MTProto returns `WebPageEmpty` for previews, so the card content
was *never* coming from MTProto — `reconcile.mjs` already scrapes the public
embed page over plain `fetch`. And every building block of that pipeline is
already deployed inside the site-api Worker:

- `fetchTelegramHtml` fetches `t.me/<slug>/<id>` pages in prod today
  (`src/features/mood/server/telegram-fallback-repository.ts`), proving
  Cloudflare egress → t.me works.
- The same file parses `.tgme_widget_message_link_preview` cards with a real
  DOM parser (line ~976).
- `handleDue` computes the `needs_preview` predicate in SQL
  (`src/features/mood/ingest/mood-reconcile.ts:144`).
- `handleReport` writes `link_previews` and stamps `last_verified_at`.

The external server's entire contribution to previews is the systemd timer.
Cloudflare Cron Triggers (already configured: `*/15 * * * *` and hourly)
replace it outright.

## New architecture

One Worker, closed loop, three parts. All changes land in site-api; the site
repo needs no code change — once D1 rows carry real previews, cards render.

### 1. Preview refresh + aliveness probe (cron `*/15`)

A scheduled task in the existing `runScheduled` dispatch:

- Select due rows with the existing due-query logic called as a function
  (no more HMAC-signed HTTP round trip to ourselves): recent-48h partition
  first, stalest `last_verified_at` second, either partition donates unused
  capacity. Budget ~20 fetches per run.
- For each id, fetch `t.me/<slug>/<id>?embed=1&mode=tme` via
  `fetchTelegramHtml`. One fetch yields three signals:
  - message widget present → **alive**: stamp `last_verified_at`;
  - `needs_preview` row and card markup present → extract via the existing
    fallback-repository parser, write `link_previews`;
  - reply widget present → repair `reply_to` edge;
  - error widget / no message → **dead candidate** (see part 2).
- Write through the existing report logic as an internal call.

Throughput honesty: ~80 verifications/hour vs MTProto's 100-per-single-call.
A full sweep of ~3800 posts takes ~2 days instead of hours. Irrelevant at this
channel's scale; the recent-48h partition keeps fresh posts converging in one
or two ticks.

### 2. Tombstones: two-round confirmation

The embed page's "post not found" state is a weaker deletion signal than
MTProto's `MessageEmpty` — t.me markup changes, throttling, or a channel
privacy flip could all fake it. Compensate with conservatism:

- A dead candidate is recorded (`dead_seen_at` or equivalent), not tombstoned.
  Tombstone only when a second, later run confirms it.
- Keep the safety valve: if one run produces more dead candidates than the cap
  (default 25), record nothing dead and alert — that pattern is a probe
  malfunction, not a mass deletion.
- Verify the exact "deleted post" embed markup against a fixture before
  trusting it (delete a test post, capture the HTML, pin the parser to it).

### 3. A monitor that screams (cron hourly)

The actual lesson of the incident. The hourly cron checks two invariants and
alerts through the ops bot (`TELEGRAM_OPS_BOT_TOKEN`, already wired for flood
gate alerts):

- `MAX(last_verified_at)` older than 24h → "reconcile pipeline is dead".
- Oldest `needs_preview` row older than 24h, or backlog above a threshold →
  "previews are not converging".

Every graceful-degradation path must have a paired alarm; this is the pairing.

## What gets retired

- `scripts/mood-reconcile/` (script, systemd unit and timer, MTProto session
  state), plus the `TG_API_ID` / `TG_API_HASH` server-side credentials.
- The `/v2/mood/reconcile/due` and `/v2/mood/reconcile/report` HTTP endpoints,
  once the in-Worker path has run clean for a week. Update `/docs` internal
  page in the same PR (docs-coverage guard).
- `MOOD_RECONCILE_PRIORITY_IDS` — unnecessary: the 62 unverified rows sort
  first in the stale partition and the three bare-URL posts (3765/3771/3779)
  are `needs_preview`, so the first cron tick fixes them.

## Rejected alternatives

- **GitHub Actions cron running the existing script.** Rejected outright
  (owner decision: GH Actions schedule reliability is not acceptable). If
  embed-probe false positives ever prove unacceptable, the fallback is not a
  timer anywhere — it is the staleness alert plus a manual oneshot run of
  `reconcile.mjs` from a laptop. The script is already a oneshot; only the
  systemd wrapper dies.
- **GramJS inside the Worker (MTProto over WebSocket).** Technically plausible,
  operationally a joke. No.
- **Read-path live merge (`fallback=1`).** Moves the external dependency from
  write time to every request, pays t.me latency per page view, and defeats
  the archive's purpose.
- **Queue-on-ingest unfurl.** Only improves new-post preview latency from
  ≤15 min to ~30 s at the cost of a consumer and delivery-delay tuning. Not
  worth it now; easy to add later if the latency ever bothers.

## Open decisions

1. **Tombstone confirmation policy** — two consecutive dead rounds is the
   proposal; the gap between rounds (one tick? one hour?) trades deletion
   latency against false-positive resistance.
2. **Alert thresholds** — 24h watermark staleness and the needs_preview
   backlog cap are placeholders; pick values that would have caught the
   2026-08-11 outage within a day.

## Implementation order (site-api)

1. Extract embed-page fetch + card/reply/alive parsing into a reusable module
   (parser already exists in the fallback repository; add the embed entry).
2. Scheduled task on `*/15`: due selection → probe → internal report write.
3. Two-round tombstone confirmation + safety valve carry-over.
4. Hourly staleness alerts via ops bot.
5. Run one week with the systemd timer left stopped as control; then delete
   the script directory, endpoints, secrets, and update docs.
