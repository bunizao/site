---
title: How a post is built
description: How a Ghost draft becomes rendered HTML, and the four passes your markup goes through on the way.
group: Writing
order: 0
---

You write posts in Ghost, and the build turns them into pages on buxx.me. This
page explains the transform in between and the warnings it prints when your
markup has a problem.

Ghost is the editor and the database. It never serves a reader. At build time,
the site pulls `post.html` (Ghost's own rendering of the Koenig editor) and runs
it through one transform before it reaches a page.

## The pipeline

`transformPostDirectives(html, context)` in
`src/features/posts/server/directives/index.ts` runs four passes, in this order:

1. **Embed enrichment.** Rewrites bare `<iframe>` embeds and shortcodes into
   this site's own components. Apple Music iframes become the listening card,
   YouTube iframes become the click-to-load facade, and `[mood:123]` becomes a
   mood embed. This pass runs only for rich output targets (see
   [Output targets](#output-targets)).
2. **Masking.** Swaps everything inside `<code>`, `<pre>`, `<script>` and
   `<style>` for a private-use-area token. Later passes can't see it, so a
   fenced code block showing `[!poem]` stays a code block. The tokens go back in
   at the very end. If a directive mangled one, the transform throws instead of
   shipping broken markup.
3. **Block and meta directives.** Matches any paragraph that contains only a
   `[!name key=value]` marker. A *block* directive replaces the paragraph with
   rendered HTML. A *meta* directive is removed from the body, and its
   attributes go to the page instead.
4. **Inline directives.** These get the whole document instead of one
   paragraph, because they don't match a marker. `poem` reshapes blockquotes.
   `footnotes` rewrites `[^label]` references and collects the definitions into
   a list at the foot of the post.

Anything that still looks like `[!something]` after these passes is reported as
an unknown directive.

## Output targets

The same post is rendered for several destinations, and a YouTube player is
useless in an RSS reader. So every directive receives the target and decides
what to emit.

| Target | Used for | Embeds |
| --- | --- | --- |
| `web` | The `/blog/[slug]` page | Full interactive components |
| `preview` | `/dev/blog/[id]` draft preview | Full interactive components |
| `rss` | `/blog/rss.xml` | Plain links, absolute URLs |
| `agent-markdown` | `Accept: text/markdown` responses | Plain links, absolute URLs |
| `og` | Open Graph image text | Text only |
| `excerpt` | List and card summaries | Text only |

`web` and `preview` are the *rich* targets. On every other target, a `[!music]`
directive falls back to "Listen on Apple Music". A footnote reference becomes an
inline parenthetical, because a superscript would point at an anchor the
consumer can't follow.

## Build warnings

A malformed directive doesn't break the build. The build skips it, drops the
marker, and prints a warning:

```
[blog-directive:invalid-directive-attributes] Invalid "mood" directive in post "my-post": attribute "id" must be a positive integer.
```

Watch the build output when you publish. These are the codes you'll see:

- `unknown-directive`
- `invalid-directive-attributes`
- `invalid-directive-content`
- the four footnote codes (see [Footnotes](/docs/writing/footnotes))

There is one exception. An unrecognised model in `[!authors]` throws and stops
the build. A typo there would silently drop an authorship credit from a
published post, so the build fails loudly instead.
