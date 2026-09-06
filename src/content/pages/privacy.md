---
title: Privacy Policy
description: How this website collects, uses, discloses, and retains personal data, including Cloudflare hosting, reading and playback analytics, YouTube embeds, edge diagnostics, listening cards, mood subscriptions, blog comments, and third-party services.
updatedAt: September 3, 2026
---

# Privacy Policy

This Privacy Policy describes how this website collects, uses, discloses, and retains personal data. It applies to the site as a whole — pages, blog articles, API routes, the homepage listening card, the comment thread under each blog post, and the optional mood subscription available at [/mood](/mood) — together with the infrastructure and service providers used to operate it.

> **Summary.** We do not sell personal data, share it with data brokers, or use it to build advertising profiles. No third-party analytics or advertising trackers are loaded as part of a normal page view. First-party reading and audio-playback analytics are sent only to this site's own API. Choosing to play an embedded YouTube video loads YouTube's third-party player. You provide information directly in two places only: the optional mood subscription, and the comment box under a blog post. Commenting requires a display name and the comment itself; an email address is optional there and buys a persistent identity rather than access. It is stored, but it never appears in a page or an API response — what readers see beside your comment is an avatar derived from a one-way hash of it. Comment submissions are checked for spam by Akismet.

## Scope

This policy covers personal data processed in connection with this website: the homepage, blog pages, blog comment threads and reactions, mood pages and comment views, this page, all API routes, and the optional email subscription feature.

It does not govern third-party websites or services you reach through links published here. Once you leave this site, the privacy practices of the destination apply.

## Data we collect

Depending on how you use the site, we may collect or process the following categories of data.

- **Information you provide directly.** If you use the mood subscription form: your email address, delivery preferences, timezone, and related subscription settings. If you post a comment on a blog article: the display name you choose, the text of the comment, and, optionally, your email address and whether you want to be notified of replies. No other feature on the site requests information from you.
- **Blog comment data.** A published comment is stored with its text, display name, timestamps, and — where you supplied one — your email address and a hash of it. Each comment additionally carries anti-abuse signals derived from the request: a keyed hash of your IP address rather than the address itself, a keyed device fingerprint hash, the user agent, and the country and network provider Cloudflare reports. Reactions are stored with a keyed identity value rather than an identifying one.
- **Technical and request data.** Serving a page or an API route requires standard request metadata. It is processed to deliver the response, enforce rate limits, and prevent abuse.
- **Operational and performance data.** Cloudflare processes request metadata, logs, and performance signals necessary to serve the site, maintain availability, and diagnose failures.
- **Blog reading analytics.** Blog article pages send first-party reading events to this site's own API; no third-party analytics vendor is loaded. These events may include the post slug, event, visitor and session identifiers, dwell time, scroll depth, completion state, referrer, IP address, approximate location and network metadata derived by Cloudflare, language, browser, operating system, device type, and user agent.
- **Listening playback analytics.** Listening cards send first-party playback events to this site's own API when you interact with audio. These events may include the track identifier, title and artist; page path and surface; play requests, successful starts, pauses, seeks and completion; actual listening time, media position and duration; the same visitor and session identifiers used for blog reading analytics; and request-derived IP address, approximate location, referrer, language, browser, operating system, device type, and user agent.
- **Edge connection diagnostics.** The footer can display attributes of your current connection derived by Cloudflare from your request: the serving datacenter, HTTP protocol, TLS version, TCP round-trip time, approximate location, and network or internet provider. These values are computed per request, returned only to you, and are not stored.
- **Listening feature request data.** The homepage listening card triggers server-side requests to Last.fm and Apple services to retrieve the most recent track, album metadata, artwork, preview URLs, and related listening status.
- **Theme preference data.** If you change the site theme, the preference is stored locally in your browser and is not transmitted to us.
- **YouTube embed preference data.** YouTube poster images and channel avatars are loaded through this site's static proxy. YouTube is not contacted by your browser unless you choose to play a video. After that choice, the browser stores a session-only reachability result so later video cards can use the same playback or external-link behavior.
- **Subscription record metadata.** For mood subscriptions: status fields such as pending, active, or unsubscribed, and timestamps for creation, update, confirmation, last confirmation sent, and last notification sent. An email hash is maintained alongside the address in order to index, deduplicate, and manage subscription records.
- **Security and anti-abuse data.** Where Turnstile is enabled for the mood subscription flow or for posting a comment or reaction, verification data may include a challenge token and the client IP address used during verification. Posting a comment additionally involves rate-limit state keyed to your anonymous session identifier, your IP address, and a fingerprint the server derives from your request.
- **Reader identity data.** If you verify your email address or sign in with GitHub or Google to manage your comments: a reader record holding a display name, a one-way hash of your email address, and, for a signed-in reader, the name, email address, and avatar image supplied by that provider.
- **Public-content request data.** Loading published writing, project, and mood content involves server-side or browser-side requests to Ghost, GitHub, a GitHub contributions fallback API, and Telegram-related sources.

## How we use data

We use the data described above to operate, secure, and maintain the site, specifically to:

- host, render, and secure the website and its API routes;
- retain your local theme preference;
- monitor performance and reliability;
- understand which articles are read, for how long, and how readers arrive;
- publish, thread, edit, and delete blog comments, and count reactions;
- screen comments for spam and abuse before they appear, including one automated check performed by a language model;
- send the one-time email that lets you confirm an address and manage the comments posted from it, and notify you of replies where you asked for that;
- understand which listening cards are played, whether playback starts, how long audio is heard, and whether a track is completed;
- display edge connection diagnostics when you hover or focus the footer indicator;
- retrieve and refresh listening data from Last.fm and Apple services;
- load a YouTube player only after you choose to play an embedded video;
- load public content from Ghost, GitHub, and Telegram-related sources;
- publish, display, edit, and remove blog comments, and check submissions for spam;
- send comment verification links and, where you have opted in, reply notifications;
- send confirmation emails and mood notifications where you have opted in;
- honor unsubscribe requests and maintain subscription state; and
- detect abuse, spam, scripted signups, scripted comment posting, and operational failures.

We do not use personal data collected through this site for data brokerage or for advertising profiles unrelated to these purposes.

## Hosting and security

Public pages and API proxy routes run on Cloudflare Workers. Private API operations — mood images, queue consumers, and scheduled notifications — run in a separate `site-api` service. Cloudflare processes standard request metadata, security signals, logs, and Worker observability data as necessary to serve the site, protect it from abuse, and investigate operational issues.

The footer includes an optional edge indicator. When hovered or focused, it calls this site's own `/api/edge` route, which reads Cloudflare's per-request connection properties and returns them to you. That response is never cached, logged, or retained.

## Blog comments and reactions

Comments under a blog post are anonymous-first: posting one needs a display name and an email address, and nothing else. There is no account to create and no verification step standing between you and the thread.

### What is public and what is not

The comment text and the display name you type are published on the page and returned by this site's public API. **Your email address is not.** It is stored server-side, and it never appears in a page, in an API response, or in the HTML of the confirmation page. What other readers see beside your comment is an avatar served from a one-way SHA-256 hash of the address — or, when no avatar exists for it, a pattern generated from that same hash. Nothing in that path lets a reader recover the address.

Reaction counts are public. Names and avatars are shown only for readers who have confirmed an address or signed in; an anonymous reaction is counted but attributed to nobody.

### What the address is used for

Three things, and nothing else: deriving the avatar described above, sending the one-time confirmation email that lets you claim and manage comments posted from that address, and — only if you asked for it and only after the address is confirmed — notifying you when someone replies. It is not added to any mailing list. Subscribing to posts or mood updates is a separate, explicit choice.

### Cookies and browser storage

Your first comment or reaction sets an anonymous identifier cookie, which is how the site recognises your own rows well enough to let you edit or delete them. Confirming an address or signing in replaces it with a reader session cookie. Neither is used for advertising or shared with anyone.

Your browser also keeps, locally and never transmitted on its own: the display name and address you last commented with, so the box is not empty next time, and an unsent draft, so a closed tab does not lose what you were writing. Clearing site data removes all of it.

### Anti-abuse and moderation

Every submission passes a risk stack before it is published. In order: a Cloudflare Turnstile check; a hidden honeypot field, a minimum time-on-form check, and a duplicate-body check; heuristics that inspect the email domain, the wording, and the number of links; and durable rate limits keyed to your anonymous session, your IP address, and a fingerprint derived from your request.

A submission that clears those is then sent to an external language-model provider for a moderation verdict, together with the title and excerpt of the post it was written under. The model returns publish, hold, or reject; anything else, including any error, holds the comment. A held comment is visible only to the person who wrote it and to the site owner. An edited comment is checked again the same way.

### Signing in

Confirming your address, or signing in with GitHub or Google, creates a reader record so the same identity follows you across devices. For GitHub and Google that record holds the name, email address, and avatar image those providers return for you. Signing in is optional; every part of the thread works without it.

### Editing and deleting

You can edit your own comment for fifteen minutes after posting, and delete it at any time. Deleting removes the text and the display name. Where a published reply still hangs underneath, the row itself remains as an empty placeholder so the reply it answers is not orphaned.

There is no self-service control that erases a reader identity in one action. To have a reader record and the comments attached to it removed, write to [me@buxx.me](mailto:me@buxx.me). The name, address, and draft your own browser is holding are cleared by clearing site data, which happens on your device and does not need us.

## Blog reading analytics

Blog article pages use first-party analytics served by this site's own API. No third-party analytics script is loaded. A visitor identifier is stored in local storage and a session identifier in session storage so that repeated events can be grouped without requiring an account.

The server derives network and browser signals from the request, including IP address, approximate Cloudflare location metadata, ASN or network provider metadata, user agent, language, browser, operating system, and device type. Events may be retained while the analytics feature remains in operation and under review. They are not sold and are not used for unrelated advertising profiles. You may clear the browser-stored visitor and session identifiers through your browser's storage controls at any time.

## Blog comments

Blog articles may carry a comment thread. Reading one requires nothing from you. Posting requires a display name and the comment text; an email address is optional, and supplying one is what allows you to edit or delete your own comment afterwards, receive replies, and keep a consistent avatar. A comment posted without an address is published normally but cannot later be claimed, edited, or deleted by you.

Where you supply an address, a one-time confirmation link is emailed to it through Resend. Confirming it signs in the browser that opened it and enables reply notifications, which you can turn off from any such email. An address that is never confirmed is removed.

Every submission is sent to [Akismet](https://akismet.com/), operated by Automattic, to be checked for spam. That check transmits the comment text, the display name, the email address where one was supplied, your IP address, user agent, referrer, and the address of the post being commented on. A comment identified as spam is withheld from the thread rather than published.

Avatars are resolved by this site's server, not by your browser. For an address at `qq.com`, the numeric part of that address is sent to QQ's avatar endpoint; for any other address, a hash of it is sent to Gravatar's mirror hosts. The resulting image is cached on this site's own storage, so your browser never contacts either service and no further lookup is made once an avatar is held.

Comment submissions and reactions are protected by Cloudflare Turnstile in the same manner as the subscription form. Two cookies support the feature: one recording a confirmed identity, retained for 180 days, and one anonymous identifier minted the first time you comment or react, retained for 365 days. Both are restricted to this site and are not readable by scripts.

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

The mood subscription form, the comment box, and the reaction control may be protected by [Cloudflare Turnstile](https://www.cloudflare.com/application-services/products/turnstile/) in order to distinguish legitimate visitors from automated traffic. Where it is active, your browser loads the Turnstile widget, the widget issues a verification token, and the subscription request transmits that token together with the client IP address to Cloudflare for verification. This data is processed for security and anti-abuse purposes only.

Confirmation and notification emails — for mood subscriptions, and for confirming the address behind a comment — are delivered through Resend. Cloudflare additionally provides the data infrastructure supporting the mood notification and comment features.

## Third-party content sources

The site relies on the following third-party services to load public content and metadata:

- **Last.fm** — recent listening status and track data.
- **Apple services** — track metadata, artwork, preview audio, and Apple Music links.
- **Ghost** — writing links and post metadata.
- **GitHub** — repository data, project metadata, and the homepage contributions graph, retrieved through this site's internal API route. A fallback contributions API is used only where the GitHub GraphQL lookup is unavailable.
- **Telegram-related sources** — mood content and mood comment threads. Where a mood post's comment thread is bridged (see below), a comment you post on the site is also sent to Telegram, and Telegram sources are read back to show replies posted there.
- **GitHub and Google (OAuth)** — optional reader sign-in for blog comments. Contacted only when you choose to sign in with one of them.
- **A language-model provider** — automated moderation of a submitted blog comment. The provider is configured server-side and is currently an OpenAI-compatible endpoint.
- **YouTube** — video playback after you choose to activate an embedded player; poster images and channel avatars are fetched server-side through this site's static proxy.

Depending on the page and feature in use, the associated requests may be made server-side or directly from your browser.

## Disclosure to service providers

We disclose personal data only where reasonably necessary to operate the site and its features:

- **Cloudflare** — hosting, anti-abuse verification, operational observability, and mood notification infrastructure.
- **Resend** — email delivery for mood subscriptions, comment confirmation links, and comment reply notifications.
- **Akismet (Automattic)** — spam checking of blog comment submissions.
- **Gravatar and QQ** — avatar images, looked up server-side by email hash.
- **Last.fm and Apple services** — listening data and music metadata.
- **Ghost, GitHub, Telegram-related services, and YouTube** — public content, metadata, and optional video playback. Where a mood post's comment thread is bridged, this also means your display name and the comment text you post are sent to that post's Telegram discussion group.
- **GitHub and Google** — optional reader sign-in, where you choose it.
- **A language-model provider** — the text of a submitted comment, together with the title and excerpt of the post it was written under, for a moderation verdict. The address behind the comment is never sent.

We do not sell personal data collected through this site, and we do not share subscription lists with third parties for their own direct marketing.

## Retention

We retain data for as long as reasonably necessary to operate the site, maintain security, assess performance, and provide optional features such as mood subscriptions.

Certain data is short-lived, including temporary rate-limit state, local theme settings, the session-only YouTube reachability result, and session identifiers stored in your browser. Blog reading and listening playback analytics may be retained while the features remain useful for understanding readership, audio engagement, and site operation. Published comments are retained until you or we remove them. The anti-abuse signals attached to a comment — the hashed IP address, the fingerprint hash, the user agent, the country, and the network provider — are erased from it 90 days after it was posted, leaving the comment itself intact. An email address supplied with a comment but never confirmed is removed after 7 days. Subscription records may be retained longer in order to maintain opt-in status, unsubscribe status, and delivery history. When you delete your record from [/subscribe/manage](/subscribe/manage), the current subscription generation and every safely attributable delivery, tracking, and audit row are removed; an older row whose ownership is ambiguous after an address is reused is retained rather than risking another subscriber's data. A single receipt recording that a deletion happened also survives, keyed so that it cannot be traced back to an address. Data held by Cloudflare, Resend, Ghost, GitHub, Telegram-related sources, YouTube, or other providers is additionally subject to those providers' own retention practices.

## Your rights and choices

You may:

- browse the site in full without subscribing to any feature, and read every comment thread without identifying yourself;
- comment without providing an email address, and read any thread without providing anything;
- edit your own comment within 15 minutes of posting, and delete it at any time thereafter, provided you confirmed the address you posted with. A comment posted without an address cannot be verified as yours, so removal requests for one go to the address below;
- ask for a reader record and the comments attached to it to be removed, by writing to [me@buxx.me](mailto:me@buxx.me);
- select your preferred notification delivery frequency;
- unsubscribe at any time using the link included in every subscription email;
- change the address on your subscription, or delete your record outright, from [/subscribe/manage](/subscribe/manage). Deleting removes your email address, subscription settings, delivery history, newsletter open/click data, and safely attributable audit entries from the database; an older row whose ownership is ambiguous after an address is reused is retained rather than risking another subscriber's data. Opening the emailed link only shows a preview, and the deletion takes effect after you confirm it in your browser. It cannot be undone;
- request access to or correction of your subscription record by contacting [me@buxx.me](mailto:me@buxx.me); and
- clear locally stored theme preferences, analytics identifiers, and the saved comment name, address, and draft through your browser's storage controls.

Where Turnstile is required on submission of the subscription form or the comment box, completing the verification is a necessary part of subscribing or posting. It is normally invisible and asks nothing of you.

## International transfers

This site and its service providers may process data in countries other than the one in which you are located. By using the subscription feature, you acknowledge that your data may be processed wherever the hosting, email delivery, and anti-abuse providers operate.

## Changes to this policy

We may update this policy from time to time to reflect changes in the subscription and comment features, our service providers, or applicable legal requirements. Where we do, the date shown at the top of this page will be updated accordingly.

## Contact

For questions regarding this Privacy Policy or this site's data practices, contact [me@buxx.me](mailto:me@buxx.me).
