---
title: Local development
description: Install the toolchain, run the site locally, check your changes, and see where dev differs from production.
group: Start
order: 2
---

How to get the site running on your machine and check your changes before a
deploy. It also covers the places where local dev behaves differently from
production.

## Toolchain

Use **Bun** for packages and scripts, and **Node.js >= 22.12** for anything that
shells out to `wrangler`. `.node-version` pins 22. On Node 18, `wrangler`
commands don't crash. They misbehave silently, which is harder to spot. Check
your Node version before you debug anything Cloudflare-related:

```bash
node --version   # must be >= 22.12
bun install
```

## Run the dev server

```bash
bun dev -- --background   # http://localhost:4321, does not hold the terminal
bunx astro dev status
bunx astro dev logs --follow
bunx astro dev stop
```

The background form is the default because it leaves your terminal free. Run
plain `bun dev` in the foreground when you want to watch the log stream.

Surface-scoped variants boot the same server with a `DEV_SURFACE` hint, so a
route can skip work it doesn't need:

| Command | Surface |
| --- | --- |
| `bun dev:home` | Home page only |
| `bun dev:mood` | Mood feed and detail |
| `bun dev:richtext` | Mood with the rich-text fixture loaded |
| `bun dev:preview` | Draft preview routes |
| `bun dev:portal` | Admin portal with the auth bypass on |
| `bun dev:api` | Proxies `/api/*` to a local `site-api` instead of production |

## Preview a draft

`/dev/blog/<ghost-post-id>` renders the current Ghost draft through the same
rich-source compiler that published posts use. Registered directive markers can
be standalone paragraphs or exact, unlabelled Ghost code cards. Conversation,
authors, listening, mood, and YouTube share one transform order, set by that
compiler.

While its tab is visible, the preview checks the draft revision every 1.5
seconds. When Ghost saves a newer revision, the page reloads and restores the
contained reading scroll position. Because it is a full-page reload, listening,
video, image, and embed behavior initialize once. A partial replacement could
duplicate event listeners. If a probe fails, the current preview stays visible
and retries with bounded backoff.

## How dev differs from production

`astro dev` runs on Astro's native Node SSR. The Cloudflare adapter applies only
during `build`. The workerd runtime, its bindings, and the `API` service binding
don't exist in dev.

In practice:

- In dev, `/api/*`, `/v2/*`, and `/oauth*` are proxied over plain HTTP to
  `API_DEV_ORIGIN` (default `https://buxx.me`). A fresh `bun dev` talks to
  **production** APIs unless you change that.
- To develop against a local API, run `bun run dev` in `../site-api` (it boots
  wrangler on `127.0.0.1:8787`), then run `bun dev:api` here.
- To use a preview deployment instead, set `API_DEV_ORIGIN` in `.env.local`.
- Check anything that depends on real Worker behavior (cache keys, headers,
  bindings) with `bun preview`. It builds the site and runs `wrangler dev` on the
  built Worker.

Mood pages differ too. Dev reads from the **live** source, and production reads
from the **D1 archive**. If you profile or debug `/mood` without
`?source=archive`, you are measuring a code path production never takes.

## Performance diagnostics

Add `?debug=performance` to any site page to load the opt-in performance panel.
`debug=observe` still works as an alias for older investigation links. The
production build includes the diagnostic module, but ordinary visits don't load
or run it.

The panel records:

- layout shifts and their source nodes
- LCP
- long tasks
- slow resources
- frame gaps
- image frame geometry
- fonts
- visual viewport changes
- scroll calls
- meaningful element resizes

At first contentful paint (FCP), it adds one `fcp-path` line that names what the
paint waited for:

```text
fcp-path ttfb=45 doc=86 css=7/52KB font-preloads=1/3KB last=globals.css@122 render=16ms
```

| Field | Meaning |
| --- | --- |
| `last` | The render-blocking stylesheet or preloaded font that arrived last before FCP. |
| `render` | The time left for style, layout and paint after `last` arrived. A large `render` points at the main thread instead of the network. |
| `pending` | Preloaded fonts still downloading at FCP. Chrome held the paint for them (capped at about 100ms), then painted with the fallback face. |

**Copy** exports the complete log. The visible panel keeps only the latest
entries. Agents can read the same data without scraping the UI:

```js
window.__BUXX_PERF_DEBUG__.snapshot()
window.__BUXX_PERF_DEBUG__.text()
```

Resource entries contain only origins and paths. The log never includes page
text or resource query parameters.

## Checks

```bash
bun run check            # astro sync + type check
bun run build            # production build (adapter, agent markdown, pagefind)
bun run test:unit
bun run test:e2e:site    # Playwright; needs test:e2e:install once
bun run test:registry    # installs every published component with the real CLI
bun run test:ops         # scheduled health checks
bun run check:docs-coverage   # every HTTP route is named somewhere under /docs
```

No linter is configured. The type checker and the tests are the gate.

`check:docs-coverage` walks `src/pages/**` in this repo and in the sibling
`site-api` checkout, and derives each public path. It fails when no page under
`src/content/docs/` mentions a path.

- To check a different sibling, pass it as
  `bun scripts/check-docs-coverage.ts <path>` or `SITE_API_REPO=<path>`.
- From a worktree that isn't beside `../site-api`, you must pass the path.
  Without it, the guard silently checks only this repo's half.
- The guard sees only routes that exist as files. Anything dispatched by hand in
  `worker.ts`, such as the Telegram webhooks, has to be documented by hand too.

## Environment variables

The site reads these through `import.meta.env.*`. Put local values in
`.env.local`. Worker secrets go in Cloudflare, never in the repo.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_GHOST_URL` | Ghost CMS origin (default `https://blog.buxx.me`) |
| `GHOST_CONTENT_API_KEY` | Content API key. Required in the Cloudflare build env, or the Writing section prerenders empty |
| `GHOST_ADMIN_API_KEY` | Server-only. Used for draft previews. Never prefix it `PUBLIC_` |
| `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` | OGIS endpoint for generated blog OG images |
| `GITHUB_TOKEN` | GitHub GraphQL token |
| `PUBLIC_HD_IMAGE_URL` | HD mood image base URL served by `site-api` |
| `MOOD_READ_SOURCE` | `archive` (default) or `live` |
| `CHANNEL`, `TELEGRAM_HOST` | Telegram channel slug and host |
| `PUBLIC_SITE_URL`, `SITE_URL` | Canonical base URLs |
| `API_DEV_ORIGIN` | Dev-only. Where `/api/*` is proxied |

Bindings and non-secret vars live in
[`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc).

## Two repositories

This repo (`site`) is the **public** Worker. The private Worker `site-api` lives
in the sibling repo `../site-api`. It owns D1, KV, R2, queues, crons, admin and
OAuth, notify, the Telegram webhook, the image proxy, and the concrete public API
implementations. Production `buxx.me/api/*` routes directly to `site-api`. This
repo keeps only a thin service-binding fallback for preview environments.

Keep the two repos split. The boundary between them is a security boundary.

### Contracts package

`@bunizao/contracts` is maintained in this public repo and released as a public
npm package. The first release is `@bunizao/contracts@0.1.0`. The package source
and release metadata live in
[`packages/contracts/`](https://github.com/bunizao/site/tree/main/packages/contracts).

- Consumers, including `site-api`, pin an exact package version and upgrade it
  explicitly.
- Local development in this repo uses the workspace dependency, so you can test
  contract changes before a release.
- The root `check`, tests, and build commands prepare the workspace package
  automatically. Run `bun run contracts:build` before you start a focused dev
  server.
- Publish a version only from a matching `contracts-v<version>` tag. The release
  workflow uses npm trusted publishing with provenance.
