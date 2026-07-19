# Mood Read-Path Rollout

The default server-side source is the D1 archive (`MOOD_READ_SOURCE=archive`).
The live Telegram reader remains the fallback, and client-side hydration owns
comments and reactions that must stay fresh.

## Parity Checklist

Verify both `?source=archive` and `?source=live` before enabling the default:

- Feed order and anchor windows (`/mood?N&source=archive`)
- Text and rich text entities
- Photos, galleries, videos, stickers, audio, documents, locations, polls, and link previews
- Forwarded posts and reply quotes
- Detail page body and media (`/mood/<id>?source=archive`)
- Visible live comment counts and reactions
- RSS output remains unchanged

## Rollback

Set `MOOD_READ_SOURCE=live` and deploy the public Worker. No data migration or
code revert is required.

## Production Verification — 2026-07-11

- `site` commit: `0c7485d9`; Worker version: `f3a5cb70-c994-42d6-b400-466c5a57f602`.
- `site-api` commit: `e143045`; Worker version: `0cbf40ad-e124-42a3-9b43-3fb71c2f0e7d`.
- Live and archive first-page IDs match exactly after tombstoning deleted Telegram posts `3624–3640`.
- `/mood?3621` and `/mood?3623` both returned `x-buxx-mood-page-cache: HIT`; observed warm TTFB was `0.30–0.33 s`.
- Cache-bypassed TTFB was `0.53 s` for `/mood?3621`, `0.80 s` for `/mood`, and `0.32 s` for `/mood/3646`.
- Production browser smoke passed for privacy, blog, projects, both anchor URLs, and mood detail; all used Tailwind Preflight and archive mood reads without page errors.
- Live count hydration returned current reaction data for visible archive posts.
- Lighthouse `/mood`: performance `93`, accessibility `100`, FCP `2.1 s`, LCP `2.9 s`, TBT `43 ms`, CLS `0.005`.
- Lighthouse performance gates passed on home, mood, and blog. The workflow reopened issue `#24` only because all three pages scored `75` on the separate Best Practices gate.
