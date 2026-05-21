# Portfolio Roadmap

Working plan for evolving `buxx.me` into a portfolio-grade surface that can
sit on a resume. Items are ordered by priority and impact-per-effort, not by
feature size.

## Goals

1. **Make the site work as a portfolio.** A visitor with 30 seconds should
   see what has been shipped, what the tech bar looks like, and how design
   and engineering combine here.
2. **Bring all content in-house.** No more redirects to external surfaces
   for the things that should live on this domain (blog, project case
   studies).
3. **Reduce external runtime dependencies where the cost outweighs the
   benefit.** Keep Ghost as a headless CMS; drop external theme
   maintenance.
4. **Treat the mascot as a brand asset, not a code artifact.** It should be
   easy to iterate on visually and easy to drop into more surfaces.

## Out of Scope

The following ideas were considered and explicitly dropped:

- **Live coding activity / Agent Office sync.** Low audience value, high
  build and maintenance cost. The existing `/api/activity-panel.svg`
  endpoint already covers the "what is being worked on" surface with a
  static snapshot; no real-time pipeline is justified.
- **Full migration from Ghost to MDX content collections.** Ghost stays
  as the headless CMS. Only the rendering layer moves in-house.

---

## P0 - Typography Hybrid

**Effort:** under one day.

The current site uses JetBrains Mono globally (`src/styles/globals.css:96`
applies `font-mono` on `<body>`). That gives the site a strong identity but
turns long-form text into a chore. The fix is a hybrid: sans for content,
mono for data.

### Scope

- Switch `<body>` default from `font-mono` to `font-sans` in
  `src/styles/globals.css`.
- Reapply `font-mono` deliberately on:
  - Section labels (`.section-label`, e.g. `Projects`, `Writing`)
  - Tabular numeric data (`.project-stars`, `.post-date`, contribution
    counts, activity panel values)
  - Tags and tiny metadata (`.tag`, `.post-tag`, `.project-role`)
  - Code blocks and inline code
  - Existing intentional uses in admin consoles (already correct)
- Visual walk of every page after the swap: home, `/mood`, `/mood/[id]`,
  `/privacy`, `/dev/portal` surfaces, 404.

### Done When

- Body copy reads in Geist Sans on every public page.
- Mono survives in the places where it functions as a visual accent or as
  a tabular alignment helper.
- No layout shift introduced (`font-feature-settings` and line-height
  already tuned for both families).

---

## P1 - Projects Showcase

**Effort:** 1-2 weeks.

The home Projects section currently renders six small cards that link
straight to GitHub. For a portfolio surface, that buries the work. The fix
is a real projects page with case-study depth, and a slimmer home preview.

### Scope

- Add a `projects` content collection at `src/content/projects/*.mdx`.
  Each entry carries: `slug`, `name`, `tagline`, `hero` image, `stack[]`,
  `metrics[]`, `links[]`, `role`, plus a free-form MDX body for the case
  study itself.
- New routes:
  - `src/pages/projects/index.astro` - grid of large cards (hero shot,
    tagline, stack chips, primary metric).
  - `src/pages/projects/[slug].astro` - case study template
    (hero -> pitch -> problem -> approach -> stack -> outcome -> links).
- Refactor `src/features/home/ui/Projects.astro`:
  - Show two featured projects with the new large-card visual.
  - "View all projects" CTA links to `/projects`, not GitHub.
  - Keep the GitHub pinned data path as a fallback for star counts, but
    the primary copy comes from the content collection.
- Featured projects (initial): **Attegi**, **ogis**. The remaining repos
  stay on the `/projects` index without dedicated case studies until they
  earn the page.
- Add OG image support for project pages (the existing OG system already
  handles this; extend the templates).

### Done When

- `/projects` lists at least 4 projects with proper hero images.
- Attegi and ogis each have a complete case study at `/projects/attegi`
  and `/projects/ogis`.
- The home page shows only two featured projects, with a clear path to
  the full list.
- All copy is concrete: numbers where they exist, no generic
  "modern, scalable, beautiful" filler.

---

## P2 - Native Blog Rendering

**Effort:** 1-2 weeks.

Today `Posts.astro` lists Ghost post titles and links out to
`blog.buxx.me` via `target="_blank"`. That hands SEO, layout, and brand
control to a Ghost theme that is painful to maintain. Ghost stays as the
headless CMS; the rendering moves into this Astro app.

### Scope

- New routes:
  - `src/pages/blog/index.astro` - paginated post list with the same
    visual language as `/projects`.
  - `src/pages/blog/[slug].astro` - post detail. Fetches a single post
    from the Ghost Content API and renders the `html` field, then runs a
    server-side prismjs pass on `<pre><code>` blocks.
- Add an LRU cache around the Ghost API client (the `lru-cache` dep is
  already in place) so first paint does not depend on Ghost being up.
- Reading-time, tags, author, published date, and a "back to blog" link
  on the detail page.
- RSS feed at `/blog/rss.xml`, matching the existing `/mood/rss.xml`
  pattern.
- Update `Posts.astro` so links point to `/blog/<slug>` instead of the
  external Ghost URL.
- Configure `blog.buxx.me` to 301-redirect each post path to its in-site
  counterpart so existing inbound links and search results survive.
- Sitemap update: include `/blog/*` URLs in `src/pages/sitemap.xml.ts`.

### Done When

- All public blog reading happens on `buxx.me/blog/...`.
- A failure to reach Ghost does not break the site (cached snapshot
  serves).
- Code highlighting matches the rest of the site (prismjs theme already
  in use elsewhere).
- `blog.buxx.me` either returns 301s or is decommissioned in favour of
  the admin-only editor URL.

---

## P3 - Mascot As A Brand System

**Effort:** 1 week of design + a few days of plumbing. Runs in parallel
with P1 / P2.

The mascot (`peek`) is currently encoded as ASCII pixel grids in
`src/features/mascot/peek/`. That is elegant for the navbar and 404 but
limits iteration: trying a new pose means hand-editing a grid. The mascot
also only shows up in two surfaces (nav, 404) when it could anchor the
brand across newsletter, OG cards, share images, project page footers,
and more.

### Scope

#### Authoring pipeline

- Pick a pixel-art editor as the source of truth (Aseprite or Piskel).
  Designs live as `.aseprite` / `.png` files under
  `assets/mascot/source/`.
- Add a small `scripts/mascot/import.ts` that reads a PNG sprite sheet
  and emits the grid format that `src/features/logos/data/` already
  consumes. Runtime data layer stays the same; iteration moves into a
  visual tool.
- Document the workflow in `docs/MASCOT.md` (extend, do not rewrite).

#### Higher-fidelity asset family

- Add an SVG version of `peek` for surfaces where pixel art at large
  sizes reads as crunchy: newsletter, OG images, share cards, project
  page footers.
- Store SVGs under `public/mascot/` with a small `peek-svg.ts` registry
  so consumers ask for a state by name, not by file path.

#### New placements (in priority order)

1. **Newsletter / broadcast emails.** Add `peek` to the
   `src/features/notify/` email templates as a header mark and as a
   section divider. Email-safe rendering: inline SVG or referenced PNG
   with width set, no animation.
2. **OG / share images.** Bake `peek` into the OG image templates so
   any shared link carries the brand.
3. **Project / blog page footers.** A small idle `peek` as a sign-off.
4. **Loading / empty states.** Replace generic spinners on slow loads
   with a sleepy `peek` state.

### Done When

- A new mascot variant can be designed in a pixel-art editor and shipped
  without hand-editing TypeScript.
- `peek` appears in at least the newsletter, OG images, and one new
  in-product surface.
- `/dev/preview` still reflects the canonical data.

---

## Sequencing And Parallelism

- **Week 1:** P0 ships. Every screenshot taken for P1 / P2 work uses the
  new typography, so this goes first.
- **Weeks 2-3:** P1 Projects (main thread) + P3 Mascot authoring pipeline
  (parallel design / tooling thread).
- **Weeks 4-5:** P2 Blog (main thread) + P3 Mascot placements (newsletter
  first, then OG / share, then in-product polish).

P3 runs alongside P1 / P2 because it is mostly a design and tooling
workstream and does not collide with the routes those items touch.

## Tracking

Each P-level should be one PR (or a small stack) merged into `main` once
verified locally. Branch naming: `feat/<area>-<short-desc>`. Commit
messages follow `CLAUDE.md` (imperative, no "for" / "to" rationale).
