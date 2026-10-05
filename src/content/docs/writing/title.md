---
title: English titles
description: Give a post an English title with [!title en="..."], shown under its own title in the blog index and tag archives.
group: Writing
order: 7.5
---

Use `[!title en="..."]` to give a post an English title without writing a full
translation. The blog index and every tag archive show it under the post's own
title, smaller and quieter.

```md demo
[!title en="The Tide Writes Back"]
```

| Attribute | Required | Value |
| --- | --- | --- |
| `en` | yes | The English title, as you want it to read. |

`[!title]` is a meta [directive](/docs/writing/directives). Put it on a line of
its own anywhere in the post. The build removes it from the article, the
excerpt, the feed and the Markdown output, so it never shows as text.

## Writing it in Ghost

- Use straight quotes `"` around the value. A Chinese input method types `“`
  and `”`, which the parser treats as part of a bare value, and the marker is
  then dropped with an `invalid-directive-attributes` warning.
- Curly quotes and apostrophes *inside* the value are fine:
  `[!title en="“Darling, I Just Don't Get It.”"]`.
- If the editor keeps joining the marker to the paragraph next to it, put it in
  a code card with no language label. See
  [Directive syntax](/docs/writing/directives#matching).

## Which English title wins

1. The post's own `[!title en]`, when it has one.
2. Otherwise, the title of its [English translation](/docs/writing/publishing#translations),
   so a translated post needs no marker.
3. Otherwise, nothing: the row shows only its own title.

A post written in English (`#en`) never gets a second English line. The marker
wins over the translation because it is the more deliberate act: if you wrote
it, it shows.

Only the index rows read it. The article page, `<title>`, Open Graph and search
still use the post's own title.

## Notes

- Implementation: `src/features/posts/server/directives/title.ts`, read before
  rendering in `src/features/posts/server/content.ts`, resolved by
  `mapEnglishTitles` in `src/features/posts/i18n.ts`.
