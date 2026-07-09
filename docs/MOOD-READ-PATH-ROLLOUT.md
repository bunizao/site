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
