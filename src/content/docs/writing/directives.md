---
title: Directive syntax
description: "The [!name key=value] syntax: how markers are matched, how attributes parse, and the three directive kinds."
group: Writing
order: 1
---

A directive is a marker you write on a line of its own in the Ghost editor. The
build replaces it with rendered output, such as an embed, or reads it as page
metadata. This page covers the syntax every directive shares.

```md demo
[!mood id=482 theme=dark]
```

Ghost wraps that line in a paragraph. At build time, any paragraph that contains
only a marker is turned into the directive. An unlabelled Ghost code card works
the same way when every non-empty line in it is a registered marker. Use the
code card when the editor keeps joining your marker to nearby text.

## Matching

The marker must be alone in its paragraph. This matches:

```html
<p>[!youtube id=dQw4w9WgXcQ]</p>
```

None of these match:

```html
<p>Try writing [!youtube id=dQw4w9WgXcQ] on its own line.</p>
<p><strong>[!youtube id=dQw4w9WgXcQ]</strong></p>
```

This lets you write about the syntax in a post without triggering it, as long as
the marker shares its paragraph with something else.

Code cards follow their language label:

| Label | What happens |
| --- | --- |
| `text` or another ordinary language | The card is masked before directives run and shows as code. Use one of these when the whole code sample is itself a valid marker. |
| `directive` | The card opts into directive syntax, with the same line rule as an unlabelled card. |
| No label, every non-empty line is a registered marker | Each line becomes its own directive, in order. This is the compatibility form. |

A registered marker here is one for a block or meta directive: `mood`, `music`,
`youtube`, `authors` or `title`. Blank lines and spaces around a line are ignored. If any
line is something else (commentary, an unknown name, or two markers on one
line), the whole card stays code.

In the Ghost editor, put the marker in its own paragraph with a blank line above
and below it. If it shows as normal text on the published page, it was almost
certainly wrapped in formatting or joined to the paragraph before it.

If paragraphs are awkward to author, use a code card that contains only
markers, one per line. Don't put commentary in the same card.

## Names

```
[!name]
[!name attributes]
```

A name starts with a lowercase letter, followed by lowercase letters, digits,
and hyphens: `[a-z][a-z0-9-]*`. Matching is case-insensitive, so
`[!Mood id=1]` works, but write it lowercase.

If the name isn't recognised, the marker stays on the page as plain text and the
build logs `unknown-directive`. A typo like `[!moood id=1]` stays visible instead
of disappearing.

## Attributes

Attributes are `key=value` pairs separated by whitespace. Values can be bare,
double-quoted, or single-quoted:

```md demo
[!authors ai=anthropic/claude-opus-4-6 note="drafted the migration table"]
```

The rules:

- Keys use the same shape as names: lowercase letters, digits, hyphens.
- A bare value runs to the next whitespace. Quote any value that contains a
  space.
- A quoted value can contain the other quote character, but not its own.
- A repeated key is an error. The last one does not win.
- An attribute the directive doesn't declare is an error.
- Write an empty value as `key=""`. A bare `key=` is a parse error.

If anything fails to parse, the build logs `invalid-directive-attributes` and
drops the marker from the output.

## Directive kinds

The kind decides when a directive runs and what it can do.

### Block

A block directive is matched one paragraph at a time and replaces that
paragraph with HTML. Blocks can be async, because several of them fetch
metadata, like the YouTube title or the Apple Music artwork. `mood`, `music`,
and `youtube` are blocks.

### Meta

A meta directive is matched the same way but produces no HTML. The build removes
the paragraph and collects the parsed attributes into `result.meta` under the
directive name, for the page template to use. `authors` and `title` are meta
directives: the credit belongs in the post footer, and the English title in the
index, instead of wherever you typed them.

A meta marker never renders, so it would otherwise leak into anything built
from the raw source: the excerpt, the plaintext, the Markdown output. The build
scrubs standalone meta markers from those separately, and skips code fences
while doing it.

### Inline

An inline directive gets the entire document instead of a single paragraph,
because it doesn't match a marker. `poem` looks at the shape of blockquotes.
`footnotes` looks for `[^label]` anywhere in the text. Inline directives run
after all the block directives, so they see the finished document.

## Reference

| Directive | Kind | Attributes |
| --- | --- | --- |
| [`[!mood]`](/docs/writing/mood) | block | `id`, `theme`, `density` |
| [`[!music]`](/docs/writing/music) | block | `id` |
| [`[!youtube]`](/docs/writing/youtube) | block | `id`, `start` |
| [`[!authors]`](/docs/writing/authors) | meta | `ai`, `note` |
| [`[!title]`](/docs/writing/title) | meta | `en` |
| [`[!poem]`](/docs/writing/poem) | inline | *(modifiers, not attributes)* |
| [`[^label]`](/docs/writing/footnotes) | inline | *(no attributes)* |

## Add a directive

Directives are registered in one frozen array in
`src/features/posts/server/directives/index.ts`:

```ts
export const postDirectiveRegistry: readonly Directive[] = Object.freeze([
  poemDirective,
  footnotesDirective,
  moodDirective,
  musicDirective,
  authorsDirective,
  titleDirective,
  youtubeDirective,
]);
```

To add one:

1. Create a file in that directory that exports an object matching
   `BlockDirective`, `MetaDirective`, or `InlineDirective`.
2. Add it to the array. Order matters only among inline directives, which run
   in registry order.
3. Parse attributes with `parseKeyValueAttributes` and
   `rejectUnsupportedAttributes` from `./attributes` instead of writing your own
   parser. Throwing `DirectiveAttributeError` is what turns a bad marker into a
   warning instead of a crash.
