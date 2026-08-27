---
title: Local development
description: "Getting the site running: toolchain, commands, the dev-versus-production runtime gap, and environment variables."
group: Start
order: 2
---

## Toolchain

**Bun** for packages and scripts, **Node.js >= 22.12** for everything that shells
out to `wrangler`. `.node-version` pins 22. A Node 18 shell does not fail loudly —
`wrangler` commands just silently misbehave, which is a worse outcome than a
crash. Check before debugging anything Cloudflare-shaped:

```bash
node --version   # must be >= 22.12
bun install
```

## Running

```bash
bun dev -- --background   # http://localhost:4321, does not hold the terminal
bunx astro dev status
bunx astro dev logs --follow
bunx astro dev stop
```

The background form is the default because most work here needs the terminal free.
Plain `bun dev` runs in the foreground when you actually want to watch the log
stream.

Surface-scoped variants boot the same server with a `DEV_SURFACE` hint, which lets
a route skip work it does not need:

| Command | Surface |
| --- | --- |
| `bun dev:home` | Home page only |
| `bun dev:mood` | Mood feed and detail |
| `bun dev:richtext` | Mood with the rich-text fixture loaded |
| `bun dev:preview` | Draft preview routes |
| `bun dev:portal` | Admin portal with the auth bypass on |
| `bun dev:api` | Proxy `/api/*` at a local `site-api` instead of production |

## The dev/production runtime gap

This trips people up, so it is worth stating plainly: **`astro dev` runs on Astro's
native Node SSR. The Cloudflare adapter only applies during `build`.** The workerd
runtime, its bindings, and the `API` service binding do not exist in dev.

What that means in practice:

- `/api/*`, `/v2/*`, and `/oauth*` are proxied over plain HTTP in dev, to
  `API_DEV_ORIGIN` (default `https://buxx.me`). So a fresh `bun dev` talks to
  **production** APIs unless told otherwise.
- To develop against a local API: run `bun run dev` in `../site-api` (it boots
  wrangler on `127.0.0.1:8787`), then `bun dev:api` here.
- Set `API_DEV_ORIGIN` in `.env.local` to point at a preview deployment instead.
- Anything that depends on real Worker behavior — cache keys, headers, bindings —
  must be checked with `bun preview`, which builds and runs `wrangler dev` on the
  built Worker.

There is a second gap worth knowing: mood pages read from the **live** source in
dev and the **D1 archive** in production. Profiling or debugging `/mood` without
`?source=archive` means measuring a code path that production never takes.

## Checks

```bash
bun run check            # astro sync + type check
bun run build            # production build (adapter, agent markdown, pagefind)
bun run test:unit
bun run test:e2e:site    # Playwright; needs test:e2e:install once
bun run test:registry    # installs every published component with the real CLI
bun run test:ops         # scheduled health checks
```

No linter is configured. That is on purpose — the type checker and the tests are
the gate, and a third opinion about formatting was not earning its keep.

## Environment variables

Read through `import.meta.env.*`. Put local values in `.env.local`; Worker secrets
go in Cloudflare, never in the repo.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_GHOST_URL` | Ghost CMS origin (default `https://blog.buxx.me`) |
| `GHOST_CONTENT_API_KEY` | Content API key. Required in the Cloudflare build env, or the Writing section prerenders empty |
| `GHOST_ADMIN_API_KEY` | Server-only. Draft previews. Never prefix it `PUBLIC_` |
| `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` | OGIS endpoint for generated blog OG images |
| `GITHUB_TOKEN` | GitHub GraphQL token |
| `PUBLIC_HD_IMAGE_URL` | HD mood image base URL served by `site-api` |
| `MOOD_READ_SOURCE` | `archive` (default) or `live` |
| `CHANNEL`, `TELEGRAM_HOST` | Telegram channel slug and host |
| `LASTFM_API_KEY`, `LASTFM_USER` | Home listening widget |
| `PUBLIC_SITE_URL`, `SITE_URL` | Canonical base URLs |
| `API_DEV_ORIGIN` | Dev-only. Where `/api/*` is proxied |

Bindings and non-secret vars live in
[`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc).

## Two repositories

This repo (`site`) is the **public** Worker. The private Worker `site-api` lives in
the sibling repo `../site-api` and owns D1, KV, R2, queues, crons, admin and OAuth,
notify, the Telegram webhook, the image proxy, and the concrete public API
implementations. Production `buxx.me/api/*` routes directly to `site-api`; this
repo keeps only a thin service-binding fallback for preview environments.

Keep them split. The boundary is a security boundary, not an organizational
preference.

`@bunizao/contracts` is duplicated byte-for-byte in both repos and **this repo is
canonical**. After editing a contract here, run `bun run sync:contracts` in
`../site-api`.
