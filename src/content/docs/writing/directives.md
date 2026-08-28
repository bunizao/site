---
title: Directive syntax
description: The [!name key=value] grammar — how markers are matched, how attributes parse, and the three kinds of directive.
group: Writing
order: 1
---

A directive is a marker written on a line of its own in the Ghost editor:

```md demo
[!mood id=482 theme=dark]
```

Ghost normally wraps that line in a paragraph, and the build matches paragraphs
whose *entire* content is a marker. An unlabelled Ghost code card whose entire
content is one registered marker is also an authoring carrier. This is useful
when the editor will not keep a marker in its own paragraph.

## Matching

The marker must be alone in its paragraph. This is matched:

```html
<p>[!youtube id=dQw4w9WgXcQ]</p>
```

None of these are:

```html
<p>Try writing [!youtube id=dQw4w9WgXcQ] on its own line.</p>
<p><strong>[!youtube id=dQw4w9WgXcQ]</strong></p>
```

So you can write about the syntax in a post without triggering it, as long as the
marker shares its paragraph with something. Code labelled `text` or with another
ordinary language is also masked before directives run. Use one of those labels
when the whole code sample is itself a valid marker. The special `directive`
language opts a code card into authoring syntax; an unlabelled exact marker is
the compatibility form.

In the Ghost editor, put the marker in its own paragraph with a blank line above
and below it. If it renders as normal text on the published page, it was almost
certainly wrapped in formatting or joined to the paragraph before it.

If paragraph authoring is awkward, use a code card containing only the marker.
Do not put commentary or a second marker in the same card.

## Names

```
[!name]
[!name attributes]
```

A name starts with a lowercase letter and continues with lowercase letters,
digits, and hyphens: `[a-z][a-z0-9-]*`. Matching is case-insensitive, so
`[!Mood id=1]` works, but write it lowercase.

An unrecognised name is left in the document and logged as `unknown-directive`.
That is deliberate — a silent deletion of something you typed is worse than a
visible `[!moood id=1]` on the page telling you what you got wrong.

## Attributes

Attributes are `key=value` pairs separated by whitespace. Values may be bare,
double-quoted, or single-quoted:

```md demo
[!authors ai=anthropic/claude-opus-4-6 note="drafted the migration table"]
```

The rules:

- Keys follow the same shape as names — lowercase, digits, hyphens.
- Bare values run to the next whitespace. Quote anything containing a space.
- A quoted value may contain the other quote character but not its own.
- A repeated key is an error, not a last-one-wins.
- An attribute the directive does not declare is an error.
- `key=` with nothing after it is a legal empty string.

Anything that fails to parse produces `invalid-directive-attributes` and the
marker is dropped from the output.

## The three kinds

Which kind a directive is determines when it runs and what it can do.

### Block

Matched one paragraph at a time; replaces that paragraph with HTML. Blocks may be
async, because several of them fetch metadata — the YouTube title, the Apple
Music artwork. `mood`, `music`, and `youtube` are blocks.

### Meta

Matched the same way, but produces no HTML. The paragraph is removed and the
parsed attributes are collected into `result.meta` under the directive name, for
the page template to use. `authors` is the only meta directive: the credit
belongs in the post footer, not where you happened to type it.

Because a meta marker never renders, it would otherwise leak into anything
derived from the raw source — the excerpt, the plaintext, the Markdown output.
Those are scrubbed of standalone meta markers separately, with code fences
respected.

### Inline

Handed the entire document instead of a single paragraph, because what these
match is not a marker at all. `poem` looks at the shape of blockquotes;
`footnotes` looks for `[^label]` anywhere in the text. Inline directives run
after all the block directives, so they see the finished document.

## Reference

| Directive | Kind | Attributes |
| --- | --- | --- |
| [`[!mood]`](/docs/writing/mood) | block | `id`, `theme`, `density` |
| [`[!music]`](/docs/writing/music) | block | `id` |
| [`[!youtube]`](/docs/writing/youtube) | block | `id`, `start` |
| [`[!authors]`](/docs/writing/authors) | meta | `ai`, `note` |
| [`[!poem]`](/docs/writing/poem) | inline | *(modifiers, not attributes)* |
| [`[^label]`](/docs/writing/footnotes) | inline | *(no attributes)* |

## Adding one

Directives are registered in one frozen array in
`src/features/posts/server/directives/index.ts`:

```ts
export const postDirectiveRegistry: readonly Directive[] = Object.freeze([
  poemDirective,
  footnotesDirective,
  moodDirective,
  musicDirective,
  authorsDirective,
  youtubeDirective,
]);
```

A new one is a file in that directory exporting an object matching
`BlockDirective`, `MetaDirective`, or `InlineDirective`, added to the array.
Order matters only among inline directives, which run in registry order. Use
`parseKeyValueAttributes` and `rejectUnsupportedAttributes` from `./attributes`
rather than writing a parser — throwing `DirectiveAttributeError` is what turns a
bad marker into a warning instead of a crash.
