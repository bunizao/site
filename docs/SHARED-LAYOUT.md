# Shared Layout

## Scope

This document covers shared cross-page UI behavior:

- layout shell
- navbar and header actions
- page-template adaptation
- shared footer

## Base Layout

Main file: [`src/layouts/Layout.astro`](../src/layouts/Layout.astro)

Responsibilities:

- owns the HTML shell for most routes
- sets canonical, OG, and Twitter metadata
- exposes optional RSS and oEmbed discovery links
- mounts the shared section navbar by default
- mounts the shared theme dropdown
- avoids mounting third-party analytics scripts

Theme behavior:

- runs before paint with an inline script
- reads `localStorage.theme`
- falls back to `prefers-color-scheme`
- applies `html.dark`
- stores the current selection in `html[data-theme-setting]`

## Navbar Model

Implementation lives in [`src/layouts/Layout.astro`](../src/layouts/Layout.astro).

Important design choice:

- the navbar is section-anchor based, not route-aware

Behavior:

- default links target:
  - `#projects-section`
  - `#writing-section`
  - `#moods-section`
- nav labels are rewritten into per-character spans
- scrolling updates the active section
- smooth scrolling is handled in client code
- `IntersectionObserver` switches the nav between horizontal and vertical modes based on hero visibility
- the active indicator is animated only in vertical mode

Header actions:

- `Layout.astro` owns the theme dropdown
- individual pages can inject extra buttons into `[data-header-actions]`
- `Layout.astro` exposes a small registration surface for GSAP header-button animation

## Page Template Adaptation

Main file: [`src/layouts/Page.astro`](../src/layouts/Page.astro)

Purpose:

- reuse the same base layout for document-style pages such as `/privacy`

How it adapts the shared nav:

- adds `body.page-template-active`
- keeps only the first nav item
- renames that item to `buxx.me`
- rewires it to `/`
- removes the active indicator
- removes extra links and separators

This keeps the global chrome but changes the navigation contract from section scrolling to home navigation.

## Shared Footer

File: [`src/features/home/ui/Footer.astro`](../src/features/home/ui/Footer.astro)

Behavior:

- static footer
- exposes `/privacy`
- exposes the GitHub source repository

The privacy page is therefore linked from:

- the global footer
- the mood notify panel

## Implementation Summary

- shared UI concerns are centralized in `Layout.astro`
- content pages reuse the same shell and mutate the nav through `Page.astro`
- the shared layout is optimized for the home page first, then adapted for document-style pages
