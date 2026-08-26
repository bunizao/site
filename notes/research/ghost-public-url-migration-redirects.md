# Ghost public URL migration redirects

Research date: 2026-08-09

## Decision

**This is the final recommended architecture:** use ordered Cloudflare Single
Redirect rules in the zone-level `http_request_dynamic_redirect` phase. Match
only the known public Ghost URL shapes, and let every unmatched request continue
to Ghost.

Do **not** attach a broad `blog.buxx.me/*` Worker Route. Do **not** use a broad
redirect catch-all whose safety depends on remembering every Ghost internal
namespace. The last two redirect rules below match exactly one root path
segment, so every future post using the current `/:slug/` permalink shape is
covered automatically without matching nested Ghost operations.

The old hostname remains the live Ghost origin. It must remain proxied, owned,
and verified in Search Console. The migration moves public search URLs, not the
CMS origin.

No production configuration was changed during this research.

The explicit root exclusions are defense in depth, not the boundary that keeps
nested Ghost traffic safe. A path such as `/api/posts` has two segments and
cannot match either article rule at all. The exclusion set separately protects
the bare `/api` and `/api/` forms, along with the equivalent root forms of every
other known Ghost operational namespace.

## Validation status

- The JSON payload parses as exactly nine rules, leaving one slot within the
  Free plan's ten-rule Single Redirect quota. The update must refuse to write
  if preserved unrelated rules would exceed that quota.
- Every filter and dynamic target expression passes an independent Cloudflare
  Rules Language parser for the `http_request_dynamic_redirect` phase. The
  longest filter is 709 characters, below Cloudflare's 4,096-character limit.
- A local route matrix passed 17 redirect cases, 41 Ghost fall-through cases,
  and four mutating-method cases. The fall-through cases include bare and
  nested `/api`, `/admin`, `/comments`, and `/activitypub` paths.
- All 18 current Ghost posts use the required one-segment permalink shape. All
  18 new targets return `200`, declare the exact new URL as canonical, and
  appear in the new sitemap.
- Production is still unchanged: the three missing legacy URLs return `200`.
  Both the configured API token and Wrangler OAuth currently receive
  Cloudflare error `10000` when reading the dynamic redirect ruleset, so a safe
  merged update and rollback snapshot cannot yet be produced.

[Cloudflare URL forwarding
availability](https://developers.cloudflare.com/rules/url-forwarding/#availability)
documents the Free-plan quota and wildcard support.

## Why this is the final design

The design has four useful failure properties:

1. A new root-level Ghost post is redirected automatically; no per-post rule is
   needed.
2. A new or forgotten nested Ghost operational route falls through to Ghost
   instead of being redirected away from its origin.
3. Unknown nested public paths keep Ghost's real `404` behavior instead of being
   redirected to an irrelevant page and becoming a likely soft 404.
4. Only `GET` and `HEAD` requests redirect. Mutating requests are never converted
   by a `301` response.

Google recommends server-side permanent redirects, direct final destinations,
and avoiding irrelevant mass redirects. It also recommends keeping redirects
for at least one year and, for users, potentially indefinitely. [Google site
move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
explicitly permits moving a domain or subdomain into a path on another domain,
so `blog.buxx.me` to `buxx.me/blog/` is eligible for the Search Console Change of
Address workflow. [Google Change of Address
documentation](https://support.google.com/webmasters/answer/9370220?hl=en)

## Confirmed current URL model

The live Ghost Content API currently reports:

- 18 posts, all at `https://blog.buxx.me/:slug/`.
- Two pages: `/links/` and `/tags/`.
- Public tag archives at `/tag/:slug/`.
- One author archive at `/author/murray/`.

The three missing migrations are currently `200` on both hosts:

- `blog.buxx.me/the-unbearable-lightness/`
- `blog.buxx.me/email-philosophy/`
- `blog.buxx.me/tides-write-back/`

Older post slugs, root, feeds, sitemaps, tags, and authors already have edge
redirects. The replacement rules below subsume the explicit article-slug rule
named `Legacy blog cutover: known article slugs`.

Ghost itself reserves the post slugs `ghost`, `rss`, and `amp`, and its router
mounts preview, email, unsubscribe, static-route, collection, page, and taxonomy
routers in a defined order. [Ghost protected
slugs](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/shared/config/overrides.json)
[Ghost router
manager](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/frontend/services/routing/router-manager.js)

## Ghost route boundary

The route boundary below comes from Ghost v6.39 live probes and the pinned Ghost
source at commit `f318505718f95db27800a3d3bda8e670324260b1`.

| Source path | Final handling | Reason |
| --- | --- | --- |
| `/` | `301 https://buxx.me/blog/` | Public blog index |
| `/:slug/` and `/:slug` | `301 https://buxx.me/blog/:slug/` | Current post permalink; future posts are automatic |
| `/tags/` | `301 https://buxx.me/blog/tags/` | Exact replacement exists |
| `/tag/:slug/` | `301 https://buxx.me/blog/tag/:slug/` | Exact replacement exists |
| `/tag/:slug/page/:n/` | `301` to the unpaginated new tag archive | The new site has no paginated tag route |
| `/author/*` | `301 https://buxx.me/blog/` | Single-author archive consolidated into the all-post index |
| `/page/*` | `301 https://buxx.me/blog/` | The new all-post index is not paginated |
| `/rss/`, `/feed/`, tag/author feeds | `301 https://buxx.me/blog/rss.xml` | Exact replacement exists |
| `/sitemap.xml`, `/sitemap-*.xml` | `301 https://buxx.me/sitemap.xml` | Exact replacement exists |
| `/:slug/amp/` | `301 https://buxx.me/blog/:slug/` | Removes Ghost's current extra hop through the old canonical URL |
| `/links/` | `301 https://buxx.me/blog/` | Existing intentional retirement; not equivalent content and may be treated as a soft 404 |
| `/robots.txt` | Keep on Ghost | It permits post crawling and points to the old sitemap, which redirects to the new sitemap |
| `/ghost` and `/ghost/*` | Keep on Ghost | Admin, Admin API, Content API, and Ghost JWKS |
| `/api/*`, `/admin/*` | Fall through to Ghost | Not current Ghost core mounts, but explicitly reserved from the article-shaped fallback |
| `/members/*` | Keep on Ghost | Member sessions, checkout, comments API, webhooks, and member JWKS |
| `/content/images/*` | Keep on Ghost | Image storage currently redirects to `static.buxx.me`; Ghost size variants include shapes the app proxy does not normalize |
| `/content/media/*`, `/content/files/*` | Keep on Ghost | Media and file storage |
| `/assets/*`, `/public/*` | Keep on Ghost | Theme and Ghost runtime assets |
| `/email/*`, `/p/*`, `/unsubscribe/*` | Keep on Ghost | Email rendering, draft previews, and unsubscribe actions |
| `/r/*`, `/webmentions/*`, `/gift/*` | Keep on Ghost | Link tracking, webmentions, and gift flows |
| `/.ghost/*` | Keep on Ghost | ActivityPub and analytics service namespaces |
| `/.well-known/*` | Keep on Ghost | Recommendations, LLMS, WebFinger, NodeInfo, and future discovery files |
| `/cdn-cgi/*` | Keep at Cloudflare/Ghost | Cloudflare-owned service namespace |
| `/comments/*` | Fall through to Ghost | Not a Ghost core top-level namespace; real comment APIs live below `/members/api/comments/*` and `/ghost/api/admin/comments/*` |
| `/activitypub/*` | Fall through to Ghost | Not the Ghost core namespace; Ghost uses `/.ghost/activitypub/*` and `/.well-known/*` |
| Other nested paths | Fall through to Ghost | Preserves real operational behavior and real 404s |

Ghost mounts the backend API and admin under `/ghost`, including
`/ghost/.well-known`. [Ghost backend
mounts](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/server/web/parent/backend.js)
The frontend mounts `/members`, `/webmentions`, and `/gift` before the public
site router. [Ghost frontend
mounts](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/server/web/parent/frontend.js)

Ghost serves storage prefixes, member discovery, theme assets, sitemaps, and
public runtime files before dynamic public routes. [Ghost site
application](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/frontend/web/site.js)
[Ghost public file
routes](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/frontend/web/routers/serve-public-file.js)

Ghost's hard-coded public operational routers confirm `/p/`, `/email/`, and
`/unsubscribe/`. [Preview
router](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/frontend/services/routing/preview-router.js)
[Email
router](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/frontend/services/routing/email-router.js)
[Unsubscribe
router](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/frontend/services/routing/unsubscribe-router.js)

The ActivityPub service uses `/.ghost/activitypub/*`; Ghost's gateway also
routes `/.well-known/webfinger` and `/.well-known/nodeinfo`. [Ghost ActivityPub
service](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/ghost/core/core/server/services/activitypub/activity-pub-service.ts)
[Ghost gateway
routes](https://github.com/TryGhost/Ghost/blob/f318505718f95db27800a3d3bda8e670324260b1/docker/dev-gateway/Caddyfile)

## Exact Cloudflare rules

These nine rules are ordered from most specific to least specific. A redirect is
a terminating action, so Cloudflare uses the first matching redirect and stops
evaluating later rules. [Cloudflare terminating action
behavior](https://developers.cloudflare.com/ruleset-engine/rules-language/actions/)

The objects below are the exact `rules` entries for the zone-level
`http_request_dynamic_redirect` entry-point ruleset. They use `wildcard`,
`wildcard_replace`, `substring`, `starts_with`, `ends_with`, `lower`, `len`, and
`concat`; they do not use the Business/Enterprise-only `matches` operator.
[Cloudflare wildcard
operators](https://developers.cloudflare.com/ruleset-engine/rules-language/operators/#wildcard-matching)
[Cloudflare expression
functions](https://developers.cloudflare.com/ruleset-engine/rules-language/functions/)

```json
[
  {
    "ref": "legacy_ghost_sitemaps",
    "description": "Legacy Ghost sitemaps",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and (lower(http.request.uri.path) eq \"/sitemap.xml\" or http.request.uri.path wildcard \"/sitemap-*.xml\")",
    "action_parameters": {
      "from_value": {
        "target_url": { "value": "https://buxx.me/sitemap.xml" },
        "status_code": 301,
        "preserve_query_string": false
      }
    }
  },
  {
    "ref": "legacy_ghost_feeds",
    "description": "Legacy Ghost feeds",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and (lower(http.request.uri.path) in {\"/rss\" \"/rss/\" \"/feed\" \"/feed/\"} or http.request.uri.path wildcard \"/tag/*/rss\" or http.request.uri.path wildcard \"/tag/*/rss/\" or http.request.uri.path wildcard \"/tag/*/feed\" or http.request.uri.path wildcard \"/tag/*/feed/\" or http.request.uri.path wildcard \"/author/*/rss\" or http.request.uri.path wildcard \"/author/*/rss/\" or http.request.uri.path wildcard \"/author/*/feed\" or http.request.uri.path wildcard \"/author/*/feed/\")",
    "action_parameters": {
      "from_value": {
        "target_url": { "value": "https://buxx.me/blog/rss.xml" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_tag_pagination",
    "description": "Legacy Ghost tag pagination",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and http.request.uri.path wildcard \"/tag/*/page/*\"",
    "action_parameters": {
      "from_value": {
        "target_url": { "expression": "wildcard_replace(http.request.uri.path, \"/tag/*/page/*\", \"https://buxx.me/blog/tag/${1}/\")" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_tag_archive",
    "description": "Legacy Ghost tag archives",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and http.request.uri.path wildcard \"/tag/*/\" and not http.request.uri.path wildcard \"/tag/*/*/\" and len(http.request.uri.path) gt 6",
    "action_parameters": {
      "from_value": {
        "target_url": { "expression": "concat(\"https://buxx.me/blog\", http.request.uri.path)" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_amp",
    "description": "Legacy Ghost article AMP aliases",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and ((http.request.uri.path wildcard \"/*/amp/\" and not http.request.uri.path wildcard \"/*/*/amp/\") or (http.request.uri.path wildcard \"/*/amp\" and not http.request.uri.path wildcard \"/*/*/amp\"))",
    "action_parameters": {
      "from_value": {
        "target_url": { "expression": "wildcard_replace(http.request.uri.path, \"/*/amp*\", \"https://buxx.me/blog/${1}/\")" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_tags_index",
    "description": "Legacy Ghost tags index",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and lower(http.request.uri.path) in {\"/tags\" \"/tags/\"}",
    "action_parameters": {
      "from_value": {
        "target_url": { "value": "https://buxx.me/blog/tags/" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_archive_consolidation",
    "description": "Legacy Ghost index and archive consolidation",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and (lower(http.request.uri.path) in {\"/\" \"/links\" \"/links/\" \"/author\" \"/author/\" \"/page\" \"/page/\"} or http.request.uri.path wildcard \"/author/*\" or http.request.uri.path wildcard \"/page/*\")",
    "action_parameters": {
      "from_value": {
        "target_url": { "value": "https://buxx.me/blog/" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_root_article_trailing_slash",
    "description": "Legacy Ghost root articles with trailing slash",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and http.request.uri.path ne \"/\" and http.request.uri.path wildcard \"/*/\" and not http.request.uri.path wildcard \"/*/*/\" and not (http.request.uri.path contains \".\") and not (lower(http.request.uri.path) in {\"/rss/\" \"/feed/\" \"/links/\" \"/tags/\" \"/amp/\" \"/author/\" \"/page/\" \"/tag/\" \"/ghost/\" \"/api/\" \"/admin/\" \"/content/\" \"/assets/\" \"/public/\" \"/members/\" \"/email/\" \"/p/\" \"/.ghost/\" \"/.well-known/\" \"/r/\" \"/webmentions/\" \"/gift/\" \"/unsubscribe/\" \"/comments/\" \"/activitypub/\" \"/cdn-cgi/\"})",
    "action_parameters": {
      "from_value": {
        "target_url": { "expression": "concat(\"https://buxx.me/blog\", http.request.uri.path)" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  },
  {
    "ref": "legacy_ghost_root_article_no_trailing_slash",
    "description": "Legacy Ghost root articles without trailing slash",
    "action": "redirect",
    "expression": "http.host eq \"blog.buxx.me\" and http.request.method in {\"GET\" \"HEAD\"} and not ends_with(http.request.uri.path, \"/\") and ((http.request.uri.path ne \"/\" and http.request.uri.path wildcard \"/*\" and not http.request.uri.path wildcard \"/*/*\" and not (http.request.uri.path contains \".\") and not (lower(http.request.uri.path) in {\"/rss\" \"/feed\" \"/links\" \"/tags\" \"/amp\" \"/author\" \"/page\" \"/tag\" \"/ghost\" \"/api\" \"/admin\" \"/content\" \"/assets\" \"/public\" \"/members\" \"/email\" \"/p\" \"/.ghost\" \"/.well-known\" \"/r\" \"/webmentions\" \"/gift\" \"/unsubscribe\" \"/comments\" \"/activitypub\" \"/cdn-cgi\"})) or (http.request.uri.path wildcard \"/tag/*\" and not http.request.uri.path wildcard \"/tag/*/*\" and len(http.request.uri.path) gt 5))",
    "action_parameters": {
      "from_value": {
        "target_url": { "expression": "concat(\"https://buxx.me/blog\", http.request.uri.path, \"/\")" },
        "status_code": 301,
        "preserve_query_string": true
      }
    }
  }
]
```

`preserve_query_string: true` keeps public attribution parameters. It does not
expose member or preview tokens because those paths never match a redirect rule.
Cloudflare documents query preservation as an explicit redirect setting.
[Cloudflare Single Redirect
settings](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/)

### Safe API update procedure

1. Read and save the current entry-point ruleset:
   `GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`.
2. Build a complete merged ruleset in memory. Remove the old explicit-slug rule
   only from that copy and insert the nine rules above in this exact order.
3. Validate every expression and target before writing.
4. Apply one versioned update, preserving every unrelated existing rule.
5. Retain the pre-change response as the exact rollback payload.

Never send a partial `PUT` body. Cloudflare states that `PUT` replaces the
entire rule list and omitted rules are deleted. A single rule can instead be
added with `POST /zones/{zone_id}/rulesets/{ruleset_id}/rules`, with an explicit
position. [Cloudflare ruleset update
warning](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update/)
[Cloudflare add-rule
API](https://developers.cloudflare.com/ruleset-engine/rulesets-api/add-rule/)

The token needs `Zone > Single Redirect > Edit`. [Cloudflare Single Redirect API
permissions](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/)

## Why not a Worker Route

Cloudflare supports a more-specific Worker Route with no script to override a
broader route. For example, `blog.buxx.me/ghost* -> <no script>` can bypass a
`blog.buxx.me/* -> redirect-worker` route. The most specific route wins.
[Cloudflare Worker Route matching](https://developers.cloudflare.com/workers/configuration/routing/routes/#matching-behavior)

That mechanism is valid, but inferior here:

- It adds a runtime program to the Ghost admin/API request path.
- It requires many negative routes and a pass-through `fetch(request)` default.
- Exact no-script routes do not cover query-string variants unless the pattern
  ends in `*`; Cloudflare documents this surprising behavior.
- A missing negative route, a Worker exception, or a deploy regression can make
  Ghost unavailable even though DNS and the Ghost origin are healthy.
- The existing `site` Worker is intentionally scoped to `buxx.me/*` and
  `www.buxx.me/*`. Reusing it for Ghost would erase the current public/private
  routing boundary.

The path-shape Single Redirect design has no code runtime and defaults unknown
traffic to Ghost. That is the safer invariant.

## Verification gate

The change is not complete until all checks pass against production.

### Redirect correctness

- Every Ghost Content API post URL returns one direct `301` to the same slug at
  `https://buxx.me/blog/:slug/`.
- Both slash forms of every post return a one-hop `301` to the trailing-slash
  new URL.
- The three currently missing posts return exact new-host `Location` values.
- Root, tags, tag archives, author, pagination, feeds, sitemaps, and AMP aliases
  reach an existing final `200` URL.
- Redirect responses preserve ordinary public query strings.
- `POST` requests do not match any migration rule.

### Ghost survival checks

- `/ghost/` remains `200`.
- `/ghost/api/content/*` is not redirected.
- `/ghost/api/admin/*` is not redirected.
- `/api/*`, `/admin/*`, `/comments/*`, and `/activitypub/*` are not redirected.
- `/ghost/.well-known/jwks.json` remains reachable.
- `/members/api/site/` and `/members/.well-known/jwks.json` remain reachable.
- Preview, email, unsubscribe, gift, webmention, link-tracking, theme asset,
  public asset, image, media, file, discovery, and Cloudflare paths are not
  redirected.

### New-site checks

- Every new article returns `200` with a self-canonical on `buxx.me`.
- `https://buxx.me/sitemap.xml` contains only the new canonical URLs.
- `https://buxx.me/robots.txt` points to the new sitemap.
- No target produces a second redirect or a `404`.

## Permanent publishing invariant

Add a scheduled and post-publish check that:

1. Reads all published post URLs from the Ghost Content API.
2. Fails if any post pathname is not exactly one root segment with a trailing
   slash.
3. Reads all published Ghost pages and fails if a page does not have an
   intentional mapping and an existing new-site target.
4. Computes the expected `https://buxx.me/blog/:slug/` target.
5. Asserts the old URL returns `301` with that exact `Location`.
6. Asserts the target returns `200` and a new-host self-canonical.
7. Runs the Ghost survival probes above.

This converts a permalink-shape change or Cloudflare rule regression into an
immediate deployment/operations failure instead of another silent SEO split.
Once the production checks pass, submit the new sitemap and use Search Console
Change of Address from the verified `blog.buxx.me` property. Keep both Search
Console properties and keep the redirects indefinitely.
