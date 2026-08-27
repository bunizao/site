---
title: Authorship credits
description: The [!authors] directive — crediting a model as a co-author, and the human-authorship pledge it replaces.
group: Writing
order: 7
---

Every post carries one of two lines at its foot. By default it is the pledge:

> 本文由真人撰写，**未使用 AI 创作**。

A post that used a model says so instead, naming which one and what it did. That
is what `[!authors]` is for.

```
[!authors ai=anthropic/claude-opus-4-6]
[!authors ai=anthropic/claude-opus-4-6 note="重写了迁移那一节的表格"]
```

| Attribute | Required | Value |
| --- | --- | --- |
| `ai` | yes | `provider/model` from the model registry |
| `note` | no | One clause saying what the model did. Max 160 characters. |

The directive is *meta*: the marker is removed from wherever you wrote it and
never renders in place. Put it anywhere; the credit lands in the footer.

## Model references

`ai` is a `provider/model` pair. The provider is part of the reference, not a
guess — `claude-opus-4-6` exists under `anthropic`, `google-vertex-anthropic`, and
several resellers, and the credit should say which one actually ran.

Valid references come from `src/data/generated/model-registry.json`, a snapshot of
[models.dev](https://models.dev) written by `bun run sync:models`. Nothing in it
is hand-maintained. If a credit names a model newer than the snapshot, re-run the
sync.

**An unknown model stops the build.** This is the only directive error that is
not a warning. Everything else degrades to a skipped marker and a log line; a
typo'd model reference would silently drop an authorship claim off a published
post, which is worse than a red build.

## Notes and the two footer lines

The `note` decides how a credit reads.

**With a note**, the model gets its own sentence with the model as the subject —
your clause completes it. Write the predicate, not a full sentence: `note="重写了
迁移那一节的表格"`, not `note="Claude 重写了…"`.

**Without a note**, the credit joins a single generic line — `本文在 A 和 B 的协
助下完成。` — so "Written with" never repeats down the footer.

Terminal punctuation is added for you, taking its cue from the note's own last
character rather than the blog's locale: an English note under a Chinese blog
gets a full stop, not `。`.

## Several credits

Repeat the directive. Order in the footer follows the order the directives appear
in the post.

```
[!authors ai=anthropic/claude-opus-4-6 note="drafted the pipeline diagram"]
[!authors ai=openai/gpt-5 note="checked the numbers"]
```

The same model credited twice collapses into one entry — a model is never named
twice in a footer — and its notes join with a comma in the order written.

## Why there are no roles

An earlier design had a closed vocabulary of twenty-two roles, each flagged for
whether it was compatible with the human-authorship pledge. It bought a validator
that could check the spelling of a claim but never its truth, and twenty-two verbs
that still could not describe what a model did on a given post.

`note` replaces all of it. The author writes the sentence, and is accountable for
it.

## Derived text

Because a meta marker produces no HTML, it would otherwise survive into anything
built from the raw source — the excerpt, the plaintext, the Markdown output, the
Open Graph description. Standalone `[!authors]` markers are stripped from all of
those separately, with code fences respected so a post *about* the syntax keeps
its examples.

## Notes

- Implementation: `src/features/posts/server/directives/authors.ts`,
  `src/data/authorship.ts`, `src/features/posts/ui/AiCredit.astro`.
- The pledge component is `src/features/posts/ui/NotByAI.astro`. It is the
  default; there is no tag or flag to opt into it.
