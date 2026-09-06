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
   YouTube or Apple Music card, since those are the four shapes the template
   actually transforms.
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

## What breaks it

The template addresses this repo's own class names: `.blog-article__title`,
`.blog-feature`, `.blog-prose`, `.code-box`, `.mermaid-diagram`, `.yt`,
`.blog-music`, `.blog-fn-back`, and the `article:*` meta tags BlogLayout emits.
Renaming any of them silently degrades every shared link, so
`tests/e2e/blog.pw.ts` asserts they still exist on a rendered article. If that
test fails, fix the template in the same change — not the assertion.

`@bunizao/contracts` is not involved: Instant View is entirely a public-site
concern, and `site-api` has no part in it.
