---
title: Poems
description: "Verse blocks: the [!poem] marker, two modifiers, stanzas, attribution, and the three auto-detection rules."
group: Writing
order: 2
---

Write verse as a blockquote. The `poem` directive turns it into a card: a soft
rounded panel with an oversized opening quote, italic lines, stanza breaks, and
a signature line for the attribution.

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

Everything after `[!poem]` on the marker line is the title. It renders above the
verse in small letter-spaced caps. The title is optional, so `[!poem]` on its
own works.

## Modifiers

Two bracketed words can go anywhere in the title line. The build strips them
out of the title, so `[!poem] 雨巷 [center]` has the title `雨巷`.

| Modifier | Effect |
| --- | --- |
| `[center]` | Centers the stanzas, the attribution, and the quote glyph. |
| `[plain]` | Drops the italics, so the verse stays upright. |

You can combine them: `[!poem] Sea Fever [center] [plain]`.

## Stanzas

How the body splits depends on what the editor produced:

- If the blockquote contains paragraphs, each `<p>` is one stanza.
- If it is one paragraph of hand-broken lines, stanzas split on **two or more
  consecutive line breaks**. A single break is a new line within a stanza.

In the Ghost editor, press `Shift+Enter` for a new line and leave a blank line
for a new stanza.

## Attribution

A trailing attribution is lifted out of the verse and rendered as a `<cite>`
under it. The build finds it in one of two ways.

**As its own stanza.** If the last stanza is only a dash and a short name
(`— 戴望舒`, `-- Masefield`), the whole stanza becomes the attribution. This
needs at least one other stanza, so a one-line blockquote that happens to start
with a dash is left alone.

**At the end of the last line.** Otherwise, the build splits the last stanza on
a trailing `—`, `–`, or `--` followed by up to 40 characters. Only that tail
becomes the attribution.

Both forms cap the attribution at 40 characters. A long final line that starts
with an em dash is treated as prose and stays in the verse.

## Poems without the marker

A blockquote is treated as verse if **any** of these is true:

1. It opens with `[!poem]`.
2. Its text ends with an attribution: `—` or `–` followed by 1–40 characters.
3. It contains two or more `<br>` breaks, and no list, heading, or preformatted
   block.

Rule 2 gives a quotation ending `— Ursula K. Le Guin` the card without any
syntax. Rule 3 makes hand-broken verse pasted into a blockquote work. Both rules
exist so the common cases need no syntax at all.

To keep a plain blockquote that matches one of these rules, break the pattern.
Put the attribution inside the sentence instead of after a dash, or give the
blockquote a `<ul>`, heading, or code block.

Code inside a blockquote is masked before any of this runs. A masked `<pre>`
turns off rule 3 completely: a fenced block among the lines means it isn't
verse.

## Output

```html
<blockquote class="blog-poem">
  <p class="blog-poem__title">雨巷</p>
  <p>撑着油纸伞，独自<br>彷徨在悠长、悠长</p>
  <p>我希望逢着<br>一个丁香一样地</p>
  <cite class="blog-poem__attribution">— 戴望舒</cite>
</blockquote>
```

The card classes apply to `web`, `preview`, **and** `rss`. Feed readers strip
the class attribute but keep the structure, so the stanza breaks and the
`<cite>` survive and only the panel is lost. For `og` and `excerpt`, the build
emits a plain `<blockquote>` with no classes.

A blockquote that already has `blog-poem` is skipped, so running the transform
twice over the same document is safe.

Styles live in `src/styles/blog-prose.css` under *Poem card*.
