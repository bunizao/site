# Office Runtime

## Overview

`/office` is currently implemented as a two-layer system:

1. An Astro host page at `/office`
2. The original Star Office frontend runtime mounted inside that page

The original frontend runtime is served from:

- `public/office-runtime/index.html`
- `public/office-runtime/static/*`

The runtime still behaves like the original Star Office frontend, but its data plane is adapted to the existing worker-backed room architecture.

## Runtime Layers

### Page host

The outer host page lives at:

- `src/pages/office/index.astro`

Its responsibilities are:

- read production defaults from environment variables
- allow query-string overrides for local debugging
- pass runtime configuration into the embedded office runtime

Relevant environment variables:

- `PUBLIC_AGENTS_OFFICE_URL`
- `PUBLIC_AGENTS_OFFICE_ROOM_ID`
- `OFFICE_JOIN_KEY`
- `OFFICE_JOIN_KEYS`
- `OFFICE_JOIN_MAX_CONCURRENT`

### Original frontend runtime

The embedded runtime lives at:

- `public/office-runtime/index.html`
- `public/office-runtime/bridge.js`

This is the original Star Office frontend runtime, including:

- Phaser-based pixel scene rendering
- original control panel and drawer UI
- original guest list and memo panel
- original `/status`, `/agents`, `/yesterday-memo`, `/join-agent`, `/agent-push` request shapes

### Worker-backed compatibility layer

The worker compatibility layer lives at:

- `src/lib/office-compat.ts`
- `src/pages/status.ts`
- `src/pages/agents.ts`
- `src/pages/yesterday-memo.ts`
- `src/pages/set_state.ts`
- `src/pages/join-agent.ts`
- `src/pages/agent-push.ts`
- `src/pages/leave-agent.ts`
- `src/pages/agent-approve.ts`
- `src/pages/agent-reject.ts`
- `src/pages/health.ts`

These routes let the original runtime call legacy endpoints while the actual authoritative room state remains in the Cloudflare worker.

## Asset Uploads

### Where uploaded assets go

Uploaded assets do **not** go to the original repository files on disk.

They currently go into an in-memory server-side compatibility store:

- `src/lib/office-drawer-store.ts`

Specifically:

- uploaded binary data is stored in `uploadedAssets`
- values are kept as base64 plus content type metadata
- the runtime serves them through a dynamic static override route

The serving route is:

- `src/pages/office-runtime/static/[...path].ts`

That route works like this:

1. If there is an uploaded override for a requested asset path, return the uploaded bytes.
2. Otherwise, fall back to the original file in `public/office-runtime/static`.

### Current persistence model

The current asset upload model is **process memory only**.

That means:

- uploads survive within the current server process
- uploads do **not** survive a redeploy
- uploads do **not** survive a process restart
- uploads are not shared across multiple server instances
- uploads are not written back into the repo

The same temporary storage model currently applies to:

- drawer auth state
- Gemini config
- asset position overrides
- asset default overrides
- home favorites

### Current upload endpoints

The current compatibility endpoints are:

- `POST /assets/upload`
- `POST /assets/restore-default`
- `POST /assets/restore-prev`
- `GET /assets/list`
- `POST /assets/auth`
- `GET /assets/auth/status`
- `GET /assets/positions`
- `POST /assets/positions`
- `GET /assets/defaults`
- `POST /assets/defaults`
- `GET /assets/home-favorites/list`
- `POST /assets/home-favorites/save-current`
- `POST /assets/home-favorites/apply`
- `POST /assets/home-favorites/delete`
- `GET /config/gemini`
- `POST /config/gemini`

These endpoints exist to keep the original frontend runtime operational while the backend migration is still in progress.

### Worker-backed mode

The runtime now supports a Worker-backed asset data plane.

When the site server has:

- `OFFICE_ASSETS_WORKER_URL`

the Astro compatibility routes proxy these requests to the Worker:

- `/assets/*`
- `/config/gemini`
- `/office-runtime/static/*`

The runtime bridge also forwards `x-office-room-id` on asset fetches so the Worker can keep asset state room-scoped.

If `OFFICE_ASSETS_WORKER_URL` is **not** configured, the site falls back to the existing in-memory compatibility store.

## What is fully functional today

- Original Star Office runtime renders under `/office`
- Legacy status endpoints map into worker-backed room state
- Guest join and push flows work through compatibility routes
- Asset drawer can authenticate locally
- Asset list loads
- Position/default metadata can be stored
- Home favorites can be saved and re-applied
- Asset upload and restore endpoints work against the in-memory asset store
- Worker-backed asset storage can now be enabled with Astro proxying
- Worker-backed favorites and Gemini config storage can now be enabled with Astro proxying

## What is not production-complete yet

These items still need a real persistent backend:

- true multi-instance consistency
- join key lifecycle parity with the original backend
- approval expiry and offline reaping parity
- real image generation workflow
- the full `broker`, `DIY`, `move house`, and `return home` behavior chain

The new Worker covers:

- persistent uploaded asset versions in R2 + D1
- persistent favorites in R2 + D1
- persistent Gemini config metadata in D1

The remaining production work is mostly deployment wiring and the still-missing original workflows above.

## Production implications

Right now, the office runtime is safe for:

- local development
- preview environments
- iterative compatibility work

It is **not yet suitable** for production asset editing if you need persistence across deploys or instances.

To make the drawer fully production-ready, the next storage target should be a durable backend such as:

- Cloudflare R2 for uploaded binaries
- D1 or KV for metadata and favorites
- Worker-side authenticated routes for mutation

## Verification

Current checks used during migration:

- `bun run check`
- `bun run build`
- `bun test tests/unit/office-compat.test.ts`
- `bun test tests/unit/office-drawer-routes.test.ts`
- `bunx playwright test tests/e2e/preview-smoke.pw.ts`
