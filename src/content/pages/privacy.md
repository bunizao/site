---
title: Privacy Policy
description: How this website collects, uses, discloses, and retains personal data, including Cloudflare hosting, reading and playback analytics, YouTube embeds, edge diagnostics, listening cards, mood subscriptions, and third-party services.
updatedAt: August 8, 2026
---

# Privacy Policy

This Privacy Policy describes how this website collects, uses, discloses, and retains personal data. It applies to the site as a whole — pages, blog articles, API routes, the homepage listening card, and the optional mood subscription available at [/mood](/mood) — together with the infrastructure and service providers used to operate it.

> **Summary.** We do not sell personal data, share it with data brokers, or use it to build advertising profiles. No third-party analytics or advertising trackers are loaded as part of a normal page view. First-party reading and audio-playback analytics are sent only to this site's own API. Choosing to play an embedded YouTube video loads YouTube's third-party player. The only information you provide directly is an email address, and only if you choose to subscribe to mood notifications; you may withdraw it at any time.

## Scope

This policy covers personal data processed in connection with this website: the homepage, blog pages, mood pages and comment views, this page, all API routes, and the optional email subscription feature.

It does not govern third-party websites or services you reach through links published here. Once you leave this site, the privacy practices of the destination apply.

## Data we collect

Depending on how you use the site, we may collect or process the following categories of data.

- **Information you provide directly.** If you use the mood subscription form: your email address, delivery preferences, timezone, and related subscription settings. No other feature on the site requests information from you.
- **Technical and request data.** Serving a page or an API route requires standard request metadata. It is processed to deliver the response, enforce rate limits, and prevent abuse.
- **Operational and performance data.** Cloudflare processes request metadata, logs, and performance signals necessary to serve the site, maintain availability, and diagnose failures.
- **Blog reading analytics.** Blog article pages send first-party reading events to this site's own API; no third-party analytics vendor is loaded. These events may include the post slug, event, visitor and session identifiers, dwell time, scroll depth, completion state, referrer, IP address, approximate location and network metadata derived by Cloudflare, language, browser, operating system, device type, and user agent.
- **Listening playback analytics.** Listening cards send first-party playback events to this site's own API when you interact with audio. These events may include the track identifier, title and artist; page path and surface; play requests, successful starts, pauses, seeks and completion; actual listening time, media position and duration; the same visitor and session identifiers used for blog reading analytics; and request-derived IP address, approximate location, referrer, language, browser, operating system, device type, and user agent.
- **Edge connection diagnostics.** The footer can display attributes of your current connection derived by Cloudflare from your request: the serving datacenter, HTTP protocol, TLS version, TCP round-trip time, approximate location, and network or internet provider. These values are computed per request, returned only to you, and are not stored.
- **Listening feature request data.** The homepage listening card triggers server-side requests to Last.fm and Apple services to retrieve the most recent track, album metadata, artwork, preview URLs, and related listening status.
- **Theme preference data.** If you change the site theme, the preference is stored locally in your browser and is not transmitted to us.
- **YouTube embed preference data.** YouTube poster images and channel avatars are loaded through this site's static proxy. YouTube is not contacted by your browser unless you choose to play a video. After that choice, the browser stores a session-only reachability result so later video cards can use the same playback or external-link behavior.
- **Subscription record metadata.** For mood subscriptions: status fields such as pending, active, or unsubscribed, and timestamps for creation, update, confirmation, last confirmation sent, and last notification sent. An email hash is maintained alongside the address in order to index, deduplicate, and manage subscription records.
- **Security and anti-abuse data.** Where Turnstile is enabled for the mood subscription flow, verification data may include a challenge token and the client IP address used during verification.
- **Public-content request data.** Loading published writing, project, and mood content involves server-side or browser-side requests to Ghost, GitHub, a GitHub contributions fallback API, and Telegram-related sources.

## How we use data

We use the data described above to operate, secure, and maintain the site, specifically to:

- host, render, and secure the website and its API routes;
- retain your local theme preference;
- monitor performance and reliability;
- understand which articles are read, for how long, and how readers arrive;
- understand which listening cards are played, whether playback starts, how long audio is heard, and whether a track is completed;
- display edge connection diagnostics when you hover or focus the footer indicator;
- retrieve and refresh listening data from Last.fm and Apple services;
- load a YouTube player only after you choose to play an embedded video;
- load public content from Ghost, GitHub, and Telegram-related sources;
- send confirmation emails and mood notifications where you have opted in;
- honor unsubscribe requests and maintain subscription state; and
- detect abuse, spam, scripted signups, and operational failures.

We do not use personal data collected through this site for data brokerage or for advertising profiles unrelated to these purposes.

## Hosting and security

Public pages and API proxy routes run on Cloudflare Workers. Private API operations — mood images, queue consumers, and scheduled notifications — run in a separate `site-api` service. Cloudflare processes standard request metadata, security signals, logs, and Worker observability data as necessary to serve the site, protect it from abuse, and investigate operational issues.

The footer includes an optional edge indicator. When hovered or focused, it calls this site's own `/api/edge` route, which reads Cloudflare's per-request connection properties and returns them to you. That response is never cached, logged, or retained.

## Blog reading analytics

Blog article pages use first-party analytics served by this site's own API. No third-party analytics script is loaded. A visitor identifier is stored in local storage and a session identifier in session storage so that repeated events can be grouped without requiring an account.

The server derives network and browser signals from the request, including IP address, approximate Cloudflare location metadata, ASN or network provider metadata, user agent, language, browser, operating system, and device type. Events may be retained while the analytics feature remains in operation and under review. They are not sold and are not used for unrelated advertising profiles. You may clear the browser-stored visitor and session identifiers through your browser's storage controls at any time.

## Homepage listening card

The homepage calls this site's `/api/listening` route after the page loads. Last.fm serves as the primary source for recent listening activity, and Apple's music metadata endpoints are used to enrich the current track with album details, artwork, preview audio, and Apple Music links.

When the feature runs, this site's server sends track lookup terms derived from the latest Last.fm result to Apple services and receives track metadata in response. Standard request metadata is processed as part of those outbound requests in the same manner as any server-to-server request.

## Listening playback analytics

Listening cards on the homepage, blog, mood, and component pages use first-party playback analytics served by this site's own API. No third-party analytics script is loaded. These events distinguish a play request from playback that actually starts, and record cumulative heard time rather than inferring listening solely from the media position. Pause, seek, progress checkpoint, completion, track, page, and surface data are grouped into one playback record.

Playback analytics reuse the visitor identifier stored in local storage and the session identifier stored in session storage for blog reading analytics. The server derives IP, approximate Cloudflare location, referrer, language, browser, operating system, device type, and user-agent information from the request. You may clear the browser-stored identifiers through your browser's storage controls at any time.

## YouTube embeds

Before you press play, embedded YouTube videos use poster images and channel avatars fetched through this site's `/static/youtube/` proxy. The page does not load a YouTube iframe, YouTube JavaScript, or YouTube cookies in that state.

Pressing play creates an iframe from YouTube's privacy-enhanced `youtube-nocookie.com` domain. YouTube and Google may then process standard request metadata such as your IP address, browser details, and network information under their own policies. The site stores only a `yes` or `no` reachability result in session storage; it expires with the browser session and is not sent to this site's server.

## Email delivery and anti-abuse

The mood subscription form may be protected by [Cloudflare Turnstile](https://www.cloudflare.com/application-services/products/turnstile/) in order to distinguish legitimate visitors from automated traffic. Where it is active, your browser loads the Turnstile widget, the widget issues a verification token, and the subscription request transmits that token together with the client IP address to Cloudflare for verification. This data is processed for security and anti-abuse purposes only.

Confirmation and notification emails for mood subscriptions are delivered through Resend. Cloudflare additionally provides the data infrastructure supporting the mood notification feature.

## Third-party content sources

The site relies on the following third-party services to load public content and metadata:

- **Last.fm** — recent listening status and track data.
- **Apple services** — track metadata, artwork, preview audio, and Apple Music links.
- **Ghost** — writing links and post metadata.
- **GitHub** — repository data, project metadata, and the homepage contributions graph, retrieved through this site's internal API route. A fallback contributions API is used only where the GitHub GraphQL lookup is unavailable.
- **Telegram-related sources** — mood content and comment threads.
- **YouTube** — video playback after you choose to activate an embedded player; poster images and channel avatars are fetched server-side through this site's static proxy.

Depending on the page and feature in use, the associated requests may be made server-side or directly from your browser.

## Disclosure to service providers

We disclose personal data only where reasonably necessary to operate the site and its features:

- **Cloudflare** — hosting, anti-abuse verification, operational observability, and mood notification infrastructure.
- **Resend** — email delivery for mood subscriptions.
- **Last.fm and Apple services** — listening data and music metadata.
- **Ghost, GitHub, Telegram-related services, and YouTube** — public content, metadata, and optional video playback.

We do not sell personal data collected through this site, and we do not share subscription lists with third parties for their own direct marketing.

## Retention

We retain data for as long as reasonably necessary to operate the site, maintain security, assess performance, and provide optional features such as mood subscriptions.

Certain data is short-lived, including temporary rate-limit state, local theme settings, the session-only YouTube reachability result, and session identifiers stored in your browser. Blog reading and listening playback analytics may be retained while the features remain useful for understanding readership, audio engagement, and site operation. Subscription records may be retained longer in order to maintain opt-in status, unsubscribe status, and delivery history. These records are removed when you delete your record from [/subscribe/manage](/subscribe/manage); what survives is a single receipt recording that a deletion happened, keyed so that it cannot be traced back to an address. Data held by Cloudflare, Resend, Ghost, GitHub, Telegram-related sources, YouTube, or other providers is additionally subject to those providers' own retention practices.

## Your rights and choices

You may:

- browse the site in full without subscribing to any feature;
- select your preferred notification delivery frequency;
- unsubscribe at any time using the link included in every subscription email;
- change the address on your subscription, or delete your record outright, from [/subscribe/manage](/subscribe/manage). Deleting removes your email address, subscription settings, delivery history, newsletter open/click data, and the associated audit entries from the database; opening the emailed link only shows a preview, and the deletion takes effect after you confirm it in your browser. It cannot be undone;
- request access to or correction of your subscription record by contacting [me@buxx.me](mailto:me@buxx.me); and
- clear locally stored theme preferences and analytics identifiers through your browser's storage controls.

Where Turnstile is required on submission of the subscription form, completing the verification is a necessary part of subscribing.

## International transfers

This site and its service providers may process data in countries other than the one in which you are located. By using the subscription feature, you acknowledge that your data may be processed wherever the hosting, email delivery, and anti-abuse providers operate.

## Changes to this policy

We may update this policy from time to time to reflect changes in the subscription feature, our service providers, or applicable legal requirements. Where we do, the date shown at the top of this page will be updated accordingly.

## Contact

For questions regarding this Privacy Policy or this site's data practices, contact [me@buxx.me](mailto:me@buxx.me).
