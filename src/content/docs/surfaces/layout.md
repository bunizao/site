---
title: Shared layout
description: "Chrome that every page inherits: the layout shell, theme switch, command palette, and footer."
group: Surfaces
order: 3
---

Every route on the site renders inside the same shell. This page covers what
that shell owns, the four navbar variants it can render, and the theme and
footer behavior that comes with it.

## Shells at a glance

| File | What it owns | Who renders it |
| --- | --- | --- |
| [`Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) | The HTML shell, canonical/OG/Twitter metadata, RSS and oEmbed discovery links, the navbar, the site menu, the theme dropdown, the command palette, and the spotlight overlay | Nearly every page, directly |
| [`Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro) | `Layout` with `navVariant="page"` plus `body.page-template-active` and a `main.page-template` wrapper | Nothing right now — `/privacy` composes `Layout` itself |
| [`BlogLayout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/BlogLayout.astro), [`PortalLayout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/PortalLayout.astro) | Reading chrome for `/blog`, and the admin portal shell | `/blog/*`, `/dev/portal/*` |
| [`Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro) | The shared footer | Composed per page, not injected by the shell |

No third-party analytics script is mounted anywhere in the shell.

## Navbar variants

The navbar is section-anchor based, not route-aware — its links are `#`
anchors on the home page, which is why every other variant either drops them
or replaces them. `navVariant` picks the shape:

| `navVariant` | Brand | Links | Active indicator |
| --- | --- | --- | --- |
| `home` | 40px animated peek plus wordmark | `navLinks` from `@/data/site` | Yes |
| `page` | Mark plus wordmark, linking `/` | None — the brand is the only way out | No |
| `docs` | Mark alone, followed by a `/ Docs` breadcrumb | None — the rail beside the page is the navigation | No |
| unset | 20px mark; add `brandVariant="home"` for the full brand in a plain horizontal bar, as `/privacy` and `/components` do | `navLinks` | Yes |

Two more props sit alongside it: `hideSiteNav` removes the bar and the site
menu entirely (embedded specimens, chrome-free pages), and `showSiteNav`
controls only whether the bar is visible on mobile. Docs force that on.

Behavior on the home variants:

- Nav labels are rewritten into per-character spans so the mascot can react to
  individual letters.
- Scrolling updates the active section, and smooth scrolling is handled in
  client code rather than CSS.
- An `IntersectionObserver` on the hero status element switches the bar between
  horizontal and vertical modes.
- The active indicator animates in vertical mode only.

## Header actions

`[data-header-actions]` is the shell's registration surface, top right. It
always carries the theme dropdown, and the command-palette search button on
every variant except `docs` — docs carry their own search in the rail, and two
triggers for one palette is one too many. Individual pages inject their own
buttons into the same container; `/mood` puts RSS, Telegram, and Notify there.
The shell also exposes a small hook for GSAP header-button animation.

## Theme

An inline script runs before paint, so the incoming page of a navigation is
already correct rather than flashing:

1. Read `localStorage.theme`, inside a `try` — a blocked storage read falls
   through to the system preference instead of throwing.
2. Resolve the effective theme: a stored `light`/`dark` wins, otherwise
   `prefers-color-scheme`.
3. Write `html[data-theme-setting]` — `light`, `dark`, or `system`. This drives
   which icon the dropdown shows, and is deliberately not the same value as the
   effective theme.
4. Toggle `html.dark`.

Switching later goes through the same resolution, plus a theme-wipe transition
that is skipped when the effective theme would not actually change or when
reduced motion is set.

## Footer

[`Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro) is composed per page rather than emitted by the shell. Links and the
status URL come from `footer` in `@/data/site`; the contact badges are the
GitHub, Email, and Telegram entries of `profile.links`. Two client fetches
hydrate it:

| Fetch | Fills |
| --- | --- |
| `GET /api/footer` | The status pill — `data-footer-status` starts as `unknown` and reads *Checking* until it answers |
| `GET /api/edge` | The region popover, hidden until the request resolves |

The privacy page is reachable from the global footer and from the mood notify
panel.

## Page template adaptation

[`Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro)
reuses the base layout for document-style pages such as `/privacy`. It adds
`body.page-template-active`, keeps the first nav item as a `buxx.me` link to
`/`, and removes the section indicator and extra separators.

The shared layout is optimized for the home page first, then adapted for
document-style pages. Chrome styles live in
[`src/styles/site-chrome.css`](https://github.com/bunizao/site/blob/main/src/styles/site-chrome.css),
loaded alongside `globals.css`; Blog and Portal layouts load only the shared
globals because they own different chrome.

## Motion vocabulary

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
