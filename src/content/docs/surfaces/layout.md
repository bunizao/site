---
title: Shared layout
description: "Chrome that every page inherits: the layout shell, theme switch, command palette, and footer."
group: Surfaces
order: 3
---

## Scope

This document covers shared cross-page UI behavior:

- layout shell
- navbar and header actions
- page-template adaptation
- shared footer

## Base Layout

Main file: [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro)

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

Implementation lives in [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro).

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

Main file: [`src/layouts/Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro)

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

File: [`src/features/home/ui/Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro)

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

## Motion Vocabulary

Declared at `:root` in [`src/styles/globals.css`](https://github.com/bunizao/site/blob/main/src/styles/globals.css). One
curve family, one duration scale, site-wide:

| Token | Value |
| --- | --- |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--dur-press` | `110ms` |
| `--dur-fast` | `130ms` |
| `--dur-base` | `190ms` |
| `--dur-enter` | `240ms` |

The scale was adopted from the portal, which was the only part of the site that
had one; [`src/styles/portal.css`](https://github.com/bunizao/site/blob/main/src/styles/portal.css) now aliases its
`--portal-*` names to these so its existing rules keep reading their own
vocabulary.

**Rule: new motion uses a token. A literal curve needs a comment saying why it
is not one.**

`--expo-out` is deliberately outside this scale — it is a `linear()` easing for
the 1.5s theme wipe, a different register from UI motion.
[`src/styles/home-reveal.css`](https://github.com/bunizao/site/blob/main/src/styles/home-reveal.css) likewise owns its
own `--reveal-ease` by design.

### Adoption follow-ups

The adoption pass replaced literals only where the value matched a token
exactly **and** the site was enumerated in plan 022. Left for a later pass:

**Exact matches, mechanically safe** — these can become tokens with no change in
rendering:

- `src/features/components/ui/OnThisPage.astro:72` — `--ease-out`
- `src/pages/privacy.astro:334` — `--ease-out`
- `src/components/CommandPalette.astro:1554-1556` — `--ease`
- `src/features/admin/ui/AnalyticsCharts.tsx:158` — `--ease` (inline style, React island)

`src/styles/code-box.css:11` and `src/styles/listening.css:655` already read
`var(--ease-out, …)` with a literal fallback; that form is deliberate for
stylesheets that may mount outside their owning subtree.

**Near-misses needing a judgement call** — each is an "ease-out with a long
tail" that is *not* `--ease-out`. Collapsing them blind would change how things
feel, so each site needs its own decision (is this meant to be the standard
ease-out, or is the curve deliberate?):

| Curve | Uses | Notable homes |
| --- | --- | --- |
| `cubic-bezier(0.16, 1, 0.3, 1)` | 31 | globals, TimelineWheel, 404, view transitions |
| `cubic-bezier(0.2, 0.8, 0.2, 1)` | 12 | — |
| `cubic-bezier(0.4, 0, 0.2, 1)` | 9 | Material's standard curve |
| `cubic-bezier(0.32, 0.72, 0, 1)` | 8 | ProjectStack entrance |
| `cubic-bezier(0.22, 1, 0.36, 1)` | 8 (+2 unspaced) | SiteWordmark, hero cards, GitHubContributions |
| `cubic-bezier(0.25, 1, 0.3, 1)` | 6 | blog.css, SiteWordmark |
| `cubic-bezier(0.45, 0, 0.2, 1)` | 4 | — |
| `cubic-bezier(0.2, 0.7, 0.2, 1)` | 3 (+2 unspaced variant) | — |

Overshoot curves (`0.25, 1.22, 0.45, 1.04`, `0.25, 1.18, 0.45, 1.04`,
`0.34, 1.56, 0.64, 1`, `0.22, 1.2, 0.4, 1`) are character, not drift — they are
not candidates for the token set.

Also worth a pass: the same curve is spelled both with and without spaces
(`cubic-bezier(0.22,1,0.36,1)` vs `cubic-bezier(0.22, 1, 0.36, 1)`), which
defeats grep-based auditing.
