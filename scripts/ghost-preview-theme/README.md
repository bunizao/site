# buxx-preview

Not a real Ghost theme — a ten-line shell whose only job is to make Ghost's
own **Preview** button open the site's live draft preview
(`/dev/blog/[id]`, see `src/pages/dev/blog/[id].astro`) instead of Ghost's
default theme-rendered preview.

`post.hbs` and `page.hbs` render nothing but a full-viewport iframe pointing
at `https://buxx.me/dev/blog/{{id}}`. In a post or page context, `{{id}}` is
the 24-character Ghost Admin post id — exactly the id
`/dev/blog/[id]` accepts. `index.hbs`, `default.hbs`, and `error.hbs` exist
only because `gscan` (Ghost's theme validator) requires them; they are never
meant to be seen.

This is Phase 0 of `plans/koenig-editor.md`. It ships before the fork
(Phase 1) exists, so it is worth installing on its own: it turns Ghost's
Preview button into a live window onto the production rendering pipeline —
directives, embeds, real CSS — instead of Ghost's own approximation.

## Install

1. Build the zip: `bun run ghost:preview-theme` (writes
   `dist/ghost-preview-theme/buxx-preview.zip`).
2. In Ghost Admin: **Settings → Design → Change theme → Upload theme** →
   pick the zip.
3. Activate it.

## Use

Open any post or page in the editor and click **Preview**. Ghost opens
`/p/<uuid>/`, which this theme fills with an iframe of
`buxx.me/dev/blog/<id>` — the same page `/dev/portal/blog` already links to,
behind the same owner auth (`src/middleware.ts` gates every `/dev/*` path).

## Uninstall

Switch back to the site's real theme in Design settings. Nothing on the site
or in Ghost's database depends on this theme being active.
