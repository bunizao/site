# `/static/` proxy hardening

**Scope.** Close the same-origin-execution and open-relay holes in
`/static/[...path]` **without constraining what the proxy may serve in future** —
the proxy is the designated path for third-party assets that must not be stored
long-term, and that role is expanding.

**Depends on.** Nothing.
**Blocks.** [youtube-embed-card.md](youtube-embed-card.md) — its poster needs
`i.ytimg.com` proxied, which must not happen before signing lands.
**Repos.** `site`.

**Implementation status.** Response confinement and the rotating-key signed URL
machinery are complete. Runtime defaults to `observe`; real producers still emit
legacy URLs. No signing secrets, mode changes, `i.ytimg.com` allowlist entry, or
Cloudflare WAF rule have been applied.

---

## The role of this proxy (decided)

The proxy exists for **third-party assets that should stay ephemeral**:
custom emoji, channel avatars, og:images, YouTube posters. These are not our
content. Caching them in R2 would mean indefinitely storing someone else's
bytes, serving stale posters after a video changes, and paying operational
weight (backfill job, key scheme, write-back) for a passthrough.

R2 is for **our** durable content (mood media). The proxy is for **theirs**.

The requirement is: *every reader worldwide loads a complete article.* That is a
reachability problem, and a proxy is the right tool for it.

So this plan does **not** try to shrink the proxy's job. It makes the proxy safe
to grow.

## Current state and the actual risk

This section records the pre-hardening state that motivated the plan. Current
code rejects executable responses and understands signed requests, but remains
in observation mode until producer migration and rollout evidence are complete.

`src/pages/static/[...path].ts` proxies any URL whose host matches
`TELEGRAM_ALLOWED_DOMAINS` plus the `PUBLIC_HD_IMAGE_URL` host. Probed in
production:

```
GET https://buxx.me/static/https://t.me/tutumood
→ 200, content-type: text/html; charset=utf-8
→ access-control-allow-origin: *
→ CSP (site-wide): script-src 'self' 'unsafe-inline' ...
```

1. **Same-origin HTML execution.** Arbitrary allowed-host content renders from
   the `buxx.me` origin. `nosniff` is set but does not help when upstream
   *declares* `text/html`. With `'unsafe-inline'` in the CSP, any allowed host
   that returns attacker-influenced `text/html` or `image/svg+xml` yields full
   JS execution on the origin carrying the dev-portal session cookie.
   `telesco.pe` and `cdn*.telegram-cdn.org` distribute arbitrary user-uploaded
   channel files. No live exploit was constructed; the mitigation is cheap
   enough that proving it first is the wrong order.
2. **Open relay.** `/static/<any t.me URL>` is a general-purpose Telegram mirror.
   The cost is not bandwidth — it is `buxx.me` being classified as a proxy and
   blocked, destroying the reason the proxy exists.
3. **The rate limiter is decorative.** `src/lib/security/rate-limit.ts:23` keeps
   state in a module-level `Map` inside the isolate. Workers run many isolates
   per colo and recycle them, so "240/min per IP" is really "per IP *per
   isolate*". It cannot bound a distributed or persistent abuser.

## Why signing, and not a tighter allowlist

A host/path allowlist trades safety against expandability — every new asset
source is a new hole punched in the same public surface.

Signing does not make that trade. **The server can mint a URL for any host it
chooses; the public can mint none.** Adding `i.ytimg.com` to a signed proxy adds
zero public attack surface, because there is no open passthrough left to abuse.
Signing is what makes the proxy safe to grow, which is exactly the requirement.

## Steps

### 1. Content-type lockdown (do first, breaks nothing)

In `buildProxyResponse()`:

- Allow image, video, audio, font, and `application/octet-stream` assets. Preserve
  JSON only for the exact Telegram animated-emoji metadata route. Reject SVG,
  HTML, JavaScript, and every other type with `415` and no body.
- **Overwrite** the response `content-type` with the sanitized value rather than
  passing upstream's through.
- Add `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and a
  response-scoped `Content-Security-Policy: default-src 'none'; sandbox`.
- Keep `Access-Control-Allow-Origin: *` — assets are public; hotlink control is
  step 2's job, not CORS's.

This removes the entire XSS class and cannot break a caller, because every
current caller requests media.

### 2. Signed URLs

- Shape:
  `/static/<base64url(target)>?k=<keyId>&e=<unixExpiry>&s=<hmac>`, HMAC-SHA256
  over `${keyId}\n${target}\n${expiry}` with `STATIC_PROXY_SECRET`.
- Keep current and previous key ID/secret pairs during rotation. The verifier
  accepts either complete pair without exposing secrets to client bundles.
- **Long expiry (30 days minimum).** These URLs land in cached HTML, D1 rows,
  and RSS; short expiries produce broken images in archived content. Long expiry
  is acceptable because the secret is rotatable.
- One minting helper; route every call site through it. Current seams:
  `mood/shared/utils.ts:42`, `mood/server/telegram-source.ts` (many),
  `mood/server/channel-service.ts:117,132,177`,
  `features/content/rich-content.ts:342`, `mood/ui/Hero.astro:42`.
- **`mood/client/animated-emoji.ts:37,66` and
  `mood/client/feed-media-hydration.ts:343` run client-side** and cannot hold the
  secret. Two options, pick during design:
  - have the server emit signed URLs into the markup the client hydrates from; or
  - give emoji a dedicated `/emoji/{id}.webp` route with no user-supplied URL at
    all — strictly safer and simpler than signing for a closed, id-addressed set.
- **Migration is non-negotiable.** `observe` accepts unsigned and invalid signed
  requests while recording hostname-only route families. `accept-both` accepts
  valid signed and unsigned legacy requests but rejects explicitly invalid
  signatures. Run it for at least 30 days so cached HTML, RSS readers, and
  D1-stored markup drain, then flip to `enforce`. The unsigned log is the go/no-go
  signal.

The minting helper exists, but producer migration crosses protected server,
shared, client, and UI paths. Keep it deferred until frontend handoff.

### 3. Host allowlist becomes a server-side concern

Once signing is enforced, the allowlist stops being a security boundary and
becomes an intent check. Keep it (defence in depth, and it catches minting
bugs), but growing it is now a routine change:

- add `i.ytimg.com` for YouTube posters
- add whatever og:image hosts the blog needs

Document in the file that additions are safe **only while signing is enforced**.

### 4. Edge rate limiting (Cloudflare-native, zero code)

Do not try to fix the in-isolate limiter. Add a Cloudflare **Rate Limiting rule**
on `/static/*` in the WAF — it runs before the Worker, costs no invocations, and
holds state across the colo. Start at 60 req/min per IP with a managed challenge
on exceed; tune against real traffic.

Leave `src/lib/security/rate-limit.ts` in place for other routes but add a
comment stating its per-isolate semantics, so nobody mistakes it for a real
control again.

The per-isolate warning is implemented. The Cloudflare rule remains a production
configuration gate and has not been created.

## Acceptance

- `/static/` on a `text/html` target → 415.
- Every mood surface (feed, detail, embed, home preview, RSS) renders emoji,
  avatars, and v1 fallbacks unchanged.
- Unsigned-hit log empty (or explained) before signed-only is enabled.
- Rate limiting rule visible in the dashboard with a non-zero match count under
  synthetic load.
- Adding a new host is a one-line change with no new public surface.

## Non-goals

- Shrinking what the proxy serves. Its role is growing by design.
- Moving third-party assets into R2.
