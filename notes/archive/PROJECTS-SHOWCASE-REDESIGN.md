# Projects Showcase Redesign

Standalone project showcase: a `/projects` list page plus `/projects/[id]` detail
pages, sourced from local content files instead of the GitHub API.

Status: **planning**. Architecture and data layer are settled below. Visual design
is still owned by the user and is the only blocker to implementation.

## Goal

Today, projects exist only as a homepage section (`src/features/home/ui/Projects.astro`)
that renders GitHub pinned repos as tilt cards and links out to GitHub. There is no
dedicated route and no detail view.

This redesign adds a real, self-owned projects surface:

- `/projects` — a list of every project.
- `/projects/[id]` — a detail page per project with a long-form case study.
- Content authored locally (Markdown), not constrained by GitHub API fields.

The homepage section stays as a curated preview; its "view all" link points at
`/projects` instead of GitHub.

## Decisions (settled)

- **Data source: local content collection.** A new `projects` collection in
  `src/content.config.ts`, files under `src/content/projects/*.md`.
- **Loader: `glob()` from `astro/loaders`.** The Astro 6 path; supports `render()`
  for Markdown bodies. Leave the existing legacy `pages` collection untouched.
- **Routing:** `src/pages/projects/index.astro` (list) and
  `src/pages/projects/[id].astro` (detail via `getStaticPaths` + `getCollection`).
  Both prerender — content is build-time, `output` is `static`.
- **Detail prose:** reuse the editorial `.page-content` styles from `Page.astro`
  for the rendered Markdown body. No new prose system.
- **Drafts:** a `draft` flag excludes entries from production builds.
- **No cover images (proposed):** keep the surface typographic and monochrome to
  match the site's minimal HSL system; zero image-maintenance cost. Revisit if the
  final design wants imagery.

## Open — waiting on user's design

These are NOT decided and gate the build:

1. **Visual direction.** Working proposal is "The Index" — a monospace, numbered
   archival list (distinct from the home tilt cards), with a big-title + meta-rail +
   case-study layout on detail. User is sketching an alternative; could be a card
   grid, magazine layout, timeline, etc.
2. **Per-project fields.** Which metadata each project surfaces (and required vs
   optional). Draft field set below is a starting point, not final.
3. **Detail depth.** Short blurb vs full case study (screenshots, process, stack
   rationale). Affects whether cover/inline images re-enter scope.

## Proposed schema (draft, pending field decision)

```ts
// src/content.config.ts — added alongside the existing `pages` collection
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),            // one-line, shown in list + detail header
    role: z.enum(['Author', 'Contributor']).default('Author'),
    tags: z.array(z.string()).default([]),
    year: z.number(),               // sort + display
    repo: z.string().url().optional(),
    link: z.string().url().optional(), // live/demo
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});
```

List ordering (draft): featured first, then `year` descending, then title. This
sort is a small, isolated UX decision worth confirming with the final design.

## Build steps (once design lands)

1. Add the `projects` collection + schema to `src/content.config.ts`.
2. Seed `src/content/projects/*.md` from the real projects currently hardcoded as
   `fallbackProjectConfigs` in `Projects.astro` (TutuBetterRules, Attegi, Mirrored,
   ogis, always-attend, Mole). Frontmatter + an honest short body each; user expands.
3. Build `/projects/index.astro` per the chosen visual direction.
4. Build `/projects/[id].astro`: meta header + links + rendered body in `.page-content`.
5. Repoint the homepage section's "view all" link to `/projects`.
6. Confirm `/projects` and detail URLs land in `src/pages/sitemap.xml.ts`.
7. Verify against `bun run build` and a Playwright pass at the real preview server.

## Files touched

- `src/content.config.ts` — add `projects` collection.
- `src/content/projects/*.md` — new content entries.
- `src/pages/projects/index.astro` — new list page.
- `src/pages/projects/[id].astro` — new detail page.
- `src/features/home/ui/Projects.astro` — repoint the "view all" link.
- `docs/ARCHITECTURE.md` — document the new route and collection.
