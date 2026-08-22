---
title: Poems
description: Verse blocks — the [!poem] marker, the two modifiers, stanza and attribution handling, and the three ways a blockquote becomes a poem on its own.
group: Writing
order: 2
---

Verse is written as a blockquote. The `poem` directive promotes it into a card:
a soft rounded panel with an oversized opening quote, italic lines, stanza
breaks, and a signature line for the attribution.

```md demo
> [!poem] 雨巷
> 撑着油纸伞，独自
> 彷徨在悠长、悠长
> 又寂寥的雨巷
>
> 我希望逢着
> 一个丁香一样地
> 结着愁怨的姑娘
>
> — 戴望舒
```

Everything after `[!poem]` on the marker line is the title, rendered above the
verse in small letter-spaced caps. The title is optional; `[!poem]` alone is
fine.

## Modifiers

Two bracketed words may appear anywhere in the title line. They are stripped out
of the title itself, so `[!poem] 雨巷 [center]` has the title `雨巷`.

| Modifier | Effect |
| --- | --- |
| `[center]` | Centers the stanzas, the attribution, and the quote glyph. |
| `[plain]` | Drops the italics — verse stays upright. |

They combine: `[!poem] Sea Fever [center] [plain]`.

## Stanzas

How the body is split depends on what the editor produced.

If the blockquote contains paragraphs, each `<p>` is one stanza. If it is one
paragraph of hand-broken lines, stanzas split on **two or more consecutive line
breaks** — a single break is a line within a stanza. In the Ghost editor that
means `Shift+Enter` for a new line and a blank line for a new stanza.

## Attribution

A trailing attribution is lifted out of the verse and rendered as a `<cite>`
under it. It is found two ways.

**As its own stanza.** If the last stanza is nothing but a dash and a short name
— `— 戴望舒`, `-- Masefield` — the whole stanza becomes the attribution. This
needs at least one other stanza, so a one-line blockquote that happens to start
with a dash is left alone.

**At the end of the last line.** Otherwise the last stanza is split on a trailing
`—`, `–`, or `--` followed by up to 40 characters, and only that tail becomes the
attribution.

Both forms cap the attribution at 40 characters. A long final line beginning with
an em dash is prose, not a signature, and stays in the verse.

## Detection without the marker

The marker is not the only way in. A blockquote is treated as verse if **any** of
these hold:

1. It opens with `[!poem]`.
2. Its text ends with an attribution — `—` or `–` followed by 1–40 characters.
3. It contains two or more `<br>` breaks, and no list, heading, or preformatted
   block.

Rule 2 is why a quotation ending `— Ursula K. Le Guin` gets the card treatment
without being asked. Rule 3 is why hand-broken verse pasted into a blockquote
works. Both were chosen so that the common cases need no syntax at all.

If you want a plain blockquote that trips one of these, break the pattern:
put the attribution in the sentence rather than after a dash, or give the
blockquote a `<ul>`, heading, or code block.

Code inside a blockquote is masked before any of this runs, and a masked `<pre>`
suppresses rule 3 outright — a fenced block among the lines means it is not
verse.

## Output

```html
<blockquote class="blog-poem blog-poem--center">
  <p class="blog-poem__title">雨巷</p>
  <p>撑着油纸伞，独自<br>彷徨在悠长、悠长</p>
  <p>我希望逢着<br>一个丁香一样地</p>
  <cite class="blog-poem__attribution">— 戴望舒</cite>
</blockquote>
```

The card classes are applied for `web`, `preview`, **and** `rss`. Feed readers
strip the class attribute but keep the structure, so the stanza breaks and the
`<cite>` survive; only the panel is lost. For `og` and `excerpt` the plain
`<blockquote>` is emitted with no classes at all.

A blockquote already carrying `blog-poem` is skipped, so the transform is safe to
run twice over the same document.

Styles live in `src/styles/blog-prose.css` under *Poem card*.
