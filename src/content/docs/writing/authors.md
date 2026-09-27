---
title: Authorship credits
description: Credit an AI model as a co-author with [!authors], in place of the default human-authorship pledge.
group: Writing
order: 7
---

Use `[!authors]` to credit an AI model that helped with a post. Every post ends
with one of two lines. By default it is the human-authorship pledge:

> 本文由真人撰写，**未使用 AI 创作**。

A post that used a model shows a credit instead, naming the model and what it
did.

```md demo
[!authors ai=anthropic/claude-opus-4-6]
```

Add a note to give the model its own sentence:

```md demo
[!authors ai=anthropic/claude-opus-4-6 note="重写了迁移那一节的表格"]
```

| Attribute | Required | Value |
| --- | --- | --- |
| `ai` | yes | `provider/model` from the model registry |
| `note` | no | Markdown-capable text saying what the model did. |

`[!authors]` is a meta [directive](/docs/writing/directives) (a `[!name]`
marker the build processes). The build removes the marker from where you wrote
it, and it never renders in place. You can put it anywhere in the post. The
credit always appears in the footer.

## Model references

`ai` takes a `provider/model` pair. The provider is required because one model
can run under several providers: `claude-opus-4-6` exists under `anthropic`,
`google-vertex-anthropic`, and several resellers. The credit should name the
one that actually ran.

Valid references come from `src/data/generated/model-registry.json`, a snapshot
of [models.dev](https://models.dev) written by `bun run sync:models`. Nothing in
it is edited by hand. If a credit names a model newer than the snapshot, run the
sync again.

`gemini/<model>` works as an authoring shorthand. The build normalizes it to
`google/<model>` before the registry lookup. For example,
`gemini/gemini-3.7-flash` records the canonical
`google/gemini-3.7-flash` credit and shows Google as the provider.

**An unknown model stops the production build.** The draft preview keeps the
article visible and shows the validation error as a warning, so you can fix it
without losing the preview. This is the only directive error that fails the
build. A mistyped model reference would otherwise drop an authorship credit
from a published post without any visible sign.

## Credit wording

The `note` decides how a credit reads.

**With a note**, the model gets its own sentence with the model as the
subject, and your note completes it. Write only the predicate: `note="重写了
迁移那一节的表格"`, not `note="Claude 重写了…"`. Notes support inline Markdown
for emphasis, code, strikethrough, and links. Raw HTML stays escaped.

**Without a note**, the credit joins one shared line, `本文在 A 和 B 的协
助下完成。`, so "Written with" never repeats down the footer.

The build adds the final punctuation for you. It follows the last character of
the note, not the blog's locale, so an English note on a Chinese blog ends with
a full stop instead of `。`.

## Credit several models

Repeat the directive. Credits appear in the footer in the order the directives
appear in the post.

```md demo
[!authors ai=anthropic/claude-opus-4-6 note="drafted the pipeline diagram"]
[!authors ai=openai/gpt-5 note="checked the numbers"]
```

If you credit the same model twice, the credits merge into one entry, so a
footer never names a model twice. The notes are joined with a comma in the
order you wrote them.

## Why there are no roles

An earlier design had a closed list of twenty-two roles, each flagged for
whether it was compatible with the human-authorship pledge. Its validator could
check how a claim was spelled but not whether it was true. The twenty-two verbs
still couldn't describe what a model did on a given post.

`note` replaces all of it. The author writes the sentence and is accountable
for it.

## Derived text

A meta marker produces no HTML, so it would otherwise survive into anything
built from the raw source: the excerpt, the plaintext, the Markdown output, and
the Open Graph description. The build strips standalone `[!authors]` markers
from each of these separately. It leaves code fences alone, so a post *about*
the syntax keeps its examples.

## Notes

- Implementation: `src/features/posts/server/directives/authors.ts`,
  `src/data/authorship.ts`, `src/features/posts/ui/AiCredit.astro`.
- The pledge component is `src/features/posts/ui/NotByAI.astro`. It is the
  default. There is no tag or flag to opt into it.
