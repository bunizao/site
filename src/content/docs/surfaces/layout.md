---
title: Shared layout
description: "The shell every page renders in: layout files, navbar variants, theme switch, footer, and motion tokens."
group: Surfaces
order: 3
---

Every route on the site renders inside the same shell. The shell is the chrome
around page content: the navbar, menus, theme switch, and footer. Read this page
when you change that chrome or when a new page needs a different navbar.

| Part | Where it lives |
| --- | --- |
| [Layout files](#layout-files) | `src/layouts/` |
| [Navbar](#navbar-variants) | `Layout.astro`, shaped by `navVariant` |
| [Header actions](#header-actions) | `[data-header-actions]` in `Layout.astro` |
| [Theme](#theme) | An inline script in `Layout.astro` |
| [Footer](#footer) | `Footer.astro` |
| [Page template](#page-template-adaptation) | `Page.astro` |
| [Motion tokens](#motion-tokens) | `src/styles/globals.css` |

## Layout files

| File | What it provides | Who renders it |
| --- | --- | --- |
| [`Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) | The HTML shell, canonical/OG/Twitter metadata, RSS and oEmbed discovery links, the navbar, the site menu, the theme dropdown, the command palette, and the spotlight overlay | Nearly every page, directly |
| [`Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro) | `Layout` with `navVariant="page"` plus `body.page-template-active` and a `main.page-template` wrapper | Nothing right now. `/privacy` composes `Layout` itself |
| [`BlogLayout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/BlogLayout.astro) | Reading chrome for `/blog` | `/blog/*` |
| [`[...path].astro`](https://github.com/bunizao/site/blob/main/src/pages/dev/portal/%5B...path%5D.astro) | The admin portal's own HTML shell. It mounts the client app in `src/features/portal/` and uses no layout | `/dev/portal/*` |
| [`Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro) | The shared footer | Each page adds it; the shell doesn't |

The shell mounts no third-party analytics script anywhere.

## Navbar variants

The navbar links come from `navLinks` in `@/data/site`. Each one is a real
route (`/projects`, `/blog`, `/mood`, `/components`, `/docs`), and a click loads
that page on every variant. The optional `section` field ties a link to a home
page section (`projects`, `writing`, `moods`). On the home page, the link lights
up while its section is on screen. On other pages those sections don't exist, so
no link lights up. Components and Docs have no `section` and never light up.

`navVariant` picks the shape:

| `navVariant` | Brand | Links | Active indicator |
| --- | --- | --- | --- |
| `home` | 40px animated peek plus wordmark | `navLinks` | Yes. Follows the section on screen |
| `page` | Mark plus wordmark, linking `/`. Add `brandVariant="home"` for the 40px animated peek, as `/privacy`, `/components`, `/message`, and `/subscribe/manage` do | None. The brand is the only way out | No |
| `docs` | Mark alone, followed by a `/ Docs` breadcrumb | None. The rail beside the page is the navigation | No |
| unset | 20px mark | `navLinks` | Rendered, but no link lights up |

Two more props control whether the bar shows at all:

| Prop | Effect |
| --- | --- |
| `hideSiteNav` | Removes the bar and the site menu entirely. Use it for embedded specimens and chrome-free pages |
| `showSiteNav` | Controls only whether the bar is visible on mobile. Docs pages force it on |

On the home variants:

- Nav labels are split into one span per character, so the mascot can react to
  individual letters.
- Scrolling updates the active link. The client click handler smooth-scrolls
  only `#` links. Every current `navLinks` entry is a route, so a click
  navigates.
- An `IntersectionObserver` on the hero status element switches the bar between
  horizontal and vertical modes.
- The active indicator animates in vertical mode only.

## Header actions

`[data-header-actions]` is the container in the top right where the shell and
pages put their buttons. It always holds the theme dropdown. On every variant
except `docs`, it also holds the command-palette search button. Docs pages have
their own search in the rail, and one palette needs only one trigger.

Pages can add their own buttons to the same container. `/mood` adds RSS,
Telegram, and Notify. The shell also exposes a small hook for GSAP
header-button animation.

`hideHeaderActionsOnMobile` hides this floating search and theme cluster below
900px. At that width the cluster can only sit on top of the text. At the end of
a mood thread it comes to rest on a comment, and the reader can't scroll it
away. The cluster stays in the DOM, because the theme script writes its state
there. On desktop the cluster sits in the margin and is unchanged. `/mood/[id]`
is the only page that sets this prop.

## Theme

An inline script sets the theme before first paint, so the incoming page of a
navigation shows the right theme instead of flashing. It runs these steps:

1. Read `localStorage.theme` inside a `try`. If storage is blocked, the script
   falls back to the system preference instead of throwing.
2. Resolve the effective theme. A stored `light`/`dark` wins; otherwise the
   script uses `prefers-color-scheme`.
3. Write `html[data-theme-setting]` as `light`, `dark`, or `system`. This sets
   which icon the dropdown shows. It holds the setting, which is a different
   value from the effective theme.
4. Toggle `html.dark`.

A later switch goes through the same resolution and adds a theme-wipe
transition. The wipe is skipped when the effective theme wouldn't change or
when reduced motion is set.

A page with a theme control of its own dispatches a `theme:set` event on
`document`, with `light`, `dark`, or `system` as its `detail`. The script
stores the setting and runs the same transition, without the dropdown's click
sound. The desk's lamp at `/` switches the theme this way. It also
replaces the wipe with a crossfade, because it keeps both of its paintings
ready.

## Footer

Each page adds [`Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro)
itself; the shell doesn't emit it. Links and the status URL come from `footer`
in `@/data/site`. The contact badges are the GitHub, Email, and Telegram entries
of `profile.links`. Two client fetches fill in the rest:

| Fetch | Fills |
| --- | --- |
| `GET /api/footer` | The status pill. `data-footer-status` starts as `unknown` and reads *Checking* until the fetch answers |
| `GET /api/edge` | The region popover, hidden until the request resolves |

The privacy page is linked from the global footer and from the mood notify
panel.

## Page template adaptation

[`Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro)
wraps the base layout for document-style pages, but no page imports it right
now. Only `tests/unit/navbar-regressions.test.ts` reads its source. `/privacy`
renders `Layout` directly with `navVariant="page"` and `brandVariant="home"`.

A page that uses `Page.astro` gets:

- `navVariant="page"`, so the bar keeps the `buxx.me` brand link to `/` and has
  no section links, active indicator, or separators.
- `body.page-template-active` and a `main.page-template` wrapper.
- An optional "Updated:" line from its `updatedAt` prop.

The shared layout is built for the home page first, then adapted for
document-style pages. Chrome styles live in
[`src/styles/site-chrome.css`](https://github.com/bunizao/site/blob/main/src/styles/site-chrome.css),
loaded alongside `public.css`, the public pages' entry to `globals.css`. It
leaves out the utilities only the admin portal and its coss kit use, which
were two thirds of the compiled sheet. The blog layout loads only
`public.css`, and the portal shell only `globals.css`, whole, because they
have their own chrome.

## Motion tokens

The site uses one curve family and one duration scale, declared at `:root` in
[`src/styles/globals.css`](https://github.com/bunizao/site/blob/main/src/styles/globals.css):

| Token | Value |
| --- | --- |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--dur-press` | `110ms` |
| `--dur-fast` | `130ms` |
| `--dur-base` | `190ms` |
| `--dur-enter` | `240ms` |

The scale came from the portal, the only part of the site that had one.

**New motion uses a token.** If you use a literal curve, add a comment that
says why.

Two easings stay outside the scale:

- `--expo-out` is a `linear()` easing for the 1.5s theme wipe. The wipe is a
  different kind of motion from UI motion.
- [`src/styles/home-reveal.css`](https://github.com/bunizao/site/blob/main/src/styles/home-reveal.css)
  defines its own `--reveal-ease`.

### Adoption follow-ups

The first adoption pass replaced a literal only when its value matched a token
exactly **and** plan 022 listed that location. The rest is left for a later
pass.

**Exact matches.** These can switch to tokens with no change in rendering:

| Location | Token |
| --- | --- |
| `src/features/components/ui/OnThisPage.astro:72` | `--ease-out` |
| `src/pages/privacy.astro:334` | `--ease-out` |
| `src/styles/command-palette.css:581-583` | `--ease` |

`src/styles/code-box.css:11` and `src/styles/listening.css:655` already use
`var(--ease-out, …)` with a literal fallback. Keep that form: it is meant for
stylesheets that may mount outside their owning subtree.

**Near-misses.** Each of these is an ease-out with a long tail, but none of them
is `--ease-out`. Replacing them all at once would change how things feel. Decide
per location whether the curve is meant to be the standard ease-out or is
intentional:

| Curve | Uses | Notable homes |
| --- | --- | --- |
| `cubic-bezier(0.16, 1, 0.3, 1)` | 31 | globals, TimelineWheel, 404, view transitions |
| `cubic-bezier(0.2, 0.8, 0.2, 1)` | 12 | |
| `cubic-bezier(0.4, 0, 0.2, 1)` | 9 | Material's standard curve |
| `cubic-bezier(0.32, 0.72, 0, 1)` | 8 | ProjectStack entrance |
| `cubic-bezier(0.22, 1, 0.36, 1)` | 8 (+2 unspaced) | SiteWordmark, hero cards, GitHubContributions |
| `cubic-bezier(0.25, 1, 0.3, 1)` | 6 | blog.css, SiteWordmark |
| `cubic-bezier(0.45, 0, 0.2, 1)` | 4 | |
| `cubic-bezier(0.2, 0.7, 0.2, 1)` | 3 (+2 unspaced variant) | |

Overshoot curves (`0.25, 1.22, 0.45, 1.04`, `0.25, 1.18, 0.45, 1.04`,
`0.34, 1.56, 0.64, 1`, `0.22, 1.2, 0.4, 1`) give specific elements their
character. They are not drift, so leave them out of the token set.

The same curve is also spelled both with and without spaces
(`cubic-bezier(0.22,1,0.36,1)` vs `cubic-bezier(0.22, 1, 0.36, 1)`). That breaks
grep-based audits, so it is worth normalizing in the same pass.
