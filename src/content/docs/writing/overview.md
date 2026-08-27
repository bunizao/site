---
title: How a post is built
description: The path from a Ghost draft to rendered HTML, and the four things that happen to your markup on the way.
group: Writing
order: 0
---

Posts are written in Ghost. Ghost is the editor and the database; it never serves
a reader. At build time this site pulls `post.html` — Ghost's own rendering of
the Koenig editor — and runs it through one transform before it reaches a page.

That transform is where everything on the rest of these pages happens.

## The pipeline

`transformPostDirectives(html, context)` in
`src/features/posts/server/directives/index.ts` runs four passes, in this order.

**1. Embed enrichment.** Bare `<iframe>` embeds and shortcodes are rewritten
into this site's own components: Apple Music iframes become the listening card,
YouTube iframes become the click-to-load facade, `[mood:123]` becomes a mood
embed. This pass only runs for rich output targets — see below.

**2. Masking.** Everything inside `<code>`, `<pre>`, `<script>` and `<style>` is
lifted out and replaced with a private-use-area token. Nothing in the following
passes can see it, so a fenced code block showing `[!poem]` stays a code block.
The tokens are put back at the very end, and if a directive somehow mangled one
the transform throws rather than shipping broken markup.

**3. Block and meta directives.** Any paragraph whose entire content is a
`[!name key=value]` marker is matched. A *block* directive replaces the paragraph
with rendered HTML; a *meta* directive is removed from the body and its
attributes handed to the page instead.

**4. Inline directives.** These get the whole document rather than one paragraph,
because what they match is not a marker. `poem` reshapes blockquotes, `footnotes`
rewrites `[^label]` references and collects the definitions into a list at the
foot of the post.

Anything still looking like `[!something]` after all that is reported as an
unknown directive.

## Output targets

The same post is rendered for more than one destination, and a YouTube player is
useless in an RSS reader. Every directive is handed the target and decides what
to emit.

| Target | Used for | Embeds |
| --- | --- | --- |
| `web` | The `/blog/[slug]` page | Full interactive components |
| `preview` | `/dev/blog/[id]` draft preview | Full interactive components |
| `rss` | `/blog/rss.xml` | Plain links, absolute URLs |
| `agent-markdown` | `Accept: text/markdown` responses | Plain links, absolute URLs |
| `og` | Open Graph image text | Text only |
| `excerpt` | List and card summaries | Text only |

`web` and `preview` are the *rich* targets. Everywhere else, a `[!music]`
directive degrades to "Listen on Apple Music" and a footnote reference becomes an
inline parenthetical rather than a superscript pointing at an anchor that the
consumer cannot follow.

## Warnings, not failures

A malformed directive does not break the build. It is skipped, the marker is
dropped, and a warning is printed:

```
[blog-directive:invalid-directive-attributes] Invalid "mood" directive in post "my-post": attribute "id" must be a positive integer.
```

Watch the build output when you publish. The codes you will see are
`unknown-directive`, `invalid-directive-attributes`, `invalid-directive-content`,
and the four footnote codes.

There is exactly one exception. An unrecognised model in `[!authors]` throws and
stops the build, because a typo there would silently drop an authorship credit
off a published post — which is the one failure mode worth being loud about.
