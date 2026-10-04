---
title: Auth and OAuth hub
description: How owner sign-in works today, the rules for credentials, and the plan for sandbox, connector and MCP clients.
group: Platform
order: 3
---

The OAuth hub controls how the site owner signs in. Today the owner portal on
`site` uses Cloudflare Access, and `site-api` runs a GitHub OAuth admin
session. Later the hub will give sandbox jobs, knowledge connectors, and MCP
clients one place to request narrower credentials.

The portal used to have an "Access Hub" page at `/dev/portal/oauth` that showed
this roadmap. That page was removed from the portal UI. The auth boundary now
lives only in code (`src/middleware.ts` and
`src/features/admin/server/access.ts`), and this page is the canonical record
of intent.

## How sign-in works today

Each Worker has its own owner gate:

| Surface | Gate |
| --- | --- |
| `/dev/*` owner portal on `site` | Cloudflare Access. `src/middleware.ts` verifies the Access JWT (`cf-access-jwt-assertion`) against the team domain, audiences, and optional email allow-list. Local dev can use a bypass instead |
| `/admin/*` on `site-api` | A signed admin session cookie from GitHub OAuth, or a verified Cloudflare Access JWT. The portal's calls through `/dev/portal/api/admin/*` carry the Access JWT |

The GitHub OAuth pieces live in `site-api`. It strips a leading `/api`, so
`src/pages/admin/auth/start.ts` serves `buxx.me/api/admin/auth/start`:

| Piece | Role |
| --- | --- |
| `/admin/auth/start` | Starts GitHub OAuth. |
| `/admin/auth/callback` | Completes it, checks the login against `ADMIN_GITHUB_LOGIN`, and sets the session cookie. |
| `/admin/auth/logout` | Clears the session. |
| `__Host-admin_session` | The signed owner session cookie, valid for 7 days. A hash of the token is also stored in `site-api`'s `SESSION` KV. Sign-in clears the legacy `admin_session` cookie. |
| `/oauth/login` | Where a failed sign-in or a logout lands. `site-api` redirects it to `https://buxx.me/oauth/login`, and the `site` Worker redirects that to the same-origin `?next=` path, `/dev/portal` by default. It doesn't start a login itself. |

Outside local dev, `/admin/auth/start` and `/admin/auth/callback` redirect to
`https://admin.buxx.me/admin/auth/...`, the host GitHub calls back to.
`/v2/admin/*` is the legacy path: `site-api` redirects it to `/admin/*`.

The `site` Worker renders the `/dev/*` pages and answers `/oauth/login`
itself. It forwards `/oauth` and every other `/oauth/*` path to `site-api`
through the `API` binding. `site-api` has no page at bare `/oauth`, so it
answers `404`.

The site does not store GitHub access tokens after login. The session proves
the owner is present. It is not a vault for provider tokens.

## Reader OAuth

Reader sign-in for comments is separate from owner sign-in. It never grants
admin access.

| Path | Role |
| --- | --- |
| `/oauth/reader/:provider` | Starts reader sign-in with `github` or `google`. |
| `/oauth/reader/:provider/callback` | Completes it. |

These run on `site-api` and reach `buxx.me` through the `/oauth/*` forwarder.
Nothing on the site links to them yet. They answer `404` when comments are
off, the provider is unknown, or its credentials are unset. Their
configuration is in the owner-only
[comments platform](/docs/platform/comments#reader-oauth) reference.

## Design rules

- Keep one human authority: the allow-listed GitHub login.
- Do not expose connector credentials or provider tokens to the browser.
- Do not pass `admin_session` into sandboxes, MCP servers, or external model
  clients.
- When a non-browser client needs access, mint a short-lived machine credential
  from the owner session.
- Give every client an explicit scope and an audit trail.
- Treat non-standard sources as connector credentials. Do not model them as
  fake OAuth providers.

## Target clients

| Client | Boundary | First useful credential |
| --- | --- | --- |
| Agent sandbox | Runs user-approved jobs against private site resources | Short-lived sandbox token |
| Knowledge connectors | Imports or syncs saved content from external platforms | Source-scoped connector credential |
| MCP server | Exposes selected tools and resources to external model clients | MCP-scoped bearer token |
| Admin portal | Human-only control plane | `admin_session` |

## Build order

1. Add an internal app registry for sandbox, connector, and MCP clients.
2. Add a token exchange endpoint that requires `admin_session` and returns
   short-lived machine credentials.
3. Add a server-side credential store for source connectors.
4. Add audit events for token minting, connector syncs, and MCP tool access.
5. Publish MCP auth metadata only after scopes and resources are real.

## Non-goals

- A generic OAuth provider, before there are real clients.
- Connecting X, Zhihu, Substack, Xiaohongshu, or other sources directly in the
  login flow.
- Long-lived platform tokens in client-side state.
- A second admin login system.
