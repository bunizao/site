---
title: Access hub
description: The owner-auth control plane — how the site grants short-lived credentials to sandboxes, connectors, and MCP clients.
public: true
---

The Access hub is the owner-auth control plane. Human login is handled by Cloudflare Access, while the app verifies the Access JWT and gives future sandbox jobs, knowledge connectors, and MCP clients one place to request narrower credentials.

## Current scope

- Cloudflare Access gates `/dev*`, `/api/admin*`, and `/v2/admin*`.
- `/oauth/login` is a compatibility route that redirects back to the requested admin path.
- `site-api /v2/admin/*` validates the forwarded Access JWT before serving private admin data.
- `/dev/*` is rendered by the public `site` Worker; `site-api` only owns private admin data APIs.

The current implementation does not store provider access tokens after login. That's deliberate: the Access identity proves the owner is present, it is not a provider-token vault.

## Design rules

- Keep one human authority — the allow-listed email in Cloudflare Access.
- Don't expose connector credentials or provider tokens to the browser.
- Don't pass the Access JWT into sandboxes, MCP servers, or external model clients.
- Mint short-lived machine credentials from the owner identity when a non-browser client needs access.
- Give every client an explicit scope and an audit trail.
- Treat non-standard sources (X, Substack, Xiaohongshu, Zhihu) as connector credentials, not fake OAuth providers.

## Target clients

| Client | Boundary | First useful credential |
| --- | --- | --- |
| Agent sandbox | Runs user-approved jobs against private site resources | Short-lived sandbox token |
| Knowledge connector | Imports or syncs saved content from external platforms | Source-scoped connector credential |
| MCP server | Exposes selected tools/resources to external model clients | MCP-scoped bearer token |
| Admin portal | Human-only control plane | Cloudflare Access JWT |

## Build order

1. Add an internal app registry for sandbox, connector, and MCP clients.
2. Add a token exchange endpoint that requires a verified Access identity and returns short-lived machine credentials.
3. Add a server-side credential store for source connectors.
4. Add audit events for token minting, connector syncs, and MCP tool access.
5. Publish MCP auth metadata only after scopes and resources are real.

## Non-goals

- No generic OAuth provider before there are real clients.
- No connecting X, Zhihu, Substack, Xiaohongshu, or other sources directly in the login flow.
- No long-lived platform tokens stored in client-side state.
- No second admin login system.
