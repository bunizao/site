# Plan: Dev Portal Rework + Telegram Ops Bot

Status: approved roadmap (2026-07-19). Tracks the portal redesign, the newsletter
flood gate, the Telegram ops bot, analytics charts, and the (deferred) blog editor.

Implementation note (2026-07-31): Phase 1 and the per-article analytics endpoint
are shipped. Current `site-api/main` also has the webhook-secured `/overview`
command and durable broadcast confirmation. Remaining backend work is system
alerts, a portal-originated bot confirmation boundary, publishing confirmations,
and event reminders. The stale `feat/telegram-ops-bot` long-polling branch is
reference material only; do not merge or cherry-pick it.

## Core architecture principle: one API, two clients

Every admin capability (subscribers, broadcasts, alerts, notify gate, event
reminders) is implemented once in **site-api**, with the contract defined in
`packages/contracts/src/telegram-ops.ts` (this repo is canonical; run
`bun run sync:contracts` in `../site-api` after edits). **The portal is the
desktop client, the bot is the pocket client** — same endpoints, shared
authorization and audit logging.

Security boundary: the ops bot uses a **dedicated bot token, dedicated webhook
path, Telegram user ID allowlist, and webhook secret header** — fully isolated
from the mood-ingest bot. One mirrors a public channel; the other can mass-email
subscribers and trigger broadcasts. Different blast radius, no shared credentials.

---

## Phase 1 — Newsletter flood gate + bot foundation (site-api)

Highest priority: the only item causing active harm. Rapid mood posting floods
`immediate` subscribers with one email per post.

Root cause (located): `telegram-webhook.ts` enqueues one notify job per channel
message; the queue consumer in `worker-tasks.ts` unconditionally calls
`dispatchMoodNotification` per postId. Digest subscribers are naturally immune
(window-based batching in `digest.ts`); only the `immediate` path needs a gate.

Changes:

1. **D1 migration**: `notify_gate` (single-row state machine: `open | held`,
   rolling timestamps of recent dispatches, alert dedup marker) and
   `notify_held_posts` (held postId queue).
2. **Gate logic**: checked inside `dispatchNotifyQueue` before dispatch.
   Rule: **>= 3 mood posts within a rolling 30 minutes -> flip to `held`**.
   Held jobs are written to the table and acked (queue retries have a cap and
   fall into the DLQ — not a holding area).
3. **Ops bot webhook** (new site-api route): secret validation + user ID
   allowlist + inline keyboard callback handling.
4. **Alert**: on gate flip the bot sends one deduplicated message —
   "N mood posts in 30 min, immediate notifications held" — with buttons:
   **[Send as one digest] [Send individually] [Drop, wait for next digest]**.
5. **Execution**: button callback -> admin endpoint `/notify-gate/release`.
   Merged send reuses the `sendMoodDigestEmail` rendering pipeline.
6. **Timeout fallback**: no decision within 6 hours -> auto-send merged digest
   (hooked onto the existing scheduled notify cron). Dropping content is the
   real incident; a merged digest is the gentlest default.
7. **Contract**: add `/notify-gate` paths plus `GateState` / `GateDecision`
   types to `telegram-ops.ts`.

Default parameters (adjustable): threshold 3 posts / 30 min, timeout 6 h,
timeout action = merged digest.

Testing: gate state machine unit tests; release endpoint covered in the
`service.e2e.test.ts` suite.

Open decision point: the `isFlood()` predicate itself (pure function, ~10
lines) — rolling window semantics and whether blog posts count toward the
threshold.

## Phase 2 — Portal shell rework (site)

Foundation for all UI work. Direction: standalone-tool aesthetic
(Linear/Vercel-style) — 13px base size, density discipline, grayscale hierarchy
instead of decorative borders.

1. **`portal.css` token layer**: `--portal-text-{xs,sm,base}` (11/12/13px),
   4px spacing base, three-level surface grays, one shared ease. Scoped under
   `.theme-portal`, never global (reuse the `/components` scoped-token
   approach).
2. **PortalLayout v2**: extract nav into `portal-nav.ts`; add a
   `chrome: 'full' | 'bare'` prop — `bare` is the fullscreen no-sidebar variant
   reserved for the future editor. This is the editor's entire upfront
   investment.
3. **Four semantic components** absorb all ad-hoc styles: `StatCard`,
   `PageSection`, `DataTable`, `EmptyState`. shadcn Card stays as the
   primitive layer.
4. **Migrate every page**, delete all inline styles. **BroadcastConsole keeps
   its logic untouched — reskin only.**
5. Newsletter page gains a **gate status card**: `open / held (N posts)` plus
   the same three release actions as the bot (second client of the same API).

## Phase 3 — Analytics charts (site + site-api)

1. **Time series**: shadcn charts (Recharts) over the existing `daily` data —
   views/reads/visitors area chart.
2. **Range switching**: 7/30/90 d with previous-period comparison. Verify the
   summary endpoint's `days` parameter is actually variable; extend if not.
3. **Newsletter funnel**: sent -> open -> click, per-campaign comparison.
4. **Per-article drilldown**: `analytics/[slug]` page — per-article traffic
   curve, referrers, completion distribution. **Requires a new site-api
   endpoint** (per-slug daily series; only aggregate rows exist today).

## Phase 4 — Bot command surface (site-api)

Foundation lands in Phase 1; this phase only adds commands:

1. `/overview` — `TelegramOpsOverview` from the contract (subscriber counts,
   recent broadcasts).
2. **Broadcast confirmation flow**: compose + preview in the portal -> bot
   receives a confirmation request (with `audienceFingerprint`) -> confirm send
   from the phone. The contract's two-step confirm design exists for this. The
   portal's BroadcastConsole keeps its full send capability; bot confirmation
   is an optional hardening path, not a replacement.
3. **System alerts**: cron failures, `test:ops` health check anomalies,
   non-empty queue DLQ -> push to bot.
4. **Content publishing entry**: blog publish notifications and mood re-sends
   confirmed from the bot.
5. Event reminders (`AdminEvent` + reminders from the contract) — already
   defined, lowest priority.

## Phase 5 — Blog editor (roadmap only, no work)

Decision: **not now, no pre-research either.** Koenig
(`@tryghost/koenig-lexical`) embeds standalone but outputs Lexical JSON with
the renderer living in Ghost — "editor UI only" means writing through the Ghost
Admin API (days), "full replacement" means owning the rendering pipeline + R2
media (weeks). Trigger: the day Ghost becomes genuinely unbearable. The
`chrome: 'bare'` route will be waiting.

---

## Execution order and repo split

| Phase | Repo | Depends on |
|---|---|---|
| 1. Flood gate + bot foundation | site-api + contracts | — |
| 2. Portal shell | site | — (parallel with 1) |
| 3. Analytics | site + site-api | 2 |
| 4. Bot command surface | site-api | 1 |
| 5. Editor | — | deferred indefinitely |

Cross-cutting constraints: contracts sync both ways (site canonical); Dropbox
TCC may require running build/test in the user's terminal; commit each logical
chunk immediately (Dropbox can clobber uncommitted edits).
