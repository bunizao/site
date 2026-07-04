# Plan 001: Redirect legacy Ghost reserved paths (feed, sitemaps, content images) on blog.buxx.me

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat de572482..HEAD -- src/middleware.ts tests/unit/cloudflare-redirects.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `de572482`, 2026-07-04

## Why this matters

The blog moved from Ghost at `blog.buxx.me` to this worker at `buxx.me/blog`, and `wrangler.jsonc` now routes `blog.buxx.me/*` to this worker. The middleware redirects legacy hosts, but its single-segment catch-all treats Ghost's *reserved* paths as post slugs: `blog.buxx.me/rss/` 301s to `https://buxx.me/blog/rss`, which is not a route (the feed lives at `/blog/rss.xml`), so every existing RSS subscriber's reader gets a permanent 404 and silently stops delivering. The same happens for Ghost sitemap URLs still held by search engines (`/sitemap.xml`, `/sitemap-posts.xml`, …), and old Ghost image URLs (`blog.buxx.me/content/images/...`, still referenced from past newsletters, feed entries, and external embeds) fall through the redirect entirely and 404.

## Current state

- `src/middleware.ts` — `redirectLegacyGhostHost()` (lines 31–56) handles the legacy host. Excerpt as of `de572482`:

```ts
// src/middleware.ts:31
function redirectLegacyGhostHost(url: URL): Response | null {
  if (url.hostname !== 'blog.buxx.me') return null;

  if (url.pathname === '/' || url.pathname === '') {
    return Response.redirect('https://buxx.me/blog', 301);
  }
  if (url.pathname === '/tags' || url.pathname === '/tags/') {
    return Response.redirect('https://buxx.me/blog/tags', 301);
  }

  const tagMatch = url.pathname.match(/^\/tag\/([^/]+)\/?$/);
  if (tagMatch?.[1]) {
    return Response.redirect(`https://buxx.me/blog/tag/${tagMatch[1]}`, 301);
  }

  if (/^\/author\/[^/]+\/?$/u.test(url.pathname)) {
    return Response.redirect('https://buxx.me/blog', 301);
  }

  const slugMatch = url.pathname.match(/^\/([^/]+)\/?$/);
  if (slugMatch?.[1]) {
    return Response.redirect(`https://buxx.me/blog/${slugMatch[1]}`, 301);
  }

  return null;
}
```

- The real feed route is `src/pages/blog/rss.xml.ts` → serves `/blog/rss.xml`. The site sitemap route is `src/pages/sitemap.xml.ts` → serves `/sitemap.xml` on `buxx.me`.
- Ghost image URLs have the shape `/content/images/2026/06/post.jpg` and sized variants `/content/images/size/w600/2026/06/post.jpg`. The blog already rewrites these to an image-proxy path via `rewriteGhostBlogImageUrl(value, ghostUrl, width?)` exported from `@/features/posts/adapter/provider` (implementation in `src/features/posts/adapter/ghost/dataset.ts:43-85`). Example mapping (locked by `tests/unit/blog-image-rewrite.test.ts`):
  - `https://blog.buxx.me/content/images/2026/06/post.jpg` → `/api/v2/images/blog/content/images/2026/06/post.jpg`
  - `.../content/images/size/w600/2026/06/post.jpg` → `/api/v2/images/blog/content/images/2026/06/post.jpg?w=600`
- Existing test conventions: `tests/unit/cloudflare-redirects.test.ts` uses `bun:test` and asserts middleware behavior by string-matching the middleware source (see its test "redirects the Ghost subdomain into canonical blog URLs"). It also asserts `_redirects` has exactly 48 rules — do not add rules to `public/_redirects`.
- Repo conventions: English-only comments; conventional commits without trailing rationale clauses (e.g. `fix: handle legacy blog host redirects`).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `bun install`        | exit 0              |
| Typecheck | `bun run check`      | exit 0, no errors   |
| Unit tests| `bun run test:unit`  | all pass            |

Note: this repo lives on a Dropbox mount; sandboxed `bun`/`node` can hit
non-deterministic `EPERM`. If a command fails with `EPERM`, ask the operator to
run it in their own terminal instead of retrying.

## Scope

**In scope** (the only files you should modify):
- `src/middleware.ts`
- `tests/unit/cloudflare-redirects.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `public/_redirects` — path-only rules for the old apex-domain slugs; a test pins its exact rule count (48).
- `src/pages/blog/rss.xml.ts`, `src/pages/sitemap.xml.ts` — the targets are correct; only the legacy-host mapping is wrong.
- `src/features/posts/adapter/**` — you import from it; do not modify it.

## Git workflow

- Work on the current branch (`plan-new-blog-era`) unless the operator says otherwise.
- One commit, message style: `fix: map legacy Ghost feed, sitemap, and image paths`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add reserved-path handling before the slug catch-all

In `src/middleware.ts`, inside `redirectLegacyGhostHost()`, insert the following
checks **after** the `/tags` check and **before** the `tagMatch` block (order
within the new checks doesn't matter, but all must precede the `slugMatch`
catch-all):

1. Feed paths: `/rss`, `/rss/`, `/feed`, `/feed/` → `Response.redirect('https://buxx.me/blog/rss.xml', 301)`.
2. Sitemap paths: pathname `/sitemap.xml` or matching `/^\/sitemap-[a-z]+\.xml$/` → `Response.redirect('https://buxx.me/sitemap.xml', 301)`.
3. Content images: pathname starting with `/content/images/` → rewrite via the
   existing helper and redirect, preserving the query string:

```ts
if (url.pathname.startsWith('/content/images/')) {
  const proxied = rewriteGhostBlogImageUrl(
    `${url.pathname}${url.search}`,
    'https://blog.buxx.me',
  );
  if (proxied && proxied.startsWith('/api/')) {
    return Response.redirect(`https://buxx.me${proxied}`, 301);
  }
  return null;
}
```

Import at the top of `src/middleware.ts`:
`import { rewriteGhostBlogImageUrl } from '@/features/posts/adapter/provider';`

Note the slug catch-all also currently swallows any other single-segment
reserved file (e.g. `/robots.txt` would become `/blog/robots.txt`). Add one more
guard right before `slugMatch`: if the last path segment contains a `.`
(e.g. `/favicon.ico`, `/robots.txt`), return `null` instead of slug-redirecting.

**Verify**: `bun run check` → exit 0.

### Step 2: Extend the redirect unit test

In `tests/unit/cloudflare-redirects.test.ts`, extend the existing
"redirects the Ghost subdomain into canonical blog URLs" test (which
string-matches the middleware source) with assertions that the middleware now
contains `https://buxx.me/blog/rss.xml`, `https://buxx.me/sitemap.xml`, and
`/content/images/`. Keep the existing assertions untouched.

If you prefer stronger tests: export `redirectLegacyGhostHost` from
`src/middleware.ts` (the file already exports `createHtmlScriptCsp` for tests)
and add direct unit tests calling it with
`new URL('https://blog.buxx.me/rss/')` etc., asserting the `Location` header.
This is the better shape; do it if it stays within the two in-scope files.

**Verify**: `bun run test:unit` → all pass, including the new assertions.

## Test plan

- Cases to cover (direct-call style preferred, source-string style acceptable):
  - `blog.buxx.me/rss/` and `/feed/` → 301 `https://buxx.me/blog/rss.xml`
  - `blog.buxx.me/sitemap.xml` and `/sitemap-posts.xml` → 301 `https://buxx.me/sitemap.xml`
  - `blog.buxx.me/content/images/2026/06/post.jpg` → 301 `https://buxx.me/api/v2/images/blog/content/images/2026/06/post.jpg`
  - `blog.buxx.me/content/images/size/w600/2026/06/post.jpg` → 301 target containing `?w=600`
  - `blog.buxx.me/robots.txt` → no slug redirect (falls through)
  - `blog.buxx.me/some-post/` still → 301 `https://buxx.me/blog/some-post` (existing behavior unchanged)
- Model after the existing tests in `tests/unit/cloudflare-redirects.test.ts`.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `bun run test:unit` exits 0; new assertions for feed/sitemap/image paths exist and pass
- [ ] The `slugMatch` catch-all in `src/middleware.ts` is still last in `redirectLegacyGhostHost`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `redirectLegacyGhostHost` no longer exists or has materially changed shape.
- Importing `@/features/posts/adapter/provider` from `src/middleware.ts` fails to typecheck (would indicate a server/client boundary issue in the adapter barrel — report rather than restructuring the adapter).
- `rewriteGhostBlogImageUrl('/content/images/...', 'https://blog.buxx.me')` does not return a `/api/v2/images/blog/...` path when you test it (the mapping may have changed).
- The `_redirects` rule-count test (48) fails — you touched a file you shouldn't have.

## Maintenance notes

- If the RSS route ever moves (e.g. to `/blog/feed/`), this mapping and `src/features/posts/server/rss.ts`'s `atom:link` must move together.
- Reviewer should scrutinize: the new checks must precede the slug catch-all, and the image redirect must preserve query strings.
- Deferred: the slug redirect targets `https://buxx.me/blog/<slug>` without a trailing slash while blog canonical URLs use trailing slashes (`postPath()`), costing one extra redirect hop. Harmless; normalize opportunistically if you're already editing these lines.
