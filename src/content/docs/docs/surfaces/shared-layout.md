---
title: Shared layout
description: How Layout.astro and Page.astro split responsibility for the site shell, navbar, and footer.
internal: true
---

The shared layout splits two concerns: `Layout.astro` owns the global HTML shell, `Page.astro` adapts it for document-style pages like `/privacy`.

## Layout.astro

`src/layouts/Layout.astro` owns the HTML shell for most routes. It sets canonical, OG, and Twitter metadata, exposes optional RSS and oEmbed discovery links, mounts the shared section navbar by default, mounts the shared theme dropdown, and avoids mounting third-party analytics scripts.

Theme behavior runs before paint via an inline script: reads `localStorage.theme`, falls back to `prefers-color-scheme`, applies `html.dark`, stores the current selection in `html[data-theme-setting]`.

## Navbar model

The navbar is **section-anchor based, not route-aware** — that's the design choice that makes everything else fall out. Default links target `#projects-section`, `#writing-section`, `#moods-section`. Nav labels are rewritten into per-character spans. Scrolling updates the active section. Smooth scrolling is handled in client code. `IntersectionObserver` switches the nav between horizontal and vertical modes based on hero visibility. The active indicator animates only in vertical mode.

Header actions:

- `Layout.astro` owns the theme dropdown.
- Individual pages can inject extra buttons into `[data-header-actions]`.
- A small registration surface lets pages plug in GSAP header-button animation.

## Page.astro

`src/layouts/Page.astro` reuses the same base layout for document-style pages. To adapt the shared nav it adds `body.page-template-active`, keeps only the first nav item, renames it to `buxx.me`, rewires it to `/`, removes the active indicator, and removes extra links and separators.

This keeps the global chrome but changes the navigation contract from section scrolling to home navigation.

## Footer

`src/features/home/ui/Footer.astro` is static — exposes `/privacy` and the GitHub source repository. The privacy page is therefore linked from both the global footer and the mood notify panel.

## Why this shape

Shared UI concerns are centralized in `Layout.astro`. Content pages reuse the same shell and mutate the nav through `Page.astro`. The shared layout is optimized for the home page first, then adapted for document-style pages — not the other way around.
