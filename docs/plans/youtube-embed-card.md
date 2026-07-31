# YouTube embed card

**Scope.** Replace the generic bookmark card YouTube links currently get with a
card we own: our poster, our play button, our type. Playable in place where
YouTube is reachable, gracefully external where it is not.

**Depends on.** [static-proxy-hardening.md](static-proxy-hardening.md) — the
poster needs `i.ytimg.com` proxied, which must not happen before signing lands.
[blog-directive-registry.md](blog-directive-registry.md) for the blog side; the
mood side is independent.
**Blocks.** Nothing.
**Repos.** `site`.

---

## Investigation results (done; act on these, do not re-research)

- **`modestbranding` is dead.** Deprecated and non-functional since
  **2023-08-15**. YouTube now picks its branding treatment from player size,
  `controls`, and other signals. Most advice online predates this.
- **`rel=0` does not disable related videos.** Since 2018-09-25 it only
  restricts them to the same channel.
- **`showinfo`, `autohide`, `theme`** are removed.
- **`controls=0` still works**, and with `enablejsapi=1` + `origin` the IFrame
  Player API (`playVideo`, `pauseVideo`, `seekTo`, `getDuration`,
  `getCurrentTime`, `getPlayerState`, `onReady`) drives playback from our UI.
- **Custom controls are permitted.** Developer policies allow overlays for
  playback controls so long as they do not conflict with YouTube player UI
  elements. **Restricting or obscuring ads is not permitted.**
- **Minimum viewport 200×200**; ≥480×270 recommended for 16:9.

## Ads: the honest position

**We cannot serve ad-free YouTube playback.** The developer policies forbid
blocking or obscuring ads, and there is no parameter that disables them. The
only approaches that produce ad-free YouTube are stream extraction —
Invidious, Piped, NewPipe — which means becoming a video proxy, which is
explicitly ruled out, and which is empirically unsustainable: YouTube's
counter-measures have reduced Invidious to roughly three surviving public
instances.

What the facade *does* buy, and it is not nothing:

- **No ads, no YouTube JS, no YouTube cookies until the reader clicks.** A
  reader who scrolls past a video is never touched by any of it. Today's embeds
  load all of it on page load.
- Every pixel before the click is ours.

If ad-free matters more than YouTube specifically, the honest options are to
link out instead of embedding, or — for our own footage — host it in R2 and use
the native player. Neither is a YouTube feature we can switch on.

## Design

### 1. Facade first, no country split

Most of the ugliness is the **pre-play** state: the oversized red play button,
the title bar overlay, share/watch-later chrome, and the related-video grid on
pause. Our own poster + play button + duration + channel removes all of it, at
zero ToS risk, and is a large perf win.

**No `cf.country` branch.** Blog posts are prerendered (`getStaticPaths`), so
country is not available at build time; and a geo guess is wrong for VPN users,
corporate firewalls, and readers in restricted networks who *do* have working
proxies. Probe capability instead of guessing location:

1. Click → insert the iframe with `enablejsapi=1`, keep the facade visible
   underneath.
2. Wait for the IFrame API's `onReady`. If it fires, reveal the player.
3. If it has not fired after ~5 s, YouTube is unreachable from this client.
   Leave the facade in place and switch its action to "open on YouTube".
4. Cache the verdict in `sessionStorage` so later cards on the page skip the
   probe.

Use a generous timeout and make the fallback non-destructive — a slow connection
must degrade to "open externally", never to an error state.

### 2. Poster via the static proxy, not R2

A YouTube thumbnail is not our content. Storing it in R2 would mean holding
someone else's bytes indefinitely, serving a stale poster after the video
changes, and paying operational weight (backfill, key scheme, write-back) for a
passthrough. The proxy is the right tool for third-party assets that must stay
ephemeral — same category as og:images and custom emoji.

- `https://i.ytimg.com/vi/{id}/maxresdefault.jpg`, falling back to
  `hqdefault.jpg` (not every video has maxres), minted through the **signed**
  static proxy.
- The fallback cannot be an `onerror` handler. A missing `maxresdefault.jpg`
  returns **HTTP 200** with a 120×90 grey placeholder, so `onerror` never fires
  (verified: `aqz-KE-bpKQ` → 1278×720, `jNQXAC9IVRw` → 120×90). Detect it by
  `naturalWidth <= 120` on `load`, or resolve server-side.
- Add `i.ytimg.com` to the proxy's host allowlist. Safe **only once signing is
  enforced** — see the hardening plan.
- Note: mood post 2853's stored `link_previews` has
  `photo: [{width:100,height:100}]` with **no URL**. Do not try to use stored
  preview photos; derive the poster URL from the video id, which we always have.

### 3. Shared markup

`src/lib/embed/youtube.ts`, framework-free, mirroring `src/lib/listening/`:
markup builder + controller, consumed by

- the blog directive `[!youtube id=... start=...]`, and
- mood's `mood/shared/feed-media.ts` `renderLinkPreview`, which currently emits
  a generic bookmark card for the 9 YouTube link-preview posts.

Styles alongside, in the `src/styles/listening.css` idiom. Reference
implementation for the facade pattern: `lite-youtube-embed` (Paul Irish) — read
it for the click-to-load and poster-sizing details, do not vendor it.

### 4. Livestreams

The oEmbed endpoint returns **200 for livestreams** — it does not flag them.
Detection needs the Data API `liveStreamingDetails` (API key + quota). Since the
card is a facade, a livestream degrades to a card with a LIVE badge. **Do not
build live detection.** If the badge matters later, that is when the API key
question gets asked.

### 5. Deferred: custom in-play controls

`controls=0` + IFrame API. Only after the facade ships and you can judge whether
in-play chrome still bothers you. The controls are easy; the cost is **ads** —
during a pre-roll, `getPlayerState()` and `getCurrentTime()` describe the ad,
not the video, so a custom progress bar lies and a custom play button fights the
ad UI. YouTube's branding treatment also changes under `controls=0` (expect a
larger watermark).

## Acceptance

- A YouTube link in a mood post renders the new card, not a bookmark card.
- `[!youtube id=...]` renders the same card in a blog post.
- Poster loads through the signed static proxy, with `hqdefault` fallback.
- Click plays in place where YouTube is reachable.
- With YouTube unreachable, the card stays and offers an external open — no
  spinner, no black box, no console error storm.
- Card ≥480×270 at desktop widths, never below 200×200.

## Non-goals

- Proxying video streams. Settled.
- Blocking ads. Not possible within the policies; see above.
- Storing posters in R2.
- Live detection.
- A provider abstraction layer. Two providers is not a matrix; follow the
  `src/lib/listening/` pattern and stop there.

## Sources

- [YouTube Embedded Players and Player Parameters](https://developers.google.com/youtube/player_parameters)
- [YouTube Player API Reference for iframe Embeds](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube API Services — Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube API Services — Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
