---
title: Privacy Policy | Bunizao
description: What this site collects, why, and who it reaches — Cloudflare hosting, blog reading analytics, edge diagnostics, the listening card, mood subscriptions, and third-party services.
updatedAt: June 28, 2026
---

# Privacy Policy

This is a personal site, run by one person. This page explains what data it collects, why it collects it, and which services see it. It covers every part of the site: pages, blog posts, API routes, the homepage listening card, and the optional mood subscription at [/mood](/mood).

> **In short.** Nothing here is sold, brokered, or used for advertising. There are no third-party analytics or ad trackers. The only thing you can hand over deliberately is an email address, and only if you subscribe to mood notifications — you can remove it at any time.

## What this covers

This policy applies to data processed by this website: the homepage, blog pages, mood pages and comment views, this page, all API routes, and the email subscription flow.

It does not cover third-party sites you reach through links here. Once you leave, their policies apply.

## What is collected

Depending on how you use the site:

- **What you give me.** If you subscribe to mood notifications: your email address, delivery preferences, timezone, and subscription settings. Nothing else on the site asks you for anything.
- **Request data.** Serving a page or an API route requires standard request metadata. It is used to deliver the response, apply rate limits, and block abuse.
- **Operational data.** Cloudflare processes request metadata, logs, and performance signals so the site stays up and failures can be debugged.
- **Blog reading analytics.** Blog articles send reading events to this site's own API — no third-party vendor. An event can include the post slug, visitor and session identifiers, dwell time, scroll depth, completion state, referrer, IP address, approximate location and network metadata derived by Cloudflare, language, browser, operating system, device type, and user agent.
- **Edge connection diagnostics.** The footer can show details about your own connection: the datacenter that served you, HTTP protocol, TLS version, round-trip time, approximate location, and network provider. These are computed per request, shown back only to you, and never stored.
- **Listening data.** The homepage listening card triggers server-side requests to Last.fm and Apple to fetch the most recent track, album metadata, artwork, and preview links.
- **Theme preference.** Stored in your browser's local storage. It never leaves your device.
- **Subscription state.** For mood subscriptions: status (pending, active, unsubscribed) and timestamps for creation, updates, confirmation, and the last notification sent. An email hash is stored alongside the address to index and deduplicate records.
- **Anti-abuse data.** When Turnstile guards the subscription form, verification involves a challenge token and the client IP address.
- **Public content requests.** Loading writing, project, and mood content involves requests to Ghost, GitHub, and Telegram-related sources.

## How it is used

- to host, render, and secure the site and its API routes;
- to remember your theme preference locally;
- to monitor performance and reliability;
- to understand which posts are read, for how long, and how readers arrive;
- to show you edge connection diagnostics when you hover the footer indicator;
- to load listening data from Last.fm and Apple;
- to load public content from Ghost, GitHub, and Telegram-related sources;
- to send confirmation emails and mood notifications you opted into;
- to honor unsubscribe requests; and
- to detect spam, scripted signups, and operational failures.

That is the full list. No data collected here feeds data brokerage or advertising profiles.

## Hosting and security

Public pages and API proxy routes run on Cloudflare Workers. Private API work — mood images, queue consumers, scheduled notifications — runs in a separate `site-api` service. Cloudflare processes request metadata, security signals, logs, and Worker observability data to serve the site, protect it, and investigate failures.

The footer's edge indicator calls this site's own `/api/edge` route, which reads Cloudflare's per-request connection properties and returns them to you. That response is never cached, logged, or retained.

## Blog reading analytics

Blog articles use first-party analytics served by this site's API. No third-party analytics script loads. A visitor identifier is kept in local storage and a session identifier in session storage so repeated events can be grouped without an account.

The server derives network and browser signals from the request: IP address, approximate Cloudflare location, network provider, user agent, language, browser, operating system, and device type. Events are retained while the feature is in use and reviewed. They are never sold and never used for advertising. You can clear the stored identifiers through your browser's storage controls at any time.

## Homepage listening card

The homepage calls `/api/listening` after load. It uses Last.fm as the source for recent listening activity, and Apple's music metadata endpoints to enrich the current track with album details, artwork, preview audio, and Apple Music links. Track lookup terms derived from the Last.fm result are sent to Apple; standard request metadata travels with those server-to-server calls as it would with any request.

## Email and anti-abuse

The mood subscription form may be protected by [Cloudflare Turnstile](https://www.cloudflare.com/application-services/products/turnstile/), which distinguishes visitors from bots. When it is active, your browser loads the Turnstile widget, the widget issues a verification token, and the subscription request sends that token and your IP address to Cloudflare for verification. That data is used for security only.

Confirmation and notification emails are delivered through Resend. Cloudflare also provides the data infrastructure behind mood notifications.

## Third-party content sources

- **Last.fm** — recent listening status and track data.
- **Apple** — track metadata, artwork, preview audio, and Apple Music links.
- **Ghost** — writing links and post metadata.
- **GitHub** — repository data, project metadata, and the contributions graph, via this site's own API route. A fallback contributions API is used only when the GitHub GraphQL lookup is unavailable.
- **Telegram-related sources** — mood content and comment threads.

Depending on the page, these run server-side or from your browser.

## Who receives data

Only what is needed to run the site:

- **Cloudflare** — hosting, anti-abuse verification, observability, notification infrastructure.
- **Resend** — email delivery for mood subscriptions.
- **Last.fm and Apple** — listening data and music metadata.
- **Ghost, GitHub, and Telegram-related services** — public content and metadata.

Personal data collected here is not sold, and subscription lists are never shared for anyone else's marketing.

## Retention

Data is kept only as long as it is useful for running the site, keeping it secure, and delivering features you opted into.

Some of it is short-lived: rate-limit state, your local theme setting, session identifiers in your browser. Blog analytics are retained while the feature remains useful. Subscription records are kept longer, since opt-in status, unsubscribe status, and delivery history are the point of them. Data held by Cloudflare, Resend, Ghost, GitHub, or Telegram-related sources also follows those providers' own retention practices.

## Your choices

- Browse the entire site without subscribing to anything.
- Choose your delivery frequency when you do subscribe.
- Unsubscribe from any subscription email, at any time.
- Request access, correction, or deletion of your subscription record at [me@buxx.me](mailto:me@buxx.me).
- Clear your theme preference and analytics identifiers through your browser's storage controls.

If Turnstile appears when you submit the subscription form, completing that check is part of subscribing.

## International processing

This site and its providers may process data in countries other than yours. Subscribing means accepting that your data is processed wherever the hosting, email, and anti-abuse providers operate.

## Changes

This policy will be updated when the subscription feature, the providers behind it, or legal requirements change. The date at the top of this page changes with it.

## Contact

Questions about this policy or how this site handles data: [me@buxx.me](mailto:me@buxx.me).
