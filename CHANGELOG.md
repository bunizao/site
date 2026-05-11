# Changelog

This changelog is based on the full git history, but it is written as a product timeline rather than a pasted commit log.

Coverage: `2026-01-08` through `2026-05-12`.

## 2026-01

### 2026-01-08 to 2026-01-09

- The site was bootstrapped on Astro, React, and Tailwind, replacing the earlier styling setup and establishing the stack that still defines the project.
- The homepage core landed almost immediately: Hero, Projects, Posts, GitHub contribution activity, the tech marquee, refreshed social links, and the first serious footer.
- Branding was tightened around `buxx.me`, with Open Graph and Twitter metadata, updated OG images, and an initial Vercel deployment setup.

### 2026-01-09 to 2026-01-12

- `Moods` became the first major content product on the site. The project gained a homepage preview, a full `/mood` feed, mood detail pages, and an API route for loading posts.
- Over these few days, the feed learned how to show image previews, bookmark cards, grouped timelines, richer date formatting, pagination, and cleaner Telegram text extraction.
- The visual side also moved fast: GSAP-based scroll reveal, parallax effects, magnetic interactions, and a more capable theme control surface started taking shape across the homepage.

### 2026-01-10 to 2026-01-16

- Telegram media support deepened. The mood system gained better reactions, custom emoji, animated emoji, forwarded-message support, and more stable handling for portrait images, video, and audio previews.
- A static Telegram media proxy was introduced so the site could serve mood assets more reliably instead of relying directly on Telegram URLs.
- The repo also started to harden operationally, with license cleanup, dependency overrides, more documentation, and the first round of CI/security housekeeping.

### 2026-01-17 to 2026-01-25

- The project migrated from `pnpm` to `bun`, and local development guidance was updated to match.
- The site added richer quote previews, linkified mood text, cleaner responsive layout rules, and stronger accessibility and mobile behavior in the feed.
- Homepage interaction work continued with better header actions, RSS and Telegram controls, improved theme switching, and more performance-aware GSAP loading.

### 2026-01-28 to 2026-01-31

- Mood detail pages turned into something more than static post views. The site gained comments, comment counts, loading states, reply handling, and comment popovers.
- `oEmbed` support and embed-mode cleanup also arrived in this phase, pushing mood detail pages closer to reusable content endpoints.
- By the end of January, the mood system had moved from “Telegram feed experiment” to a real product surface with media, interaction, comments, and embeds.

## 2026-02

### 2026-02-01 to 2026-02-06

- February opened with heavier work on the mood reading experience. Responsive image handling improved both on the site and in the Telegram image proxy.
- The `MoodTimelineWheel` was introduced and quickly iterated on with loading skeletons, better progress tracking, stronger visual feedback, and smoother motion behavior.
- The codebase also started to bend toward stricter structure and better agent guidance, even if the user-facing focus was still the mood product.

### 2026-02-10

- This was the big notification milestone. The site gained a full mood email notification pipeline with subscription handling, scheduling, sender configuration, delivery flow, and subscription UI.
- The notify panel, Turnstile protection, subscribe modal route, already-subscribed handling, and template previewing all landed around the same time.
- Playwright E2E tooling also arrived in earnest here, because once notifications shipped, hand-waving about behavior stopped being acceptable.

### 2026-02-11 to 2026-02-19

- Notification templates got more realistic: media previews, avatar proxying, card redesigns, line-break preservation, and better button and panel UI all improved.
- Storage for notify data moved to Cloudflare D1, with matching schema, migration, docs, and test updates.
- Outside notify, the mood feed kept getting cleaned up on mobile and with custom emoji rendering.

### 2026-02-15 to 2026-02-18

- JetBrains Mono was self-hosted and CSP rules were tightened, especially around fonts.
- Rich text and emoji handling improved further, with fixes for mood previews, emoji-only navigation, and media-detection mistakes.
- The repo was becoming less prototype-like: tighter security posture, better local assets, and fewer brittle remote dependencies.

### 2026-02-26 to 2026-02-27

- Telegram image handling got serious. A Cloudflare Worker was added for higher-quality Telegram images, along with backfill scripts, webhook-indexed ingest, and more explicit R2-miss behavior.
- At the same time, a vertical navigation system arrived and was heavily explored with index indicators, typewriter effects, magnetic hover, and liquid-glass tooltip styling.
- By the end of February, the site had both a stronger media pipeline and a much more experimental navigation language.

## 2026-03

### 2026-03-08 to 2026-03-10

- March started by adding a dedicated privacy page and then repeatedly refining how it inherited site chrome.
- This phase introduced privacy links, a mobile privacy header, page-specific navigation behavior, and eventually a Markdown-backed privacy page that felt integrated rather than bolted on.
- Mood detail pages also gained better quote presentation and more detailed reply-card rendering during the same stretch.

### 2026-03-13 to 2026-03-16

- Homepage project loading was upgraded to use pinned GitHub repos with fallback behavior, reducing dependence on live GitHub responses being perfect.
- The Astro 6 upgrade landed here, along with type-check cleanup, runtime fixes, dependency refreshes, and stronger PR/preview workflows.
- Playwright coverage expanded further, and preview smoke checks plus PR test automation started giving the repo a more serious delivery pipeline.

### 2026-03-17 to 2026-03-19

- Ops health checks were added, especially around image probing and delivery reliability.
- The Telegram image/webhook system gained a worker webhook, stronger ingest transport, and an authenticated activity panel path.
- A global spotlight overlay and hero grid highlight effect were introduced and then tuned so the animation felt intentional rather than noisy.

### 2026-03-20 to 2026-03-21

- The repo’s architecture docs were expanded and cleaned up, reflecting that the project now had enough moving parts to need a clearer map.
- This late-March work was less flashy, but it mattered: the project was behaving more like a maintained system than a rapidly changing personal experiment.

## 2026-04

### 2026-04-06 to 2026-04-10

- April was dominated by Telegram media correctness. The site fixed unsupported-media fallbacks, live photo handling, reply thumbnails, quote-media layout, video preview sizing, and oversize media behavior.
- A full mood gallery feature landed, then immediately went through multiple layout passes until it respected aspect ratios and looked coherent in detail views.
- Home mood previews were also stabilized more than once, which says a lot about how real the edge cases had become.

### 2026-04-12 to 2026-04-19

- The mood feature went through a large internal refactor. Routes, services, shells, controllers, comment helpers, update watchers, media hydration logic, and utilities were pulled into clearer feature boundaries.
- This was one of the most important non-visual changes in the repo’s history: the mood system stopped being one large tangle and became something maintainable.
- In parallel, listening UI work started to become more ambitious, and the project kept tightening tests and operational docs.

### 2026-04-25 to 2026-04-26

- The homepage gained a real listening system backed by Last.fm, later paired with an Apple Music demo path.
- Animated listening artwork, live-vs-preview states, tonearm and record visuals, client hydration, responsive layout fixes, and vibrant accent extraction all landed in quick succession.
- Performance work also sharpened during this window: below-the-fold home work was deferred, hero LCP was reduced, and static proxy redirects were avoided.

### 2026-04-27 to 2026-04-29

- Mood detail and embed rendering were refined heavily: quote cards, digest previews, bookmark-card hierarchy, separator softness, text scaling, author hiding, and quote/media alignment all improved.
- The listening panel and home preview cards kept getting real-world fixes, especially around compact scroll behavior, mobile layout, and animation state consistency.
- By the end of April, the site felt less like separate feature islands and more like one coherent product.

## 2026-05

### 2026-05-01 to 2026-05-03

- The 404 page became a first-class experience. It gained animated canvas motion, idle and hover behavior, trace interaction, refined contrast, cleaner footer copy, and a much stronger visual identity.
- Mood embed rendering also kept getting fixes in parallel, especially around video and quote presentation.

### 2026-05-04

- The notification system got follow-through instead of just shipping and being forgotten.
- Admin alerts, welcome and cancel emails, template previews, and dedicated notify test coverage all landed here.
- Development-only annoyances, like analytics injection where it did not belong, were also cleaned up.

### 2026-05-06 to 2026-05-09

- This was the start of the `peek` era. The mascot became the site logo and the center of the homepage/navbar brand system.
- The work touched the favicon, navbar, brand lockups, mascot preview routes, lab assets, 404 integration, and multiple rounds of interaction design.
- At the same time, mood performance kept improving with preloaded home/feed payloads and reduced realtime duplicate requests.

### 2026-05-10

- The mascot system was reorganized into a more structured catalog-and-slot model so animations and expressions could be reused across surfaces instead of hardcoded ad hoc.
- Mobile navbar behavior got a concentrated round of fixes: label clipping, theme toggle scope, header-action behavior, safe-area handling, brand centering, and preview-navbar visibility were all corrected.
- The home mood placeholder was also stabilized here and backed with explicit regression tests.

### 2026-05-11 to 2026-05-12

- Privacy-page brand chrome was aligned with the homepage more carefully, using shared navbar tokens instead of fragile one-off spacing rules.
- Navbar runtime cost was reduced, logo payload handling was tightened, and listening accent selection was cleaned up.
- Mood work continued all the way through May 12 with roulette date tracking fixes, smoother scroll behavior, stronger quote-thumbnail handling, and more test coverage around quote media.

## Summary

From January through May, the site evolved in a pretty clear sequence:

1. It started as a polished Astro homepage with projects, posts, GitHub activity, motion, and branding.
2. It grew a Telegram-backed `Moods` system with feed, detail pages, media handling, comments, embeds, and galleries.
3. It added a full email notification product with delivery, previews, abuse protection, and durable storage.
4. It built real infrastructure around media reliability through Telegram proxying, worker ingest, and fallback recovery.
5. It ended this period with a much stronger brand layer, anchored by `peek`, plus better page chrome, stronger tests, and less fragile runtime behavior.
