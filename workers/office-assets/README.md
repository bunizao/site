# Office Assets Worker

Cloudflare Worker for `/office` asset persistence.

## Scope

This Worker serves:

- `/assets/*`
- `/config/gemini`
- `/office-runtime/static/*`

It stores:

- uploaded asset bytes in R2
- asset version pointers and metadata in D1
- favorites in R2 + D1
- Gemini config in D1

## Required bindings

- `OFFICE_ASSETS_BUCKET` (R2)
- `OFFICE_ASSETS_DB` (D1)

## Required vars

- `OFFICE_RUNTIME_STATIC_BASE_URL`
  Example: `https://buxx.me/office-runtime/static`

## Recommended secrets

- `OFFICE_ASSETS_AUTH_PASSWORD`
- `OFFICE_ASSETS_AUTH_SECRET`
- `OFFICE_GEMINI_ENCRYPTION_SECRET`

## Local setup

1. Create the D1 database and R2 bucket.
2. Apply [`schema.sql`](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/workers/office-assets/schema.sql).
3. Set the required vars and secrets in Wrangler.
4. Set `OFFICE_ASSETS_WORKER_URL` in the Astro site so `/assets/*` and `/office-runtime/static/*` proxy to this Worker.
