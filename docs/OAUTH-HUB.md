# OAuth Hub

The OAuth hub is the owner-auth control plane for the site. It starts with the GitHub OAuth admin session and gives future sandbox jobs, knowledge connectors, and MCP clients one place to request narrower credentials.

## Current Scope

- `/oauth/login` starts the human login flow.
- `site-api /v1/admin/auth/start` and `/v1/admin/auth/callback` perform GitHub OAuth.
- `admin_session` is the signed owner session cookie.
- `/oauth` routes to the protected hub; unauthenticated requests end at `/oauth/login`.
- `/dev/*`, `/oauth*`, and `/api/admin/*` on the public site are compatibility proxy routes into `site-api`.

The current implementation does not store GitHub access tokens after login. That is intentional. The session proves the owner is present; it is not a provider-token vault.

## Design Rules

- Keep one human authority: the allow-listed GitHub login.
- Do not expose connector credentials or provider tokens to the browser.
- Do not pass `admin_session` into sandboxes, MCP servers, or external model clients.
- Mint short-lived machine credentials from the owner session when a non-browser client needs access.
- Give every client an explicit scope and audit trail.
- Treat non-standard sources as connector credentials, not fake OAuth providers.

## Target Clients

| Client | Boundary | First useful credential |
| --- | --- | --- |
| Agent sandbox | Runs user-approved jobs against private site resources | Short-lived sandbox token |
| Knowledge connectors | Imports or syncs saved content from external platforms | Source-scoped connector credential |
| MCP server | Exposes selected tools/resources to external model clients | MCP-scoped bearer token |
| Admin portal | Human-only control plane | `admin_session` |

## Build Order

1. Add an internal app registry for sandbox, connector, and MCP clients.
2. Add a token exchange endpoint that requires `admin_session` and returns short-lived machine credentials.
3. Add a server-side credential store for source connectors.
4. Add audit events for token minting, connector syncs, and MCP tool access.
5. Publish MCP auth metadata only after scopes and resources are real.

## Non-Goals

- Do not build a generic OAuth provider before there are real clients.
- Do not connect X, Zhihu, Substack, Xiaohongshu, or other sources directly in the login flow.
- Do not store long-lived platform tokens in client-side state.
- Do not create a second admin login system.
