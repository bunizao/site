# Dev Portal v2

A rebuild of `/dev/portal`: one fast client app instead of eleven server-rendered
pages, and a comment workspace built around the act of moderating rather than
around the data the API happens to return.

Tags on every feature: **FE** frontend only · **BE** needs a site-api route or
column · **C** needs a `@bunizao/contracts` release · **PUB** changes what
readers see on the blog. Status boxes are ticked as each item lands.

## 1. What is wrong today

Measured on the current portal (2026-09-28, local dev with demo data, plus a
read of both repos on `origin/main`).

- **Every click blocks on the network.** Each page is SSR: browser → `site`
  worker → service binding → `site-api` → D1, and only then does
  `ClientRouter` swap the document and re-hydrate every island. Nothing is
  cached, so Back refetches. A status tab on the queue is a full page load.
  Pages weigh 250–450 KB of HTML in dev; Analytics pulls recharts and the world
  GeoJSON on every visit.
- **No hierarchy.** Each page is a stack of equal-weight cards. On Comments the
  queue, the only thing you act on, sits below four stat cards and a
  "Write as the owner" card, i.e. below the fold.
- **Rows are forensic dumps.** Every queue row prints network, ten key chips,
  cluster counts and the verdict by default. Three comments fill two screens.
- **Missing basics.** No keyboard, no selection or bulk action, no search, no
  sort, no undo, no reply, no reject, a hard 25/50-row cap with "narrow the
  filter" instead of pagination.
- **Layout bugs.** Insights squeezes three tables into one row and wraps
  network names mid-word.
- **Two portals.** `site` `/dev/portal` is the maintained one. `site-api` still
  serves a stale July copy at `admin.buxx.me`, and the Telegram "Review" button
  (`ADMIN_PORTAL_URL`, `notify-owner.ts`) points there, at a page with no
  comment view.
- **Dark only, mouse only.** The owner reviews on iPad; nothing responds to
  touch beyond a click.

## Decisions (owner, 2026-09-28)

- Rebuild in `site` at `/dev/portal`; the move to `admin.buxx.me` is a later,
  separate step that the single API base URL keeps cheap.
- Backend work in `site-api` and contracts is in scope, on local branches;
  every push, contracts release and merge waits for the owner's yes.
- Reader-facing additions: pin a comment, lock a thread, per-post comment mode.
- Dark theme only.
- The bar: deliberately designed, easy to use, top-tier performance, clear
  hierarchy, production-grade, feature-complete. Paths and feel come first,
  and it must not be ugly. Each screen is judged by:
  - its step count per job;
  - click → next paint under 100 ms at 4× CPU throttle;
  - nesting depth: at most two levels from the screen to any datum.
- Comments are a chronological log table (who, what, fingerprint, IP,
  location, device) with a flat detail panel one click away.
- Density is moderate, not tight (owner, 2026-09-28: "too compact, my eyes
  feel messy"):
  - List rows are 44 px, about 17 per 900 px screen.
  - Rows are separated by space or a subtle separator, not hard rules.
  - A line uses at most two text styles.
  - Home is calm and airy, with one clear first thing.

## 2. Principles

1. **Instant.** A route change never waits on the network. Cached data paints
   immediately and revalidates in the background. Moderation acts are
   optimistic: the row reacts in the same frame, the request follows.
2. **One job per screen.** The primary list takes the space; detail opens in an
   inspector on demand. Forensics are one keypress away, never in the way.
3. **Keyboard on desktop, gestures on iPad.** Both are first-class. Swipe a
   row the way Mail does; follow the finger; no hover-only affordances.
4. **Undo over confirm.** Destructive acts run immediately and offer Undo for a
   few seconds. Dialogs are for irreversible, wide-impact acts only (bans with
   purge, broadcasts).
5. **Honest states.** Skeletons shaped like the content, empty states that say
   what would fill them, errors with a retry, a visible "stale" marker when a
   refresh fails.
6. **The URL is the state.** Filters, selection and the open inspector live in
   the URL so Back, reload and shared links all work.

## 3. Architecture

- **Shell.** One Astro route, `src/pages/dev/portal/[...path].astro`, renders
  a bare document and `<PortalApp client:only="react" />`. The middleware gate
  is unchanged. Old pages are deleted as their replacement lands; static
  routes beat the rest route, so the two coexist during the move.
- **Routing.** A small History-API router (a route table, `<Link>`, params,
  search params). Links prefetch the target's data and code on pointer intent.
- **Data.** `@tanstack/react-query`: one cache for the whole app, keys per
  resource, `staleTime` ~30 s, refetch on focus, polling where the data is live
  (queue 15 s, event log 5 s), optimistic mutations with rollback.
- **API layer.** One typed client over `/dev/portal/api/admin/*` and the
  existing portal routes (`analytics-events`, `ghost-posts`, `notify-preview`),
  typed from `@bunizao/contracts`. The base URL is a single constant, so a later
  move to `admin.buxx.me` is a one-line change plus a copy.
- **Demo mode.** In dev without the `API` binding, a dev-only route serves the
  existing `portal-demo.ts` fixtures, and mutations resolve locally, so the UI
  is fully clickable without site-api.
- **Code splitting.** Each screen is a lazy chunk. Charts and the map load only
  on the screens that draw them.
- **Styling.** Tailwind + the existing `coss` primitives, one dark token set,
  `prefers-reduced-motion` honoured, 44 px touch targets on coarse pointers.
- **Removed at the end.** `PortalLayout.astro`, `styles/portal.css`,
  `components/portal/*`, the old pages and their server loaders.

## 4. Shell and global features

- [ ] Sidebar with live badges (held comments, pending subscribers, held mood
      notifications); collapses to icons (`⌘B`); bottom tab bar on phones. **FE**
- [ ] Command palette `⌘K`: jump to any screen, search comments / subscribers /
      posts / sources, run actions ("approve selection", "open on blog",
      "copy link"). **FE**
- [ ] Shortcuts everywhere, `?` shows the sheet, `g` chords to jump
      (`g c` comments, `g s` subscribers, `g a` analytics…). **FE**
- [ ] Toast stack with Undo, one place for every receipt and error. **FE**
- [ ] Density: comfortable / compact. **FE**
- [ ] Layouts for desktop (three panes), iPad (two panes, swipe), phone (one
      pane, sheet inspector). **FE**
- [ ] Live queue watch: tab title shows `(3)` when new comments are held while
      the portal is open; optional browser notification. **FE**
- [ ] Connection state: "demo data" pill, "offline / stale" marker on failed
      refresh. **FE**

## 5. Home: "Needs you"

- [ ] Inbox of everything waiting on the owner, each a one-click jump: held
      comments (with oldest wait), comments awaiting email, held mood
      notifications (notify gate), pending subscribers, failed broadcasts,
      active comment lockdown. **FE** (lockdown needs **BE**, see 6.5)
- [ ] Today at a glance with week-over-week deltas: views, reads, comments,
      hearts, new subscribers. **FE**
- [ ] One merged activity stream (comments, reactions, subscriber events). **FE**
- [ ] System health: mood ingest health, last broadcast state, lockdown. **FE**
      (`admin/mood/health` exists and is unused)

## 6. Comments

### 6.0 Journeys (revised 2026-09-28)

Every page is rewritten on the coss primitives in `src/components/coss/`; no
screen keeps `portal.css`. The comment tools are built around four jobs, each
borrowed from a pattern that already works elsewhere:

1. **Triage the held queue** (Linear triage, Superhuman). The inbox opens on
   Held with the oldest wait visible. List on the left, reading pane on the
   right; `j/k` moves, `a` / `u` / `d` / `b` decide, and the next row is
   selected the moment the current one leaves the list. Inbox zero is an
   explicit, calm state.
2. **Decide without fear** (Gmail undo, NN/g "undo over confirm"). Approve and
   Unpublish apply at once with an Undo toast; `z` undoes the last one. Delete
   is held back for 6 s and only then sent, because the backend has no
   undelete; closing the tab flushes it. Only bulk restores and bans ask first.
3. **Understand one writer** (YouTube Studio, Discourse review). The pane
   leads with "why it is here" (reason, parsed risk score, awaiting-email
   state), then the body, then the writer, then keys and history behind
   disclosures. Every key pivots the list to `?key=&value=`, where a profile
   card sits above the filtered comments; the ban flow previews impact before
   it writes.
4. **Act on the go** (Apple Mail, HIG). On iPad and phone, rows swipe right to
   approve and left to delete, following the finger; below `lg` the pane is a
   bottom drawer with the decision bar under the thumb.

Words are fixed: Held, Published, Rejected, Deleted; "Unpublish" moves a
comment back to Held. Errors say how to recover. The Telegram Review button
lands on `/dev/portal/comments#<id>`.

Implementation is delegated to Opus subagents, one area each, reviewed and
committed here in batches.

### 6.1 Queue

- [ ] Three panes: filter rail | compact list | inspector. A list row is one
      glance: face, name, identity badge, post, two lines of body, verdict
      chip, age. **FE**
- [ ] Status tabs with counts, switched client-side from cache. **FE**
- [ ] Filters: status, post, identity (verified / anonymous / claimed later),
      source-key pivot. **FE** (all supported today)
- [ ] More filters: surface (blog / mood), reason, model (Akismet / LLM /
      none), awaiting email, country, date range, has links. **BE C**
- [ ] Search in body and author name. **BE**
- [ ] Sort: newest, oldest first (FIFO review), riskiest. **BE**
- [ ] Infinite scroll over the real total, virtualised. **FE** (offset
      pagination exists)
- [ ] Keyboard: `j/k` move, `a` approve, `h` hide, `r` reject, `d` delete,
      `b` ban, `o` open on the blog, `x` select, `⇧`-range, `⌘A` all, `z` undo,
      `/` search, `Enter` inspector. **FE** (`r` needs **BE**)
- [ ] Touch: swipe right approve, swipe left delete (or reject), long-press to
      select; the row follows the finger and springs back. **FE**
- [ ] Optimistic acts with a 5 s Undo toast. **FE** for approve↔hide;
      undo of delete needs **BE** (6.4)
- [ ] Bulk actions on a selection: approve, hide, reject, delete, ban authors.
      **FE** loop first, **BE** bulk route later
- [ ] New-comment pill ("3 new") instead of the list jumping under the
      pointer; polls every 15 s and on focus. **FE**
- [ ] Deep link `/dev/portal/comments/<id>` opens the inspector on that
      comment; the Telegram Review button points here. **FE** + one env change
      in site-api

### 6.2 Inspector

- [ ] Full body, raw by default, rendered-Markdown toggle; links highlighted
      with their domains. **FE**
- [ ] Verdict card: action, reason, model, note, and the risk score parsed out
      of `Awaiting email: score N (signals)`. **FE**; a real score column is
      **BE C**
- [ ] Thread context: the parent and the replies around it. **FE** (queue by
      `postId`)
- [ ] Identity: reader, auth at write, claim method, email masked with reveal,
      Gravatar / MX. **FE**
- [ ] Origin: country / city, ASN and org, IP (copy), browser / OS, dwell,
      Turnstile age, bot and VPN hints; the raw blobs behind a disclosure. **FE**
- [ ] Keys and cluster: chips with counts; each pivots the queue or opens the
      source profile in place. **FE**
- [ ] Author history: this writer's other comments and hearts. **FE**
      (`admin/sources/*`)
- [ ] Timeline: every activity-log entry for this comment. **FE**
- [ ] Copy link / id / IP; open on the blog at `#c-<token>`. **FE**

### 6.3 Owner participation

- [ ] Reply as the owner from the inspector, published at once with the
      author badge, bridged to Telegram for mood rows. **BE C**
      (`POST admin/comments/:id/reply`; today only the owner-code handoff or
      Telegram direct reply)
- [ ] New top-level owner comment on any post. **BE C**
- [ ] Edit the owner's own comments without the 15-minute window. **BE**
- [ ] Owner-code handoff kept as a fallback under Settings. **FE**

### 6.4 Moderation actions (backend)

- [ ] Reject as spam, with a reason; sends Akismet spam feedback. **BE C**
      (today the owner can approve, hide, delete, never reject)
- [ ] Restore a deleted comment to its prior status. **BE C**
- [ ] Bulk route `POST admin/comments/bulk {ids, action}`. **BE C**
- [ ] Queue params `q`, `surface`, `reason`, `model`, `from`, `to`, `sort`.
      **BE C**
- [ ] Expose `surface`, `moderatedAt`, `updatedAt` on `AdminCommentRecord`;
      titles for mood rows. **BE C**
- [ ] Move `AdminCommentSummary` and the activity types into contracts (site
      copies them by hand today). **C**

### 6.5 Controls (backend)

- [ ] Lockdown: see state, engage for N minutes, lift early (`comments:lockdown`
      KV key exists, no route). **BE C**
- [ ] Quarantine list and lift. **BE C**
- [ ] Revoked readers: list and restore (`AdminBannedReader` types exist, no
      route; `banned` is never reset today). **BE**
- [ ] Per-post comment mode (open / read-only / off) set from the portal
      instead of Ghost tags. **BE C PUB**
- [ ] Pin one comment per post. **BE C PUB**
- [ ] Lock a thread (no new replies). **BE C PUB**
- [ ] Owner messages (`/message` inbox): read, reply, archive, mark spam —
      Telegram-only today. **BE C**

### 6.6 Bans, sources, reactions, insights

- [ ] Bans: searchable table, expiry countdown, hits, source; lift inline and in
      bulk; add a ban by hand; operations with Restore. **FE**
- [ ] Edit a ban's note or expiry. **BE**
- [ ] Source profile opens in the inspector instead of a separate page. **FE**
- [ ] Reactions: list with post / comment filter, hourly chart, stuffing
      highlight from insights. **FE**
- [ ] Insights rebuilt with room to breathe: daily volume by status, verdict
      mix, time to review, networks / countries / subnets / browsers tables,
      quality funnel, window switcher. **FE**

## 7. Subscribers

- [ ] Virtualised table with search and filters (status, channel, delivery
      mode), counts per filter. **FE**
- [ ] Detail drawer with inline edit and the audit timeline. **FE**
- [ ] Bulk: resend confirmation, change delivery, unsubscribe, delete. **FE**
      loop
- [ ] Add subscriber; CSV export of the current filter. **FE**

## 8. Broadcasts and notifications

- [ ] Composer with live preview (desktop / phone / dark), audience picker with
      live recipient count (dry run). **FE**
- [ ] Send with an idempotency key; live progress bar from
      `broadcasts/:id/progress` (exists, unused). **FE**
- [ ] History with per-send stats. **FE**
- [ ] Mood notify gate: held posts, release as digest / individual / drop. **FE**
- [ ] Email template previews (today's Newsletter page). **FE**

## 9. Analytics

- [ ] Range picker, KPI row with deltas, traffic chart. **FE**
- [ ] Sortable article table; drill-down drawer per article. **FE**
- [ ] Realtime event log with filters and auto-refresh. **FE**
- [ ] Map, platform and source quality, listening, newsletter funnel. **FE**

## 10. Activity

- [ ] One timeline grouped by day, filters by family / event / actor / source /
      reader, each entry jumps to its target. **FE**

## 11. Content, mood and tools

- [ ] Blog drafts with live preview (port). **FE**
- [ ] Mood: ingest health, AI model config (primary / fallback) with a test
      button, archive search — all three routes exist, none is used. **FE**
- [ ] Tools group, lazy-loaded ports: mascot, SVG gallery, mood embed. **FE**

## 12. Settings

- [ ] Owner identity on the blog (owner-code handoff). **FE**
- [ ] Density, shortcut sheet. **FE**
- [ ] Comment policy in force (env defaults), read-only. **BE**

## 13. Phases

| Phase | Scope | Repos |
|---|---|---|
| P0 | Shell, router, query cache, API client, demo mode, toasts, palette skeleton | site |
| P1 | Comments queue + inspector + keyboard + swipe + optimistic + undo + client-side bulk | site |
| P2 | Comment backend: reject, restore, bulk, search / filter / sort, record fields, owner reply, lockdown | site-api, contracts |
| P3 | Bans, reactions, sources, insights | site |
| P4 | Home, subscribers, broadcasts, activity | site |
| P5 | Analytics, mood, tools, settings | site |
| P6 | Pin, lock, per-post mode, owner messages, revoked readers | site-api, contracts, site (PUB) |
| P7 | Delete the old portal, docs, e2e | site |

Verification per phase: `bun run check`, `bun run test:unit`, browser check in
demo mode (desktop, iPad touch, phone), `check:docs-coverage` whenever a route
changes. Backend phases also run site-api's tests; nothing is pushed or
merged without the owner's yes (a merge to `main` is a release).

## 14. Screen briefs

Each screen states its job, primary path (steps), what sits at level 1 and 2,
its states, and measured click → next paint at 4× CPU (dev build unless
noted). A screen without a brief is not done.

**Comments** `/comments`
- **Job:** clear Held fast, and answer "who is this writer and what else did
  they do" in one click.
- **Paths:**
  - Keyboard triage is one key per comment, with auto-advance.
  - From Telegram to a decision: open, then 1 tap.
  - Ban: `b` then `Enter`.
  - A writer's whole history: 1 click, and Back restores place.
  - The full fingerprint: 1 click.
- **L1:**
  - A toolbar line: status with counts, post picker, search, ⋯.
  - A chronological log, 37 px rows, 22 visible at 1440×900. Columns: time,
    status, writer, comment, post, fingerprint, IP, location, device.
- **L2:** a flat 440 px panel with actions, text, reason line, writer, the
  full fingerprint record (copy + count pivots) and history. On a phone it is
  a full-screen drawer.
- **Touch:** swipe right approves, left deletes (with undo); long-press
  selects.
- **Measured** (ms):

  | Action | Time |
  | --- | --- |
  | j | 79 |
  | a | 82 |
  | d | 73 |
  | z | 68 |
  | Tab | 149 |
  | Pivot | 150 |
  | Back | 268 |

  Tab, pivot and Back are over budget; wave 2 shell work fixes that.

**Bans** `/comments/bans`
- **Job:** see what is blocked, find a ban, lift it safely, add one by hand.
- **Paths:** lift in 1 click (undo inline, toast or `z`); find by typing;
  manual ban with `n`.
- **L1:** Active / Expired / Removals tabs, search, filter menu.
- **L2:** rows (key → comments pivot, note, hits, expiry, source, Lift).
- **Measured** (ms):

  | Action | Time |
  | --- | --- |
  | Lift | 46 |
  | Undo | 32 |
  | Search keystroke | 31 |
  | Manual-ban dialog | 78 (207 on first open) |

**Reactions** `/comments/reactions`
- **Job:** who reacts to what; spot stuffing runs.
- **Paths:** pivot or ban in 2 steps; a session or subnet cell reaches its
  comments in 1 click.
- **L1:** hourly chart, "Crowded" targets, feed with filters and search.
- **L2:** row menu.
- **Measured:** search 29 ms.

**Insights** `/comments/insights`
- **Job:** what a 7, 30 or 90-day window looks like.
- **Path:** any row reaches its comments in 1 click.
- **L1:** KPIs with deltas, a daily chart, and ranked tables with inline bars.
- **L2:** row menu.
- **Measured:** window switch 51 ms. Tables finish in a deferred render
  (~196 ms after).

**Home** `/`
- **Job:** what needs you now, and one move to get there.
- **Paths:** oldest held comment is 2 steps (open, then decide), inside the
  Held queue. Gate release is click, then confirm (no backend undo).
- **L1:** Needs you, Last 14 days, Recent activity.
- **L2:** one line per item.
- **Measured:** Activity → Home 43 ms.

**Activity** `/activity`
- **Job:** one log of comment and reaction events.
- **Paths:** an entry to its comment in 1 click; filter by reader in 1 click.
- **L1:** filter bar and day headings.
- **L2:** rows.
- **Measured:** Home → Activity 60 ms. Back 82 ms, with scroll restored.

**Analytics** `/analytics`, `/analytics/:slug`
- **Job:** readership by range, and one article without leaving the list.
- **Paths:** article open and Back are 1 click each; range is 1 click.
- **Measured** (ms, prod React build):

  | Action | Time |
  | --- | --- |
  | Range switch | 30 |
  | Article open | 46 (119 the first time) |
  | Back | 34–43 |
