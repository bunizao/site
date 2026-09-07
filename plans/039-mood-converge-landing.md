# 039 — Land the serverless mood convergence stack

Status: proposed 2026-09-07, revised 2026-09-08 after a full baseline audit.
Completes plan 037 (track A and track B) and plan 038 G2; supersedes the
in-Worker embed probe of plan 032 (its monitor survives).

## What broke

`https://buxx.me/mood/3810` (posted 2026-09-07) renders as a bare URL on `/`,
on `/mood/3810`, and in the newsletter. Its D1 row holds
`link_previews = [{"type":"link_preview_options",…}]` and
`last_verified_at IS NULL`. Neither the site nor the converge DO is at fault.

- The DO's server half lives on site-api `feat/mood-converge-ship` (13
  patch-unique commits ahead of `main`, never pushed): `POST
  /v2/mood/converge/report`, the ingest-time unfurl, the `*/15` retry drain,
  the `web_page_none` terminal marker, the stale-lane cap, and the
  generation-tagged image variants (track B).
- That branch was deployed on 2026-09-03 12:49Z. The next deploy, at
  15:35:22Z, came from `main`, which has none of it. The four deploys on
  2026-09-06 also came from `main`.
- KV `mood:converge:status.reportedAt = 2026-09-03T15:33:30Z` — 112 s before
  that deploy. The DO has alarmed every five minutes into an Astro 404 HTML
  page since; `failures` only counts, nothing stops the loop.
- The webhook has stored bare `link_preview_options` since then. Posts
  3806–3809 carry no URL; 3810 is the first link post after the regression.
- Backlog: 43 rows match the `needs_preview` predicate (ids 11…3810). All but
  3810 are 2022–2026 rows where Telegram never produced a card. 43 rows
  (every id ≥ 3806, plus 3803) have `last_verified_at IS NULL`.

## Baseline audit (2026-09-08)

Method: downloaded the deployed `site-api`, `site` and `mood-converge`
bundles through the Workers API and grepped them for string literals unique
to each unmerged branch; `git cherry` against `origin/main` for patch
equivalence; `d1_migrations` on both databases against the repos.

| fact | result |
| --- | --- |
| deployed `site-api` | = `origin/main` HEAD `38bb258` (#54, 2026-09-06 14:36Z) |
| deployed `site` | = `origin/main` HEAD `8b2dcc45` (#187) |
| deployed `mood-converge` | = `feat/mood-converge-ship` build (carries the report path); `codex/a2-do-kill-test-site-api` is a kill-test harness that removed it — do not merge its worker changes |
| `site-mood` schema | prod has `0011_mood_dead_candidate.sql` (`dead_candidate_at`), main does not; the only drift |
| `site-notify` schema | identical |
| cron triggers | `*/15 * * * *`, `0 * * * *` — match main |

### Lost from production since 2026-09-03 15:35Z (on converge-ship only)

| piece | evidence |
| --- | --- |
| `POST /v2/mood/converge/report` + KV `mood:converge:status` | route → 404 HTML; literal absent from bundle |
| ingest-time unfurl, `*/15` retry drain, `web_page_none` | `mood:preview:retry`, `web_page_none` absent; KV key missing |
| track B: generation-tagged image variants cache-first (`ed5b94f`) | `createMoodImageGenerationTag`, `readGenerationTag`, `createTaggedVariantCacheEntry` absent from main and bundle — the plan 038 G3 LCP win is gone too |
| stale-lane cap `staleLaneCap = 5` | only matters while `/v2/mood/reconcile/*` is still called; retire with it |

### Never on main, still worth landing

| branch | patch-unique | what |
| --- | ---: | --- |
| `claude/serverless-mood-reconcile` (site-api) | 6 | dead-man monitor + ops-bot alerts (keep), embed probe (drop), migration 0011 dead_candidate (already applied on prod — add the file to main so a fresh DB matches) |
| `perf/mood-feed-cache` (site-api) | 4 | `2b2de50` landed on main in different words; `78d95ec` parallel feed quote/media lookups did not — check and cherry-pick |
| `claude/mood-reconcile-redesign-c46d0f` / `codex/a2-do-kill-test` (site) | 28 / 15 | plans 035, 037, 038, `scripts/perf/mood-lcp.mjs`, `/docs/api/internal` converge entry — the design record of this whole effort is not on main |
| `perf/mood-lcp-image-size` (site) | 4 | `4ba2bc0` image hints matched to layout; the other three are model-registry chores |

### Unmerged but not a baseline gap

- Owner work in flight, both repos (your call, not this plan): the
  `feat/comment-owner-sign-in` pair (email sign-in + single-use handoff),
  `claude/message-og-dialog-design-dc21d5`,
  `claude/dialog-font-padding-adjust-b5c795`,
  `claude/message-feature-bugs-c797cb`.
- August features never merged: `feat/blog-image-accent`,
  `docs/import-architecture-audit` (listening artwork accents, drop KV
  dual-read), `feat/telegram-bot-ux`, `feat/notify-preferences-overhaul`
  (14 unique, 243 behind).
- Landed differently: `feat/notify-skip-translations` (`translationOf` gate
  exists on main), `fix/mood-placeholder-main`, `fix/owner-message-email`.
- Misnamed: `fix/mood-d1-quota-fallback` holds only the
  `verify-channel-difference.mjs` probe script.
- The 22 `hotfix/*-20260824` branches are patch-equivalent in main except
  `hotfix/ghost-broadcast-integrity-20260824` (1 commit). Delete the rest.
- July `advisor/*`, `feat/cv`, `feat/telegram-ops-bot`, `claude/audit-*`:
  340+ behind, superseded.

## Design — five lanes, all on Workers Free

### A. Land the stack (the fix)

Merge `feat/mood-converge-ship` onto site-api `origin/main`. `git merge-tree`
shows conflicts in `package.json` and `bun.lock` only. Open a PR, deploy from
`main`. Restores the report route, track B image variants, and the marker.
No `/start` is needed: the next alarm's report succeeds,
`getChannelDifference` from pts 9068 replays 3806–3810 plus any deletions,
and a TooLong falls into the existing dense sweep.

Same PR: add `migrations/0011_mood_dead_candidate.sql` verbatim (prod already
lists it in `d1_migrations`, so it is a no-op there), and cherry-pick
`78d95ec` if it still applies.

Site PR: plans 035/037/038 and `scripts/perf/mood-lcp.mjs` from
`claude/mood-reconcile-redesign-c46d0f`; `/v2/mood/converge/report` on
`/docs/api/internal` (path, purpose, auth tier). Worker-level routes are
invisible to `check:docs-coverage`, so this is a manual obligation.

### B. Own the unfurl: Open Graph first, Telegram second

The card should not depend on Telegram having rendered one. The unfurler
fetches the linked page itself and reads its metadata; the t.me embed is a
fallback for bot-walled sites (x.com, Instagram) where Telegram has a card
and a plain fetch gets a login page.

Order, per row:

1. `link_preview_options.is_disabled` → `web_page_none`. The owner turned the
   card off in Telegram; honour it.
2. Target URL = first `url` / `text_link` entity in the post, the same choice
   Telegram makes.
3. `GET` the target: `redirect: 'follow'`, `AbortSignal.timeout(5000)`,
   UA `Mozilla/5.0 (compatible; buxx-unfurl/1.0; +https://buxx.me)`,
   `Accept: text/html`. Read at most 256 KB, stop at `</head>`. Only
   `http(s)`, no IP-literal or `localhost` hosts, no `buxx.me` image-proxy
   loop (the site's own pages are fine — 3810 links `buxx.me/message`).
4. Parse the head with a ~80-line scanner: `<meta property|name=…>` and
   `<title>`, attribute regex, minimal entity decode. Fields:
   `og:site_name` → hostname; `og:title` → `twitter:title` → `<title>`;
   `og:description` → `twitter:description` → `description`;
   `og:image` (or `og:image:url`, `og:image:secure_url`) → `twitter:image`,
   resolved against the final URL; `og:image:width/height` when present.
   Not `cheerio` (parsing an arbitrary 200 KB page blows the 10 ms CPU
   budget) and not `HTMLRewriter` (unit tests run under `bun test`, where it
   does not exist).
5. Image dimensions missing → fetch the image's first 64 KB and read them
   from the PNG/JPEG/GIF/WebP header. Still missing → `large`.
   `prefer_small_media` forces `compact`, `prefer_large_media` forces `large`.
6. Title, description and image all empty, or a 403/429 bot wall → fall back
   to `unfurlTelegramLinkPreview` (existing, t.me embed). Still nothing →
   `web_page_none`. 404/410/DNS failure → `web_page_none` (dead link, no
   card). Timeout or 5xx → leave the row untouched; KV counter
   `mood:unfurl:fail:<id>` (7-day TTL) reaching 3 → `web_page_none`.
7. Write the existing `web_page` shape via `serializeLinkPreview`, extended
   with `photo: [{ url, width, height }]`.

Image path: `linkPreviewList` currently proxies a thumbnail only when it is
Telegram media and hotlinks anything else. Change both halves so any http(s)
thumbnail maps to the owned `mood/<id>/link-preview` proxy URL, and the
image proxy's `readImageUrl` branch accepts a public https image URL as
`kind: 'url'` (same host guard as step 3, `image/*` content type, 5 MB cap).
Readers never fetch from the third-party host; R2 caches and resizes it like
every other mood image, and the newsletter's `bookmarkCardHtml` gets an
absolute URL as it already requires.

Where it runs:

- Webhook `waitUntil`, immediately — the 15 s delay existed only because
  Telegram unfurls asynchronously; our own fetch does not need it.
- Cron `*/15`, D1 as the queue: up to 5 rows matching `needs_preview`,
  newest first. This replaces plan 037's hand-seeded KV retry list; a hand
  step is what this incident lost. Migration
  `0012_mood_needs_preview_index.sql`: a partial index on the predicate
  (`channel, message_id` WHERE `is_deleted = 0 AND type = 'text' AND
  instr(text, 'http') > 0 AND link_previews NOT LIKE '%web_page%'`) so the
  query reads only backlog rows — zero once drained. 3810 is repaired on
  the first tick; the 43 rows drain in about 2.5 h, and the 42 historic
  rows now get a card wherever the page still serves Open Graph.

### C. Dead-man alert

Port `ops-bot/alerts.ts` and `mood-pipeline-monitor.ts` from
`claude/serverless-mood-reconcile`. Hourly cron, two signals:

1. KV `mood:converge:status.reportedAt` older than 1 h → "converge loop
   stalled". Zero D1 rows.
2. `needs_preview` backlog whose oldest `datetime` is older than 6 h →
   "previews not landing". Backlog rows only, via the lane B index.

Pushes go to the ops bot's allowlisted user ids with a 20 h KV dedupe. This
turns a four-day silent outage into a Telegram ping at the top of the hour.

### D. Deploy guard

Production deploys come from `main` only; worktree branches deploy to
staging. Optional: one assertion in the site's hourly `tests/ops` run —
unsigned `POST /api/v2/mood/converge/report` returns 401, never 404.

### E. Retire, after seven silent days of lane C

`scripts/mood-reconcile/`, `/v2/mood/reconcile/{due,report}` with
`handleMoodReconcileRequest`, `MOOD_RECONCILE_*` and `staleLaneCap`, the
`claude/serverless-mood-reconcile` and `codex/a2-do-kill-test-site-api`
branches, the 21 equivalent `hotfix/*-20260824` branches, plan 032's probe
sections, and the site's dead `preserveBookmarks` sanitizer option. Then
plan 038's A3: VPS credentials deleted, box off.

## D1 budget

Lane B reads ~0 rows once drained (partial index). Lane C signal 1 reads
none; signal 2 reads backlog rows. Neither moves the plan 038 G1 target of
< 65,000 reads/day.

## Verification

1. After the lane A deploy: `mood:converge:status.reportedAt` advances
   within 5 min; unsigned `POST /api/v2/mood/converge/report` → 401;
   `/api/v2/images/mood/<id>/<n>` answers with the generation tag again.
2. Within 15 min: a cache-busted `/api/v2/mood/3810?fallback=0` returns
   `media[0].type === 'link-preview'` with the owned proxy thumbnail; `/`
   and `/mood/3810` render the card once edge SWR turns over.
3. Within 3 h: the `needs_preview` count is 0.
4. Lane B unit tests: fixtures for an OG page, a page with only `<title>`,
   a bot wall (403 → t.me fallback), a dead link, a timeout, and
   `is_disabled`.
5. Lane C: unit tests with a fake clock; the first hourly tick logs
   `previewBacklog: 0, staleWatermark: false` in `wrangler tail`.

## Not in scope

- Site rendering. `renderLinkPreview` and `renderStructuredMoodDetailContent`
  already draw the card; verified locally against 3810's shape.
- Hand-editing D1 rows. Lane B repairs them through the sanctioned path.
- Media over 20 MB, GitHub Actions as a pipeline scheduler, a VPS, a Paid
  plan — per plans 033 and 037 and the owner's standing constraints.
- The owner's in-flight comments and messages branches.

## Decisions for the owner

1. Lane A merge shape: merge commit (recommended) or a rebase of the 15
   commits.
2. Open Graph first with the t.me embed as fallback (recommended), or t.me
   first with Open Graph as fallback. OG-first is deterministic and repairs
   the 42 historic rows; t.me-first matches what you see in Telegram.
