# Changelog

This changelog is written from the full git history, but it is not a pasted commit log. It summarizes what the site actually gained, fixed, and improved over time.

Coverage: `2026-01-08` through `2026-05-12`.

## 2026-01

### Early foundation

- The repository started as a rebuild around Astro, React, and Tailwind, replacing the earlier styling setup and establishing the current frontend stack.
- The home page took shape quickly: Hero, Projects, Posts, GitHub contribution activity, the tech marquee, refreshed social links, and the first pass of the footer all landed in this phase.
- Branding was standardized around `buxx.me`, with Open Graph and Twitter metadata, updated OG images, and the first production routing and deployment setup for Vercel.

### Moods became a real product surface

- The site gained its first Telegram-backed `Moods` experience: a home preview, a dedicated `/mood` feed, mood detail pages, and an API route for loading posts.
- Mood rendering became much richer over the month: image previews, bookmark cards, grouped timelines, better date formatting, pagination, reactions, custom emoji, animated emoji, forwarded message handling, and richer quote previews.
- The feed and detail pages also learned how to handle more real Telegram media cases: portrait images, video and audio previews, custom emoji images, author normalization, and cleaner text extraction via Cheerio.
- A static Telegram media proxy was introduced so the site could serve mood assets more reliably instead of depending directly on Telegram URLs everywhere.

### Motion, theme, and interface work

- GSAP-based motion was introduced across Hero, Projects, Posts, and Moods, including scroll reveals, parallax effects, magnetic interactions, and more polished loading transitions.
- The theme switcher evolved from a simple toggle into a fuller theme control surface with better animations and later support for system mode.
- Header actions, RSS and Telegram links, and general page chrome kept getting refined so the homepage felt more like a complete product than a static portfolio.

### Comments, embeds, and detail-page depth

- Late in the month, mood detail pages grew beyond “single post with media” into something closer to a discussion surface.
- The site gained comment sections, comment counts, comment popovers, safer comment rendering, richer loading states, and cleaner pagination and reply handling.
- Mood pages also gained `oEmbed` support and better embed-mode behavior, which pushed the detail pages closer to being reusable content endpoints rather than just internal pages.

### Performance, platform, and maintenance

- The repo migrated from `pnpm` to `bun`, picked up better local development guidance, and gradually tightened its ignore rules and agent instructions.
- Fonts were cleaned up and optimized more than once, including early JetBrains Mono adoption and later local font work.
- Vercel Speed Insights and other performance-oriented changes started to appear by the second half of the month.
- Security and project housekeeping also advanced: dependency overrides, Dependabot updates, license changes to AGPL, and early CI/security workflow experiments all landed here.

## 2026-02

### Mood feed matured into a stronger reader

- February focused heavily on making the mood system feel like a proper product instead of a feed prototype.
- The `MoodTimelineWheel` was added and iterated on with new loading states, better progress tracking, improved notch highlighting, and more polished motion behavior.
- Responsive image handling improved on both the site and the Telegram image proxy, so feed images could load faster and scale more cleanly.
- Rich text preservation got better, including line breaks, safer formatting retention, and fewer cases where markup was flattened or lost.

### Notification and email delivery shipped

- A full mood notification pipeline landed this month: subscription handling, delivery scheduling, sender configuration, email rendering, and user-facing subscription UX.
- The site gained a notify panel, Turnstile protection, a subscribe modal route, email template previews, “already subscribed” handling, and better UI for the confirmation flow.
- Notification templates became more realistic over time, with media markers, media previews, card redesigns, avatar proxying, and line-break preservation.
- Storage for notification data was later moved to Cloudflare D1, and both the schema and tests were updated to match.

### Image pipeline and worker infrastructure expanded

- Telegram image handling became much more serious. A Cloudflare Worker was added for high-resolution Telegram images, and the ingest pipeline kept getting reworked to reduce missing images and better recover assets.
- The image worker was tightened so missing R2 assets could fail correctly, static fallbacks could be used when needed, and old KV fallback behavior could be removed.
- A backfill script was added for recovering mood images from Telegram public pages, and webhook image indexing was routed through the worker ingest flow.

### Navigation and chrome experiments

- A new vertical navigation system appeared and was refined aggressively: index indicators, scramble/typewriter behavior, magnetic hover, liquid-glass tooltip effects, and scroll-driven visibility changes.
- The navigation was then simplified and corrected several times so it would look lighter, move less awkwardly, and stay out of the way on Mood L1.
- The header button area also became more responsive and better behaved on mobile, including auto-collapse behavior when scrolling past the hero.

### Security, typography, and platform polish

- JetBrains Mono was self-hosted and generated content was adjusted to use local font assets more cleanly.
- CSP was tightened, especially around font sources.
- Playwright E2E tooling arrived in earnest, with page and API coverage added for the new notify and mood flows.
- The repo documentation and agent rules were also updated repeatedly as the project became less like a prototype and more like a maintained product.

## 2026-03

### Privacy page and page-level chrome

- March introduced a dedicated privacy page and then spent real effort making it fit the rest of the site rather than feeling bolted on.
- That work included themed page styling, privacy links, a mobile privacy header bar, refined navbar behavior on smaller screens, and eventually a Markdown-backed privacy page.
- Navigation behavior across page templates kept being adjusted so the privacy surface inherited the right amount of homepage chrome without acting like a clone of the home page.

### Navigation rewrites continued

- The vertical nav from late February kept evolving: hover physics were reduced, active-indicator positioning was fixed, reveal timing was simplified, and the indicator was hidden when the nav was outside its intended state.
- These changes were less about adding new UI and more about sanding down a flashy system until it stopped fighting the content.

### Platform upgrade and better CI

- The Astro 6 upgrade happened in this month, along with type-check cleanup, dependency updates, and fixes for runtime drift after the upgrade.
- Playwright coverage expanded, new fixtures were added, and CI started to look more production-aware with PR test workflows, preview smoke checks, Node 22 alignment, and protected preview bypass handling.
- Ops health checks were added as part of the project’s confidence story, alongside image health tests and better documentation for image ingest URLs.

### Worker and backend-facing features

- The Telegram image/webhook system gained a worker webhook, stronger ingest transport, and an authenticated activity panel path.
- Homepage project loading was upgraded to use pinned GitHub repos with fallback behavior when live data was incomplete.

### Visual and content polish

- Mood detail pages picked up better reply cards, cleaner quote styling, and a flatter semi-transparent quote surface.
- Comment rendering was unified and cleaned up, with tests added to keep rich comment display stable.
- The site also gained a global spotlight grid overlay and hero highlight effect, followed by smoothing and fade-behavior fixes so the effect felt intentional instead of noisy.

## 2026-04

### Mood media reliability became the main story

- April was dominated by real-world Telegram media correctness.
- The site fixed live photo fallbacks, unsupported media handling, reply thumbnail inference, quote-media layout, video card alignment, video oversize handling, and several classes of duplicate or false-positive fallback behavior.
- Home preview loading was stabilized multiple times, including smaller thumbnail loading and fixes for image layout instability.
- Mood embeds and newsletter/digest previews were also brought closer to the site’s main rendering rules, so external and internal previews stopped drifting apart.

### Galleries and detail-page presentation expanded

- A full mood gallery feature landed, followed by multiple passes on image bounds, aspect ratios, placeholder removal, collage behavior, and eventually justified-layout galleries for detail pages.
- Quote cards inside mood detail pages were refined heavily: spacing, hierarchy, stacking, text scale, bookmark rendering, author hiding, and digest separator treatment were all revisited until the detail view felt coherent.

### Structural refactor of the mood feature

- A large codebase cleanup happened mid-month. The mood system was broken into clearer feature boundaries, with routes, shells, services, client utilities, controllers, update watchers, comment popovers, and media hydration logic pulled into more focused modules.
- This was not a flashy user-facing feature, but it mattered: the mood feature stopped being one sprawling blob and became something easier to debug and extend.

### Listening system launched and then got serious

- The hero gained a real listening experience backed by Last.fm and later an Apple Music demo path.
- Animated listening artwork, live vs preview state handling, client hydration, tonearm/record visuals, responsive layout fixes, and vibrant accent extraction were all introduced or refined during this period.
- A large amount of late-April work was dedicated to making the listening module feel product-grade on mobile, especially with spacing, animation states, typography, and hover behavior.

### Performance and operational work

- Below-the-fold home work was deferred, hero LCP was reduced, static proxy redirects were avoided, and thumbnail loading was tightened for better real-world performance.
- Ops health coverage kept growing, including timeout tuning and image URL fixes.
- Several April changes were essentially “keep the site from lying to itself” work: stabilizing unresolved feed images, syncing listening panel state, and reducing runtime drift between dev and production behavior.

## 2026-05

### Error page became a first-class experience

- Early May turned the 404 page into a real designed surface instead of a dead end.
- The error page gained animated canvas motion, hover and idle behavior, a Geist-driven visual treatment, trace interaction, refined dark-mode contrast, cleaner footer copy, and eventually integration with the mascot system.
- By the end of that line of work, the 404 page felt like part of the brand rather than a utility page.

### Notify system got product-level follow-through

- The notification flow kept improving with admin alerts, welcome and cancel emails, template previews, and dedicated unit-test coverage in CI.
- Development-only behavior was also cleaned up, like skipping analytics injection where it would get in the way.

### Peek became the site mascot and the navbar centerpiece

- The biggest visible product shift in May was the introduction of the `peek` mascot as the site’s logo and interactive brand system.
- That work touched the favicon, homepage navbar, desktop and mobile brand lockups, preview routes, mascot labs, 404 interactions, and multiple rounds of animation/state design.
- The mascot system later moved into a more structured catalog-and-slot model so different surfaces could share expressions and animation states instead of hardcoding one-off behavior everywhere.
- Navbar behavior then kept being tuned around that mascot: spacing, active states, mobile clipping, privacy-page brand chrome, scroll behavior, shared tokens, and smaller client-side runtime cost.

### Moods kept getting fixed and made faster

- The mood system did not stop moving while mascot work was happening.
- Initial home/feed payload preloading landed, duplicate realtime requests were reduced, home preview placeholders were stabilized, roulette date tracking improved, scroll tracking was smoothed, and inline reply/quote thumbnail handling was hardened.
- Tests were added or expanded to pin these fixes down, especially around quote media and navbar regressions.

### Listening and home chrome polish continued

- The listening panel picked up accent-swatch selection fixes and artwork accent restoration.
- Home and page navbar behavior on mobile Safari was corrected repeatedly: safe-area handling, brand centering, brand-space release, theme toggle scope, hero offsets, and privacy-page chrome alignment all received focused fixes.

### Secondary product and platform work

- SEO discovery metadata was added.
- The old ascii moon dev page was removed.
- The newsletter preview/dev console surface was restyled to better match the rest of the site’s visual language.
- By the end of May 12, the branch history shows the site in a much more integrated state: mascot branding, stronger page chrome, more stable mood previews, and less client overhead in the navbar and mood systems.

## Summary

Across its first five months, the site evolved from a polished personal homepage into a multi-surface product with:

- A Telegram-backed publishing system for feed, detail, embeds, galleries, and comments.
- A full email notification pipeline with delivery, previews, storage, and abuse protection.
- Dedicated infrastructure for Telegram image proxying, ingest, and media fallback recovery.
- A richer homepage with live GitHub data, listening state, motion systems, and a distinctive mascot-driven brand layer.
- Stronger operational confidence through Playwright coverage, worker tests, preview smoke checks, PR workflows, and ops health monitoring.
