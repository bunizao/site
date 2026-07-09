# CV PRD — Bilingual Resume with Redaction and Approval-Gated Full View

Status: approved for implementation
Branch: `feat/cv` (this repo) + a sibling branch in `../site-api`
Owner decisions locked on 2026-07-09 after design grilling.

---

## 1. Overview

A resume page at `/cv` on buxx.me, plus a matching PDF. One structured data
source renders both. Design follows the 無人之境 / site design language, with
[BartoszJarocki/cv](https://github.com/BartoszJarocki/cv) as the structural
reference only (section inventory, print-friendly single column) — **not** a
visual port. Redesign visuals fresh in this site's design language.

### Goals

- Elegant web resume + elegant PDF, bilingual (en/zh), from one data source.
- Real CV data lives in the **private** `site-api` repo; the public repo never
  contains real PII.
- Selected fields render as **redacted** for anonymous visitors. The threat
  model is **crawlers and search indexing** (the owner's real Chinese name,
  phone, private email must never appear in anonymous SSR HTML), not human
  secrecy.
- Humans who want the full version request access (email + intent); the owner
  approves in the existing dev portal; approval sends a signed magic link.
- The owner can mint a **long-lived magic link** from the dev portal to paste
  into job applications (outbound), no per-visitor approval needed.
- The owner always sees the full version via the existing Cloudflare Access
  session.

### Non-goals

- No CRUD editor for CV content. Editing = edit a TypeScript file in
  `site-api`, deploy.
- No per-token revocation, no open-tracking, no grants table. Two-level
  kill switch only: rotate the owner link, or rotate the signing secret
  (invalidates every issued token).
- No redacted PDF. The PDF is always the full version and always token/session
  gated.
- No third language. `en` (default) and `zh` only.

---

## 2. Decisions of record

| # | Decision | Choice |
|---|----------|--------|
| D1 | Data storage | Committed typed file `cv.ts` in `site-api` (no D1). Shared types in `@bunizao/contracts` (canonical in `site`). Redacted sample fixture committed in `site` for dev preview. |
| D2 | Redaction model | Any leaf field supports `{ value, redacted: true }`. Default policy: only contact PII redacted (real name, phone, private email, precise address). Work/projects/skills public. |
| D3 | Visitor access | Email + intent form → pending request → owner approves in dev portal → magic link emailed. HMAC-signed token, no session table. |
| D4 | Owner long-lived link | Minted in dev portal, same token format, default 180 days. Rotatable (mint new = old one dies via `linkVersion` claim). |
| D5 | Language | `en` default, `zh` toggle. Both fully translated in the data model. |
| D6 | PDF | Cloudflare Browser Rendering renders a print route → cached in R2. "View PDF" serves the cached file; no browser print dialog. Free tier (10 min/day) is ample with caching. |
| D7 | PDF policy | Always full version, always gated. Anonymous "View PDF" click routes to the request-access flow. |
| D8 | Route | `/cv` standalone page on the public site. |
| D9 | PDF languages | Two artifacts: `cv-en.pdf`, `cv-zh.pdf`. "View PDF" serves the current UI language. |
| D10 | Approval email | Reuse site-api's existing notify email channel. |

---

## 3. Architecture

```
site (public repo, this one)                site-api (private repo, ../site-api)
────────────────────────────                ────────────────────────────────────
/cv page (Astro, SSR)          ──service──▶ GET  /api/cv?lang=&full=   (data read)
/cv request form (island)      ──binding──▶ POST /api/cv/request       (access request)
/cv/print print route (gated)               GET  /api/cv/pdf?lang=     (R2-cached PDF)
/dev/portal/cv (owner UI)      ──────────▶ /api/admin/cv/*            (queue, approve, mint)
                                            cv.ts        (real data, private)
                                            token.ts     (HMAC sign/verify)
                                            pdf.ts       (Browser Rendering + R2)
contracts: CvDocument types (canonical here, synced to site-api)
fixture: src/features/cv/data/sample.ts (fake, redacted-representative)
```

Trust boundary: `site` never holds real PII at rest. In production the full
CV crosses the service binding only after `site-api` has verified either a
valid magic-link token or a Cloudflare Access JWT.

### Token design

- Compact HMAC token: `base64url(payload).base64url(hmac-sha256(payload, CV_TOKEN_SECRET))`.
- Payload claims: `{ email?, kind: 'grant' | 'owner-link', exp, linkVersion }`.
- `kind: 'grant'` — minted on approval, emailed to the requester.
- `kind: 'owner-link'` — minted by the owner in the portal. `linkVersion` is a
  single integer stored in site-api KV; minting a new owner link bumps it, and
  verification rejects stale versions. This yields rotation without a table.
- Redeem flow: `/cv?key=<token>` → server verifies via site-api → sets a
  short-lived (7 d) signed cookie `cv_full` → redirects to clean `/cv`.
- Kill switches: bump `linkVersion` (kills owner links) or rotate
  `CV_TOKEN_SECRET` (kills everything).

### Crawler hygiene (core requirement)

- Anonymous SSR HTML must never contain redacted values. Redaction happens
  **server-side in site-api** before the payload crosses the binding: the
  public read replaces redacted leaves with `{ redacted: true }` (value
  stripped, not masked client-side).
- `X-Robots-Tag: noindex` on: any `/cv` response rendered with full data, the
  `?key=` redeem URL, the print route, and the PDF endpoint. The plain
  anonymous `/cv` (redacted) **is indexable** — it is the public resume.

---

## 4. Data model (`@bunizao/contracts`, new module `cv.ts`)

Keep it small and boring. Sketch (implementer refines, but do not add layers):

```ts
export interface Localized { en: string; zh: string }

/** A field the owner may hide from anonymous visitors. */
export interface Redactable {
  value: Localized;
  redacted?: boolean;      // true → public read strips `value`
}

export interface CvLink { label: Localized; url: string }

export interface CvWorkItem {
  company: Redactable;     // usually public
  role: Localized;
  location?: Redactable;
  start: string;           // 'YYYY-MM'
  end?: string;            // absent = present
  summary: Localized;
  highlights: Localized[];
  tags?: string[];
}

export interface CvEducationItem { /* school, degree, start, end — same shapes */ }

export interface CvDocument {
  updatedAt: string;              // ISO date, shown on page + PDF footer
  identity: {
    displayName: Localized;       // public handle / English name
    legalName: Redactable;        // real Chinese name — redacted: true
    headline: Localized;
    location: Redactable;         // public value = city-level; redacted variant = precise
    email: Redactable;            // professional contact — owner decides
    phone: Redactable;            // redacted: true
    links: CvLink[];              // github, blog, etc.
  };
  summary: Localized;
  work: CvWorkItem[];
  education: CvEducationItem[];
  projects: { name: Localized; url?: string; description: Localized; tags?: string[] }[];
  skills: { group: Localized; items: string[] }[];
}
```

Public read type: `CvPublicDocument` = same shape but every `Redactable` leaf
becomes `{ redacted: true } | { value: Localized }`. Export a
`redactCvDocument(doc): CvPublicDocument` helper **in contracts** so both
repos share the stripping logic and the fixture can exercise it.

After editing contracts here, sync into `../site-api` with
`bun run sync:contracts` (run in `site-api`). Contracts are byte-identical
duplicated; `site` is canonical.

---

## 5. Backend work (`../site-api`) — do this first

The frontend consumes these endpoints; build and deploy them behind a flag
before starting frontend integration (frontend dev uses the fixture meanwhile).

### B1. Contracts sync + data file

- Sync the new `cv.ts` contracts module.
- `src/cv/data.ts` (or the repo's idiomatic location): export `const CV: CvDocument`
  with the real content. **This file is the only place real PII exists.**
  Seed it with placeholder text; the owner fills real content himself.

### B2. Token service

- `CV_TOKEN_SECRET` (worker secret), `linkVersion` in KV (key `cv:link-version`, default 1).
- `signCvToken(claims)`, `verifyCvToken(token)` — HMAC-SHA256 via WebCrypto,
  constant-time compare, reject expired / bad version / malformed.
- Unit tests: round-trip, tamper, expiry, version bump invalidation.

### B3. Public read endpoints

- `GET /api/cv?lang=en|zh` → `CvPublicDocument` (redacted). Cacheable
  (short TTL + cache tag consistent with existing edge-cache patterns).
- `GET /api/cv?full=1` → full `CvDocument`, **only if** request carries a
  valid `cv` token (header or query) **or** a verified Cloudflare Access JWT
  (reuse the existing Access verification used by admin routes). Otherwise 401.
  `Cache-Control: no-store` + `X-Robots-Tag: noindex`.

### B4. Access requests

- D1 table `cv_access_requests`:
  `id, email, intent, lang, status ('pending'|'approved'|'rejected'), created_at, decided_at`.
  One migration, no ORM ceremony.
- `POST /api/cv/request` `{ email, intent, lang }` — validate email shape,
  cap intent length (~500 chars), rate-limit per IP (reuse existing
  rate-limit util if present), dedupe pending per email. Returns `{ ok: true }`
  regardless of dedupe (no enumeration).
- Optional but cheap: notify the owner via the existing notify channel that a
  request arrived.

### B5. Admin endpoints (Access-JWT gated, same guard as other `/api/admin/*`)

- `GET  /api/admin/cv/requests?status=` — list queue.
- `POST /api/admin/cv/requests/:id/approve` — mark approved, sign a
  `grant` token (180 d), email the magic link `https://buxx.me/cv?key=…`
  via the notify email channel (plain, short, bilingual-neutral template).
- `POST /api/admin/cv/requests/:id/reject`.
- `POST /api/admin/cv/owner-link` — bump `linkVersion`, sign a fresh
  `owner-link` token (180 d), return the URL. Response is the only place it is
  shown; not stored.

### B6. PDF pipeline

- Enable the Browser Rendering binding (`browser`) and an R2 bucket (reuse an
  existing bucket with a `cv/` prefix if one fits).
- `GET /api/cv/pdf?lang=` — gated identically to `full=1`. Flow:
  1. Cache key: `cv/{lang}-{hash(CV serialized + template version)}.pdf`.
  2. R2 hit → stream it (`content-type: application/pdf`,
     `content-disposition: inline; filename="…"`, `X-Robots-Tag: noindex`).
  3. Miss → launch browser, load `https://buxx.me/cv/print?lang=…&key=<one-shot internal token>`,
     `page.pdf({ format: 'A4', printBackground: true })`, put to R2, stream.
- The internal token for the print fetch is a normal `grant` token minted
  server-side with a 5-minute expiry — no special path.
- Failure mode: Browser Rendering error → 503 with a friendly retry message;
  never fall back to serving a redacted PDF.

### B7. Production route

- Ensure `buxx.me/api/cv*` is covered by the existing direct route to
  site-api (it is under `/api/*`, so it should be; verify).

---

## 6. Frontend work (`site`, this repo)

### F1. Contracts + fixture

- Add `packages/contracts/src/cv.ts` (types + `redactCvDocument`), export from
  `index.ts`. Unit-test the redaction helper in `tests/unit`.
- `src/features/cv/data/sample.ts`: a **fake but realistic** `CvDocument`
  (fake name, fake phone, plausible work history) used automatically when the
  API is unreachable in dev. Never real data.

### F2. Read path (`src/features/cv/server/api-client.ts`)

Mirror the mood feature's api-client pattern:

- `getCv(locals, { lang, full })`:
  - Production / `bun dev:api`: fetch from site-api via the service binding /
    dev proxy (same mechanism the mood client uses).
  - Plain `bun dev` with API unreachable: fall back to
    `redactCvDocument(SAMPLE)` (or full sample when a dev-bypass admin session
    exists). Log which source served, once.
- This gives instant HMR preview on fixture edits, and `bun dev:api` for the
  real gated path.

### F3. `/cv` page (`src/pages/cv.astro` + `src/features/cv/ui/*`)

- SSR, `prerender = false`.
- Server flow: read `key` param → if present, verify via site-api, set `cv_full`
  cookie (7 d, `HttpOnly`, `Secure`, `SameSite=Lax`), redirect to `/cv`.
  Then: owner Access session or valid `cv_full` cookie → fetch full; else
  fetch public. Full renders get `X-Robots-Tag: noindex`; the redacted page
  is indexable.
- `?lang=zh` switches language; default `en`. Language toggle is a link, not
  JS state — both variants must SSR (crawlers should index the redacted page
  in both languages; use `rel="alternate" hreflang`).
- Layout: single column, print-inspired, A4-ish max-width (~72ch). Sections:
  identity header → summary → work → projects → education → skills → footer
  (`updatedAt`, PDF link).
- **Redacted rendering**: a redacted field renders as an inline blurred/hatched
  placeholder chip (`aria-label="redacted"`), sized like plausible content,
  with a subtle lock glyph. Clicking any redacted chip (or "View PDF" while
  anonymous) opens the request-access panel. The placeholder text must be
  static dummy glyphs — never a masked transform of the real value.
- Request-access panel: email + intent textarea + submit → POST to
  `/api/cv/request` → success state "You'll receive a link once approved."
  Small React island; the rest of the page stays static Astro.
- Design: follow `/frontend-design` + `/make-interfaces-feel-better` skill
  guidance at implementation time. Site design language: Inter for reading
  content, mono only for the metadata spine (dates, tags, section labels) —
  consistent with the home "mono→human descent" system. No dividers-for-
  hierarchy; spacing and color. Restrained motion (existing scroll-reveal
  conventions; remember new reveal classes need their own FOUC-hide entry).

### F4. Print route (`src/pages/cv/print.astro`)

- Same data + components, print-tuned standalone stylesheet: A4 page box,
  `@page` margins, no nav/footer chrome, no motion, black-on-white.
- Gated exactly like full `/cv` (token or Access). Never renders redacted.
- **CJK font risk**: Browser Rendering's Chromium has no guaranteed CJK
  coverage — zh PDF would render tofu with system fonts. The print route must
  self-host a CJK face via `@font-face` (e.g. LXGW WenKai or Noto Sans SC,
  full-weight woff2 loaded only on this route; size is irrelevant for a
  one-shot render). Verify glyphs in the generated PDF before calling B6 done.

### F5. Dev portal page (`src/pages/dev/portal/cv.astro`)

- Follow the existing portal page pattern (PortalLayout + portal-client
  loader + shadcn cards).
- Sections: pending requests queue (email, intent, age, Approve/Reject
  buttons), decided history (last N), owner-link card ("Mint new link" →
  shows URL once with copy button + warning that the previous link is now
  dead), PDF cache card (current cache keys, "Purge" button optional/defer).
- Wire through `src/features/admin/server/portal-client.ts` (`adminGet` +
  a small `adminPost` sibling forwarding the Access JWT).

### F6. Home surface (optional, last)

- A one-line pointer to `/cv` from the home identity area. Do not build a
  section for it; a link suffices. Defer if scope pressure.

---

## 7. Copy & i18n

- All UI chrome strings (buttons, form labels, redaction tooltip, success
  states) exist in both languages, keyed off the same `lang` as the content.
  A tiny `const STRINGS: Record<'en'|'zh', {...}>` in the feature — no i18n
  library.
- Email template (magic link): English with a short Chinese line, since the
  requester's language preference is captured on the form (`lang` field) —
  send the matching primary language.

## 8. Rollout

1. Land contracts + fixture + `/cv` public rendering (fixture-backed) in this
   repo behind nothing — the redacted page is safe by construction.
2. Land site-api: data file (placeholder), token service, public read.
   Point `/cv` at the real read via `bun dev:api`; verify parity with fixture.
3. Land requests + admin + email; verify approve→email→redeem end to end in
   preview.
4. Land PDF pipeline; verify en + zh glyphs, R2 caching, gating.
5. Owner fills real `cv.ts` content, deploys, mints owner link.

## 9. Acceptance checklist

- [ ] Anonymous `curl https://buxx.me/cv` HTML contains no redacted values
      (grep for the real name must fail) and no `noindex`.
- [ ] `curl "…/cv?key=<valid>"` → 302 with `Set-Cookie: cv_full` → full render
      carries `X-Robots-Tag: noindex`.
- [ ] Expired / tampered / version-bumped tokens → redacted view, no error page.
- [ ] Owner with Access session sees full view with no token.
- [ ] Request → portal approve → email arrives → link works; reject leaves
      requester on redacted view.
- [ ] Mint owner link twice; the first link stops working.
- [ ] `GET /api/cv/pdf?lang=zh` renders real CJK glyphs; second fetch is an R2
      hit (check timing/header).
- [ ] Anonymous PDF fetch → 401; UI routes to request panel instead of a dead
      link.
- [ ] `bun dev` with no local API renders the fixture; `bun dev:api` renders
      site-api data.
- [ ] Lighthouse on `/cv` is consistent with the site's existing gate.

## 10. Implementer notes (read before writing code)

Aimed at lower-capability agents; violating these has bitten this repo before.

1. **Never put real PII in this repo** — not in fixtures, not in tests, not in
   stories, not in commit messages. The fixture is fake data.
2. **Redact server-side.** Do not send full values to the client and hide
   them with CSS/JS. If you can see the real name in view-source of an
   anonymous page, the feature has failed its only job.
3. **Contracts flow one way.** Edit `packages/contracts` in `site`, then run
   `bun run sync:contracts` inside `../site-api`. Never hand-edit the copy in
   site-api.
4. **Dev runtime**: `astro dev` is native Node SSR; the Cloudflare adapter and
   service bindings exist only in build/`wrangler dev`. `/api/*` in dev is an
   HTTP proxy to `API_DEV_ORIGIN`. Use `bun dev:api` to hit a local site-api.
   Requires Node ≥ 22 — a Node 18 shell silently breaks every wrangler command.
5. **Astro islands**: never read `window` in a `useState` initializer —
   initialize to a constant and read the real value in an effect (mobile
   hydration freeze otherwise).
6. **CJK text-wrap**: do not use `text-wrap: pretty` on CJK content (Safari
   breaks lines short); use `wrap`. Do not use justify/center to fix it.
7. **Fonts**: use the tokens from `src/lib/fonts.ts` (`FONT_SANS`, `FONT_MONO`,
   …). Reading content is Inter; metadata spine is mono. Do not introduce new
   font families except the print-route CJK face (F4).
8. **Commit style**: Conventional Commits, imperative, no "for/to <rationale>"
   suffixes. English only, comments included. Commit small chunks immediately
   (Dropbox can clobber uncommitted edits). If commit hangs, it is SSH
   signing — use `git -c commit.gpgsign=false commit …`.
9. **Verification**: builds/tests may hit sandbox EPERM on the Dropbox mount —
   hand `bun run check` / `bun run build` / tests to the user's terminal when
   that happens. Verify UI with the repo's Playwright flow against a served
   build, not the hidden preview tab.
10. **Token crypto**: WebCrypto `crypto.subtle` HMAC only. No new dependencies
    for signing. Constant-time comparison for the MAC.
11. **No new abstractions**: no repository pattern, no service classes, no
    i18n framework, no state library. Follow the mood feature's file layout
    (`features/cv/{server,ui,data}`) and the existing portal page pattern.
12. **Cache discipline**: full-view and PDF responses are `no-store`. Only the
    anonymous redacted page participates in the existing HTML edge cache; make
    sure the `cv_full` cookie and `key` param bypass it (check
    `isNeverCachePath` / cache-key logic in `src/middleware.ts`).
