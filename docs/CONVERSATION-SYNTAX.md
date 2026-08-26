# Conversation syntax

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

Live playground: `/components/preview/conversation`.

## Messages

A line of the form `name: text` is a message. Speakers are auto-registered on
first use, so the simplest possible thread needs nothing else:

```conversation
ann: is that all?
bob: that's all.
```

Both `:` and `：` work as the separator, so a Chinese keyboard never has to
switch. A name is at most 24 characters and may not contain a colon.

Not every `x: y` line becomes a message. A head that is a URL scheme
(`https`, `mailto`, `tel`, `ftp`) or that contains Markdown punctuation is
treated as prose, so a bare link on its own line does not turn into a
phantom speaker.

### Runs

Consecutive messages from one speaker collapse into a **run**: each message
keeps its own bubble, but the name is drawn once, at the top of the first one,
and only the last bubble squares off the corner nearest its speaker.

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

Latin text gets a space at the seam. When either side of the seam is CJK the
join is tight, so no gap appears that the author never typed. The rule errs
toward never adding a character that is not in the source.

A **blank** line ends the current bubble, so the next message from the same
speaker starts a fresh one instead of continuing it.

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
@you me
@tutu label="图图" accent=#B4603A avatar=🐈
```

| Attribute | Effect |
| --- | --- |
| `me` | Renders this speaker on the trailing side with the filled bubble. |
| `label="…"` | Display name. Defaults to the key. Quote it if it has spaces. |
| `accent=#RRGGBB` | Custom hue for the fill and the name. Must be a hex colour. |
| `avatar=…` | See below. |

### `me`

The `me` side is drawn on the trailing edge, filled, and without an avatar —
a reader does not need reminding what they look like. With no explicit `me`,
**the first voice to speak** takes that side, so a two-party exchange gets the
right layout with no cast lines at all.

The name on a `me` run is still emitted, screen-reader-only. Alignment and fill
are the only visible attribution and neither reaches assistive technology, so
dropping the label outright would leave those messages unattributed.

### `accent`

The default is monochrome, derived from the site's `--foreground`, and is AA in
both themes by construction.

Supplying `accent=#RRGGBB` opts into a hue. A hex chosen to look good as a
*fill* routinely lands near 4:1 when reused as *name text*, so the accent is
walked toward the far end of the bubble in 4% steps until it clears 4.5:1 —
once per theme, at build time. You keep as much of the chosen hue as the
contrast ratio allows, and no configuration can produce unreadable text.

Anything that is not a hex colour is ignored rather than passed through.

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
inside a chat bubble are a sign the content belongs in prose instead.

## Layout notes

The bubble cap is `30em`, not a pixel width. A CJK glyph is 1em and a Latin
glyph roughly 0.5em, so one number lands on about 30 Chinese characters **and**
about 60 Latin ones — both inside a comfortable measure. That is the whole trick
for mixed text.

Everything reflows on **container queries**, not viewport media queries, so a
thread in a narrow column adapts to that column rather than to the window. At
container widths under 520px the avatar gutter and the far-side channel shrink;
under 360px avatars are dropped and the body steps down to 15px.

Two attributes on `.conv-thread` are read by the stylesheet and are how the
playground's toggles work:

| Attribute | Effect |
| --- | --- |
| `data-avatars="off"` | Hides avatars, keeping the gutter so both sides stay optically even. |
| `data-names="off"` | Hides visible names; they stay in the accessibility tree. |

Custom properties are namespaced `--conv-*`. `--accent` and `--radius` are
global site tokens, and an un-prefixed name on the thread would shadow them for
every descendant.
