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

## Working from real templates, not guesses

The manual at instantview.telegram.org is the reference, but published contest
templates are what settle syntax arguments, because they demonstrably passed the
editor. Two in [Sea-n/Telegram-IV-Templates](https://github.com/Sea-n/Telegram-IV-Templates)
answered most of what this template needed:

- [`chess.com.xpath`](https://github.com/Sea-n/Telegram-IV-Templates/blob/master/chess.com.xpath)
  — `@before_el("./..")`, **quoted**. An unquoted relative path is a syntax
  error, which is what broke the first draft of this template outright. It also
  shows the idiom for pulling a node out of nested wrappers: repeat the same
  rule, once per level ("Take Image out, or it will be unsupported").
- [`taiwannews.com.tw.xpath`](https://github.com/Sea-n/Telegram-IV-Templates/blob/master/taiwannews.com.tw.xpath)
  — a slideshow is built as `figure > slideshow > figure > img`, never
  `slideshow > img`: each image's parent becomes a `<figure>` first
  (`<figure>: $imgs/parent::*`), then the container element is replaced with
  `<slideshow>`. It also gates the whole thing behind `@if` on a second image.

Both declare `~version: "2.0"`. If the editor refuses a function this file uses,
dropping the version line to `"2.0"` is the cheap thing to try before rewriting
the rule.

The editor's own errors are the third source, and the sharpest one — it names
the tag and the context it refused. `Element <slideshow> is not supported in
<figure>` is what settled where the gallery slideshow has to live; no amount of
reading templates would have. Paste an error verbatim into this file's history
rather than paraphrasing it.

## Why the rest of the template is plain

The editor is the only place a rule can be verified, and a template that fails
to process renders nothing at all. So `buxx.me.iv` keeps to constructs a
published template demonstrates, and settles for a plain rendering of anything
that would need a guess.

Node surgery below, one rule at a time, editor open. Anything that survives
moves up into the template with a comment saying what it buys.

### Refinements to try

**Lift code out of its wrapper.** Without this a code block renders as whatever
Instant View makes of `figure > div > pre`. With it, a bare `<pre>`. Two hops,
so the rule runs twice — the chess.com idiom:

```
@before_el("./.."): $body//figure[has-class("code-box")]//pre
@before_el("./.."): $body//figure[has-class("code-box")]//pre
@remove: $body//figure[has-class("code-box")]
```

**Same, for the Mermaid source `<pre>`** — one hop:

```
@before_el("./.."): $body//figure[has-class("mermaid-diagram")]/pre
@remove: $body//figure[has-class("mermaid-diagram")]
```

**Unwrap the feature image** so the cover figure holds an `<img>` directly
rather than the `<span class="blog-media">` that carries its LQIP background:

```
@before_el("./.."): //figure[has-class("blog-feature")]/span[has-class("blog-media")]/img
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

**Host real third-party embeds** (CodePen, Vimeo, …) natively. Only providers
Telegram recognises work — a same-site iframe reports "Embed not supported
yet":

```
@inline: $body//figure[has-class("kg-embed-card")]//iframe
```

**Build the gallery slideshow only when there is more than one image**, the way
taiwannews.com.tw does, so a one-image gallery stays a plain figure:

```
$gallery_multi: $body//div[has-class("kg-gallery-image")][2]
@if ($gallery_multi) {
<slideshow>: $body//div[has-class("kg-gallery-container")]
}
```

**Unwrap the gallery cells' LQIP spans.** Each gallery image sits in a
`<span class="blog-media">` that carries its blur placeholder, so a converted
cell is `figure > span > img`. Instant View appears to simplify the span away on
its own; if gallery images come out blank, take it out explicitly:

```
@before_el("./.."): $body//div[has-class("kg-gallery-image")]/span[has-class("blog-media")]/img
@remove: $body//div[has-class("kg-gallery-image")]/span[has-class("blog-media")]
```

**Section kicker from the first public tag.** Parenthesised XPath may not be
supported; the fallback is to drop the property:

```
kicker: (//ul[has-class("blog-tags")]//a[has-class("blog-tag")])[1]
```

## Where the credit lives

Instant View strips the page's chrome, so anything that says who wrote this and
where it came from has to be claimed explicitly. Four places carry it:

| Slot | What the reader sees |
| --- | --- |
| `author` + `author_url` | The byline, linking to `buxx.me` |
| `site_name` | `無人之境`, read from `og:site_name` |
| `channel` | A **Join channel** button for `@tutumood` |
| `aside.ai-credit` / `aside.not-by-ai` | The provenance line, appended into the body |
| `p.footer-mark` | The copyright line, closing the page |

The provenance line and the copyright line both sit outside `.blog-prose` on the
page, so each has to be moved into the body deliberately. They are the article's
own words either way: the human pledge (or the model credits on a post that
declares them), and the sealed copyright mark from `copyrightMark()`.

`channel`'s appearance belongs to Telegram. The editor's preview draws it as
plain text; the avatar and the button only exist in the app, and only when the
handle resolves as a public channel. Judge it on a tracking link in Telegram,
not in the editor. It is also the one judgement call here — `tutumood` is the
channel the mood feed mirrors, not a blog channel — so delete the line if blog
articles should not advertise it.

### Why there is no related block

Instant View's `<related>` is built for a list of articles with thumbnails. The
only thing an article page could feed it is the prev/next nav, which carries two
titles and no images, and renders as a pair of bare links under a heading. That
looks worse than ending on the copyright line, so the template ends on the
copyright line.

If posts ever grow a richer "more from here" section — covers, excerpts — this
is the rule to bring back, minus the direction labels that would otherwise run
into the titles:

```
@remove: //nav[has-class("blog-adjacent")]//span[has-class("blog-adjacent__dir")]
<related>: //nav[has-class("blog-adjacent")]
@append_to($body)
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
