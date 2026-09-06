# Telegram Instant View

`buxx.me.iv` is the parsing template that turns a blog article into a Telegram
Instant View page. It is version-controlled here because it is written against
this repo's markup, but **nothing deploys it** — Telegram hosts templates, and
publishing is a manual step in their editor.

## How a link becomes Instant View

1. A template for the domain is written and published at
   [instantview.telegram.org](https://instantview.telegram.org/my).
2. Telegram issues that published template an **rhash**.
3. A link carrying `?rhash=<hash>` opens as Instant View for anyone. A bare
   `https://buxx.me/blog/<slug>` only does so once Telegram adopts a template
   for the whole domain, which is their call and can take a long time or never
   happen at all.

So the hash is not optional plumbing: until adoption, it is the entire feature.

## Publishing loop

1. Open <https://instantview.telegram.org/my> and create (or open) the template
   for `buxx.me`.
2. Paste the contents of `buxx.me.iv`.
3. Point the editor at a real article — the ones worth checking are a plain
   post, one with a feature image, one with a code block, and one with a
   YouTube or Apple Music card, since those are the shapes the template
   actually touches.
4. Fix what the editor reports, **here in this file first**, then paste again.
   A rule that only ever exists in the editor is a rule that gets lost.
5. Publish, then hit **Get tracking link** and copy the `rhash` out of the URL
   it hands you.
6. Put that hash in `blog.instantView.rhash` (`src/data/site.ts`) and deploy.
   The article's Telegram share button is the one link on the site that appends
   it (`src/features/posts/instant-view.ts`).

Telegram caches an Instant View page per URL. Add `?rhash=…` to a fresh URL, or
use the editor's preview, when checking a change — an old cached render is not
evidence the template is wrong.

## Why the template is this plain

The editor is the only place a rule can be verified, and a template that fails
to process renders nothing at all. So `buxx.me.iv` sticks to constructs the
editor is known to accept — property assignments, `$variables`, and `@remove` —
and settles for a plain rendering of anything it cannot safely reshape.

Node surgery goes below instead, one rule at a time, editor open. Anything that
survives moves up into the template with a comment saying what it buys.

### Refinements to try

**Lift code out of its wrapper.** Without this a code block renders as whatever
Instant View makes of `figure > div > pre`. With it, a bare `<pre>`:

```
@before_el(./../..): $body//figure[has-class("code-box")]/div[has-class("code-box-body")]/pre
@remove: $body//figure[has-class("code-box")]
```

**Same, for the Mermaid source `<pre>`:**

```
@before_el(./..): $body//figure[has-class("mermaid-diagram")]/pre
@remove: $body//figure[has-class("mermaid-diagram")]
```

**Unwrap the feature image** so the cover figure holds an `<img>` directly
rather than the `<span class="blog-media">` that carries its LQIP background:

```
@before_el(./..): //figure[has-class("blog-feature")]/span[has-class("blog-media")]/img
@remove: //figure[has-class("blog-feature")]/span[has-class("blog-media")]
cover: //figure[has-class("blog-feature")]
```

**Cards as blockquotes.** Ghost bookmarks and the Apple Music card are link-
shaped once their chrome is gone:

```
@remove: $body//*[has-class("kg-bookmark-thumbnail")]
@remove: $body//*[has-class("kg-bookmark-icon")]
<blockquote>: $body//figure[has-class("kg-bookmark-card")]
<blockquote>: $body//figure[has-class("blog-music")]
```

**Flatten galleries to their images:**

```
@before_el(./../../..): $body//div[has-class("kg-gallery-image")]/img
@remove: $body//div[has-class("kg-gallery-container")]
```

**Host real third-party embeds** (CodePen, Vimeo, …) natively. Only providers
Telegram recognises work — a same-site iframe reports "Embed not supported
yet":

```
@inline: $body//figure[has-class("kg-embed-card")]//iframe
```

**Section kicker from the first public tag.** Parenthesised XPath may not be
supported; the fallback is to drop the property:

```
kicker: (//ul[has-class("blog-tags")]//a[has-class("blog-tag")])[1]
```

## Known gaps

**Mood embeds vanish.** `[mood:123]` renders as an `<iframe>` pointing at
`/mood/embed`, and Instant View will not host a same-site iframe, so the
template removes the card outright. Nothing in that markup is a human-readable
link, so there is nothing to degrade to.

Fixing it properly is a site-side change, not a template one: give
`buildEmbedFigure` (`src/features/posts/server/mood-embed.ts`) a `<figcaption>`
holding a real `<a href="/mood/<id>">`, hidden in the browser by
`blog-prose.css` since the iframe already shows the post. Instant View ignores
CSS, so the link is what it would keep. That also buys a fallback for a blocked
or failed iframe. It has to ship and deploy **before** the template can use it —
the editor parses the live page, not this branch.

## What breaks it

The template addresses this repo's own class names: `.blog-article__title`,
`.blog-feature`, `.blog-prose`, `.code-box`, `.mermaid-diagram`,
`.blog-mood-embed`, `.yt`, `.blog-music`, `.blog-fn-back`, and the `article:*`
meta tags BlogLayout emits. Renaming any of them silently degrades every shared
link, so `tests/e2e/blog.pw.ts` asserts they still exist on a rendered article.
If that test fails, fix the template in the same change — not the assertion.

`@bunizao/contracts` is not involved: Instant View is entirely a public-site
concern, and `site-api` has no part in it.
