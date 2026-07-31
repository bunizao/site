# Blog authorship credits

**Scope.** Let a post declare its model co-authors in the footer, in place of the
human-authorship pledge, without either claim ever being guesswork.

**Depends on.** [blog-directive-registry.md](blog-directive-registry.md)
(`kind: 'meta'`).
**Blocks.** Nothing.
**Repos.** `site`.

**Implementation status.** Registry, `[!authors]` carrier, attribute validation,
credit UI, and both footer states are implemented and tested. Remaining: wire
`transformPostDirectives` into `content.ts` so `Post` carries `meta`, then pass it
to `readAuthorshipCredits` in `[slug].astro` (it reads `{}` today, so every post
renders the pledge).

---

## Carrier

Internal tags are rejected: a tag is a slug, cannot carry structure, and
`#co-author-by-claude-opus-4-6` pollutes the tag archive.

- **Human co-authors → Ghost native `authors[]`.** The Content API already
  returns it, and `posts/adapter/ghost/dataset.ts` already normalizes the array
  into `authors` plus `primaryAuthor`. Ghost gives names, not roles — there is no
  division-of-labour vocabulary for people, and inventing one would fabricate
  data the byline already covers.
- **Model co-authors → `[!authors]` meta directive** in the post body:

```
[!authors ai="anthropic/claude-opus-4-6" note="produced the first draft and translated this post from Chinese"]
[!authors ai="openai/gpt-5"]
```

Body rather than `codeinjection_head` because it is visible while writing.
`kind: 'meta'` — hoisted and stripped from prose, RSS, excerpt, and agent
markdown. Multiple credits per post; repeated `ai` values merge into one line,
their notes joined in written order.

Two attributes only:

- `ai` — **required**, `provider/model`. Model ids are only unique within a
  provider, so the provider is part of the reference rather than something we
  guess.
- `note` — optional, ≤160 chars, one clause completing "<model> ___".

## Registry

`src/data/authorship.ts` resolves `provider/model` to display names from
`src/data/generated/model-registry.json`, a snapshot of
[models.dev](https://github.com/sst/models.dev) written by `bun run sync:models`.
Nothing here is hand-maintained; re-run the script when a credit names a model
newer than the snapshot. The snapshot is read only in Astro frontmatter, which
runs at build time on a prerendered blog — it never reaches the browser.

Vendor marks live in `src/data/vendor-marks/<provider>.svg`, vendored from
[lobe-icons](https://github.com/lobehub/lobe-icons) (MIT). Marks are per provider,
not per model. A provider without one gets a lettered ring: a wrong mark is worse
than an honest placeholder, and these are trademarks.

### Why there is no role vocabulary

An earlier design had twenty-two typed roles, each carrying a `pledgeSafe` flag
that decided which footer line a post got. It bought a closed set of verbs that
still could not describe what a model did on a given post, and a validator that
could check the spelling of a claim but never its truth. `note` replaces all of
it: the author writes the sentence.

## Rendering

Two states, decided by one condition — **any credit at all**:

1. No credits → `NotByAI.astro`, the human-authorship pledge. This is the
   default for every post, so the absence of a directive is never silence.
2. One or more credits → `AiCredit.astro`. One line per model. Models with a
   `note` get their own sentence with the model as subject; models without one
   collapse into a single `blog.copy[locale].aiCredit.fallback` line, so
   "written with" never repeats. `Intl.ListFormat` owns the conjunction.

Neither surface has a popover. A one-line declaration of what a model did is the
whole point; the manifesto behind the old `#not-by-ai` trigger was removed too.
`authors[id].manifesto` in `site.ts` is retained but unreferenced.

A note ends in the punctuation of **its own** language, not the blog's — an
English note under a `zh` blog must not end in `。`.

## Validation

An unresolvable `ai` reference **fails the build** with a message naming the post
slug, the reference, and the fix (`bun run sync:models`). It is not a warning: a
typo'd model must not silently drop the credit off a post that needed it.

Attribute problems (missing `ai`, unsupported attribute, empty or overlong
`note`) degrade to a directive warning and strip the carrier, matching the rest
of the registry.

## Acceptance

- A post with no directive renders the pledge. ✓
- A post with any credit renders credit lines and no pledge. ✓
- Repeated `ai` names the model once, notes joined in order. ✓
- Unknown model → build fails, message names slug and model. ✓
- The directive never appears in prose, RSS body, excerpt, or agent markdown. ✓
- Gradient ids in vendored marks are scoped per render. ✓

## Non-goals

- A UI for composing credits. Hand-typed directive is fine at this volume.
- Per-section or per-paragraph attribution.
- Backfilling credits onto published posts.
