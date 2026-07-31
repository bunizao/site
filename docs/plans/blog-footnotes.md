# Blog footnotes

**Scope.** Post-wide footnotes that work in ordinary Koenig paragraphs, render
as one block at the article foot, and are styled by us.

**Depends on.** [blog-directive-registry.md](blog-directive-registry.md)
(`kind: 'inline'`).
**Blocks.** Nothing.
**Repos.** `site`.

**Implementation status.** The post-wide transformer, warning policy, protected
HTML handling, and output-target behavior are implemented and tested. Production
consumer wiring and styles remain deferred until frontend handoff.

---

## Why not Ghost's

Ghost's Markdown card nominally supports `[^1]` / `[^1]: text`, but footnotes
render **beneath that card**, not at the end of the post. Several markdown cards
produce several disconnected footnote blocks with independent numbering, and the
syntax is widely reported broken in practice. Coherent footnotes would mean
writing the whole post inside markdown cards, which defeats Koenig.

## How it works

The author types footnotes in **normal paragraphs**. Koenig does not touch
`[^1]` — its markdown shortcuts cover `**bold**`, `# heading`, and `[text](url)`,
and `[^1]` matches none of them (no parenthesis follows), so it survives into the
rendered HTML as literal text. That is the whole trick: no card, no plugin, no
fork.

**Author writes:**

```
Ghost stores content as Lexical JSON.[^1] The renderer is separate.[^2]

...

[^1]: Since Ghost 5.x. Earlier versions used Mobiledoc.
[^2]: See @tryghost/kg-lexical-html-renderer.
```

**Ghost hands us:**

```html
<p>Ghost stores content as Lexical JSON.[^1] The renderer is separate.[^2]</p>
...
<p>[^1]: Since Ghost 5.x. Earlier versions used Mobiledoc.</p>
<p>[^2]: See @tryghost/kg-lexical-html-renderer.</p>
```

**We emit:**

```html
<p>Ghost stores content as Lexical JSON.<sup class="blog-fn-ref" id="fnref-1"><a href="#fn-1">1</a></sup> The renderer is separate.<sup class="blog-fn-ref" id="fnref-2"><a href="#fn-2">2</a></sup></p>
...
<section class="blog-footnotes">
  <ol>
    <li id="fn-1">Since Ghost 5.x. Earlier versions used Mobiledoc. <a class="blog-fn-back" href="#fnref-1">↩</a></li>
    <li id="fn-2">See @tryghost/kg-lexical-html-renderer. <a class="blog-fn-back" href="#fnref-2">↩</a></li>
  </ol>
</section>
```

## Algorithm

`directives/footnotes.ts`, `kind: 'inline'`, one pass over the whole document:

1. **Collect definitions.** Match paragraphs that are *entirely* a definition:
   `/^<p>\s*\[\^([^\]]+)\]:\s*([\s\S]*?)<\/p>$/`. Capture label → body HTML.
   Remove those paragraphs from the document. Labels are arbitrary strings
   (`[^ghost]` is as valid as `[^1]`) — authors should not have to renumber.
2. **Collect references** in document order: `/\[\^([^\]]+)\]/g` over what
   remains. **Assign display numbers by order of first reference**, not by label.
   This is why authoring order does not have to match reading order.
3. **Replace** each reference with the `<sup>` anchor. Repeated references to the
   same label reuse the number and get a unique `id` suffix (`fnref-1`,
   `fnref-1b`, …) so every backlink target is unique.
4. **Emit** the ordered list, sorted by display number, after the prose.

### Where it must not run

Skip `<pre>`, `<code>`, and the `CodeBox` fragments — a Rust lifetime like
`&'a [^T]` or a regex containing `[^x]` must not become a footnote. Run the pass
on the non-code fragments only. `posts/server/code-blocks.ts` `splitBlogProse`
already partitions code from prose; either run footnotes after that split, or
mask code regions before matching.

**This is the highest-risk detail in the plan.** A false positive silently
mangles a code sample. Add a test with a regex character class in a code block.

### Edge cases

| Case | Behaviour |
|---|---|
| Reference with no definition | Render the `<sup>` with no link, warn at build with post slug + label |
| Definition with no reference | Drop it, warn at build |
| Same label referenced twice | One list entry, one number, unique `fnref-*` ids, backlink to the first |
| Definition body contains inline HTML (`<a>`, `<em>`) | Preserve it — the body is already Ghost-rendered HTML |
| Definition split across paragraphs | Not supported. An adjacent paragraph must repeat the same `[^label]:` marker so the intent is unambiguous; warn and take the first paragraph only |
| `[^1]` inside a code block | Left alone (see above) |

### RSS and excerpts

RSS gets the same pass, so footnote anchors resolve to the post page — the
`href="#fn-1"` will be relative to the reader's context and may dangle. Prefer
rendering RSS footnotes as plain parenthetical text, or absolutise the anchors
to the post URL. Decide during implementation; do not ship dangling anchors.

**Implemented output policy.** Web and preview HTML use local forward/back
anchors. RSS and agent Markdown use absolute canonical post URLs with fragments,
so readers never resolve a footnote against the feed document. Excerpt and OG
targets inline the definition as plain parenthetical text and omit the footnote
section. The transformer is registered but remains unwired from production page,
RSS, excerpt, and agent-Markdown consumers until the frontend handoff.

An unmarked paragraph after a definition remains ordinary prose. HTML cannot
distinguish that valid interleaving from an attempted continuation, so only an
immediately repeated `[^label]:` carrier emits the split-definition warning.

## Styling

New rules in `src/styles/blog-prose.css`, following the existing `.blog-poem`
idiom. The reference marker should be small, not superscript-tiny; the footnote
section wants a rule above it and muted body text. `:target` highlight on the
list item is a cheap, good touch.

## Acceptance

- A post with out-of-order labels renders sequential display numbers.
- Forward and back links both jump correctly.
- A regex character class inside a code block is untouched.
- Build warns (not fails) on an orphan reference or definition, naming the slug.
- One footnote section per post, at the foot, regardless of how the author
  interleaved definitions.

## Non-goals

- Sidenotes / margin notes. Different layout problem; revisit after this ships.
- Hover popovers on the reference. Nice, but additive later.
- Supporting Ghost's Markdown card footnotes. They are being replaced, not fixed.
