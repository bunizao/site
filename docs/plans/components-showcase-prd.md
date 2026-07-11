# Components Showcase

A public `/components` surface that aggregates every notable piece of UI this
site draws — primitives, showpieces, and bespoke compositions — and makes the
reusable subset installable by others. Distribution is a shadcn-style registry
(`npx shadcn add https://buxx.me/r/<name>`), with `@bunizao/decode-text` kept as
its own npm package. Visual and motion tone are settled (see below); this branch
ships the full infrastructure plus a first batch of six components.

Status: **ready to build.** All design and architecture decisions are settled
through a grilling pass. Remaining unknowns are implementation details, not
blockers.

Branch: `feat/components-showcase`.

## Goal

Today the site's UI lives entirely inside the app: shadcn-style primitives in
`src/components/ui/*`, bespoke pieces (mascot, project-card heroes, the mood
wheel), and `@bunizao/decode-text` — the first piece extracted into a real
package. There is no place that shows this work as a body of craft, and no way
for a visitor to lift a piece into their own project.

`/components` fixes both:

- **Show** — a gallery that presents every notable component the way a printed
  type-specimen sheet presents type: the real component, sitting bare on the
  page, named in mono. Includes coupled compositions (mood wheel, blog hover
  card, project heroes) rendered on fixture data.
- **Reference** — each installable component advertises a working install
  command. Registry components install source into the consumer's project via
  the shadcn CLI; `decode-text` installs from npm. Coupled components that
  cannot be a clean drop-in are shown but link to source instead.

This is a developer corner, not a headline of the site. It is reachable from the
footer, not the main navigation, and it does not compete with the homepage
narrative (work-first hero → projects → experience → writing → mood) or with the
blog's separate identity as 無人之境.

## Non-goals (this branch)

- Porting **all** ~16+ components. This branch ships infrastructure plus a
  first batch of six; the rest land in later batches (see "Later phases").
- A search / command palette (`⌘K`), sponsors, or a stars badge. chanhdai has
  them; we do not need them yet.
- Reusing Starlight. The existing Starlight docs collection stays for internal
  infra docs; the components surface is bespoke Astro (see "Decisions").
- Hand-written props tables or per-component accessibility sections. Props are
  read from the TypeScript types and the linked source, not transcribed.
- Turning coupled compositions into npm packages. They enter the registry as
  source, or they link to source; they are never a runtime dependency.

## Decisions (settled)

The following are locked. They are the outcome of a full decision-tree pass and
should not be re-litigated during the build.

### Scope and distribution

- **Aggregation, not a purist design system.** The gallery shows everything
  interesting the site draws, including data-coupled compositions.
- **Distribution is a shadcn registry.** Each component is a registry item
  served at `/r/<name>.json`; the install command is
  `npx shadcn add https://buxx.me/r/<name>` (with pnpm / yarn / bun variants).
  The CLI copies **source** into the consumer's project — this is what lets a
  styled, possibly-coupled component carry an install command at all.
- **`decode-text` is the one npm exception.** It is pure logic, zero-dep, and
  already published as `@bunizao/decode-text`. Its install command is
  `npm i @bunizao/decode-text`, not a registry add. The content schema therefore
  supports **two install mechanisms** (`npm` and `registry`), and the detail
  page renders the right one per component. This is deliberate: the surface can
  showcase published packages and registry components side by side, and any
  future extracted package slots in the same way.
- **Registry rigor is real (tier A).** Every registry component must actually
  install into a blank shadcn project and render **with correct styling**. This
  is verified, not asserted (see "Verification"). Coupled components are
  decoupled **before** they enter the registry — props for data coupling, an
  explicit mount API with injected DOM dependencies for environmental coupling
  — and the site keeps a thin in-app wrapper around the decoupled core.

### Surface and shell

- **Bespoke Astro pages, not Starlight.** A `/components` index plus
  `/components/[slug]` detail pages, rendered in the site's own layout so the
  section is visually seamless with the rest of buxx.me. Component metadata
  lives in a dedicated `components` content collection (type-safe, one entry per
  component).
- **Discoverability: footer only.** A `/components` link in the footer. Not in
  the main nav. The section exists and is linkable without stealing the main
  narrative.
- **Registry endpoint:** static JSON at `/r/<name>.json`, generated at build
  time from the same collection so metadata and registry never drift.

### Detail page anatomy

Each `/components/[slug]` page has, in order:

1. Breadcrumb (`components / <slug>`) plus previous / next component links.
2. Title + one-line tagline.
3. **Preview** — the live component in a bordered frame.
4. **Installation** — package-manager tabs (pnpm / npm / yarn / bun) and the
   install command with a copy button; shape depends on `install.type`.
5. **Usage** — a short import + JSX snippet.
6. **Credits** — inspiration / attribution when there is any.
7. A right-rail "On this page" table of contents with a cursor on the active
   section.

No hand-written props table, no separate a11y section. Props are discoverable
from the linked source and the exported TypeScript types.

### Preview rendering

- **Inline island is the default.** Each preview is a `client:visible` React
  island in a bordered frame, sharing the page's Tailwind tokens — which is more
  faithful, since the components are built on those tokens.
- **iframe only where required — and mood-wheel requires it (decided).** The
  wheel is `position: fixed` and syncs to `window` scroll; it cannot work as an
  inline island, so its preview is an iframe containing a small scrollable
  fixture feed (that fixture page is a scoped work item, not an afterthought).
  The blog hover card's fixed layer is the other known candidate (later phase).
  Everything else stays inline.
- **Index previews are static miniatures; live previews live on the detail
  page.** Sixteen live islands on the index would hurt first paint. A miniature
  is, in order of preference: (1) the component server-rendered in a frozen
  state with no JS shipped, or (2) a pre-rendered SVG/image for components that
  cannot render meaningfully without JS (mood-wheel). Every future component
  entry picks one of these two; no third mechanism.

### Visual tone (locked)

- **De-boxed specimen grid.** No card-in-card. Each component sits bare on the
  page; a hairline rule under it carries a mono caption (`<name>` on the left,
  install-type marker on the right). Whitespace and hairlines do the separating,
  not nested bordered boxes — the boxed-card-grid look reads as templated and is
  explicitly rejected.
- **Mono metadata spine.** Geist Mono for names, tags, install commands, code —
  consistent with the site's existing "mono is the metadata spine" language.
- **Monochrome + dot grid.** The site's black/white HSL system and the ambient
  dot grid on the index canvas; the detail page is clean (no dot grid). Light
  and dark both fall out of the existing token system.
- **Install-type marker:** plain words — `registry` (muted) and `npm ●` (inked,
  with a filled dot) — not cryptic symbols.
- **Mobile degrades to an editorial row list.** Below the grid breakpoint, the
  specimen grid becomes full-width rows (name + tagline left, small preview
  right), like a changelog.

### Motion tone (locked — Emil Kowalski framework)

The section is browsed repeatedly, so motion is restrained: it moves only where
movement has a purpose, and never on keyboard-initiated or navigation actions.

| Surface | Motion | Spec |
| --- | --- | --- |
| Index first paint | Subtle, first view only | `opacity` + `translateY(6px)`, 50ms stagger per cell, `--ease-out`; reduced-motion keeps opacity only |
| Specimen hover | Yes, but no card lift | Baseline hairline `--line → --line2` over 120ms `ease`; the component's own real hover/active states do the rest |
| Install tabs | Yes | `clip-path` duplicate-layer slide for a seamless active-tab color transition, ~180ms |
| Copy button | Yes | `:active { scale(0.97) }` 160ms `--ease-out`; copy→check icon crossfade masked with `filter: blur(2px)` 200ms; "Copied" tooltip appears instantly |
| decode-text preview | Yes (it is the demo) | Runs once on entering the viewport; replays on hover / click |
| Prev / next, breadcrumb | **No** | Keyboard-reachable; page-level navigation is never animated |
| mood-wheel preview | Its own scroll physics | The component owns its motion; the page adds nothing |

Global tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`,
`--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`. Every pressable element uses
`scale(0.97)` / 160ms. `prefers-reduced-motion` keeps opacity and color, drops
all translation and stagger. Hover animations are gated behind
`@media (hover: hover) and (pointer: fine)`.

## First batch (this branch)

Six components, chosen to exercise every tier and both install mechanisms:

| slug | source today | tier | install |
| --- | --- | --- | --- |
| `button` | `src/components/ui/button.tsx` | primitive | registry |
| `badge` | `src/components/ui/badge.tsx` | primitive | registry |
| `card` | `src/components/ui/card.tsx` | primitive | registry |
| `decode-text` | `packages/decode-text` (published) | showpiece | npm |
| `mascot` | `src/features/mascot/peek/*` | showpiece, zero-dep engine | registry |
| `mood-wheel` | `src/features/mood/ui/TimelineWheel.astro` | coupled composition | registry |

Per-component notes:

- **button / badge / card** — already clean shadcn primitives. Registry
  dependencies: the `utils` item (`cn` from `src/lib/utils.ts`, which pulls
  `clsx` + `tailwind-merge`); button also needs npm deps
  `@radix-ui/react-slot` and `class-variance-authority`. These are the cheapest
  wins and validate the primitive → registry path.
- **decode-text** — no extraction work; it is already a package. Work is the
  detail page wiring plus an `npm`-type install block and a live preview that
  imports the package.
- **mascot** — the peek engine (`src/features/mascot/peek/*`) is vanilla TS and
  zero-dep, but it is a directory of files, not one component. Its registry item
  bundles the engine files. This validates that a multi-file, non-`ui/`
  showpiece can ship through the registry.
- **mood-wheel** — the hard one, and the reason it is in the first batch. Its
  coupling is **environmental, not data**: the wheel never fetches Telegram
  data (the mood page does); what it hard-codes is its habitat —
  `document.querySelector('[data-mood-feed]')` / `[data-mood-list]`, `window`
  scroll, `position: fixed` (`src/features/mood/client/timeline-wheel.ts`,
  ~680 lines of vanilla TS). The refactor is therefore a **mount API**, not a
  props/data wrapper: the engine gets an explicit entry —
  `mountTimelineWheel(root, { feed, list, ... })` — with its DOM dependencies
  injected instead of discovered. Distribution shape (decided): the registry
  item ships the **framework-agnostic vanilla engine plus a wiring example**,
  not the `.astro` file — shadcn consumers are React projects, and an `.astro`
  file would be Astro-only. `TimelineWheel.astro` stays in-repo as the site's
  thin wiring (markup + CSS + the mount call). This still proves tier-A rigor
  for a genuinely coupled composition — against the right kind of coupling.
  Preview: iframe with a fixture feed, always (see "Preview rendering").

## Architecture

### Content collection

A new `components` collection in `src/content.config.ts`, one entry per
component. Proposed schema (final field set may tighten during build):

```ts
// src/content.config.ts — added alongside the existing `pages` and `docs` collections
const components = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/components' }),
  schema: z.object({
    title: z.string(),                // display name; the slug is the entry id (filename)
    tagline: z.string(),              // one line under the title
    tier: z.enum(['primitive', 'showpiece', 'composition']),
    order: z.number().default(0),     // index ordering
    // Install mechanism — the dual-mechanism decision:
    install: z.discriminatedUnion('type', [
      z.object({ type: z.literal('npm'), pkg: z.string() }), // decode-text
      z.object({ type: z.literal('registry') }),             // registry name = entry slug
    ]),
    source: z.string().url(),         // "view source" link (GitHub)
    credits: z.string().optional(),   // inspiration / attribution
    draft: z.boolean().default(false),
  }),
});
```

The slug is the entry id — no `name` field duplicating the filename, and the
registry item name is the same slug. The **usage snippet lives in the Markdown
body** as its first fenced code block (multi-line JSX in YAML frontmatter is
miserable to write and diff); anything after that block is optional prose.
Registry payloads are generated from `install` + a colocated file manifest, so a
single source of truth backs both the page and `/r/<name>.json`.

### Routes

- `src/pages/components/index.astro` — the specimen grid (static miniatures),
  ordered by `order`, grouped or filtered by `tier` if useful. Prerendered.
- `src/pages/components/[slug].astro` — detail page via `getStaticPaths` +
  `getCollection('components')`. Prerendered.
- `src/pages/r/[name].json.ts` — emits the shadcn registry item per component
  (see "Registry endpoint"). Prerendered as static JSON.

All three are build-time static; `output` stays `static`, consistent with the
projects surface.

### Registry endpoint

Each `/r/<name>.json` conforms to the shadcn **registry-item** schema:

```jsonc
{
  "$schema": "https://ui.shadcn.com/schema/registry-item.json",
  "name": "button",
  "type": "registry:ui",
  "dependencies": ["@radix-ui/react-slot", "class-variance-authority"],
  "registryDependencies": ["utils"],
  "files": [
    { "path": "components/ui/button.tsx", "type": "registry:ui" }
  ]
}
```

- File contents are read from the real source at build time so the registry can
  never ship stale code.
- `registryDependencies` reference shared items (e.g. `utils` for `cn`); a
  `utils` registry item is published so `cn` resolves.
- **No silent dependency on site-only CSS variables.** Installed source lands in
  a project that has shadcn's standard tokens but none of this site's custom
  ones (`--line`, `--line2`, motion easings, custom HSL ramps). Each registry
  item either uses standard shadcn tokens only, or declares its extras via the
  registry-item `cssVars` field. button / badge / card should be clean; mascot
  and mood-wheel will need `cssVars`. The blank-project install test is what
  catches violations — "renders but unstyled" is a failure, not a pass.
- `npm`-type components (decode-text) do **not** get a registry file; their
  detail page shows an `npm i` block instead. They may still appear at
  `/r/<name>.json` as a metadata-only entry, or be omitted from the registry
  endpoint entirely — decided during build, default omit.

### Shared UI pieces to build

Small, bespoke, all in the site's tone:

- `ComponentSpecimen` (index cell — static miniature + hairline caption).
- `ComponentPreviewFrame` (detail — bordered frame; inline island by default,
  iframe variant for viewport-isolated previews).
- `InstallTabs` (pnpm / npm / yarn / bun; `clip-path` active-tab transition).
- `CopyCommand` (the inked command bar + copy→check button with blur-masked
  crossfade and instant tooltip).
- `OnThisPage` (right-rail TOC with an active-section cursor).
- `PrevNext` (breadcrumb + adjacent-component links; no animation).

### Files (indicative)

```
src/content.config.ts                         # + components collection
src/content/components/*.md                    # one entry per component (6)
src/pages/components/index.astro
src/pages/components/[slug].astro
src/pages/r/[name].json.ts
src/features/components/ui/ComponentSpecimen.astro
src/features/components/ui/ComponentPreviewFrame.tsx
src/features/components/ui/InstallTabs.tsx
src/features/components/ui/CopyCommand.tsx
src/features/components/ui/OnThisPage.astro
src/features/components/ui/PrevNext.astro
src/features/components/server/registry.ts     # build registry-item JSON from source + manifest
src/features/mood/client/timeline-wheel.ts     # refactor: explicit mount API, injected DOM deps
src/features/mood/ui/TimelineWheel.astro       # becomes thin wiring (markup + CSS + mount call)
src/styles/components.css                       # section-scoped tone + motion tokens
```

Footer gets a `/components` link.

## Verification (definition of done for this branch)

The branch is done when all of the following hold:

1. `/components` renders the six-component specimen grid in the settled tone,
   correct in light and dark, and degrades to the row list on mobile.
2. Each `/components/[slug]` renders preview + install + usage + credits + TOC,
   with the correct install mechanism per component.
3. **Registry actually works.** In a throwaway blank shadcn project (Tailwind
   v4, matching how `cssVars` are emitted),
   `npx shadcn add https://buxx.me/r/button` (and `badge`, `card`, `mascot`,
   `mood-wheel`, pointed at a preview/build URL) installs the source and the
   component renders **with correct styling** — site-only CSS variables must
   resolve via `cssVars`, not silently fall back to nothing. This is executed
   and confirmed, not assumed.
4. `npm i @bunizao/decode-text` remains the path for decode-text, and its detail
   page shows the npm block, not a registry add.
5. **mood-wheel has an explicit mount API** (DOM dependencies injected, no
   global `querySelector` discovery) and the site's `/mood` still renders
   correctly through the thin `.astro` wiring — no regression in the existing
   mood read path (the wheel never owned data fetching; the live t.me mirror is
   untouched by this refactor).
6. Motion matches the locked table; `prefers-reduced-motion` is honored;
   `bun run check` and `bun run build` pass.

Verification uses the repo's own tooling per the dev-runtime notes (Playwright
for animation frames against `http://[::1]:port`, since the preview tab pauses
rAF). Registry-install testing runs against a built/preview URL, since the `API`
binding and static registry JSON resolve at build/preview, not `bun dev`.

## Risks

- **mood-wheel decoupling touches a live path.** Accepted by the user. Mitigate
  by keeping the refactor mechanical: fetch/model logic is untouched (it never
  lived in the wheel); only DOM discovery moves from global `querySelector` to
  injected references at the mount call. Regression-check `/mood` before merge.
- **Dropbox sync can revert uncommitted edits, and large PRs are risky on the
  mount.** Mitigate with frequent small commits (Conventional Commits) and by
  keeping this branch to infra + six components rather than the whole set.
- **Registry install depends on the consumer having a shadcn-configured project
  (Tailwind, `cn`, tokens).** This is inherent to the shadcn registry model and
  is acceptable; the install command targets developers, and coupled components
  that cannot be a clean drop-in link to source instead.
- **Sandbox tooling flakiness on the Dropbox mount** (EPERM on spawned
  node/bun/tsc/git) may push `check` / `build` / registry-install runs to the
  user's own terminal.

## Later phases (not this branch)

Subsequent batches, each a small PR:

- Remaining primitives: `checkbox`, `input`, `label`, `select`, `textarea`,
  `dialog`, `alert-dialog`, `dropdown-menu`, `table`, `skeleton`.
- `HoverGloss` and the blog homepage hover card (viewport-isolated preview).
- Project-card heroes (`AttegiTourHero`, `CliCubeHero`, `HarmonicWaveHero`,
  `OgCarouselHero`) and `ProjectStack`.
- Brand / logo icons.
- Possibly `⌘K` search once the catalog is large enough to need it.

Each new component is: one collection entry, one registry item (or npm block),
and — if coupled — a props-driven refactor plus data wrapper, following the
mood-wheel precedent set here.
