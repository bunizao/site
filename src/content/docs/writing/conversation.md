---
title: Conversation blocks
description: Write chat threads in a conversation fence, with speakers, cast lines, bubbles, avatars and layout.
group: Writing
order: 6
playground: /components/conversation#playground
---

A conversation block renders a chat thread from plain text. In a blog post,
fence it as `conversation`:

````markdown demo
```conversation
you: how wide should a bubble be?
ada: 30em.
```
````

Outside a post, render it with the component:

```astro
---
import Conversation from '@/features/content/ui/Conversation.astro';
---

<Conversation source={source} />
```

The playground's **Source** is a complete Markdown fence. Copy it as-is into a
Markdown editor or a Ghost Markdown card. In a Ghost code card, set the
language to `conversation` and paste only the lines inside the outer backticks.

## Thread options

The optional `@conversation` line sets options for the whole thread. It must
be the first non-empty line inside the fence. `conversation` is reserved for
this header, so you can't use it as a speaker key.

````markdown demo
```conversation
@conversation avatars=on names=on tints=off
@gemini [Gemini] accent=#6E7FD8 tints=on
@ada [Ada] accent=#6F8F9D

gemini: My tint overrides the thread default.
ada: I inherit the neutral receiving bubble.
```
````

| Option | Default | Effect when `off` |
| --- | --- | --- |
| `avatars` | `on` | Hides avatars. Wide threads keep their alignment gutters; narrow ones close them. |
| `names` | `on` | Hides visible names. Accessible labels remain. |
| `tints` | `on` | Leaves receiving bubbles neutral. |

Only `on` and `off` are valid. Unknown, repeated, malformed, or misplaced
options stay visible as prose. They are never partly applied.

Thread options are defaults that every speaker inherits. To override one for a
single speaker, put the same option on that speaker's
[cast line](#cast-lines). Options you leave off a cast line keep the thread
value. This works the same way for `avatars`, `names`, and `tints`.

## Messages

A line in the form `name: text` is a message. A speaker is registered
automatically the first time they speak, so the simplest thread needs nothing
else:

```conversation demo
ann: is that all?
bob: that's all.
```

A key (the speaker's identifier) is **one token**: no whitespace, no colon, at
most 24 characters. Cast lines and message heads use the same key, which is
what keeps `@ada` and `ada:` matched. If a name doesn't fit in one token, it
isn't a key. Use a [`[name]`](#name) for it instead.

The key is lowercased for matching but displayed exactly as you first wrote
it, so `Ann:` renders **Ann** and `ann:` renders **ann**. The parser never
changes how your name is written.

Both `:` and `：` work as the separator, so you never have to switch away from
a Chinese keyboard.

Not every `x: y` line becomes a message. The head must be a key, so
`So here is the thing: it works` stays prose. A head is also prose if it:

- is a URL scheme (`https`, `mailto`, `tel`, `ftp`)
- contains Markdown punctuation
- starts with `@`

This applies even when a cast line declared that spelling, so a bare link on
its own line never turns into a phantom speaker.

### The own side

The own side is the sending side of the thread, like your own messages in a
chat app. Four keys are reserved for it: **`me`**, **`you`**, **`我`**,
**`你`**. Messages under these keys are drawn on the trailing edge, filled,
with no name and no avatar, since readers don't need reminding what they look
like.

```conversation demo
@Ada avatar=🐈

me: how wide should a bubble be?
ada: 30em.
```

Use `me:` when you are the one speaking, and `you:` when the reader is cast as
the one asking. 我 and 你 are the same two options on a Chinese keyboard, the
same way `：` is. Pick whichever reads right. The output is identical.

The key sets the side, so there is no attribute for it. If no reserved key
speaks, **the first voice** takes the own side. That's why the `ann` / `bob`
thread above already lays out as a conversation.

The own-side name is still emitted as screen-reader-only text. Alignment and
fill are the only visible attribution, and neither reaches assistive
technology, so dropping the label would leave those messages unattributed. To
give it a name worth hearing, add a cast line: `@me [Lucian]`.

### Runs

Consecutive messages from one speaker form a **run**. Each message keeps its
own bubble, but the name appears once, on its own line above the first bubble.
Only the last bubble squares off the corner nearest its speaker. The name sits
beside the bubbles instead of inside them, because the bubble is the message
and the name is who sent it.

```conversation demo
grace: One thing first.
grace: A run of messages from one person is labelled once.
grace: Like this. Three bubbles, one name.
```

### Wrapping

An **indented** line is a soft wrap, as in Markdown. It continues the sentence
instead of starting a new paragraph:

```conversation demo
ada: A CJK glyph is 1em and a Latin glyph about half that,
  so one number lands on ~30 Chinese characters and ~60 Latin ones.
```

In Latin text, the seam gets a space, which separates the two words. When
either side of the seam is CJK, the join is tight. A mixed seam like
`拉丁字母大约` + `0.5em` needs spacing but no extra character, so the thread
sets `text-autospace: normal` and the browser draws the gap. The renderer never
adds a character that isn't in the source.

A **blank** line ends the current bubble, so the next message from the same
speaker starts a new one. Only an indented line can continue a bubble.
Unindented prose and malformed syntax stay as separate notes.

There is no multi-paragraph bubble. Two paragraphs are two messages, which is
how people send them.

### Dividers

A line starting with `---` is a divider. With text after it, it renders as a
labelled break. On its own, it collapses to a single rule. Either way it ends
the current run, so the next message shows its name again.

```conversation demo
ann: morning
--- three hours later
ann: afternoon
```

## Cast lines

A cast line starts with `@` and declares a speaker before they talk. Every
attribute is optional. You only need a cast line to override a default.

```conversation demo
@gemini [Gemini] accent=#6E7FD8 tints=on
@ada [Ada] accent=#6F8F9D
@tutu [图图] accent=#B4603A avatar=🐈

gemini: Declared before I say anything.
ada: Nothing here needed a cast line either.
tutu: 只是想换个颜色。
```

| Written as | Effect |
| --- | --- |
| `[…]` | Display name. Defaults to the key, exactly as first written. |
| `accent=#RRGGBB` | Custom hue for the own-side fill, receiving-side tint, and name. Must be a hex colour. |
| `avatar=…` | See [`avatar`](#avatar). |
| `avatars=on` or `avatars=off` | Overrides the thread avatar default for this speaker. |
| `names=on` or `names=off` | Overrides the thread name default for this speaker. |
| `tints=on` or `tints=off` | Overrides the thread tint default for this speaker. |

A value is one token: `name=value`, never quoted. The display name is the only
value that can be a phrase, so it gets its own content-block syntax. The
brackets come from [Typst](https://typst.app), where `[…]` marks prose instead
of a token. Tokens don't need quoting and prose doesn't need escaping, so
nothing on a cast line needs either.

The key, message head, and cast declaration share one validator: one token, no
whitespace or colon, at most 24 characters, and no Markdown punctuation. Each
cast attribute in the table can appear at most once.

The full grammar: a cast line is a key, then at most one `[name]`, then any
number of `name=value` pairs, and **nothing else**. A stray word or an
attribute that isn't in the table means the line is not a cast line, so it
renders as written:

```conversation demo
@Ada Lovelace accent=#4E7A5E
```

That key has a space in it, so it isn't a valid key. The line appears in the
thread verbatim, instead of declaring `ada` and silently dropping the rest.

No attribute sets which side a speaker sits on. The key does that (see
[the own side](#the-own-side)).

<a id="name"></a>

### `[name]`

The label defaults to the key **as first written**, and nothing rewrites it.
So you set capitalisation by typing it, not by declaring it:

```conversation demo
@Ada accent=#4E7A5E

ada: Case only matters the first time. Match it however you like after that.
```

Use brackets for names a key can't spell: a name with a space, a name in a
script the key isn't in, or a name that differs from the handle.

```conversation demo
@ada [Ada Lovelace]
@tutu [图图] avatar=🐈
@octo [Octocat] avatar=https://avatars.githubusercontent.com/u/583231?v=4

ada: A name with a space in it.
tutu: 一个键写不出的名字。
octo: A handle that is not the name.
```


### `accent`

By default the thread is monochrome. Its colours derive from the site's
`--foreground` and meet AA contrast in both themes by construction.

Set `accent=#RRGGBB` to add a hue. Where it shows depends on the speaker's
side:

| Side | What the accent paints |
| --- | --- |
| own side (`me:`, `you:`, `我:`, `你:`) | the whole bubble, filled |
| everyone else | a tint on the bubble, plus the name |

The tint is what makes a colour worth setting on a thread running
`avatars=off names=off`. With no name or avatar to show the colour, the bubble
is the only place left. It stays a tint because one fully filled side is how
readers tell which way the conversation runs, and two filled sides would lose
that. `tints=off` removes it entirely.

Put `tints=off` on a cast line to keep only that speaker's receiving bubbles
neutral. The speaker value overrides the thread default in either direction,
so `tints=on` can opt one speaker back in when `@conversation tints=off`.

The tint is **not** your hex mixed into the bubble. In OKLCH, the renderer
keeps the hue, pins lightness close to the bubble's own, and caps chroma. This
keeps a thread even: a vivid violet and a muted sage end up at the same
weight, so no speaker stands out unless you choose it. It is also what keeps
light mode clean. An accent picked as a fill is mid-dark, and mixing one into a
light bubble always gives a muddy pastel.

A hex chosen to look good as a *fill* often lands near 4:1 contrast when reused
as *name text*. So the renderer walks the accent toward the far end of the page
background in 4% steps until it clears 4.5:1. This happens once per theme, when
the conversation renders. You keep as much of your hue as the contrast ratio
allows, and no setting can produce unreadable text.

Anything that isn't a hex colour makes the cast line invalid, so it stays
visible as prose.

### `avatar`

Four forms, in the order you're likely to use them:

| Written as | Renders |
| --- | --- |
| `avatar=https://…`, `/local.png`, `data:image/svg+xml,…` | `<img>`, lazy, `referrerpolicy="no-referrer"` |
| `avatar=#sprite-id` | `<svg><use href="#sprite-id">`, inheriting the speaker's colour |
| `avatar=🐈` | the glyph itself |
| omitted | initials; a CJK label uses its last character |

Raw inline `<svg>` isn't a supported form. It would make cast lines hard to
read, and a data: URI does the same job.

An external avatar still costs your readers a request to someone else's host.
`referrerpolicy="no-referrer"` stops that host from learning which page they
are on. Where the site's image proxy is available, routing through it is
better.

## Inline markup

Bubbles support a small subset of inline Markdown: `` `code` ``, `**bold**`,
`*italic*`, and `[links](https://example.com)`. A conversation is dialogue, so
if you need headings or lists in a bubble, the content belongs in prose. Links
can be HTTP(S), root-relative, or fragment targets. Other schemes stay as
literal text.

## Layout

The bubble cap is `30em` instead of a pixel width. A CJK glyph is 1em and a
Latin glyph about 0.5em, so one number gives about 30 Chinese characters
**and** about 60 Latin ones. Both are a comfortable line length, so one cap
works for mixed text.

Everything reflows on **container queries** instead of viewport media queries.
A thread in a narrow column adapts to that column, not to the window.

| Container width | What changes |
| --- | --- |
| Under 520px | The avatar gutter and the far-side channel shrink. Any row without a visible avatar (every sending run, and both sides under `avatars=off`) stops reserving the gutter and closes to the column edge, so both sides of the thread end on the same line as the surrounding prose. |
| Under 360px | Avatars are dropped everywhere, and the body text steps down to 15px. |

A bubble is sized to fit its own text, which CSS alone can't express. Once a
message wraps, `width: fit-content` locks the box to the cap. Whatever width
the line breaker couldn't use stays inside the right border as dead space. It
is worst on CJK, where a trailing 「吗？」 can't be split and drops to the next
line whole.

A small client pass measures the line boxes and sets the width to the widest
one, so the gap at the right border matches the padding at the left. It never
narrows a bubble past a line that is already laid out, so line breaks are the
same with and without it. Without JavaScript, the bubble keeps the cap.

The renderer turns `@conversation` into namespaced attributes on the thread.
The playground edits that source line directly, so its switches can't create a
visual state that you couldn't copy back into an editor.

Custom properties use the `--conv-*` namespace. `--accent` and `--radius` are
global site tokens, and an unprefixed name on the thread would shadow them for
every descendant.
