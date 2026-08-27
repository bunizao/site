# Plan: Blog Post Translations

Give *specific* posts an alternate-language version. Both versions live behind
**one public URL**. The reader gets the language their browser asks for, can
switch by hand, and that choice is remembered.

This is not a bilingual site — the interface stays Chinese and most posts will
never have an English version. See [Where this is going](#where-this-is-going)
for the end state and the seams that keep it reachable.

## The shape

```
/blog/lun-chenmo              canonical URL of the logical article
/blog/lun-chenmo?lang=en      the English version, same article
/blog/on-silence              the translation's build path — 301 to the above
```

Ghost still holds two independent posts. The site treats them as one article.

## Ghost side: one internal tag on the translation

Ghost has no native i18n and no custom fields on the Content API. Internal tags
(`#`-prefixed) are the only per-post metadata channel, and this repo already
uses them for `#unlisted`, `#no-toc`, `#not-by-ai`.

```
#<locale>              this post is written in <locale>; no sibling versions
#<locale>:<canonical>  this post is the <locale> version of <canonical>
```

`<canonical>` is the slug of the default-locale post — which is also the
article's one public URL. `<locale>` is a BCP 47 tag, case-insensitive: `en`,
`zh-TW`, `zh-Hant`.

**The Chinese original carries no tag at all.** Publishing a translation is one
tag on one post (`#en:lun-chenmo`), so "wrote the translation, forgot to tag the
original" is not a state that can exist. An untagged post is the default locale,
which is why an English *original* needs the bare `#en` form — otherwise it
would be served as Chinese.

### Parse `tag.name`, never `tag.slug`

Ghost slugifies tag names (`#not-by-ai` → `hash-not-by-ai`). The colon does not
survive that transform, and once it is gone `#zh-tw:notes` and `#zh:tw-notes`
collapse to the same slug. `tag.name` is the string the author typed, verbatim,
`#` included — the mock fixtures show this shape at
`src/features/posts/adapter/mock.ts`.

Parsing `name` also removes Ghost's slugify rules from our data contract
entirely. They are a third-party string transform that can change between
versions; nothing load-bearing should sit downstream of it.

Normalize with `.toLowerCase()` and split on the **first** colon. Ghost slugs
cannot contain colons, so the split is unambiguous.

Confirmed against the live instance — a tag named `#en:test-test` comes back as:

```json
{ "name": "#en:test-test", "slug": "hash-en-test-test", "visibility": "internal" }
```

The colon survives in `name` and is gone from `slug`, exactly as assumed.

### Publishing checklist

1. New post, write the translation, same feature image.
2. Tag it `#en:<canonical-slug>`. Nothing else, nowhere else.
3. Do **not** set `canonical_url`. Pointing it at the original deindexes the
   translation; `hreflang` is the correct signal and the site work emits it.
4. Do **not** add `#unlisted` — see below.

### The newsletter must not re-broadcast translations

Publishing any post fires Ghost's `post.published` webhook at `../site-api`
(`src/pages/webhooks/ghost.ts`), which broadcasts to blog subscribers after a
300s delay. A translation is not a new article and must never send. This has
already happened once, to 5 subscribers, with a test post.

**`#unlisted` does not stop it, and never would have.** There is no tag gating
anywhere in site-api: the webhook reads the slug, `createGhostBlogSource.loadPost`
fetches the post with no tag filter, and `NotifyMoodPost` carries no `tags` field
at all — so the decision cannot be made downstream even in principle. Nothing
intercepts, so nothing was missed.

`#unlisted` would also be the wrong tool if it did work. It sets
`noindex, nofollow, noarchive, nosnippet`, and that HTML is exactly what gets
served at `?lang=en` — the English variant would drop out of the index while
`hreflang` kept pointing at it. **Translations must not carry `#unlisted`.**

The fix is a rule, not a habit: **site-api skips any post carrying a
`#<locale>:<canonical>` tag.** Such a post is by definition a version of
something already announced. In `../site-api`:

- `ghostPostToNotifyPost` carries the internal tag names onto `NotifyMoodPost`,
  or a single derived `translationOf?: string`.
- `dispatchBlogNotification` returns early with a distinct
  `skippedReason: 'translation'` — not `post_not_found_or_not_supported`, which
  would lie in the logs.
- The tag parser lives in `@bunizao/contracts` (`src/content.ts`), the surface
  both repos already share byte-identically. `site` stays canonical; run
  `bun run sync:contracts` in `../site-api` after editing.
- Regression test: a post tagged `#en:foo` produces zero sends.

**This ships before the first real translation is published.** Everything else
in this plan is reversible; a newsletter is not.

## Language resolution

```
?lang=<tag>  >  blog_lang cookie  >  Accept-Language  >  blog.locale.default
```

`Accept-Language` is a weighted list, not a language: `zh-CN,zh;q=0.9,en;q=0.3`
is a Chinese reader with an English fallback and must be served Chinese. Walk
the list in descending `q` and take the first language we have a version of;
`q=0` means "explicitly not this one" and falls out of the same loop.

Match with **RFC 4647 Lookup**: drop right-most subtags until something matches.
`zh-TW` → `zh-TW` → `zh`, so every `zh-*` reader lands on Chinese unless a
`#zh-TW:` version exists, at which point they land on it without any rule
change. `en-GB` → `en-GB` → `en`.

`src/features/agent-markdown/server/negotiation.ts` already parses `Accept` with
q-values for media types. The language version is the same parser with RFC 4647
matching in place of media-type specificity — generalize it, do not fork it.

Cookie: `blog_lang=<tag>; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
written by the edge when it sees an explicit `?lang=`. The query parameter
always wins, so a shared `?lang=zh` link is never hijacked by the recipient's
stored preference.

## Site side: swap the asset at the edge

`output: 'static'` — every post is a prerendered file and Pagefind indexes those
files. Serving two languages from one URL therefore cannot mean rendering on
demand. It means choosing which prerendered file to return:

```
GET /blog/lun-chenmo
  resolved zh → ASSETS.fetch('/blog/lun-chenmo/')   variant html:zh
  resolved en → ASSETS.fetch('/blog/on-silence/')   variant html:en
```

Astro already prerenders both posts — each is an ordinary Ghost post with its
own slug. **No build artifacts are moved or renamed.** The translation's build
path stays where Astro put it; it simply stops being a public URL.

That last distinction is the whole trick: a static file needs *a* path, but
nothing says that path has to be the public contract.

### 1. Manifest

`scripts/generate-i18n-manifest.ts`, run after `astro build` alongside
`generate-agent-markdown.ts`, emits `dist/client/_i18n/posts.json`:

```json
{
  "lun-chenmo": { "translations": { "en": "on-silence" } },
  "on-silence": { "canonical": "lun-chenmo", "locale": "en" }
}
```

One table, two entry kinds — the worker's single lookup answers both "does this
article have an English version" and "is this path a translation that must
redirect".

The same script **validates and fails the build**: unknown locale tags, `#tr`
targets that do not resolve to a real post, two posts claiming the same locale
in one group, a group whose canonical member does not exist. Precedent:
`scripts/check-route-contracts.ts`.

Read it in the worker through the `ASSETS` binding, cached at module scope — the
manifest ships with the build, so within one deployment it cannot change. Mirror
`readBuiltBlogMarkdown`, including its dev fallback: no `ASSETS` binding means
`astro dev`, where the resolver computes from `getAccessiblePosts()` directly.

### 2. Where the swap lives

In `src/features/agent-markdown/server/responses.ts`, as a shared function
called from **both** `src/worker.ts` and `src/middleware.ts`.

This is not optional. Middleware does not run for prerendered routes in
production, which is why `worker.ts` already duplicates the markdown negotiation
path; dev flips those routes to on-demand (`astro.config.mjs`, the
`buxx-negotiated-content-dev-ssr` integration) so middleware handles them there.
Anything that lands in one and not the other is a dev/prod divergence that no
test in this repo will catch.

### 3. Cache correctness

Three things must be true together, and getting two of three silently serves the
wrong language to real readers.

- **Variant key.** `EdgeCacheVariant` widens from `'html' | 'markdown'` to carry
  the resolved locale. `buildVariantCacheKey` already folds `variant` into the
  key, so `html:zh` and `html:en` become separate cached objects on one URL.
- **No CDN URL cache for grouped posts.** `Cloudflare-CDN-Cache-Control` caches
  by URL and knows nothing about the cookie — it would hand the Chinese copy to
  an English reader. Posts in a translation group set it to `no-store` and rely
  on the worker's variant cache. `/mood/embed` already takes this exact shape in
  `getContentRoutePolicy`.
- **`Vary: Cookie, Accept-Language`** on negotiated responses. We do not depend
  on it for hit rate — that is what the variant key is for — but emitting it is
  what keeps any intermediary cache from mis-serving. Also emit
  `Content-Language`.

Ungrouped posts — nearly all of them — keep today's caching untouched.

### 4. Head, canonical, hreflang

`BlogLayout.astro` takes a `locale` prop (default `blog.locale.blog`) and threads
it into `<html lang>` and `og:locale`. `NotByAI.astro` and `AiCredit.astro` take
the same prop — they render *inside* the article, so they speak its language.
`BlogMasthead.astro` and `BlogColophon.astro` stay Chinese: they are the
publication's identity, not the article's voice.

**A translation renders as if it lives at the canonical URL**, because its bytes
are served from there. `canonical` and `og:url` point at `/blog/lun-chenmo`, not
at its own build path.

Every version lists every version, itself included, or Google ignores the
cluster:

```html
<link rel="alternate" hreflang="zh" href="https://buxx.me/blog/lun-chenmo/" />
<link rel="alternate" hreflang="en" href="https://buxx.me/blog/lun-chenmo/?lang=en" />
<link rel="alternate" hreflang="x-default" href="https://buxx.me/blog/lun-chenmo/" />
```

`?lang=en` goes in the sitemap and is indexable — a parameter-based language
variant is a form Google supports. `sitemap.xml.ts` switches from
`getListedPosts()` to `getIndexablePosts()` plus the `?lang=` variants.

### 5. The translation's build path

`/blog/on-silence` → **301** to `/blog/lun-chenmo?lang=en`, in the worker, from
the manifest's reverse entry. One public URL per article, enforced rather than
merely documented.

The page itself still carries `noindex` and `data-pagefind-ignore="all"`: it is
reachable to the worker via `ASSETS.fetch`, which does not re-enter the worker,
so the redirect never fires on the internal read.

### 6. Search

`package.json` builds the index with `pagefind --site dist/client
--force-language zh`. A translation must stay out of it, or English text gets
segmented by the CJK tokenizer and surfaces as a duplicate hit for content its
Chinese twin already covers. `BlogLayout.astro` already emits
`data-pagefind-ignore="all"` for noindexed pages; give it a separate
`excludeFromSearch` prop so a translation can be out of search while staying in
Google.

### 7. The switcher

Renders **only when the article actually has another version** — a control that
appears is a control that works. Near the top: a reader who landed in the wrong
language should not have to scroll a whole essay to find the way out.

It is `LanguagePill.astro`, rendered into `TagList`'s `trailing` slot so it
shares the tag row. That placement is the point. The pill is built from
`.blog-tag`'s own numbers — `12.5px`, `padding 6px 11px`, `border-radius 999px`
— so it cannot drift out of alignment, and the header gains no extra row or
spacing step. A `1px` hairline separates it from the tags ("different group")
and a 12% accent tint marks it as a control ("this one does something"); 12% is
the mix `.blog-row__tag:hover` and `.toc-topbar__link.active` already use.

Each version is an `<a href="?lang=en">` — one canonical URL, language on the
query. They are links because every version *has* a URL, which buys Cmd-click,
middle-click and Tab for free.

**This step now costs client JS**, which the earlier draft of this plan ruled
out. The menu opens on hover with a 90ms/200ms intent delay, closes on Escape
with focus restored, moves on ↑↓, and flips its anchor when it would overflow
the reading column. That is roughly 60 lines in the component, and it buys a
control that scales past two languages. A no-JS `<a>` was the right call while
the answer was "one link"; it stops being the right call once the answer is "a
menu". The pill degrades to a plain visible label with no menu when JS fails.

Endonyms only — 中文 / English, each in its own language and tagged `lang`.
Never a flag (languages are not countries), never a two-letter code.

### 8. Listing

`/blog`, RSS, `llms.txt` and the home preview stay Chinese. `getListedPosts()`
runs through `selectListedPosts`, which keeps one row per translation group, so
a translated article appears once and in Chinese.

Translated rows get the lucide **`languages` glyph** in `PostRow.astro` —
accent-coloured, `14px`, beside the date. No letters. An `EN` chip does not
survive a third language (a hundred languages would mean a hundred chips), and
the two-letter code was the wrong unit anyway: the row does not need to
enumerate what exists, only to say *this one is multilingual*. It is a mark and
not a control — the row is already a single link target, so nothing interactive
nests inside it. The accessible name carries what the glyph cannot: "也有
English 版本", built from `blog.copy[locale].languageSwitcher.alsoIn`.

A row cannot see its own siblings — the tag link runs translation → canonical,
not back — so each listing page builds `mapOtherLanguages(accessiblePosts)`
once and passes each row its own entry.

**Known gap.** The mark currently means "this article has another version", not
"this article has *your* language". The stronger reading needs the listing
rendered per reader, which this step deliberately does not do. With `zh`/`en`
the two readings coincide for an English reader; they diverge the moment a
third locale lands. Revisit together with listing negotiation.

The list stays one language and never mixes. Sitemap is the one surface that
deliberately does not follow the listing (step 4).

Prev/next needs no change: a translation is absent from `listedPosts`, so
`buildPostPageProps` resolves `listedIndex === -1` and returns `null`/`null` —
the path `#unlisted` posts already take.

### 9. Dates stay as they are

`formatPostDate` is a fixed `en-US`/UTC formatter, deliberately. Making it
locale-aware would change the rendered date on **every existing Chinese post** —
a site-wide visual change smuggled in under "add a translation". Out of scope.

## Where this is going

The end state is the whole site in English for English readers. This plan is a
deliberate workaround, and its job is to not block that.

**The seam that matters:** language resolution must not know what a language
variant's URL looks like. Resolution answers "which locale does this reader
want"; a separate, single place turns that into a URL. Moving from `?lang=en` to
a `/en/` prefix then costs one URL builder and one 301 rule.

**Not now, though.** A path prefix fits a site whose interface is already
translated. Here almost no post has an English version, so `/en/` would
manufacture 404s for everything that does not.

**The discipline that matters more:** every reader-facing string added by this
work goes into `blog.copy[locale]`. Not one hardcoded Chinese string in a
`.astro` file. The expensive part of the end state is not the URL shape — it is
finding the copy. Done this way, that day is filling in a table.

## Agents

Contract lands first; A and B are then fully parallel. The site-api gate is a
separate repo and a hard prerequisite for publishing, not for coding — it can run
alongside, but no translation goes live until it has shipped.

### Blocking — site-api translation gate

Different repo (`../site-api`), own deploy. Scope is the whole of
[The newsletter must not re-broadcast translations](#the-newsletter-must-not-re-broadcast-translations).

### Lead — contract

Everything below depends on this and nothing below can start without it.

- Rewrite `src/features/posts/i18n.ts`: parse `tag.name`, `#<locale>[:<canonical>]`
  grammar, canonical-slug keying. Update `tests/unit/blog-i18n.test.ts`.
- `resolveRequestLocale()` — the precedence chain, q-values, RFC 4647 Lookup.
- Manifest shape and the `?lang` / `blog_lang` / `data-*` contracts.
- Put the tag parser in `@bunizao/contracts` so site-api consumes the same one.
- Translation-pair fixtures in `adapter/mock.ts`.

### Agent A — edge and build

- `resolveRequestLocale` wiring + asset swap in `responses.ts`; call it from
  **both** `worker.ts` and `middleware.ts`.
- Manifest reader with module-scope cache and dev fallback.
- `EdgeCacheVariant` widening; `no-store` CDN policy for grouped posts;
  `Vary` and `Content-Language`.
- 301 for translation build paths.
- `scripts/generate-i18n-manifest.ts` — emit and validate; wire into `build`.
- `?lang` support in the blog-post markdown renderer. The translation's `.md` is
  already in the build output, so this is slug resolution and nothing else.

### Agent B — article and listing surface

- `BlogLayout.astro`: `locale` prop → `<html lang>`, `og:locale`,
  `Content-Language`; `excludeFromSearch` prop.
- Canonical and `og:url` rewiring for translations; the three `hreflang` links.
- `NotByAI` / `AiCredit` follow the article's locale; masthead and colophon do
  not.
- The switcher in `PostMeta.astro`.
- `EN` chip in `PostRow.astro`.
- `selectListedPosts` wired into `content.ts`; `getIndexablePosts` for sitemap.
- All new copy through `blog.copy[locale]`.

### Agent C — verification and docs

- Unit: locale resolution precedence, q ordering, `q=0`, RFC 4647 fallback, tag
  parsing edge cases, manifest generation, listing dedup.
- E2E: `Accept-Language: en` on the canonical URL returns English; `?lang=zh`
  overrides an `en` cookie; switcher round-trip sets and honours the cookie;
  translation build path 301s; the switcher is absent on untranslated posts.
- Build assertions: translation absent from `/blog`, RSS, `llms.txt` and
  Pagefind; present in `sitemap.xml`; three `hreflang` links on both versions.
- `docs/ARCHITECTURE.md`, and the Ghost publishing checklist somewhere the
  author will actually find it.

## Non-goals

- No `/en/` route prefix — see [Where this is going](#where-this-is-going).
- No UI-string translation infrastructure beyond `blog.copy`.
- No language filter or toggle on `/blog`. Revisit past ~10 English posts.
- No per-language RSS feed.
- No two-languages-in-one-post directive: `title`, `excerpt` and `featureImage`
  are single-valued in Ghost and the newsletter would mail both versions.
- No second Ghost instance.

## Verification

- `bun run check`
- `bun run build`
- `bun run test:unit`
- `bun run test:e2e:site`
