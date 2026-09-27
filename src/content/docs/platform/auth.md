---
title: Auth and OAuth hub
description: How owner sign-in works today, the rules for credentials, and the plan for sandbox, connector and MCP clients.
group: Platform
order: 3
---

The OAuth hub controls how the site owner signs in. Today it runs the GitHub
OAuth admin session. Later it will give sandbox jobs, knowledge connectors, and
MCP clients one place to request narrower credentials.

The portal used to have an "Access Hub" page at `/dev/portal/oauth` that showed
this roadmap. That page was removed from the portal UI. The auth boundary now
lives only in code (`src/middleware.ts` and
`src/features/admin/server/access.ts`), and this page is the canonical record
of intent.

## How sign-in works today

| Piece | Role |
| --- | --- |
| `/oauth/login` | Starts the human login flow. |
| `site-api /v2/admin/auth/start`, `/v2/admin/auth/callback` | Perform GitHub OAuth. |
| `admin_session` | The signed owner session cookie. |
| `/oauth` | Routes to the protected hub. Unauthenticated requests end at `/oauth/login`. |

`/dev/*` and `/oauth/login` are UI routes on the public site. `site-api` only
handles the `/v2/admin/*` API and OAuth endpoints.

The site does not store GitHub access tokens after login. The session proves
the owner is present. It is not a vault for provider tokens.

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
