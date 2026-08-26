# Notes

Written once, not maintained. Everything here describes the state of the world
when it was written; none of it is a source of truth about how the site works
today.

- `notes/archive/` — **frozen records**. Shipped PRDs, completed migrations, resolved investigations. Never updated; they explain why things were built the way they were.
- `notes/research/` — dated research notes. Frozen once written.
- `notes/reviews/` — policy only. Audit reports go in `site-api`; see its README for why.
- `notes/debug/` — local-only debug artifacts, not committed (see its README).

The two trees that *are* maintained live elsewhere, and each owns its word:

- **`src/content/docs/`** is the reference, published at [buxx.me/docs](https://buxx.me/docs). It is the only thing called "docs". The hub renders its own index from the collection's frontmatter, so there is no copy of that index here to drift out of date. Add a page by dropping a Markdown file in with `title`, `description`, `group`, and `order`; the sidebar, hub, sitemap, and prev/next all follow. Group order lives in `src/features/docs/server/nav.ts`. When a code change makes a page wrong, fix it in the same PR.
- **`plans/`** is work that is not finished. It is the only thing called "plans". Numbered files (`001-`…) are frozen audit batches; named files are workstream plans. When a plan ships, move it to `notes/archive/`.
