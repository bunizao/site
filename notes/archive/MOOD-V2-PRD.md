# Mood API Taxonomy

Status: **supersedes the D1-first v2 migration PRD** (2026-06-17) · Owner: bunizao

## Decision

- **v1 is the live Telegram mirror.** It is real-time and canonical for user-facing mood reads.
- **v2 is the D1 archive / structured read.** It is non-canonical and exists for search, AI, debugging, and operational inspection.
- `?api-v2=true` is migration scaffolding. Treat it as deprecated and remove it from canonical docs, RSS/oEmbed URLs, and public link expectations.
- `api.buxx.me` is machine ingress, not the canonical public API surface.

## Why Reads Stay Live

D1 populates mutable fields (`comments_count`, reactions, views) once at ingest from the Telegram
webhook payload and does not refresh them in real time. The live v1 mirror reads the current
Telegram surface, so comment counts, reactions, and media stay current.

Real-time interaction is a hard requirement. Once a live Telegram fetch is mandatory, serving
user-facing reads from D1 buys nothing on the read path. D1 remains valuable as a backup and
queryable structured archive for search, AI, debugging, reconciliation, and ops.

## Current Taxonomy

| Surface | Path family | Role | Canonical for users |
| --- | --- | --- | --- |
| Mood pages | `/mood`, `/mood/[id]`, `/mood/rss.xml`, `/mood/embed` | User-facing pages and feeds | Yes |
| Public compatibility JSON | `/api/moods`, `/api/comments` | Browser-facing data used by the public site | Yes |
| v1 machine mood API | `/api/v1/mood*` | Live Telegram mirror, real-time comments/reactions/media | Yes, as the upstream read source |
| v2 machine mood API | `/api/v2/mood*` | D1 archive / structured read for search, AI, debug, and ops | No |
| Machine ingress host | `api.buxx.me` | Webhooks, notify, image ingest/proxy, archive reads, internal automation | No |

The public site should document and generate canonical user-facing links without `api-v2`.
Archive reads can expose structured D1 payloads, but they must not be described as the live mood
feed or as a replacement for the realtime v1 mirror.

## What Changed From the Old PRD

The old plan targeted a D1-first cutover where the public site would eventually read all mood
surfaces through structured v2 data and keep the live Telegram scrape as fallback. That is no
longer the target.

The part that remains useful is the archive pipeline:

- ingest Telegram webhook updates into D1
- keep structured columns for media, entities, forwards, replies, reactions, and raw payloads
- expose archive reads for search, AI, debugging, reconciliation, and ops
- keep media/image ingress available to support rendered pages

The part that is explicitly retired:

- flipping default user-facing reads to D1
- asserting v1/v2 visual or field parity as the production health signal
- keeping `?api-v2` as a permanent public backend selector
- documenting `api.buxx.me` as the canonical public API

## Test Intent

Ops tests should now prove two separate things:

- **Canonical live health:** `/api/moods` returns non-empty realtime mood data from the live v1
  source, including valid ids and at least one user-visible content signal such as text, media,
  reactions, or comment counts.
- **Archive smoke:** when the v2 archive route exists, `/api/v2/mood*` returns parseable structured
  archive data. This should be a smoke test only; it should not require parity with live v1 or
  treat archive data as user-facing truth.

If the archive route is not implemented in the current branch, leave the assertion opt-in or mark
the required future check clearly. Do not guess the contract from old `?api-v2` behavior.

## Implementation Cleanup

- Remove `?api-v2` propagation from UI links, RSS, oEmbed, and agent markdown.
- Remove `MOOD_API_V2_DEFAULT`; the source decision belongs to explicit route families, not a runtime default.
- Align implementation routes with `/api/v1/mood*` live and `/api/v2/mood*` archive semantics.
