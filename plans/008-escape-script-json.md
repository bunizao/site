# Plan 008: Escape JSON embedded in script elements

> **Executor instructions**: Follow every step and verification gate. Keep the
> fix small and shared; do not redesign feed hydration or SEO. Stop on any STOP
> condition. Update `plans/README.md` when complete unless a reviewer owns it.
>
> **Drift check (run first)**:
> `git diff --stat 4b575c2a..HEAD -- src/features/mood/ui/FeedShell.astro src/features/mood/ui/HomePreview.astro src/layouts/Layout.astro src/features/logos/ui/AnimatedLogo.astro src/lib tests/unit`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: `site` commit `4b575c2a`, 2026-07-13
- **Issue repository**: `bunizao/site` (PUBLIC; publish only after explicit acknowledgement)
- **Issue**: https://github.com/bunizao/site/issues/75

## Why this matters

Three Astro templates put `JSON.stringify()` output directly into a `<script>`
element through `set:html`. HTML parsing recognizes a script-closing sequence
inside JSON strings before JavaScript or JSON parsing occurs, so Telegram/Ghost
content can truncate the data block, corrupt the DOM, and potentially create an
injection surface. CSP reduces some execution impact but does not make raw script
element serialization correct.

## Current state

- `FeedShell.astro:320` embeds the initial Mood feed payload
  (`<script is:inline type="application/json" data-mood-initial-feed set:html={JSON.stringify(initialFeedPayload)}>`).
- `HomePreview.astro:38` embeds homepage Mood posts
  (`set:html={JSON.stringify(initialPosts.slice(0, INITIAL_POST_COUNT))}`).
- `Layout.astro` embeds JSON-LD items (search `JSON.stringify` in the file).
- (Line numbers re-verified 2026-07-19 at commit `da8c4747`; the original
  2026-07-13 references drifted but all three sinks remain as described.)
- `AnimatedLogo.astro:97` is the existing safe exemplar:

  ```ts
  const animationsJson = JSON.stringify(animations).replace(/</g, '\\u003c');
  ```

The fix must preserve valid JSON. HTML entity escaping is wrong here because the
client reads script text and calls `JSON.parse()`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Target tests | `bun test tests/unit/serialize-script-json.test.ts` | all pass |
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| Build | `GHOST_MOCK_CONTENT=1 bun run build` | exit 0 |

## Scope

**In scope**:

- `src/features/mood/ui/FeedShell.astro`
- `src/features/mood/ui/HomePreview.astro`
- `src/layouts/Layout.astro`
- `src/lib/serialize-script-json.ts` (create; one small function)
- `tests/unit/serialize-script-json.test.ts` (create)

**Out of scope**:

- Feed payload shape, hydration timing, or renderer parity.
- CSP policy or nonce infrastructure.
- HTML serializers used outside script elements.
- JSON returned with `application/json` response bodies.
- Refactoring the already-safe AnimatedLogo implementation unless required to
  eliminate duplicate helper logic and covered by the same test.

## Git workflow

- Branch: `advisor/008-script-json-escaping`.
- Conventional Commit: `fix(security): escape embedded script json`.
- Do not deploy or push unless instructed.

## Steps

### Step 1: Add one script-safe JSON serializer

Create `serializeScriptJson(value: unknown): string`. It must call
`JSON.stringify()` and replace `<` with its JSON Unicode escape (`\\u003c`). It
may also escape U+2028/U+2029 if tests demonstrate a supported browser/parser
need, but do not introduce a serialization dependency.

Document in an English comment that this prevents HTML script-element
termination while preserving JSON parseability.

**Verify**: targeted tests prove normal nested objects round-trip through
`JSON.parse()`.

### Step 2: Cover hostile parser-boundary strings

Test strings containing mixed-case script-closing text, angle brackets, HTML
comment markers, quotes, ampersands, and non-ASCII text. The serialized output
must contain no literal `<`, must remain valid JSON, and must round-trip exactly.
Do not include a runnable browser exploit payload in comments or issue prose.

**Verify**: `bun test tests/unit/serialize-script-json.test.ts` -> all pass.

### Step 3: Replace the three unsafe sinks

Import the helper in both Mood templates and `Layout.astro`. Compute values in
frontmatter where that keeps templates readable, then pass the safe string to
`set:html`. Do not entity-escape it and do not double-stringify it.

**Verify**: repository search for
`set:html={JSON.stringify` returns no matches in `src/`.

### Step 4: Build and inspect generated HTML

Build with mock Ghost content. Add or use a fixture containing a harmless
script-closing marker and inspect the generated HTML/script text. The marker
must appear escaped and client-side JSON parsing must still work.

**Verify**: `GHOST_MOCK_CONTENT=1 bun run build` -> exit 0; targeted unit and
existing Mood initial-feed tests pass.

## Test plan

- New pure unit tests for round-trip serialization and absence of literal `<`.
- A template/source assertion that all three known sinks use the helper.
- Existing `tests/unit/mood-initial-feed.test.ts` remains green.
- Existing JSON-LD metadata tests remain green if present; otherwise inspect one
  built page containing JSON-LD.

## Done criteria

- [ ] All known inline JSON script sinks use one safe serializer.
- [ ] Serialized output contains no literal `<` and round-trips exactly.
- [ ] `rg 'set:html=\{JSON\.stringify' src` returns no matches.
- [ ] Target tests, full unit tests, check, and build pass.
- [ ] No unrelated CSP, feed, SEO, or rendering behavior changed.

## STOP conditions

- Astro transforms the helper output so it is double-escaped in built HTML.
- A consumer expects HTML entities rather than raw script text.
- Fixing the sink requires changing the payload contract.
- In-scope templates drifted semantically since the planned commit.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Use `serializeScriptJson()` for future `set:html` script data. Do not use it for
normal JSON HTTP responses or HTML text nodes; those have different escaping
contracts.
