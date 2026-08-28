---
title: Footnotes
description: The [^label] syntax — references, definitions, repeat references, backlinks, and the four warnings that catch a broken pair.
group: Writing
order: 6
---

Footnotes use the familiar Markdown-extension syntax. A reference anywhere in the
text, and a definition in a paragraph of its own:

```md demo
Cloudflare bills by request, not by CPU time.[^billing]

[^billing]: Workers Paid, as of the 2024 pricing change.
```

The reference becomes a numbered superscript linking down to the note. The
definition paragraph is removed from where you wrote it and the notes are
collected into an ordered list at the foot of the post, each with a `↩` backlink
to where it was cited.

## Labels

A label is any text without a `]` or a newline. `[^1]`, `[^billing]`,
`[^why-not-d1]` all work. Labels are matched exactly — including case — and never
appear on the page. They exist only to pair a reference with its definition.

Numbering comes from **reference order**, not label text or definition order.
`[^zebra]` cited before `[^apple]` is note 1. Write the definitions wherever they
are convenient; they get sorted.

## Definitions

A definition must be a paragraph whose entire content is `[^label]: body`. It may
contain inline HTML — links, emphasis, code.

Put each definition on its own line in the Ghost editor. The parser reads one
paragraph at a time, so a definition sharing a paragraph with prose is not a
definition; it is prose that happens to contain a colon.

Definitions may live anywhere in the post. Immediately after the paragraph that
cites them is usually easiest to maintain; the reader sees them at the bottom
either way.

## Citing the same note twice

Repeat references to one label all point at the same note and share its number:

```
…as the pricing docs say.[^billing] …which is also why the queue is batched.[^billing]
```

Each reference gets its own anchor — `fnref-1`, `fnref-1a`, `fnref-1b` — but the
note's single backlink returns to the first. Past 26 repeats the suffix becomes
numeric. If you are citing one note 27 times, the note probably wants to be a
paragraph.

## Warnings

Four things get logged during the build. None of them stop it.

| Code | Meaning |
| --- | --- |
| `orphan-reference` | `[^label]` cited with no definition. The number still renders, unlinked. |
| `orphan-definition` | A definition nothing cites. Dropped from the output. |
| `duplicate-definition` | Two definitions for one label. The first wins. |
| `split-definition` | A definition repeated in the very next paragraph — usually the editor splitting a long note in two. Only the first body is used. |

`split-definition` exists because Ghost sometimes breaks a long definition across
paragraphs on paste. It is called out separately from `duplicate-definition` so
you can tell an editor artefact from an actual mistake.

## Other output targets

For `rss` and `agent-markdown` the structure is unchanged but every link is made
absolute — a feed reader has no page to resolve `#fn-1` against.

For `og` and `excerpt` there is no page to link to at all, so a reference is
replaced inline by its note in parentheses:

```
Cloudflare bills by request, not by CPU time. (Workers Paid, as of the 2024 pricing change.)
```

A reference with no definition falls back to a bare `[1]`.

## Notes

- `[^` inside a code block or `<code>` span is masked before this runs, so
  writing about the syntax is safe.
- Implementation: `src/features/posts/server/directives/footnotes.ts`.
