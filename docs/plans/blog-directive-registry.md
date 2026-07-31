# Blog directive registry

**Scope.** Replace three unrelated content-transform idioms with one server-side
directive pass, and move the poem promoter off the client.

**Depends on.** Nothing.
**Blocks.** [blog-footnotes.md](blog-footnotes.md),
[blog-authorship-credits.md](blog-authorship-credits.md),
[youtube-embed-card.md](youtube-embed-card.md) (blog side),
[blog-editor-preview.md](blog-editor-preview.md).
**Repos.** `site`.

**Implementation status.** The document transformer and the poem, mood, music,
footnote, and authorship handlers are implemented and tested. They remain
deliberately unwired from page, RSS, excerpt, OG, and agent-Markdown consumers;
the client poem pass remains until frontend handoff.

---

## Why

| Component | Syntax | Runs |
|---|---|---|
| mood embed | `[mood:123 theme=dark]`, pasted bookmark card, or raw iframe | server, `posts/server/mood-embed.ts` |
| Apple Music | Ghost embed-card iframe | server, `posts/server/apple-music.ts` |
| poem | `[!poem] Title [center] [plain]` inside a blockquote | **client**, inline script in `posts/ui/Prose.astro:187` |

The poem promoter running client-side means verse cards are invisible to RSS, to
the OG image, and to search indexing, and they flash an unstyled blockquote
before hydration. Both server rewrites are applied in
`src/pages/blog/[slug].astro:20-21` (`enrichAppleMusicEmbeds`, `enrichMoodEmbeds`);
posts are prerendered via `getStaticPaths`, so this is all build-time work with
no client cost.

Without a registry, every future component is another bespoke regex in another
file. With one, a component is ~30 lines and one registry line.

## Steps

### 1. Registry

Create `src/features/posts/server/directives/`:

```
index.ts      — registry + the single pass
types.ts      — Directive interface
poem.ts       — ported from Prose.astro
mood.ts       — wraps existing mood-embed.ts logic
music.ts      — wraps existing apple-music.ts logic
```

```ts
interface Directive {
  name: string;
  /** 'block' replaces its own markup; 'meta' is hoisted out and stripped from
   *  the prose; 'inline' transforms in place across the whole document. */
  kind: 'block' | 'meta' | 'inline';
  parse(attrs: string): Record<string, string>;
  render(attrs: Record<string, string>, ctx: DirectiveContext): string | Promise<string>;
}
```

The pass returns `{ html, meta }` so `meta` directives can surface post-level
data without a second parse. `inline` directives get the whole document because
they need cross-paragraph state (footnote numbering).

### 2. Syntax

Standardize on the callout shape already half in use: `[!name key=value]`.
Greppable, survives Koenig untouched (it is just paragraph text), and `[!poem]`
already uses it.

- `[!poem] Title [center] [plain]` — **keep verbatim.** Published posts contain
  it; changing it would silently break them. New modifiers may use `key=value`.
- `[!mood id=123 theme=dark density=compact]`
- `[!music id=...]`

**Back-compat is mandatory.** `[mood:123]`, pasted bookmark cards, raw
`/mood/embed` iframes, and Ghost Apple Music embed cards all appear in published
posts. Port the regexes from `mood-embed.ts` and `apple-music.ts` **as-is**
rather than rewriting them; the new syntax is purely additive.

### Output policy

Directive handlers must declare their behavior through `DirectiveOutputTarget`.
The transformer returns HTML for every target; text-oriented consumers strip or
convert the semantic HTML after the directive pass.

| Target | Poem | Mood and music |
|---|---|---|
| `web` | Static poem card HTML | Existing responsive mood embed or server-resolved music card |
| `preview` | Static poem card HTML | Same rich output as `web` |
| `rss` | Static poem card HTML with no client dependency | One accessible absolute link; music prefers the resolved canonical track and has a source-link fallback; no iframe, player, or fragment URL |
| `og` | Semantic blockquote text without presentation classes | One accessible canonical link, suitable for downstream text extraction |
| `excerpt` | Semantic blockquote text without presentation classes | One accessible canonical link, suitable for downstream text extraction |
| `agent-markdown` | Semantic blockquote text that converts cleanly to Markdown | One accessible canonical link that converts cleanly to Markdown |

Invalid attribute syntax, unsupported attributes, and invalid values remove the
directive callout and emit a structured warning containing the post slug. A
music metadata lookup failure degrades the new callout to its Apple Music link.
Legacy enrichment remains owned by `mood-embed.ts` and `apple-music.ts`, so its
failure behavior does not change.

The backend foundation registers `poem`, `footnotes`, `mood`, `music`, and
`authors` but does not call the production registry from page, RSS, OG, excerpt,
or agent-Markdown code. That wiring remains a separate step so each consumer can
adopt its explicit output target without changing existing rendered content
prematurely.

### 3. Wiring

One pass in `[slug].astro`, before `splitBlogProse`, replacing the two `enrich*`
calls. **Also apply it in `posts/server/rss.ts`** and anywhere else post HTML is
rendered — the poem fix is only real if RSS sees it.

### 4. Port the poem promoter

`Prose.astro:163-256` moves to `directives/poem.ts` and becomes string→string
instead of DOM manipulation. The three input forms it recognises (explicit
`[!poem]` marker, dash attribution, hand-broken verse ≥2 `<br>`) must all
survive; they are the reason the current code is shaped as it is. Delete the
client block once ported — do not leave both running.

## Acceptance

- Every published post renders byte-identically to today, except poem cards now
  appear in server HTML. Verify with `curl | grep blog-poem`, not a screenshot.
- No unstyled-blockquote flash on a poem post.
- RSS contains poem markup.
- Adding a directive touches exactly one new file plus one registry line.

## Non-goals

- Changing existing published syntax.
- Any client-side directive rendering.
