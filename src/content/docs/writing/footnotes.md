---
title: Footnotes
description: Add footnotes with [^label] references and definitions, plus repeat citations, backlinks, and build warnings.
group: Writing
order: 6
---

Footnotes use the common Markdown-extension syntax: a reference anywhere in the
text, and a definition in a paragraph of its own.

```md demo
Cloudflare bills by request, not by CPU time.[^billing]

[^billing]: Workers Paid, as of the 2024 pricing change.
```

The reference renders as a numbered superscript that links down to the note.
The build removes the definition paragraph from where you wrote it and collects
all notes into an ordered list at the foot of the post. Each note has a `↩`
backlink to where it was cited.

## Labels

A label is any text without a `]` or a newline, so `[^1]`, `[^billing]`, and
`[^why-not-d1]` all work. Labels match exactly, including case. They never
appear on the page. Their only job is to pair a reference with its definition.

Notes are numbered in reference order. Label text and definition order don't
affect the number, so if `[^zebra]` is cited before `[^apple]`, it is note 1.
Write the definitions wherever is convenient, and the build sorts them.

## Definitions

A definition must be a paragraph that contains only `[^label]: body`. The body
can include inline HTML: links, emphasis, code.

Put each definition on its own line in the Ghost editor. The parser reads one
paragraph at a time. If a definition shares a paragraph with other text, the
parser treats the whole thing as prose that happens to contain a colon.

Definitions can go anywhere in the post. Putting one right after the paragraph
that cites it is usually easiest to maintain. Readers see the notes at the
bottom either way.

## Cite a note more than once

Repeat references to one label all point to the same note and share its
number:

```md demo
…as the pricing docs say.[^billing] …which is also why the queue is batched.[^billing]

[^billing]: Workers Paid, as of the 2024 pricing change.
```

Each reference gets its own anchor (`fnref-1`, `fnref-1a`, `fnref-1b`), but the
note has a single backlink, which returns to the first one. After 26 repeats
the suffix becomes numeric.

## Warnings

The build logs four warnings. None of them stop the build.

| Code | Meaning |
| --- | --- |
| `orphan-reference` | `[^label]` is cited but has no definition. The number still renders, unlinked. |
| `orphan-definition` | Nothing cites this definition. It is dropped from the output. |
| `duplicate-definition` | One label has two definitions. The first wins. |
| `split-definition` | A definition is repeated in the very next paragraph, usually because the editor split a long note in two. Only the first body is used. |

Ghost sometimes splits a long definition across paragraphs when you paste it.
`split-definition` has its own code so you can tell that editor artefact apart
from a real `duplicate-definition` mistake.

## Other output targets

For `rss` and `agent-markdown`, the structure stays the same but every link
becomes absolute, because a feed reader has no page to resolve `#fn-1` against.

For `og` and `excerpt` there is no page to link to at all. Each reference is
replaced inline by its note in parentheses:

```
Cloudflare bills by request, not by CPU time. (Workers Paid, as of the 2024 pricing change.)
```

A reference with no definition falls back to a bare `[1]`.

## Notes

- `[^` inside a code block or `<code>` span is masked before footnotes are
  processed, so you can write about the syntax safely.
- Implementation: `src/features/posts/server/directives/footnotes.ts`.
