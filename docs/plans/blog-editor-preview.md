# Blog authoring and preview

**Scope.** Make directives fast to build and posts fast to iterate on, without
forking the Ghost editor and without redeploying to see a change.

**Depends on.** [blog-directive-registry.md](blog-directive-registry.md) for the
playground to be useful; the draft preview works without it.
**Blocks.** Nothing.
**Repos.** `site`.

**Implementation status.** The server-only Ghost Admin client, bounded response
handling, five-minute JWT, secret boundary, and 24-character post-ID contract are
implemented and tested. No preview route, playground, bookmarklet, or snippet
surface has been added.

---

## 1. `/dev/prose` — component playground

Dev-only route. Textarea on the left, rendered output on the right, running the
**real** directive pass and the **real** `blog-prose.css`. Vite HMR gives
sub-second iteration while building or tuning a directive. No deploy, no Ghost
round-trip.

- Gate on `import.meta.env.DEV` so it never ships.
- Seed the textarea with a fixture exercising every directive, so it doubles as
  a visual regression surface.
- Render inside the real blog layout wrapper, not a bare div — half of what you
  are checking is how a card sits in the column.

## 2. `/blog/preview/[id]` — render an actual Ghost draft

This is the answer to "I cannot redeploy repeatedly just to tune a post."

- Ghost's **Content** API cannot see drafts. The **Admin** API can:
  `GET /ghost/api/admin/posts/{id}/?formats=html`, authenticated with a JWT
  signed from an admin key (`id:secret`, HS256, 5-minute expiry, `aud`
  `/admin/`).
- `GHOST_ADMIN_API_KEY` is documented in `.env.example`; keep its real value in
  `.env.local`. The server client boundary now exists, while the dev-only route
  and rendering integration remain.
- Render the draft through the real pipeline: directive pass → `Prose.astro` →
  real layout. Production fidelity, including dark mode and fonts.
- Gate on `import.meta.env.DEV`, or behind the existing admin session if it ever
  needs to work in production.
- The admin key is a **secret with write scope**. Never expose it to the client,
  never inline it into rendered HTML, and keep it out of `.env` (committed) —
  `.env.local` only.

### Identifier contract

Ghost editor URLs carry the internal post `id`, not the separate `uuid` field.
The current editor route is `editor/:type/:post_id`, loads the model with
`{id: post_id}`, and serializes `model.id`. The preview boundary must therefore
accept only Ghost's 24-character hexadecimal post IDs; UUIDs must not be sent to
the ID endpoint.

Primary sources: [Ghost's current editor route](https://github.com/TryGhost/Ghost/blob/1eea45a5a01e71e6d880b053e8dba49e6af0fe27/apps/ember-admin/app/routes/lexical-editor/edit.js#L21-L32)
and the [Ghost Admin API post endpoints](https://docs.ghost.org/admin-api/posts/overview#endpoints).

## 3. Bookmarklet

One click from the Ghost editor to the real render: read the post ID from the
editor URL, open `localhost:4321/blog/preview/<id>`. Ship it in this plan's
README or a `scripts/` file. This is the piece that makes step 2 feel like part
of writing rather than a separate chore.

## 4. Snippets

One Ghost snippet per directive so insertion is a `/` command in the editor:
`/poem`, `/mood`, `/music`, `/youtube`, `/footnote`, `/authors`. Snippets are
built into Ghost — no fork, no maintenance.

**Document the exact body of each snippet in a committed file** so they can be
recreated after a Ghost migration or restore. Snippets live in Ghost's database
and are not in any backup you control.

## Acceptance

- Editing a directive's `render()` updates `/dev/prose` without a reload.
- A Ghost draft renders at `/blog/preview/<id>` with production styling.
- Neither route is reachable in a production build.
- Every directive has a snippet, and every snippet body is committed.

## Non-goals

- Forking `@tryghost/koenig-lexical` for in-editor cards. Ghost 6.x ships
  frequently, the card API is internal and unstable, and a fork means rebasing
  against a Lexical editor every release. Steps 1–3 give **higher** preview
  fidelity than an in-editor card could — the actual production renderer, actual
  CSS, actual fonts — at roughly half a day of work.
- In-editor WYSIWYG for directives. Accepted tradeoff: preview is a second
  window, one click away.
- A custom Ghost theme.
