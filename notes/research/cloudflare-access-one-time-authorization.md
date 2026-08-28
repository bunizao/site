# Cloudflare Access one-time authorization

Research date: 2026-08-09

## Conclusion

Cloudflare Access does **not** provide a documented API or dashboard feature
that lets an administrator or gateway mint an arbitrary, shareable, single-use
authorization code which Access will accept at the edge.

Access has several nearby features, but each makes only the login or exchange
step single-use. Successful authentication still produces a reusable session or
token. The right design depends on whether the caller is a human browser,
interactive CLI, or headless service.

## Native options

| Option | What is one-time | Resulting access | Fit |
| --- | --- | --- | --- |
| Email One-time PIN | A Cloudflare-emailed PIN; single-use, 10-minute expiry | Reusable Access application session | Human guest whose email is already allowed by policy |
| Temporary Authentication | Approval must be requested again after each session | Approver-selected grant, up to 24 hours | Just-in-time human access |
| Managed OAuth | OAuth authorization code is exchanged once | Reusable opaque access token plus refresh grant | Interactive OAuth-aware CLI or agent |
| Service Token | Nothing; Client ID and secret are reusable | Machine access until expiry or deletion | CI, cron, and server-to-server clients |

### Email One-time PIN

Cloudflare sends OTP only after the user enters an email address allowed by an
Access policy. Each PIN is single-use, expires after 10 minutes, and requesting
a new PIN invalidates the previous one. It is an authentication method, not an
administrator-issued invite code. A valid PIN creates the normal reusable
Access session. See [One-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

### Temporary Authentication

An authenticated user submits a purpose justification and access request. An
approver can grant access for up to 24 hours, and the user must request approval
again when the session ends. The approval link is for the approver; it is not a
bearer link that lets the requester skip identity verification. See
[Temporary Authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/temporary-auth/).

### Managed OAuth

Managed OAuth turns a self-hosted Access application into an OAuth authorization
server for non-browser clients. The client discovers Access metadata, opens a
browser for normal identity login, exchanges an authorization code, and receives
an opaque bearer token. The authorization code is single-use, but
the access token is reusable; its default lifetime is 15 minutes, and a refresh
token can renew access for the configured grant session. See
[Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
and [RFC 6749 section 4.1.2](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2).

### Service Token

A service token is a reusable Client ID and Client Secret pair accepted by a
Service Auth policy. Requests normally send `CF-Access-Client-Id` and
`CF-Access-Client-Secret`; an application can instead read both from one custom
header. Tokens can have a custom duration and can be rotated or deleted, but
they remain replayable until expiry or deletion. See
[Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

Creating a very short service token and deleting it after the first request does
not provide atomic consume-once behavior: concurrent requests can replay it
before deletion takes effect.

## Edge constraint for a custom code

Access evaluates a protected request before the origin can handle it. A custom
header such as `Authorization: Bearer <invite-code>` is unknown to Access and
cannot reach an ordinarily protected origin unless the request also satisfies
an Access Allow, Managed OAuth, or Service Auth policy.

A custom redemption endpoint must therefore use one of these designs:

- integrate a custom OIDC identity provider that atomically consumes the code,
  then let Access issue its own application session; or
- place a dedicated redemption path or hostname behind a narrowly scoped Bypass
  rule and let the gateway fully own code verification, replay protection,
  expiry, rate limiting, and audit logs.

Cloudflare states that Bypass disables Access enforcement and Access logging for
matching traffic. It must not be applied broadly. See
[Access policy actions](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/#bypass)
and [Generic OIDC](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/generic-oidc/).

## Generic API client limitation

Managed OAuth only works transparently when the client implements the required
OAuth discovery and browser flow. Cloudflare requires RFC 8707 support and
publishes RFC 8414/RFC 9728 metadata. A typical OpenAI- or Anthropic-compatible
client configured only with `base_url` and `api_key` does not perform that
discovery, PKCE exchange, or refresh flow.

OpenAI-compatible clients normally use `Authorization: Bearer <api-key>`; see
[OpenAI API authentication](https://developers.openai.com/api/reference/overview/#authentication).
Anthropic clients normally use `x-api-key` or `Authorization`; see
[Anthropic API authentication](https://platform.claude.com/docs/en/api/overview#authentication).

Consequences:

- a generic client needs a helper or local adapter that completes Managed OAuth
  and refreshes the Access token;
- if `Authorization` carries the Access token, it cannot simultaneously carry a
  separate gateway Bearer key; and
- service tokens require clients that can attach the Cloudflare custom headers.

## Recommendation

- **Human browser:** use an exact-email guest policy with OTP. Enable Temporary
  Authentication when each session should require approval, and choose a short
  policy session.
- **Interactive CLI:** use Managed OAuth on a dedicated API hostname only when a
  controlled client or adapter supports RFC 8707/9728 and browser login.
- **Headless client:** use one short-lived service token per client under a
  dedicated Service Auth policy. Treat it as reusable, not one-time.
- **Manually issued code:** implement it in a custom OIDC provider or a narrowly
  bypassed gateway-owned redemption surface. Use atomic storage such as D1 or a
  Durable Object if consume-once semantics are required.

Do not create and delete Access policies or service tokens per invitation. They
are reusable control-plane objects, not single-use authorization grants.
