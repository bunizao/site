# Mascot

`peek` is the site mascot.

This document exists to keep mascot work simple. It is not a deployment guide, not a migration diary, and not a place to design a framework around a cat.

## What `peek` Does

- Acts as the navbar brand mark.
- Provides a small set of motion and expression states for the site UI.
- Powers the mascot preview at `/dev/preview`.
- Supplies the public SVG used by favicon and related consumers.

## What Matters

When working on `peek`, keep these rules intact:

- `peek` should stay easy to render and easy to reason about.
- The mascot data should have one clear source of truth.
- Consumers should use stable public data, not reach into random internal files.
- Preview exists to show mascot states, not to become a second registry.

If a mascot change needs a pile of ceremony, the design is probably wrong.

## Current Usage

- Navbar brand mark in [`src/layouts/Layout.astro`](../src/layouts/Layout.astro)
- Logo data in [`src/features/logos/data/peek.ts`](../src/features/logos/data/peek.ts)
- Extra looks in [`src/features/logos/data/peek-looks.ts`](../src/features/logos/data/peek-looks.ts)
- Preview surface in [`src/pages/dev/preview.astro`](../src/pages/dev/preview.astro)
- SVG route in [`src/pages/logo/[id].svg.ts`](../src/pages/logo/[id].svg.ts)

## Current Problem

The mascot data is carrying too much in one place.

- Identity, motion data, extra looks, and preview grouping are too tightly mixed.
- Preview knows too much about how mascot data is stored.
- Adding more `peek` variants will get messy fast if this keeps growing sideways.

That does not justify a CMS, database, or some overbuilt content system. It just means the mascot data should stay organized and explicit.

## Direction

The right direction is boring on purpose:

- Keep mascot data static and typed.
- Split large mixed files when they become hard to read.
- Give mascot states stable names.
- Keep rendering code separate from mascot content.
- Make preview read from the same source of truth as the rest of the site.

Low complexity wins here. A mascot is branding content with behavior, not infrastructure.

## Definition Of Done

A mascot change is in good shape when:

- the intended UI surface still works
- `/dev/preview` still reflects the real mascot data
- `/logo/peek.svg` still renders correctly
- the data layout is easier to understand than before

If a change makes mascot work harder to follow, it missed the point.
