# Office Assets Worker TODO

## Goal

Move the current `/office` asset compatibility layer from in-memory storage to a production-ready Worker-backed system using:

- Cloudflare Worker
- Cloudflare R2
- Cloudflare D1

This should replace the temporary browser/runtime compatibility storage currently used by the Star Office runtime bridge.

## Current State

Current `/office` asset editing is not production-persistent.

Today:

- uploaded asset bytes are stored in process memory
- favorites are stored in process memory
- Gemini config is stored in process memory
- asset positions/defaults are stored in process memory
- runtime static asset overrides are served through Astro routes

Current implementation references:

- `src/lib/office-drawer-store.ts`
- `src/pages/assets/*`
- `src/pages/config/gemini.ts`
- `src/pages/office-runtime/static/[...path].ts`
- `public/office-runtime/index.html`

## Target Architecture

### Binary storage

Use R2 for:

- uploaded asset overrides
- generated room backgrounds
- saved home favorites
- backup and previous-version snapshots

Suggested key layout:

- `office-assets/{roomId}/{assetPath}/{versionId}`
- `office-generated/{roomId}/{timestamp}.webp`
- `office-favorites/{roomId}/{favoriteId}.webp`

### Metadata storage

Use D1 for:

- asset version pointers
- asset position overrides
- asset default overrides
- home favorites metadata
- join keys
- guest auth lifecycle
- Gemini config metadata or encrypted references

## Worker Scope

Create or extend a dedicated Worker for office asset operations.

Recommended responsibilities:

- validate write requests
- write binaries to R2
- update metadata in D1
- serve current asset versions
- manage favorites and restore flows
- manage Gemini config references

Do not keep asset state in Vercel server memory once this migration is complete.

## API TODO

### Asset auth

- [x] Define authentication model for office asset editing
- [x] Replace temporary `/assets/auth` behavior with Worker-backed auth
- [x] Replace temporary `/assets/auth/status` behavior with Worker-backed auth status
- [x] Decide whether auth is room-scoped, user-scoped, or token-scoped

### Asset list

- [x] Add Worker route for `GET /assets/list`
- [ ] Return canonical list of editable runtime assets
- [ ] Include width, height, ext, and metadata when available

### Asset upload

- [x] Add Worker route for `POST /assets/upload`
- [x] Upload new asset bytes to R2
- [x] Preserve previous version pointer
- [x] Preserve default version pointer on first override
- [ ] Return original runtime-compatible response shape

### Restore flows

- [x] Add Worker route for `POST /assets/restore-default`
- [x] Add Worker route for `POST /assets/restore-prev`
- [x] Update current version pointer in D1 instead of mutating local files
- [ ] Keep response fields compatible with original frontend expectations

### Positions and defaults

- [x] Add Worker route for `GET /assets/positions`
- [x] Add Worker route for `POST /assets/positions`
- [x] Add Worker route for `GET /assets/defaults`
- [x] Add Worker route for `POST /assets/defaults`
- [x] Store these values in D1, keyed by `room_id + asset_key`

### Favorites

- [x] Add Worker route for `GET /assets/home-favorites/list`
- [x] Add Worker route for `POST /assets/home-favorites/save-current`
- [x] Add Worker route for `POST /assets/home-favorites/apply`
- [x] Add Worker route for `POST /assets/home-favorites/delete`
- [x] Store favorite image binaries in R2
- [x] Store favorite metadata in D1

### Gemini config

- [x] Add Worker route for `GET /config/gemini`
- [x] Add Worker route for `POST /config/gemini`
- [x] Decide whether API keys are stored as Worker secrets, encrypted D1 rows, or external secret manager references
- [ ] Do not leave Gemini keys in process memory

### Background generation

- [ ] Add Worker route for `POST /assets/generate-rpg-background`
- [ ] Add Worker route for `GET /assets/generate-rpg-background/poll`
- [ ] Add Worker route for `POST /assets/restore-reference-background`
- [ ] Add Worker route for `POST /assets/restore-last-generated-background`
- [ ] Persist generated backgrounds to R2
- [ ] Persist generation history metadata to D1

## Data Model TODO

### Table: `office_asset_versions`

- [ ] `room_id`
- [ ] `asset_path`
- [ ] `version_id`
- [ ] `r2_key`
- [ ] `kind` (`default`, `current`, `previous`, `generated`, `favorite`)
- [ ] `created_at`

### Table: `office_asset_state`

- [ ] `room_id`
- [ ] `asset_path`
- [ ] `current_version_id`
- [ ] `default_version_id`
- [ ] `previous_version_id`
- [ ] `updated_at`

### Table: `office_asset_positions`

- [ ] `room_id`
- [ ] `asset_key`
- [ ] `x`
- [ ] `y`
- [ ] `scale`
- [ ] `updated_at`

### Table: `office_home_favorites`

- [ ] `room_id`
- [ ] `favorite_id`
- [ ] `r2_key`
- [ ] `created_at`

### Table: `office_join_keys`

- [ ] `room_id`
- [ ] `join_key`
- [ ] `max_concurrent`
- [ ] `expires_at`
- [ ] `enabled`

### Table: `office_guest_auth`

- [ ] `room_id`
- [ ] `agent_id`
- [ ] `join_key`
- [ ] `auth_status`
- [ ] `approved_at`
- [ ] `rejected_at`
- [ ] `expires_at`
- [ ] `last_push_at`

## Runtime Migration TODO

- [ ] Remove asset persistence logic from `src/lib/office-drawer-store.ts`
- [ ] Remove dynamic asset override serving from `src/pages/office-runtime/static/[...path].ts`
- [ ] Make the original runtime fetch assets from Worker-backed URLs
- [ ] Keep runtime request and response shapes compatible during migration

## Testing TODO

- [ ] Unit test Worker asset metadata handlers
- [ ] Unit test version pointer transitions on upload and restore
- [ ] E2E test `/office` drawer auth flow
- [ ] E2E test asset upload flow
- [ ] E2E test restore default flow
- [ ] E2E test restore previous flow
- [ ] E2E test favorites save/apply/delete flow
- [ ] E2E test Gemini config read/write flow
- [ ] E2E test generated background poll flow

## Acceptance Criteria

- [ ] Asset edits survive process restart
- [ ] Asset edits survive deploy
- [ ] Asset edits work across multiple instances
- [ ] Original Star Office drawer can load and mutate assets through Worker routes
- [ ] `bun run check` passes
- [ ] `bun run build` passes
- [ ] Relevant unit tests pass
- [ ] Relevant e2e tests pass
