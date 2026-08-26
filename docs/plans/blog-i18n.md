# Plan: Blog Post Translations

Give *specific* posts an alternate-language version. Not a bilingual site: the UI
is not translated, the publication stays Chinese-primary, and no existing post
changes how it renders.

## Why this is small

The locale machinery already exists and is hardwired to a constant:

| Already there | Hardwired at |
| --- | --- |
| `blog.copy[locale]` (name, tagline, notByAI, aiCredit) | `src/data/site.ts` |
| `getTagLabel(tag, locale)` | `src/features/posts/display.ts` |
| Directive pipeline `context.locale` | `src/features/posts/server/content.ts:143` |
| `Site.locale` / `SiteData.locale` | `src/features/posts/types/index.ts:10` |

Every one of them reads `blog.locale.blog === 'zh'`. The work is turning that
constant into a property of the post — not adding an i18n framework.

## Ghost side: two internal tags

Ghost has no native i18n and no custom fields on the Content API. Internal tags
(`#`-prefixed) are the only per-post metadata channel, and this repo already uses
them for `#unlisted`, `#no-toc`, `#not-by-ai`.

| Tag | Meaning |
| --- | --- |
| `#lang-en` | This post is English. No tag means the default locale (`zh`). |
| `#tr-<key>` | Translation group. Both versions carry the same key, e.g. `#tr-on-silence`. |

Slugs stay idiomatic per language (`/blog/lun-chenmo/` and `/blog/on-silence/`).
A `-en` suffix convention was rejected: Ghost recomputes the slug when the title
changes, so the pairing would break silently and invisibly.

**Publishing a translation:**

1. New post, write the translation, set the same feature image.
2. Tag it `#lang-en` and `#tr-<key>`.
3. Add `#tr-<key>` to the original.
4. Publish **without sending email** — the newsletter already went out for the
   original. (Verify no `post.published` webhook in `../site-api` re-broadcasts;
   see Open questions.)
5. Do **not** set `canonical_url` on the translation. Pointing it at the original
   deindexes the translation, which defeats the purpose. `hreflang` is the
   correct signal and step 4 of the implementation adds it.

## Site side

### 1. `src/features/posts/i18n.ts` — new, already written

Pure functions over `post.tags`, mirroring `unlisted.ts`. Exports
`getPostLocale`, `getTranslationKey`, `getTranslations`, `selectListedPosts`.

The Ghost adapter (`adapter/ghost/dataset.ts`, `adapter/provider.ts`) is **not
touched**. It stays a dumb mirror of Ghost; "which tags carry meaning" is a
feature-layer concern, which is the rule `unlisted.ts` already set.

### 2. Listing: one row per translation group

`src/features/posts/server/content.ts`

```
getIndexablePosts()  = provider.getListedPosts()          // accessible − #unlisted
getListedPosts()     = selectListedPosts(getIndexablePosts())
```

`selectListedPosts` keeps the default-locale member of each translation group,
falling back to the group's only member. A translated post therefore appears
once, in Chinese — and an English-first post (should one ever exist) still shows
up instead of vanishing from the site.

`getListedPosts` is the single choke point for eight surfaces — `/blog`, RSS,
sitemap, `llms.txt`, home preview, agent-markdown, `palette.json`, and the
article prev/next chain — so this one change carries all of them. Sitemap is the
one surface that must *not* follow (step 5).

Prev/next needs no change: a translation is absent from `listedPosts`, so
`buildPostPageProps` already resolves `listedIndex === -1` and returns
`null`/`null` — the same path `#unlisted` posts take today.

### 3. Article page follows the post's locale

`src/layouts/BlogLayout.astro` takes a `locale` prop (default `blog.locale.blog`)
and threads it into `<html lang>` and a new `og:locale`. `/blog/[slug].astro`
passes `getPostLocale(post)`; `/blog/index.astro` and the tag pages pass nothing.

`NotByAI.astro` and `AiCredit.astro` take the same optional prop — they render
*inside* the article, so their language is the article's.

`BlogMasthead.astro` and `BlogColophon.astro` stay `zh` unconditionally. They are
the publication's identity, not the article's voice; an English post still lives
in 無人之境.

The `<html lang>` change is load-bearing beyond semantics — see step 6.

### 4. `hreflang`

In `BlogLayout.astro`, when the page has translations:

```html
<link rel="alternate" hreflang="zh" href="…/blog/lun-chenmo/" />
<link rel="alternate" hreflang="en" href="…/blog/on-silence/" />
<link rel="alternate" hreflang="x-default" href="…/blog/lun-chenmo/" />
```

Every version must list *all* versions including itself, or Google ignores the
cluster. `x-default` points at the default-locale member.

### 5. Sitemap keeps translations

`src/pages/sitemap.xml.ts` switches from `getListedPosts()` to
`getIndexablePosts()`. Translations are deliberately off the browsable list but
must stay indexable — an `hreflang` alternate that is missing from the sitemap
and absent from every internal link is a page Google will struggle to discover.

This is the one place where "not listed" must not mean "not indexed", which is
exactly why it gets its own function name rather than a boolean flag.

### 6. Search: translations are excluded

`package.json` builds the index with `pagefind --site dist/client
--force-language zh`, so a per-post `<html lang="en">` will *not* split the
index — English posts would be segmented by the CJK tokenizer and would surface
alongside their Chinese twin as duplicate hits for the same content.

Fix: exclude translations from the index. `BlogLayout.astro:261` already emits
`data-pagefind-ignore="all"` for noindexed pages; add a separate
`excludeFromSearch` prop so a translation can be out of search while staying in
Google. The article page passes it when `getPostLocale(post) !== default`.

The content is still findable — its Chinese twin is indexed. Keeping
`--force-language zh` also leaves search behavior for every other page untouched.

### 7. The switcher

One link in `PostMeta.astro`, beside the date — the top of the article, not the
foot. A reader who lands on the wrong language should not have to scroll a whole
essay to discover the other version exists.

Label it in the *target* language ("Read in English" / "阅读中文版"), never in
the current one. Someone who cannot read this page's language must still be able
to read the escape hatch.

### 8. Dates stay as they are

`formatPostDate` is a fixed `en-US`/UTC formatter, deliberately (see its comment:
it matches chl.ee and keeps SSG output deterministic). Making it locale-aware
would change the rendered date on **every existing Chinese post** — a
site-wide visual change smuggled in under "add a translation for one post".
Out of scope. `June 16, 2026` on a Chinese post is already the status quo and
reads fine.

## Non-goals

- No `/en/` route prefix. Language is a property of the post, not of the path.
  Prefix routing suits a translated *interface*; here most posts will never have
  an English version and the prefix would manufacture 404s.
- No two-languages-in-one-post directive (`:::lang en`). Pairing would be free,
  but `title`, `excerpt`, and `featureImage` are single-valued in Ghost and the
  newsletter would mail both versions.
- No second Ghost instance.
- No language filter or toggle on `/blog`. Add one if English posts ever pass
  ~10; until then it is a control with nothing to control.
- No per-language RSS feed. `/blog/rss.xml` stays Chinese, matching the listing.
- No UI-string translation infrastructure. `blog.copy` covers what is needed.

## Verification

- `bun run check`
- `bun run build` — confirm the translation renders at its own path, is in
  `sitemap.xml`, is absent from `/blog/`, RSS, and `llms.txt`, and does not
  appear in Pagefind results.
- View source on both versions: three `hreflang` links each, correct
  `<html lang>`, correct `og:locale`.
- `bun run test:e2e:site`
- Add fixtures to `src/features/posts/adapter/mock.ts` — a `#tr-` pair, one
  member tagged `#lang-en` — so the listing dedup is covered without a live
  Ghost.

## Open questions

- Does `../site-api` run a `post.published` webhook that broadcasts to
  subscribers? If so, publishing a translation must not re-notify. Check before
  the first translation goes out.
