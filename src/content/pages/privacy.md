---
title: Privacy Policy | Bunizao
description: Privacy Policy for this website, including hosting, analytics, content delivery, mood subscriptions, and third-party services such as Vercel.
updatedAt: March 8, 2026
---

# Privacy Policy

This Privacy Policy explains how this website collects, uses, and shares personal data. It applies to the site as a whole, including page visits, theme preferences, analytics and performance monitoring, public content loading, API access, and the mood subscription flow available from [/mood](/mood).

It also covers the infrastructure and services used to run the site, including Vercel for hosting and performance tooling, Cloudflare for anti-abuse checks and data infrastructure in the mood notification flow, and other third-party services used to load public content or deliver email.

## Scope

This policy covers personal data processed in connection with this website, including the homepage, mood pages, privacy page, API routes, mood comments views, and the optional email subscription feature.

It does not govern third-party websites, external links, or services you visit independently after leaving this site.

## Personal data we collect

Depending on how you use the site, we may collect or process the following categories of data:

- **Information you provide directly.** If you use the mood subscription form, this includes your email address, delivery preferences, timezone, and related subscription settings.
- **Technical and request data.** When you visit pages or call API routes, infrastructure and security systems may process request metadata needed to serve the site, operate rate limits, prevent abuse, and keep the service available.
- **Analytics and performance data.** The site uses Vercel tooling to measure traffic and page performance. That may involve usage and performance measurements associated with page loads and visits.
- **Theme preference data.** If you change the site theme, that preference is stored locally in your browser using local storage so the site can remember it later.
- **Subscription record metadata.** For mood subscriptions, this includes status fields such as pending, active, or unsubscribed, plus timestamps such as created, updated, confirmed, last confirmation sent, and last notification sent.
- **Security and anti-abuse data.** If Turnstile is enabled for the mood subscription flow, anti-bot verification data may include a challenge token and the client IP address used during verification.
- **Public-content request data.** The site loads or displays public content from services such as Ghost, GitHub, a GitHub contributions API, and Telegram-related sources, which may involve server-side or browser-side requests to those services.

For mood subscriptions, the site also maintains an email hash alongside the email address to index, deduplicate, and manage subscription records.

## How we use personal data

We use the data described above to operate and improve the site, including to:

- host, render, and secure the website and its API routes;
- remember your local theme preference;
- measure traffic, page performance, and reliability;
- load public content from connected sources such as Ghost, GitHub, and Telegram-related data;
- send subscription confirmation emails and mood notifications if you opt in;
- honor unsubscribe requests and maintain subscription state; and
- detect abuse, spam, scripted signups, and operational failures.

We do not use personal data collected through this site for data brokerage or unrelated advertising profiles.

## Vercel, analytics, and performance

This site is hosted on Vercel and uses Vercel tooling for analytics and performance monitoring, including Vercel Analytics and Vercel Speed Insights.

Vercel may process standard request metadata, usage information, and performance measurements needed to serve the site, analyze traffic, and understand how pages perform in real use.

## Cloudflare, email delivery, and anti-abuse

The mood subscription form may use [Cloudflare Turnstile](https://www.cloudflare.com/application-services/products/turnstile/) to help distinguish legitimate visitors from bots and protect the subscribe endpoint from abuse.

- your browser may load the Turnstile widget from Cloudflare;
- the widget may issue a verification token associated with the challenge;
- the subscription request may include that token, and the server may send it to Cloudflare for verification;
- the server may also send the client IP address to Cloudflare as part of that verification request; and
- confirmation and notification emails for mood subscriptions are sent through Resend.

Cloudflare may also support data infrastructure used for the mood notification feature. Turnstile verification is used only for security and anti-abuse purposes in that flow.

## Content and third-party data sources

The site also relies on third-party services to load public content and metadata, including:

- **Ghost.** Used to display writing links and post metadata.
- **GitHub.** Used to display repository data and related project metadata.
- **GitHub contributions API.** Used on the homepage to display the GitHub contributions graph.
- **Telegram-related sources.** Used to fetch and display mood content and comment threads.

Depending on the page and feature you use, requests associated with delivering that content may involve those services directly or through this site's server-side integrations.

## How we share personal data

We share personal data only where reasonably necessary to operate the site and its features:

- **Vercel.** Hosting, analytics, and performance monitoring.
- **Cloudflare.** Anti-abuse verification and mood notification infrastructure.
- **Resend.** Email delivery for mood subscriptions.
- **Ghost, GitHub, and Telegram-related services.** Public content and metadata sources.

We do not sell personal data collected through this site, and we do not share subscription lists with third parties for their own direct marketing.

## Retention

We retain data for as long as reasonably necessary to operate the site, maintain security, understand performance, and provide optional features such as mood subscriptions.

Some data is short-lived, such as temporary rate-limit state or local theme settings stored in your browser. Subscription records may be retained longer to maintain opt-in status, unsubscribe status, and delivery history. Data handled by Vercel, Cloudflare, Resend, Ghost, GitHub, Telegram-related sources, or other providers is also subject to those providers' own retention practices.

## Your choices

You have several choices in relation to this site:

- you can browse the site without subscribing to mood notifications;
- you can choose your preferred delivery frequency;
- you can unsubscribe at any time using the unsubscribe link in subscription emails; and
- you can request access, correction, or deletion related to your subscription record by contacting [me@buxx.me](mailto:me@buxx.me).

You can also clear locally stored theme preferences through your browser storage controls. If Turnstile is required when you submit the subscription form, completing the anti-bot check is part of that process.

## International processing

The site and its service providers may process data in countries other than the one where you are located. By using the subscription feature, you understand that your data may be processed where the site infrastructure, email provider, or anti-abuse provider operates.

## Changes to this policy

This policy may be updated from time to time to reflect changes in the subscription feature, service providers, or legal requirements. When that happens, the date at the top of this page will be updated.

## Contact

If you have questions about this Privacy Policy or this site's data practices, contact [me@buxx.me](mailto:me@buxx.me).
