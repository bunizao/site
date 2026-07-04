# Plan 003: Stop subscribe-manage tokens leaking into blog analytics via referrer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat de572482..HEAD -- src/features/posts/ui/BlogArticleBeacon.astro src/pages/subscribe/manage.astro tests/unit/blog-analytics-beacon.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `de572482`, 2026-07-04

## Why this matters

`/subscribe/manage?token=…` authenticates subscribers with a signed magic-link token carried in the URL (by design — it arrives by email). The blog article beacon records `document.referrer` verbatim into the analytics store. Same-origin navigations send the **full URL** as referrer under the default browser policy, so a subscriber who lands on the manage page and then clicks through the site nav to a blog post deposits their live manage token into analytics data, where it outlives the visit and is readable by anything with analytics access. The token grants control over that subscriber's email preferences — analytics is the wrong place for it. Two cheap layers fix this: never store more referrer than origin+path, and make the manage page not emit a referrer at all.

## Current state

- `src/features/posts/ui/BlogArticleBeacon.astro` — inline client script on every blog article; builds the analytics payload. Excerpt as of `de572482`:

```js
// src/features/posts/ui/BlogArticleBeacon.astro:140
return {
  eventId,
  slug,
  visitorId,
  sessionId,
  dwellMs: Math.round(dwellMs),
  scrollDepth: Math.round(clamp(maxScrollDepth, 0, 1) * 1000) / 1000,
  completed: maxScrollDepth >= completionScrollDepth,
  referrer: document.referrer || null,
};
```

- `src/pages/subscribe/manage.astro` — SSR page (`export const prerender = false`, line 15) rendering the `ManagePreferences` React island; the token stays in the URL for the lifetime of the page (it is read via `new URL(window.location.href).searchParams.get('token')` in `src/features/notify/ui/ManagePreferences.tsx:204` — that read is fine and out of scope).
- No global `Referrer-Policy` header or meta tag exists (checked `src/layouts/` and `public/_headers`), so the browser default `strict-origin-when-cross-origin` applies: cross-origin referrers are already origin-only, but **same-origin referrers carry the full URL including query strings**.
- Existing beacon test: `tests/unit/blog-analytics-beacon.test.ts` (bun:test) — follow its structure for new assertions. Check how it exercises the beacon (it may parse the Astro file source or test extracted helpers); mirror whatever pattern it uses.
- Repo conventions: English-only comments; conventional commits without trailing rationale clauses.

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
- `src/features/posts/ui/BlogArticleBeacon.astro`
- `src/pages/subscribe/manage.astro`
- `tests/unit/blog-analytics-beacon.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/features/notify/ui/ManagePreferences.tsx` — the token-in-URL pattern is the product design (magic links must survive refresh); do not strip the token from the address bar in this plan.
- The analytics contract in `packages/contracts/src/analytics.ts` and the server side in `../site-api` — the payload field stays a string; only its value is truncated.
- `public/_headers` — applies to static assets, not this SSR page.

## Git workflow

- Work on the current branch (`plan-new-blog-era`) unless the operator says otherwise.
- One commit, message style: `fix: strip referrer query from blog beacon and manage page`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Truncate the referrer in the beacon payload

In `src/features/posts/ui/BlogArticleBeacon.astro`, replace the
`referrer: document.referrer || null` line with a sanitized value: parse
`document.referrer` with `new URL(...)` in a try/catch and keep only
`origin + pathname` (drop search and hash); on parse failure or empty referrer,
send `null`. Keep it inside the inline script's existing style (plain functions,
no imports).

```js
function sanitizedReferrer() {
  if (!document.referrer) return null;
  try {
    const ref = new URL(document.referrer);
    return `${ref.origin}${ref.pathname}`;
  } catch {
    return null;
  }
}
```

**Verify**: `bun run check` → exit 0.

### Step 2: Suppress referrer emission from the manage page

In the frontmatter of `src/pages/subscribe/manage.astro` (after the existing
`readPublicEnv` line), add:

```ts
Astro.response.headers.set('Referrer-Policy', 'no-referrer');
```

This stops the token URL being sent as a referrer to *any* destination
(same-origin nav, external links, and third-party subresources), independent of
the beacon fix.

**Verify**: `bun run check` → exit 0.

### Step 3: Add test coverage

Extend `tests/unit/blog-analytics-beacon.test.ts` following its existing
pattern. Cover:
- a referrer with a query string (e.g. `https://buxx.me/subscribe/manage?token=abc`)
  produces `https://buxx.me/subscribe/manage` (no query, no fragment);
- an empty referrer produces `null`;
- a non-URL referrer string produces `null`.

If the existing test asserts on the Astro source text rather than executing the
helper, assert the source contains the sanitizer and no longer contains
`referrer: document.referrer` verbatim.

**Verify**: `bun run test:unit` → all pass, including the new cases.

## Test plan

Covered in Step 3. Additionally, if the operator runs e2e locally
(`bun run test:e2e:site`), nothing should regress — the beacon payload shape is
unchanged, only the referrer value is truncated.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `bun run test:unit` exits 0; new referrer-sanitizing tests exist and pass
- [ ] `grep -n "referrer: document.referrer" src/features/posts/ui/BlogArticleBeacon.astro` returns no matches
- [ ] `grep -n "Referrer-Policy" src/pages/subscribe/manage.astro` returns one match
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The beacon payload code no longer matches the excerpt (analytics may have been reworked).
- `tests/unit/blog-analytics-beacon.test.ts` tests a compiled/extracted module in a way that makes the new cases impossible without touching out-of-scope files.
- Anything server-side rejects the truncated referrer (it must not — same field, shorter string); if a contract validation fails, report instead of editing contracts.

## Maintenance notes

- If analytics later wants referrer *query* attribution (UTM params), reintroduce it as an explicit allowlist of param names — never the raw query string.
- Reviewer should scrutinize: the manage page header must be set in frontmatter (SSR), not in a `<meta>` tag inside a layout slot that might be reordered.
- Deferred: stripping the token from the address bar via `history.replaceState` after load — trades refresh-survival for less shoulder-surfing/history exposure; product call, not made here.
