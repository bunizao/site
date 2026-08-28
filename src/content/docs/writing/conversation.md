---
title: Conversation blocks
description: The conversation fence grammar, speaker declarations, bubble boundaries, inline markup, avatars, and layout behavior.
group: Writing
order: 6
playground: /components/conversation#playground
---

A chat thread written as plain text. In a blog post, fence it as `conversation`:

````markdown
```conversation
you: how wide should a bubble be?
ada: 30em.
```
````

Outside a post, render it directly:

```astro
---
import Conversation from '@/features/content/ui/Conversation.astro';
---

<Conversation source={source} />
```

The playground's **Source** is a complete Markdown fence. Copy it as-is into a
Markdown editor or a Ghost Markdown card. In a Ghost code card, set the language
to `conversation` and paste only the lines inside the outer backticks.

## Thread options

The optional `@conversation` line controls the whole thread. It must be the
first non-empty line inside the fence. `conversation` is reserved for this
header and cannot be used as a speaker key:

````markdown
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
| `avatars` | `on` | Hides avatars; wide threads keep their alignment gutters, narrow ones close them. |
| `names` | `on` | Hides visible names; accessible labels remain. |
| `tints` | `on` | Leaves receiving bubbles neutral. |

Only `on` and `off` are valid. Unknown, repeated, malformed, or misplaced
options remain visible as prose instead of being partially applied.

Thread options are defaults inherited by every speaker. Put the same option on
a cast line to override it for that speaker only; omitted speaker options keep
the thread value. This precedence applies uniformly to `avatars`, `names`, and
`tints`.

## Messages

A line of the form `name: text` is a message. Speakers are auto-registered on
first use, so the simplest possible thread needs nothing else:

```conversation
ann: is that all?
bob: that's all.
```

A key is **one token**: no whitespace, no colon, at most 24 characters. A cast
line and a message head take the same one, which is the only reason `@ada` and
`ada:` cannot drift apart. A name that will not fit in a token is not a key —
it is a [`[name]`](#name).

The key is lowercased for matching but shown exactly as you first wrote it, so
`Ann:` renders **Ann** and `ann:` renders **ann**. The parser never restyles
your name.

Both `:` and `：` work as the separator, so a Chinese keyboard never has to
switch.

Not every `x: y` line becomes a message. The head has to be a key, so
`So here is the thing: it works` is prose, not a speaker. On top of that a head
that is a URL scheme (`https`, `mailto`, `tel`, `ftp`), that contains Markdown
punctuation, or that starts with `@` is prose too. The same rule applies even
when a cast line was written for that spelling — a bare link on its own line
does not turn into a phantom speaker.

### The own side

Four keys are reserved: **`me`**, **`you`**, **`我`**, **`你`**. Whoever speaks
under one of them is drawn on the trailing edge, filled, with no name and no
avatar — a reader does not need reminding what they look like.

```conversation
@Ada avatar=🐈

me: how wide should a bubble be?
ada: 30em.
```

`me:` and `you:` are the two framings a thread gets written in — you speaking,
or the reader cast as the one asking — and 我 / 你 are the same two without
leaving a Chinese keyboard, exactly as `：` is. Pick whichever reads right; the
output is identical.

Naming the side where you use it means there is no attribute for it. If no
reserved key speaks, **the first voice** takes that side — which is why the
`ann` / `bob` thread above already lays out as a conversation.

The name on the own side is still emitted, screen-reader-only. Alignment and
fill are the only visible attribution and neither reaches assistive technology,
so dropping the label outright would leave those messages unattributed. Give it
one worth hearing with a cast line: `@me [Lucian]`.

### Runs

Consecutive messages from one speaker collapse into a **run**: each message
keeps its own bubble, but the name is drawn once, on its own line above the
first one, and only the last bubble squares off the corner nearest its speaker.
The name sits beside the bubbles rather than inside them — the bubble is the
message, the name is who sent it.

```conversation
grace: One thing first.
grace: A run of messages from one person is labelled once.
grace: Like this. Three bubbles, one name.
```

### Wrapping

An **indented** line is a soft wrap, exactly as in Markdown — it continues the
sentence rather than starting a new paragraph:

```conversation
ada: A CJK glyph is 1em and a Latin glyph about half that,
  so one number lands on ~30 Chinese characters and ~60 Latin ones.
```

Latin text gets a space at the seam — that space is what separates two words.
When either side of the seam is CJK the join is tight: a mixed seam like
`拉丁字母大约` + `0.5em` wants spacing, not a character, and the thread sets
`text-autospace: normal` so the browser draws it. The renderer never adds a
character the source lacks.

A **blank** line ends the current bubble, so the next message from the same
speaker starts a fresh one instead of continuing it. Only an indented line can
continue a bubble; unindented prose and malformed syntax remain separate notes.

There is deliberately no multi-paragraph bubble. Two paragraphs is two
messages, which is what people actually send.

### Dividers

A line starting with `---` is a divider. With text after it, it renders as a
labelled beat; bare, it collapses to a single rule. Either way it breaks the
current run, so the next message is labelled again.

```conversation
ann: morning
--- three hours later
ann: afternoon
```

## Cast lines

A line starting with `@` declares a speaker before they talk. Every attribute
is optional — cast lines exist to override defaults, not to satisfy the parser.

```conversation
@gemini [Gemini] accent=#6E7FD8 tints=on
@ada [Ada] accent=#6F8F9D
@tutu [图图] accent=#B4603A avatar=🐈
```

| Written as | Effect |
| --- | --- |
| `[…]` | Display name. Defaults to the key, exactly as first written. |
| `accent=#RRGGBB` | Custom hue for the own-side fill, receiving-side tint, and name. Must be a hex colour. |
| `avatar=…` | See below. |
| `avatars=on` or `avatars=off` | Overrides the thread avatar default for this speaker. |
| `names=on` or `names=off` | Overrides the thread name default for this speaker. |
| `tints=on` or `tints=off` | Overrides the thread tint default for this speaker. |

A value is one token: `name=value`, never quoted. The display name is the one
thing that is a phrase, so it is the one thing that is a content block —
borrowed from [Typst](https://typst.app), where `[…]` means *this is prose, not
a token*. Tokens do not need quoting and prose does not need escaping, so
nothing on a cast line ever needs either.

The key, message head, and cast declaration use the same validator: one token,
no whitespace or colon, at most 24 characters, and no Markdown punctuation.
Each listed cast attribute may appear at most once.

That is the whole grammar. A cast line is a key, then at most one `[name]` and
any number of `name=value` pairs, and **nothing else** — a stray word or an
attribute that is not on the list means the line is not a cast line, so it
falls through and renders as written:

```conversation
@Ada Lovelace accent=#4E7A5E
```

That is a key with a space in it, so it is not a key. The line appears in the
thread verbatim rather than declaring `ada` and dropping the rest in silence.

There is no attribute for which side a speaker sits on. That is the key's job —
see [the own side](#the-own-side).

<a id="name"></a>

### `[name]`

The label defaults to the key **as first written**, and nothing rewrites it.
Capitalisation is therefore not something to declare — it is something to type:

```conversation
@Ada accent=#4E7A5E

ada: Case only matters the first time. Match it however you like after that.
```

Brackets are for the names a key cannot spell — a space, a script the key is
not in, a name that is not the handle:

```conversation
@ada [Ada Lovelace]
@tutu [图图] avatar=🐈
@octo [Octocat] avatar=https://avatars.githubusercontent.com/u/583231?v=4
```


### `accent`

The default is monochrome, derived from the site's `--foreground`, and is AA in
both themes by construction.

Supplying `accent=#RRGGBB` opts into a hue, and where it lands depends on which
side the speaker is on:

| Side | What the accent paints |
| --- | --- |
| own side (`me:`, `you:`, `我:`, `你:`) | the whole bubble, filled |
| everyone else | a tint on the bubble, plus the name |

The tint is what makes a colour worth declaring on a thread running
`avatars=off names=off`: with no name and no avatar to carry it, the bubble is
the only surface left. It stays a tint on purpose — one side filled outright is
what tells a reader which way the conversation runs, and two filled sides lose
that. `tints=off` drops it entirely.

Put `tints=off` on a cast line to keep only that speaker's receiving bubbles
neutral. The speaker value overrides the thread default in either direction, so
`tints=on` can opt one speaker back in when `@conversation tints=off`.

The tint is **not** your hex mixed into the bubble. It keeps the hue, pins
lightness beside the bubble's own, and caps chroma, all in OKLCH. That is what
keeps a thread even: a vivid violet and a muted sage arrive at the same weight,
so no speaker shouts louder than another for a reason you did not choose. It is
also the only way light mode stays clean — an accent picked as a fill is
mid-dark, and mixing one into a light bubble lands on a dirty pastel every time.

A hex chosen to look good as a *fill* routinely lands near 4:1 when reused as
*name text*, so the accent is walked toward the far end of the page background in
4% steps until it clears 4.5:1 — once per theme, when the conversation is
rendered. You keep as much of the chosen hue as the contrast ratio allows, and
no configuration can produce unreadable text.

Anything that is not a hex colour makes the cast line invalid and leaves it
visible as prose.

### `avatar`

Four forms, in the order you are likely to reach for them:

| Written as | Renders |
| --- | --- |
| `avatar=https://…`, `/local.png`, `data:image/svg+xml,…` | `<img>`, lazy, `referrerpolicy="no-referrer"` |
| `avatar=#sprite-id` | `<svg><use href="#sprite-id">`, inheriting the speaker's colour |
| `avatar=🐈` | the glyph itself |
| omitted | initials; a CJK label takes its last character |

Raw inline `<svg>` is deliberately not a form: it would wreck the readability of
a cast line, and a data: URI covers the same ground.

An external avatar still costs your readers a request to someone else's host.
`referrerpolicy="no-referrer"` keeps that host from learning which page they are
on, but routing through the site's image proxy is better where it is available.

## Inline markup

A deliberately small subset — `` `code` ``, `**bold**`, `*italic*`, and
`[links](https://example.com)`. A conversation is dialogue; headings and lists
inside a chat bubble are a sign the content belongs in prose instead. Links are
limited to HTTP(S), root-relative, and fragment targets; other schemes remain
literal text.

## Layout notes

The bubble cap is `30em`, not a pixel width. A CJK glyph is 1em and a Latin
glyph roughly 0.5em, so one number lands on about 30 Chinese characters **and**
about 60 Latin ones — both inside a comfortable measure. That is the whole trick
for mixed text.

Everything reflows on **container queries**, not viewport media queries, so a
thread in a narrow column adapts to that column rather than to the window. At
container widths under 520px the avatar gutter and the far-side channel shrink,
and any row without a visible avatar — every sending run, and both sides under
`avatars=off` — stops reserving the gutter and closes to the column edge, so the
two sides of the thread end on the same line the surrounding prose does. Under
360px avatars are dropped everywhere and the body steps down to 15px.

A bubble is sized to hug its own text, which CSS alone cannot express: once a
message wraps, `width: fit-content` locks the box to the cap and whatever the
line breaker could not spend stays inside the right border as dead space — worst
on CJK, where a trailing 「吗？」 cannot be split and drops to the next line
whole. A small client pass measures the line boxes and sets the width to the
widest one, so the gap at the right border matches the padding at the left. It
never narrows a bubble past a line already laid out, so line breaks are
identical with and without it; with no JavaScript the bubble simply keeps the
cap.

The renderer translates `@conversation` into namespaced attributes on the
thread. The playground edits that source line directly, so its switches never
create a visual state that cannot be copied back into an editor.

Custom properties are namespaced `--conv-*`. `--accent` and `--radius` are
global site tokens, and an un-prefixed name on the thread would shadow them for
every descendant.
