# Components Showcase

Status: **implemented; final hardening in progress**

Branch: `feat/components-showcase`

This document records the product that exists on the branch. Earlier drafts
described a six-item, mostly static specimen sheet with footer-only discovery.
The implementation deliberately evolved into a larger, interactive registry.
When this document and the current implementation disagree, the implementation
is the source of truth unless a later product decision explicitly changes it.

## Goal

`/components` is the public catalog for the site's reusable interface work. It
has two jobs:

- present the real components in the context where their interaction and motion
  make sense;
- publish installable source through shadcn-compatible registry endpoints.

The page is a craft surface, not a generic design-system documentation site.
It may include primitives, site-specific showpieces, and compositions extracted
from production pages.

## Product decisions

### One public registry contract

Every catalog entry uses the registry install flow:

```text
npx shadcn add https://buxx.me/r/<name>
```

`@bunizao/decode-text` remains a standalone package for direct package users,
but the showcase publishes its source through the registry so every detail page
has one consistent installation model.

A registry entry is publishable only when its payload installs into a blank
Tailwind 4 shadcn project and that project compiles. Preview documents, fixture
pages, and source trees that lose their import structure when installed are not
valid registry components.

### Interactive index previews

The live bento index is intentional. A completely static miniature grid would
load less JavaScript, but it would hide the interaction quality the page exists
to demonstrate.

Runtime is selective:

- React behavior that defines the specimen may hydrate with `client:visible`;
- Astro specimens render as HTML and CSS without a client island where possible;
- viewport-coupled previews such as mood wheel and mobile reading bar use a
  lazy iframe so fixed positioning and scroll state cannot escape the tile;
- decorative tiles do not gain JavaScript merely for entrance motion.

The performance rule is not "no JavaScript." It is "ship JavaScript only when
the specimen's defining behavior needs it."

### Navigation and page chrome

- Components is a first-class item in the shared site navigation.
- The index uses the global brand-home header and the shared footer.
- Detail pages use a compact breadcrumb and one back-to-components link.
- Previous/next component navigation is intentionally omitted.

### Visual direction

The index is the implemented live bento wall:

- a compact editorial hero;
- monochrome surfaces with component-owned color inside specimens;
- rounded, clipped tiles with quiet borders and restrained hover elevation;
- a responsive one-column stack on narrow screens;
- real specimens rather than placeholder diagrams.

Reduced-motion users receive the content without translational entrance motion.
Hover-only effects must not be required to understand or operate a specimen.

## Catalog

The merge-ready catalog contains these public entries:

| Slug | Tier | Preview | Distribution |
| --- | --- | --- | --- |
| `button` | primitive | inline | registry source |
| `badge` | primitive | inline | registry source |
| `card` | primitive | inline | registry source |
| `decode-text` | showpiece | visible React island | registry source |
| `projects-deck` | composition | visible React island | registry source |
| `listening` | showpiece | inline Astro | registry source |
| `github-activity` | showpiece | inline Astro | registry source |
| `contact-links` | composition | inline Astro | registry source |
| `tag-cards` | composition | inline Astro | registry source |
| `update-pills` | primitive | inline Astro | registry source |
| `list-hover` | composition | inline Astro | registry source |
| `mood-wheel` | composition | iframe fixture | registry source plus wiring |
| `mobile-reading-bar` | composition | iframe fixture | registry component |

The internal Peek mascot remains part of the site but is not a public registry
entry. Its nested source tree is tightly coupled to the site's animation catalog
and does not justify a stable external installation contract.

## Page structure

### Index

`src/pages/components/index.astro` renders the live bento. The index is curated,
not generated blindly from every content entry: primitives have detail pages and
registry endpoints without displacing the larger visual specimens on the wall.

### Detail pages

Each `/components/[slug]` page renders:

1. breadcrumb;
2. title and tagline;
3. live preview;
4. package-manager install tabs and copy action;
5. usage example;
6. credits when present;
7. source link;
8. one back-to-components link;
9. a right-rail table of contents.

The usage example is the first fenced code block in the content entry. There is
no hand-maintained props table or separate accessibility essay.

### Registry routes

Both `/r/<name>` and `/r/<name>.json` expose the same static registry payload for
CLI compatibility. One shared route implementation should own serialization so
the aliases cannot drift.

Registry files must declare destinations that preserve required directory
structure. Imports in emitted source must resolve in the consumer project, not
only in this repository.

## Component extraction rules

### Mobile reading bar

The reusable component owns the bar, current-section label, menu, active state,
and keyboard behavior. The iframe page owns only fixture sections, scroll state,
theme mirroring, and preview-document chrome. The registry publishes the
component, never the complete preview document.

### Mood wheel

The engine keeps its explicit mount API and injected DOM dependencies. A public
registry payload must include enough markup, styling, and wiring for a consumer
to mount it; publishing only the engine files is incomplete.

### Decode text

The package engine remains framework-independent and zero-dependency. It must
segment user-visible grapheme clusters rather than UTF-16 code units, respect
reduced motion, wait for fonts with a bounded timeout, and preserve existing
markup on cancellation.

### Shared site surfaces

This branch may refine production surfaces used by the specimens, including the
projects ledger, shared navigation, blog code boxes, Listening, and the mood
wheel mount path. Those changes are part of this branch and must carry their own
regression coverage; they are not treated as out-of-scope merely because they
also appear outside `/components`.

## Accessibility contract

- Clickable previews use semantic buttons or links and are keyboard operable.
- Dialog-like menus move focus inside on open, contain Tab navigation, close on
  Escape, make background content inert, and restore focus to the trigger.
- Iframe previews have meaningful titles.
- Reduced motion preserves visibility and removes nonessential translation.
- Copy and install controls expose state changes without relying on color alone.

## Verification

The branch is merge-ready when all of these pass:

1. `bun run check`
2. `bun run test:unit`
3. `bun run build`
4. affected Playwright tests for `/components`, navigation, `/projects`, blog
   code rendering, and the mood route
5. React Doctor changed-scope scan with no unresolved errors
6. blank Tailwind 4 shadcn install and compile checks for every published
   registry entry
7. light, dark, mobile, keyboard, and reduced-motion browser checks

Registry tests must exercise the generated payload or a real install boundary.
Source-string assertions are useful guards but are not evidence that a component
installs or compiles.

## Non-goals

- Search or a command palette before the catalog needs one.
- A separate documentation framework.
- Publishing the internal mascot engine.
- Previous/next detail navigation.
- Removing interaction from the index solely to reach zero JavaScript.

## Follow-up rule

New entries require four things in the same change: content metadata, a real
preview, a registry payload with consumer-safe imports and destinations, and an
install/compile regression test. If a composition cannot meet that contract, it
stays showcase-only until it is extracted properly.
