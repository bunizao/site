# Mascot

`peek` is the site mascot and current navbar brand mark. The current source of truth lives in [`src/features/logos/data/peek.ts`](../src/features/logos/data/peek.ts), but that file is carrying too many responsibilities and should be split before the mascot library grows further.
The preview/gallery surface lives at `/dev/preview` when local dev is running.

## Current Files

- `src/features/logos/data/peek.ts` — pixel grid, accent color, grouped gallery metadata, runtime behavior map, and every motion state
- `src/features/logos/data/peek-looks.ts` — imported extra `peek` expressions and costumes from mascot lab
- `src/features/logos/data/types.ts` — mascot data model
- `src/features/logos/lib/svg.ts` — grid-to-SVG renderer and logo registry
- `src/features/logos/ui/PixelLogo.astro` — static SVG embedding for Astro templates
- `src/features/logos/ui/PeekLook.astro` — palette-aware renderer for added `peek` looks
- `src/features/logos/ui/AnimatedLogo.tsx` — frame-based client animation renderer
- `src/pages/logo/[id].svg.ts` — public SVG route used by favicon and image consumers
- `src/pages/dev/preview.astro` — shared developer preview surface for mascot and newsletter states
- `public/dev/mascot-lab/*` — vendored reference assets from the design system export

## Current Usage

- `src/layouts/Layout.astro` uses `peek` as the navbar brand mark.
- The live navbar setup is `animation="idle"` with `hoverAnimation="dart"`.
- `AnimatedLogo` also listens for nav event overrides: `curious`, `happy`, and `sleepy`.
- `/logo/peek.svg` is the favicon and Safari mask icon source.

## Current Motion Groups

- `Core Expressions` — `idle`, `hide`, `pop`, `curious`, `purr`, `dart`, `nap`
- `Navbar Triggers` — the live site wiring: `idle`, `dart`, `curious`, `happy`, `sleepy`
- `Tracking Poses` — `scan`, `track_far_left`, `track_left`, `track_center`, `track_right`, `track_far_right`
- `Utility Motions` — `alert`, `dissolve`

## Current Runtime Behavior Map

| Trigger | Animation | Notes |
|--------|-----------|-------|
| Default navbar rest | `idle` | Base brand state |
| Brand hover / fast scroll | `dart` | High-energy attention response |
| Section link hover | `curious` | Desktop nav hover expression |
| Active section change | `happy` | Alias of `purr` |
| 10s inactivity | `sleepy` | Alias of `nap` |

## Preview Routes

- `/dev/preview` — mascot motion preview, tracking demo, and native cards for added `peek` looks
- `/dev/preview?view=newsletter` — notify email preview surface

Keep new mascot work inside the existing grid-and-frame model unless there is a real reason to change the renderer. A mascot does not need a framework inside the framework.

## Problem

The current shape works for a dozen states, but it will not scale cleanly to hundreds of `peek` designs.

- `peek.ts` mixes identity, base grid data, frame definitions, gallery grouping, aliases, and runtime behavior notes.
- `peek-looks.ts` is a second registry that preview consumers must import directly.
- `/dev/preview` knows too much about the mascot storage layout. It imports motions from `mascot.animations`, looks from `PEEK_EXPRESSION_LOOKS`, and costumes from `PEEK_COSTUME_LOOKS`.
- Runtime slots such as navbar hover, favicon, 404, and preview galleries are not modeled as first-class references. They are scattered across consuming files.
- Manual gallery item lists will become stale when the asset count reaches hundreds.

The fix is not a CMS, database, or large content framework. The right move is a small static catalog with strict IDs, typed asset files, and one query surface for consumers.

## Target Design

Split `peek` into a mascot catalog. The catalog owns storage, indexing, validation, and preview grouping. UI components should render assets; they should not know how the asset library is organized.

```txt
src/features/mascot/
  shared/
    grid.ts
    render.ts
    types.ts
  peek/
    base.ts
    catalog.ts
    palette.ts
    slots.ts
    motions/
      alert.ts
      dart.ts
      idle.ts
      scan.ts
    poses/
      track-center.ts
      track-far-left.ts
      track-far-right.ts
      track-left.ts
      track-right.ts
    looks/
      expressions/
        confused.ts
        cry.ts
        sleepy.ts
      costumes/
        headphones.ts
        santa.ts
        witch.ts
```

This is still plain TypeScript. The split is about ownership and discoverability, not adding a new runtime dependency.

## Data Ownership

`base.ts` owns the identity:

- mascot ID
- display name
- tagline
- default dimensions
- base grid
- default accent

Asset files own one design each:

- one motion, pose, expression, or costume per file
- stable ID
- label and summary
- status
- tags
- grid or frames
- optional palette overrides

`catalog.ts` owns indexing:

- exports all `peek` assets
- validates duplicate IDs at module load
- exposes typed query helpers
- groups preview sections from metadata

`slots.ts` owns usage:

- navbar brand rest state
- navbar hover state
- nav event overrides
- favicon source
- 404 tracking behavior
- preview demo recipes

Consumers should ask for a slot or a filtered asset list. They should not import individual asset arrays.

## Asset ID Rules

IDs must be stable because they will appear in slots, preview URLs, event payloads, and possibly future content references.

Use this format:

```txt
peek.motion.idle
peek.motion.dart
peek.pose.track-left
peek.expression.confused
peek.costume.santa
```

Rules:

- Use lowercase kebab-case for the final segment.
- Do not rename IDs after merge. Add a new asset and deprecate the old ID instead.
- Keep aliases explicit. `peek.motion.happy` may point at `peek.motion.purr`, but the alias should be represented in metadata.
- Prefer semantic names over visual implementation names. `sleepy` is better than `closed-eyes-01`.

## Asset Type Shape

The catalog should use one shared asset type instead of separate ad hoc arrays.

```ts
export type MascotAssetKind = 'motion' | 'pose' | 'expression' | 'costume';
export type MascotAssetStatus = 'active' | 'draft' | 'archived';

export type MascotAsset = {
  id: string;
  mascot: 'peek';
  kind: MascotAssetKind;
  label: string;
  summary: string;
  status: MascotAssetStatus;
  tags: ReadonlyArray<string>;
  grid?: Grid;
  frames?: ReadonlyArray<Grid>;
  fps?: number;
  loop?: boolean;
  aliasOf?: string;
  palette?: Partial<Record<Cell, string>>;
};
```

Keep this model small. If a field is only needed by one future idea, do not add it yet.

## Slot Type Shape

Slots describe how the site uses the mascot.

```ts
export type MascotSlot = {
  id: string;
  label: string;
  assetId: string;
  fallbackAssetId?: string;
  eventChannel?: string;
  notes?: string;
};
```

Initial `peek` slots:

| Slot | Asset | Notes |
|------|-------|-------|
| `navbar.brand.default` | `peek.motion.idle` | Brand mark at rest |
| `navbar.brand.hover` | `peek.motion.dart` | Brand hover and fast-scroll response |
| `navbar.nav-link.hover` | `peek.motion.curious` | Desktop section-link hover |
| `navbar.section.active` | `peek.motion.happy` | Positive short burst |
| `navbar.idle-timeout` | `peek.motion.sleepy` | Long inactivity state |
| `favicon.default` | `peek.pose.base` | SVG route source |
| `not-found.tracker.default` | `peek.motion.scan` | 404 tracking rest state |

Slots are important because usage should not be hidden inside layout scripts.

## Catalog API

Expose a small query surface.

```ts
export function getPeekAsset(id: PeekAssetId): MascotAsset;
export function getPeekAssets(filter?: PeekAssetFilter): ReadonlyArray<MascotAsset>;
export function getPeekSlot(id: PeekSlotId): MascotSlot;
export function getPeekPreviewSections(): ReadonlyArray<MascotPreviewSection>;
```

Expected consumers:

- `Layout.astro` reads navbar slots.
- `AnimatedLogo` receives the resolved animation key or asset frames.
- `PixelLogo` and favicon routes read the base or favicon slot.
- `/dev/preview` reads `getPeekPreviewSections()` and renders whatever the catalog returns.
- `404.astro` reads tracking slots instead of hard-coding pose names locally.

The consumer rule is simple: importing from `peek/motions/*` or `peek/looks/*` outside the catalog should be treated as a smell.

## Preview Grouping

Preview sections should be generated from metadata, not hand-maintained arrays.

Recommended grouping:

| Section | Filter |
|---------|--------|
| Core Motions | `kind === 'motion' && tags.includes('core')` |
| Navbar Triggers | `tags.includes('nav')` |
| Tracking Poses | `tags.includes('tracking')` |
| Utility Motions | `tags.includes('utility')` |
| Expressions | `kind === 'expression'` |
| Costumes | `kind === 'costume'` |
| Drafts | `status === 'draft'` |

Manual ordering can stay in one optional `order` field when the visual sequence matters. Do not make every preview section a handwritten list.

## Migration Plan

### Phase 1: Add the Catalog Beside the Existing Files

Create the new `src/features/mascot/` tree without changing runtime consumers.

- Move shared types into `src/features/mascot/shared/types.ts`.
- Add grid helpers in `src/features/mascot/shared/grid.ts`.
- Add `peek/base.ts`, `peek/palette.ts`, `peek/catalog.ts`, and `peek/slots.ts`.
- Port existing `peek` motions into one-file-per-asset modules.
- Port existing `peek` looks into `looks/expressions/*` and `looks/costumes/*`.
- Re-export compatibility data from the old `src/features/logos/data/peek.ts` so the site keeps working during the split.

Build after this phase. The expected behavior should be unchanged.

### Phase 2: Move Preview to the Catalog

Update `/dev/preview` first because it is the best pressure test for the new structure.

- Replace direct imports from `peek-looks.ts`.
- Replace `mascot.gallery` and local fallback grouping.
- Render sections returned by `getPeekPreviewSections()`.
- Keep newsletter preview behavior untouched.

This phase should remove the preview page's knowledge of internal asset storage.

### Phase 3: Move Site Runtime Slots

Move consumer wiring from hard-coded animation names to slot lookups.

- Update `Layout.astro` navbar defaults from `getPeekSlot('navbar.brand.default')` and `getPeekSlot('navbar.brand.hover')`.
- Update nav event override names from slot references.
- Update `404.astro` tracking poses from tracking slots or a catalog-provided tracker recipe.
- Keep the public event payload shape stable unless there is a clear reason to change it.

This phase should not change visual behavior.

### Phase 4: Retire the Old Logo Data Shape

After consumers use the catalog:

- Reduce `src/features/logos/data/peek.ts` to a compatibility adapter or delete it if no longer imported.
- Remove `src/features/logos/data/peek-looks.ts`.
- Keep `src/features/logos/lib/svg.ts` focused on rendering and logo route compatibility.
- Update imports so `features/logos` does not own mascot asset data anymore.

This is the cleanup phase. Do it only after preview and runtime consumers are stable.

### Phase 5: Add Validation

Add a small validation script or build-time check.

Checks:

- asset IDs are unique
- slot IDs are unique
- slot `assetId` values exist
- aliases point at existing assets
- every grid row has consistent width
- every frame in a motion has the same width and height
- required metadata exists for previewable assets

This script should fail loudly. Silent mascot corruption is annoying to debug and very avoidable.

## Adding a New Peek Design

Use this workflow for every new design:

1. Add one asset file under the correct folder.
2. Give it a stable ID.
3. Set `status: 'draft'` until the design is reviewed.
4. Add meaningful tags.
5. Run the catalog validation.
6. Check `/dev/preview`.
7. Promote to `active` only when the asset is ready for runtime use.
8. Add or update a slot only when the design is meant to appear in product UI.

Do not add new designs by editing preview markup directly. Preview should reveal catalog state, not become another registry.

## Verification

For each migration phase:

```bash
bun run build
```

For phases touching preview or runtime UI:

```bash
bun dev
```

Then verify:

- `/dev/preview` renders all active motions, poses, expressions, and costumes.
- `/dev/preview?view=newsletter` still renders the newsletter preview.
- navbar still uses `idle` at rest and `dart` on hover.
- nav event overrides still resolve `curious`, `happy`, and `sleepy`.
- `/logo/peek.svg` still renders.
- `/404` tracking behavior still switches poses.

Compress any Playwright screenshots before uploading.

## Acceptance Criteria

The split is complete when:

- no product page imports `PEEK_EXPRESSION_LOOKS` or `PEEK_COSTUME_LOOKS`
- `/dev/preview` uses catalog sections instead of hand-built mascot arrays
- runtime usage is represented in `slots.ts`
- every mascot asset has a stable ID, kind, status, and tags
- validation catches broken grids, duplicate IDs, and missing slot references
- `features/logos` renders mascot data but no longer owns the growing `peek` asset library

## Commit Strategy

Use small Conventional Commits:

- `docs: describe mascot catalog split`
- `refactor: add mascot catalog`
- `refactor: move peek preview data`
- `refactor: wire peek runtime slots`
- `chore: validate mascot catalog`

Keep each commit behaviorally reviewable. A pile of mascot files in one massive commit will be miserable to inspect.
