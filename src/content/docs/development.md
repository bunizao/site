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

## Encrypted source

The optional `/new` surface lives under `src/features/desk/`. Git stores those
files and `plans/desk-*.md` through the vendored transcrypt 2.3.2 filter.
A clone without a key builds the public home; `/new` redirects to `/`.
The normal check, build and unit-test commands work in either state.

Owner setup requires Node.js, Bash, Git and OpenSSL. On a clean checkout, run
`bash scripts/desk-unlock.sh --interactive` and paste the password at its hidden
prompt. The key exists only in that process and the local Git configuration.
For CI, supply `DESK_KEY` through its secret environment and run
`bash scripts/desk-unlock.sh`.
Do not place the key in command history, `.env` files, logs or Git. Worktrees
inherit the common repository's filter configuration. Managed worktree
creation can bypass smudge filters; Astro configuration, desk tests and
Playwright prepare those pristine encrypted checkouts automatically with the
existing local key. The preparation verifies ciphertext round-trips and refuses
to overwrite edited files. Normal edits, diffs and
commits then use plaintext locally and ciphertext in Git. Run
`bun run desk:verify -- --staged` before committing encrypted changes and
`bun run desk:verify -- --unpublished` before a first push. These inspect raw
Git blobs and report paths only. Restart a dev server
after unlocking so it resolves the appropriate module alias.

Keep the dedicated key in a password manager with a recoverable backup.
Transcrypt stores its configuration in the local Git config, so protect that
checkout and never upload its `.git` directory. The unlock script refuses to
replace an existing key or discard tracked changes. Initializing plaintext
source can make Git report expected encryption changes; the wrapper verifies
original file bytes before accepting that bootstrap state. Failed fresh
initialization restores both protected files and their original index entries.
`bash scripts/desk-unlock.sh --reset-bootstrap` removes an unused bootstrap
configuration only when HEAD, index and working source are identical plaintext
and no reachable desk history is encrypted. It leaves source and Git history
intact. `bun run test:desk` skips
when locked; `bun run desk:brand` regenerates the imported image assets in an
unlocked checkout. Development retains readable CSS identifiers, while builds
rename the surface's own identifiers and reject any that survive.

For Workers Builds, prefix the existing build command with
`bash scripts/desk-unlock.sh && `. Set the production secret `DESK_KEY` and
`DESK_REQUIRED=1` in the **build** environment. A locked required build fails
instead of silently shipping the public home. Preview builds omit both values.
GitHub Actions uses its `DESK_KEY` repository secret; fork PRs run locked.
Provisioning those secrets is an owner operation. Confirm OpenSSL is available
in the actual Workers Builds image before enabling a required deployment.

Locked Cloudflare builds skip previous asset carry-over, since a prior build
may contain this surface. Its imported images are emitted only when unlocked.
Encryption covers repository source, not HTML, CSS, JavaScript or images sent
to a browser, and does not remove plaintext from already-published Git history.

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
be standalone paragraphs, or unlabelled Ghost code cards where every non-empty
line is a marker. Conversation, authors, listening, mood, and YouTube share one
transform order, set by that compiler.

While its tab is visible, the preview checks the draft revision every 1.5
seconds. When Ghost saves a newer revision, the page reloads and restores the
contained reading scroll position. Because it is a full-page reload, listening,
video, image, and embed behavior initialize once. A partial replacement could
duplicate event listeners. If a probe fails, the current preview stays visible
and retries with bounded backoff.

## How dev differs from production

`astro dev` runs on Astro's native Node SSR. The Cloudflare adapter applies only
during `build`. The workerd runtime, its bindings, and the `API` service binding
don't exist in dev. The binding resolves only in a deployed Worker or under
`wrangler dev`.

In practice:

- In dev, `/api/*` and `/oauth*` are proxied over plain HTTP to
  `API_DEV_ORIGIN` (default `https://buxx.me`). So are the server-side mood
  archive reads. `/v2/*` answers with a `308` to `/api/v2/*`, which then takes
  the same path. `/oauth/login` is answered locally. A fresh `bun dev` talks to
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
| `API_DEV_ORIGIN` | Dev-only. Where `/api/*` and `/oauth*` are proxied |

Bindings and non-secret vars live in
[`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc).

## Two repositories

This repo (`site`) is the **public** Worker. The private Worker `site-api` lives
in the sibling repo `../site-api`. It owns D1, KV, R2, queues, crons, admin and
OAuth, notify, the Telegram webhook, the image proxy, and the concrete public API
implementations. Production `buxx.me/api/*` routes directly to `site-api`, so
the `site` Worker never sees it. This repo keeps only a thin `/api/*` fallback
for everywhere else. On preview deployments and under `bun preview`
(`wrangler dev`), it forwards over the `API` service binding. Under
`astro dev`, it forwards over plain HTTP to `API_DEV_ORIGIN`.

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
