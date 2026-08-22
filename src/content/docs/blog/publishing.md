---
title: Publishing
description: How a post gets from a Ghost draft to a deployed page, and what breaks when it doesn't.
group: Blog
order: 0
---

The publication 無人之境 lives at `/blog`. Posts are authored in Ghost and
rendered by this site at build time — Ghost is the editor and the database, but
it never serves a visitor.

## The path a post takes

1. You publish in Ghost.
2. Ghost fires its `Post published` webhook at a Cloudflare Workers Builds deploy
   hook.
3. Cloudflare rebuilds the `site` Worker. During the build, the site fetches
   posts from the Ghost Content API and renders them into static HTML.
4. The new Worker goes live. The post is now a prerendered page, an entry in
   `/blog/rss.xml`, and a row on the home page.

The consequence worth internalising: **a post is not live until a build finishes.**
Editing in Ghost and refreshing `/blog` does nothing. If a change has not appeared,
the question is always "did the deploy run", not "did the cache expire".

## Configuration

| Variable | Where it must exist | Why |
| --- | --- | --- |
| `PUBLIC_GHOST_URL` | Cloudflare **build** environment | The Content API origin. |
| `GHOST_CONTENT_API_KEY` | Cloudflare **build** environment | Read access to published posts. |

Both are read at build time, not at request time. Setting them as Worker runtime
secrets alone is not enough — the pages are prerendered, so the fetch happens
during the build or not at all.

## Wiring the hook

- In Cloudflare, create a Workers Builds deploy hook for the production branch.
- In Ghost, point the `Post published` webhook at that URL.
- Keep the event as `Post published`. A broader event fires builds for drafts.

## Rendering

Ghost returns its own content contract (`.kg-*` cards: images, galleries,
embeds, callouts, code). Those are restyled here rather than themed in Ghost, so
the published post reads in this site's typography and palette, in both light and
dark. Code fences are rehighlighted, images get a blur-up placeholder, and
YouTube and Apple Music embeds are replaced with local, privacy-preserving
components.

The practical rule: write plain Ghost content and let this site style it. Custom
HTML in a post will render, but it will not inherit the type scale and it will
not adapt to the theme.
