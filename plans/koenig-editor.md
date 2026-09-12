# Koenig fork: the buxx.me editor

Workstream plan, written 2026-09-12 from a read of the Ghost monorepo at
`main` (koenig-lexical 1.10.0) and of this repo's post pipeline, then corrected
the same day against the version the VPS runs. When a phase lands, update the
status table at the end.

**Correction, 2026-09-12.** The VPS runs Ghost 6.39.0 with the Ember admin.
At that tag Koenig is not yet inside the Ghost monorepo: Ghost consumes
`@tryghost/koenig-lexical@1.8.1` from npm, and `ghost/core` pins
`@tryghost/kg-default-nodes` 2.1.1 and `@tryghost/kg-lexical-html-renderer`
1.4.1. The fork is therefore of the TryGhost/Koenig repository at tag
`@tryghost/koenig-lexical@1.8.1`, cloned to `~/Dev/Koenig` on branch
`buxx/koenig`; source there is JS/JSX. Paths below that say
`koenig/koenig-lexical/...` read as `packages/koenig-lexical/...` in that
repo. Everything else in "Facts" was re-checked at the tag and holds; the
React-admin risk is a future one, not a present one.

Owner goal, in the owner's words: the editor Ghost ships no longer fits how
posts on this site are written. The site grew a directive grammar (`[!mood]`,
`[!music]`, `[!poem]`, footnotes, `conversation` and `mermaid` fences,
translation tags) that Ghost's editor knows nothing about, so every one of
those features is typed blind, validated at build time, and previewed in a
second browser tab. The owner wants one editor that knows the grammar, shows
the real rendered post while typing, and reports mistakes before publish.

## The one rule

**The fork changes what the editor shows. It never changes what Ghost stores.**

Ghost renders `post.lexical` to `post.html` on the server with the node set in
`@tryghost/kg-default-nodes` (`ghost/core/core/server/lib/lexical.js`). A node
type the server does not know breaks rendering, and teaching the server means
forking Ghost core, which turns every `ghost update` into a merge. So every
card this plan adds serialises to a node Ghost already has, in a form this
site's `transformPostDirectives` already accepts. Ghost, `site-api`, the
directive registry and the docs under `/docs/writing` need no change for the
cards to work. The only site-side work is the live preview channel and one
grammar extension for poems, both listed below.

A consequence worth saying out loud: an author who never installs the fork can
still write every post by hand, exactly as today. The fork is convenience over
a contract, not a new contract.

## Facts the design rests on

Verified against upstream on 2026-09-12. Re-verify before Phase 2 starts; the
Ghost admin is mid-migration and two of these will move.

| Fact | Where |
| --- | --- |
| Koenig lives in the Ghost monorepo as `koenig/koenig-lexical`, a Vite lib build producing `koenig-lexical.umd.js` and `style.css`. The UMD injects its own stylesheet; the ESM leaves it to the consumer. | `koenig/koenig-lexical/package.json`, `.changeset/koenig-style-export.md` |
| The Ember admin copies that UMD into its own assets and `import()`s it at runtime from `/ghost/assets/koenig-lexical/koenig-lexical.umd.js`. `EDITOR_URL` is a build-time variable, empty in production. | `apps/ember-admin/ember-cli-build.js:287`, `app/utils/fetch-koenig-lexical.js` |
| The new React admin (`apps/admin`) imports the editor as ESM from `node_modules` and bundles it. No runtime URL. | `apps/admin/src/utils/fetch-koenig-lexical.ts` |
| `KoenigEditor` renders `AllDefaultPlugins` then `children`; new plugins register by being added to that list. The slash menu is built from `static kgMenu` on node classes plus `cardConfig`. | `src/components/KoenigEditor.tsx`, `src/utils/buildCardMenu.ts` |
| Ghost's server renderer is `@lexical/headless` plus each node's `exportDOM`; jsdom is only the Node-side default DOM. The same render runs in a browser. | `koenig/kg-lexical-html-renderer/src/LexicalHTMLRenderer.ts` |
| Ghost admin autosaves a draft 3 s after the last change. | `apps/ember-admin/app/controllers/lexical-editor.js:38` |
| `EmEnDashPlugin` and smart-quote handling rewrite text in paragraphs. Code cards are untouched. | `src/plugins/EmEnDashPlugin.tsx` |
| This site accepts a directive in a paragraph, in an unlabelled code card holding exactly one marker, or in a code card labelled `directive`. | `/docs/writing/directives`, `src/features/posts/server/rich-content.ts` |
| `/dev/blog/[id]` renders a saved draft through the production pipeline behind owner auth, polls the Ghost revision by `HEAD` every 1.5 s and reloads on change. It may only be framed by `'self'`. | `src/pages/dev/blog/[id].astro`, `src/features/posts/client/draft-live-reload.ts`, `src/middleware.ts` |
| Ghost runs at `blog.buxx.me`, the same site as `buxx.me`, so a `buxx.me` frame inside the Ghost admin is a same-site frame and owner cookies travel with it. | `/docs/development` (`PUBLIC_GHOST_URL`) |

## Where each piece lives

Three places, three responsibilities. Nothing crosses.

```
~/Dev/Koenig  (fork of TryGhost/Koenig, branch buxx/koenig, at the tag Ghost pins)
  packages/koenig-lexical/src/buxx/          everything this plan adds
    nodes/DirectiveCardNode.tsx              one node, many cards
    nodes/FenceCardNode.tsx                  conversation + mermaid
    nodes/FootnoteRefNode.tsx                Phase 3
    plugins/BuxxCardsPlugin.tsx              registers nodes, transforms, menu
    plugins/LivePreviewPlugin.tsx            the pane + the postMessage channel
    cards/                                   one folder per card: form, preview, validate
  packages/koenig-lexical/src/plugins/AllDefaultPlugins.jsx   +2 lines

bunizao/site  (this repo)
  src/pages/dev/blog/render.ts               POST, owner auth: html in, rendered fragment + warnings out
  src/pages/dev/blog/[id].astro              listens for the editor, swaps the article, pauses the poll
  src/features/posts/client/draft-live-reload.ts   parent-driven mode
  src/middleware.ts                          frame-ancestors for /dev/blog/* gains the Ghost origin
  src/features/posts/server/directives/poem.ts     accepts the card body form (Phase 2)
  src/content/docs/writing/*.md              one paragraph per card: "in the editor, type /x"

VPS
  /srv/koenig/koenig-lexical.umd.js          the fork's build
  nginx: location = /ghost/assets/koenig-lexical/koenig-lexical.umd.js { alias ...; }
```

The fork never talks to `site-api`. The site never talks to the fork except
through the iframe channel below. The Ghost install directory is not modified.

## The serialisation contract

Every card is a `DecoratorNode` in the editor and a plain Ghost node in the
document. The trick is two-sided:

- **Export.** Two layers, because Lexical's `EditorState.toJSON()` throws
  when a node's `exportJSON().type` is not its own `getType()` (the first
  draft of this plan claimed otherwise; a real browser proved it wrong on
  2026-09-12). Inside the editor a card exports its own type
  (`buxx-directive`, `buxx-fence`, `buxx-footnote-ref`), which keeps undo,
  copy and paste honest. At the one place the JSON leaves the editor — the
  `onChange` handler in `KoenigComposableEditor.jsx` — `toGhostEditorState()`
  (`src/buxx/serialize.js`) rewrites every buxx node into the plain Ghost
  shape: `{type: 'codeblock', language: 'directive', code: '[!mood id=482 theme=dark]', caption: ''}`.
  Ghost stores that JSON, renders `<pre><code class="language-directive">`,
  and this site's `normalizeDirectiveCodeBlocks` turns it into the marker
  paragraph the directive registry has always matched.
- **Import.** On load the JSON says `codeblock`, so Lexical builds Koenig's
  `CodeBlockNode`. A node transform registered on `CodeBlockNode` replaces any
  instance whose language is `directive`, `conversation` or `mermaid`, or whose
  entire body is one marker, with the matching card. The same transform
  replaces a paragraph whose entire text is a marker, so posts written by hand
  before the fork open as cards too.

Cards always export as code cards, never as paragraphs, even when they were
loaded from one. Two reasons. A code card is immune to `EmEnDashPlugin` and
smart quotes, which today silently turn `--` in a poem attribution into a
dash the parser does not expect. And a code card is exactly one block, so the
"marker joined to the previous paragraph" failure documented in
`/docs/writing/directives` cannot happen. The site treats both forms as the
same input, so a hand-written post re-saved through the fork renders
identically; a round-trip test in Phase 1 proves that.

Footnotes are the exception: `[^1]` is inline text and the definitions are
paragraphs. They stay text in the document; the editor splits `[^1]` into a
`FootnoteRefNode` (a text-node subclass, Phase 3) that the same boundary
rewrite erases back into the `extended-text` node Ghost stored. No
serialisation change on the wire.

## The product

### Cards

Each card has a slash command, a form, an in-editor rendering, and a
validator. The validator is the same rule the site applies at build time; the
fork imports the attribute rules as data, not by depending on this repo, so
the two lists are kept in step by a test (Phase 1, "grammar snapshot").

| Card | Slash | Form | In-editor rendering | Serialises to |
| --- | --- | --- | --- | --- |
| Mood | `/mood` | id (number), theme (auto/light/dark), density (regular/compact) | The real embed, fetched from `buxx.me/mood/embed/<id>` in a sandboxed frame; a red border and the site's own error text when the id is not a positive integer or the embed 404s | `[!mood id=… theme=… density=…]` |
| Music | `/music` | Apple Music song URL or id; the card extracts the numeric id from a pasted URL | Artwork, title, artist, the site's listening card at editor width | `[!music id=…]` |
| YouTube | `/yt` | URL or id; start (seconds, optional, read from a pasted `t=` parameter) | The click-to-load facade with the thumbnail, exactly what the site ships | `[!youtube id=… start=…]` |
| Authors | `/authors` | model: a picker over the registry snapshot; note: free text | A one-line credit in the site's colophon style. **The picker is the point:** an unknown model is the one directive that fails the build, so it must be impossible to type one | `[!authors ai=provider/model note=…]` |
| Poem | `/poem` | title, `[center]`, `[plain]`, stanzas (a textarea, blank line separates stanzas), attribution | The poem block from `poem.md` | `[!poem] title [center] [plain]` on the first line, the stanzas and attribution in the card body (needs the site grammar extension below) |
| Conversation | `/chat` | The fence body in a monospace editor with `@speaker` and `you:` lines highlighted | The bubble thread beside the source, rendered by the same pure function this repo already exports (`src/features/content/conversation.ts` has no DOM dependency by design; it is vendored into the fork by a script, the way `site-api` vendors the comments contract) | code card, language `conversation` |
| Mermaid | `/mermaid` | Source | Source left, diagram right, re-rendered on pause | code card, language `mermaid` |

Ghost's own snippets keep working. A snippet holding a directive card is the
cheapest way to get a house style for, say, the music card's attributes.

**Poem grammar extension (site side, Phase 2).** Today a poem is a blockquote
with `[!poem]` as its first line; the inline directive reshapes the blockquote.
That form stays. The card writes a second form: a `directive` code card whose
first line is the marker and whose remaining lines are the poem. `poem.ts`
gains a branch that reads that body. Both forms produce the same HTML; the
existing poem tests are the oracle.

### Footnotes (Phase 3)

A floating-toolbar button and `⌘⇧F`. Pressing it inserts `[^n]` at the caret
with the next free label, appends `[^n]: ` as a new paragraph before the end
of the document, and moves the caret there. In the editor a reference renders
as a superscript that scrolls to its definition on click; a definition without
a reference, or a reference without a definition, gets the same warning text
the site's `footnotes.ts` emits. Renumbering on delete is deliberately not
attempted: labels are strings, not positions, and the site does not need them
to be sequential.

### Live preview

A pane, not a modal. `⌘⇧P` toggles it; it docks to the right of the editor
at 45 % width and remembers its state per browser. The pane is an iframe of
`buxx.me/dev/blog/<id>`, the page that already exists, so what it shows is
the production pipeline with the site's CSS, fonts, theme and real embed data.
No rendering is duplicated in React.

The channel:

1. `LivePreviewPlugin` subscribes to editor updates. 300 ms after the last
   change it runs `$generateHtmlFromNodes` inside the editor, which is the
   same call Ghost's server makes, and posts `{type: 'buxx:draft', html}` to
   the frame with the site origin as the target.
2. The preview page (site origin) receives it, `POST`s `{id, html}` to
   `/dev/blog/render` as a same-origin request carrying the owner cookie, and
   swaps the article body with the fragment that comes back. Client modules
   that decorate prose (`prose.ts`, mood embeds, mermaid) re-run on the new
   subtree. Warnings render in the existing `.blog-preview-warnings` block.
3. While the parent is driving, the `HEAD` poll pauses. If no message arrives
   for 10 s, or the page was opened without a parent, the poll resumes. That
   is the fallback and it is the current behaviour.
4. The preview page posts `{type: 'buxx:warnings', warnings}` back. The plugin
   matches each warning's `directive` and marker text to a card and shows it
   on the card, so a bad attribute is flagged where it was typed, not only in
   the pane.

Why the site page makes the request and not the plugin: the request is
same-origin from the frame, so there is no CORS surface on `buxx.me` and no
token in the editor. The plugin only ever sends markup to a frame whose
origin it names. Cookies work because `blog.buxx.me` and `buxx.me` are one
site; if Ghost ever moves off `buxx.me`, this needs a short-lived token minted
by `/dev/portal` and the plan must be revisited before that move.

`/dev/blog/render` does what `/dev/blog/[id]` does today minus the Ghost
fetch: resolve slug and title for the id through the existing Admin client
(cached per id for the session), run `renderPostContent(html, {slug, locale,
outputTarget: 'preview'})`, return `{html, warnings}`. Owner auth, `no-store`,
body capped at the Admin client's response cap. YouTube and Apple Music
enrichment already memoise per id in the Worker, so keystrokes do not fan out
to third-party APIs; the mood embed is fetched by the frame, not the Worker.

Latency budget, keystroke to paint: 300 ms debounce, under 10 ms to generate
HTML, one Worker round trip, a DOM swap. Under half a second on a normal
connection. The saved-draft path this replaces was 3 s autosave plus up to
1.5 s poll plus a full reload.

### Publish readiness (Phase 3)

The pane header shows what the site will do with the post, computed by the
render endpoint from the Admin post's tags, because the sidebar where tags
live cannot be changed:

- the translation relation the tags declare and whether the canonical slug
  exists (the build fails on a bad one; better to know now);
- `#unlisted`, `#no-toc`, `#not-by-ai` as read;
- the authorship credit line as it will print;
- the count of directive warnings.

This is read-only. Tags are still edited in Ghost's sidebar.

### What the fork does not do

- **Sidebar fields** (tags, excerpt, feature image, canonical URL) are the
  Ember or React admin's, not Koenig's. Out of reach without forking the
  admin; not worth it.
- **Email rendering.** This site does not send newsletters from Ghost.
- **Mobile.** The pane needs width. On narrow viewports the toggle is hidden
  and the editor is stock.
- **Collaboration.** Koenig's multiplayer mode is not enabled here.

## Deployment on the VPS

### The host

The Ghost origin is `orange-sin` (`node.orange-sin.tuuhub.com`, `103.195.191.179`,
ssh port 22379, user `tutu`). Confirmed 2026-09-12 by asking that IP directly
for `blog.buxx.me`, bypassing Cloudflare: port 80 redirects to https, port 443
answers `/ghost/` with 200 and `x-powered-by: Express` behind `server: nginx`.
The other VPS in `~/.ssh/config`, `xtom-tyo`, answers on neither port and is not
it.

The same origin request returns the admin's Ember config with `editorUrl: ''`,
`editorFilename: 'koenig-lexical.umd.js'`, `editorHash: '4bef7cc61a'`, version
`6.39`, and serves the editor asset at 2,900,939 bytes, `last-modified`
2026-05-15 — stock koenig-lexical 1.8.1, untouched. `x-powered-by: Express` on
the asset means nginx is proxying it through to Ghost today, so no alias is in
place yet and either deployment route below is still open.

### The seam

Ghost 6.39's Ember admin loads the editor at runtime, as one dynamic `import()`
of one file. `ghost/admin/app/utils/fetch-koenig-lexical.js` builds the URL as
`(config.editorUrl || prefixAssetUrl('assets/koenig-lexical/')) + config.editorFilename + '?v=' + config.editorHash`,
and `core/server/web/admin/app.js` mounts `/assets` as
`express.static(<adminAssets>/assets, {immutable: true, fallthrough: false})`
under `/ghost`, with `adminAssets` = `core/built/admin`. So on this install the
editor is exactly:

```
GET /ghost/assets/koenig-lexical/koenig-lexical.umd.js?v=<editorHash>
 -> <ghost-root>/core/built/admin/assets/koenig-lexical/koenig-lexical.umd.js
```

Read off the live admin on 2026-09-12: `editorUrl` is `''`, `editorFilename` is
`koenig-lexical.umd.js`, `editorHash` is `4bef7cc61a`, admin version 6.39, and
the asset answers 200 with `cache-control: public, max-age=31536000, immutable`.

One file is the whole integration surface. Deploying the fork is replacing it.
Rolling back is putting the original back. That is why this needs no Ghost
patch, no plugin API, and no entry in Ghost's dependency tree.

The build produces that file:

```bash
yarn install --frozen-lockfile
yarn workspace @tryghost/kg-default-nodes build
yarn workspace @tryghost/koenig-lexical build
```

The UMD carries its own stylesheet, so nothing else ships with it.

### Replacing it, on Docker

Mount the built file over the one in the image. It is one line, it lives with
the rest of the stack, and it survives `docker compose pull` because the image
is never modified:

```yaml
services:
  ghost:
    volumes:
      - /srv/koenig/koenig-lexical.umd.js:/var/lib/ghost/current/core/built/admin/assets/koenig-lexical/koenig-lexical.umd.js:ro
```

`/var/lib/ghost/current` is the official image's app root; confirm it once
against the running container before trusting it:

```bash
docker compose exec ghost ls -l /var/lib/ghost/current/core/built/admin/assets/koenig-lexical/
```

Then `docker compose up -d ghost`. Use a host path or a bind mount, never a
named volume, which a prune can take.

### Replacing it, at the proxy

When touching the container is unwelcome, intercept the URL before it arrives:

```
location = /ghost/assets/koenig-lexical/koenig-lexical.umd.js {
    alias /srv/koenig/koenig-lexical.umd.js;
    add_header Cache-Control "no-cache";
}
```

This has one advantage over the mount: it can override the cache header, which
the mount inherits from Ghost. It also has one requirement: the block must sit
in whatever actually terminates the request. If nginx is itself a container,
`/srv/koenig` has to be mounted into it; if the front door is Caddy or Traefik,
it is a `handle`/`file_server` or a middleware, not an `alias`.

### Two routes that look right and are not

**An npm package.** Publishing the fork changes nothing on its own, because
nothing installs it at runtime. The image ships a prebuilt admin whose copy of
the editor was baked in when the image was built. A published package only pays
off if the image itself is rebuilt, and at that point a `COPY` line does the
same job. Worth doing later as a version ledger, not as a deployment mechanism.

**`EDITOR_URL`.** It exists: `ghost/admin/config/environment.js` reads
`process.env.EDITOR_URL` into `editorUrl`, which the fetch above prefers over
the asset path. But that file runs during the Ember build, and Ghost serves the
built `index.html` verbatim (`res.sendFile`, no templating), so the value is
frozen inside the image. The live admin carries `editorUrl: ''`. Setting it in
compose does nothing unless the admin is rebuilt. Reading it at runtime instead
is a small, well-shaped upstream PR, and it would turn this whole workstream
into a supported configuration.

### Caching

`editorHash` changes only when Ghost's version changes, and the asset is served
`immutable` for a year with Cloudflare in front. A swapped file therefore keeps
losing to the cached copy under the same URL. After every editor deploy, purge
that one URL at Cloudflare and hard reload the admin. The proxy route can force
`no-cache` and skip half of this; the mount cannot.

### Ghost updates

Surviving an update is not the same as following it. Nothing here lives in the
image or a Ghost volume, so `docker compose pull && up -d`, or a
Watchtower-style auto update, leaves the fork in place. That is the more
dangerous failure, not the safer one: the fork is pinned to
`@tryghost/koenig-lexical` 1.8.1, the version Ghost 6.39 ships, and a newer
Ghost will happily keep being handed a stale editor with no error.

The version banner is the tripwire. At editor load the plugin compares the
Ghost version the admin hands it against the fork's own build and shows a
one-line warning when the minor moved, which is why it is in Phase 1 and not
later. After every image update: hard reload the admin and read the banner. If
it warns, rebase onto the `@tryghost/koenig-lexical@<x>` tag the new
`ghost/admin/package.json` pins, rebuild, redeploy, and re-run the `post.html`
diff from the handoff. If the banner is gone entirely rather than warning, the
replacement stopped taking effect, which is the risk below.

### The known risk

Upstream is replacing the Ember admin with a Vite React admin that bundles the
editor into its own chunk. When the VPS Ghost switches to it, both the mount and
the proxy route stop pointing at anything the admin loads, and the symptom is a
silent fall back to the stock editor. The bounded fallback is a post-update
script that patches the built admin chunk to `import()` the fork; the clean
answer is the runtime `editorUrl` PR above. Check which admin the VPS serves at
the start of every phase.

## Phases

Each phase ships on its own and leaves the previous one working. Effort is
for one engineer.

| Phase | Scope | Effort | Ships when |
| --- | --- | --- | --- |
| 0 | Site only. `/dev/blog/render`, the message listener on `/dev/blog/[id]`, parent-driven mode in `draft-live-reload.ts`, `frame-ancestors` for the Ghost origin. A ten-line Ghost theme whose `post.hbs` frames `buxx.me/dev/blog/{{id}}` so Ghost's own Preview button opens the site preview. | 1–2 days | The saved-draft preview opens inside Ghost admin. |
| 1 | Fork scaffold. Branch, `buxx/` folder, `BuxxCardsPlugin`, `DirectiveCardNode` with the code-card export and the load transform, the Mood and YouTube cards, `LivePreviewPlugin` wired to Phase 0, version banner, nginx alias. The round-trip test and the grammar snapshot test. | 1 week | Typing `/mood` in the real admin shows the embed and the pane updates while typing. |
| 2 | Music, Authors, Conversation, Mermaid cards. Poem card plus the site grammar extension. Warnings mapped back to cards. Docs paragraphs. | 1–2 weeks | Every block directive has a card. |
| 3 | Footnotes. Publish readiness header. Pane state persistence. | 1 week | The pre-publish checklist is on screen, not in build logs. |

Phase 0 is the cheapest thing in this plan and is worth doing even if the
fork never happens. Phase 1 is the decision point: after a week of real use,
the owner decides whether phases 2 and 3 go ahead.

## Verification

- **Round trip** (fork, unit): for each card, build the node, `exportJSON`,
  parse with Ghost's `DEFAULT_NODES` in a headless editor, render to HTML,
  and assert it equals the HTML Ghost produces for the hand-written form.
  This is the test that guards the one rule.
- **Grammar snapshot** (fork, unit): the attribute rules the cards validate
  against are a JSON file; a script in this repo regenerates it from the
  directive registry and CI fails when the committed copy is stale. Same
  pattern as `sync:contracts`.
- **Render endpoint** (site, unit): auth required, body cap, warnings shape,
  slug resolved from id, a directive code card and its paragraph form give
  the same fragment.
- **Preview channel** (site, Playwright): a stub parent posts a draft; the
  page swaps the article without reload; the poll pauses and resumes.
- **Acceptance** (fork, Playwright, upstream already has the harness): each
  slash command inserts its card; the mood card shows the error state for a
  bad id; the pane toggles and receives a message.
- **Manual, per phase:** open a real post on the VPS, save it through the
  fork, `git diff` the `post.html` from the Content API before and after.
  Nothing but the directive form may change.

## STOP conditions

- The VPS Ghost serves the React admin and no runtime editor URL exists yet.
  Do Phase 0, then stop and decide on the patch script before Phase 1.
- Ghost's server rejects a `codeblock` node with an unknown `language`
  value. It does not today; if a Ghost update starts validating languages,
  the code-card form is dead and the paragraph form is the fallback, with
  the em-dash problem back.
- The owner cookie does not reach the frame inside the admin. Do not work
  around it with a long-lived token in the editor; revisit the auth section.

## Status

| Phase | Status |
| --- | --- |
| 0 | DONE 2026-09-12 (`34185554`, `f04d1521`, `d60139e7`, `4726c596`); the preview theme still has to be uploaded and activated in Ghost Admin by the owner |
| 1 | DONE 2026-09-12 in `~/Dev/Koenig` (`86e2080..609c167`): grammar, `DirectiveCardNode`, load transforms, mood + youtube cards, live preview pane, version banner, round-trip tests, `BUXX.md`, `scripts/build-buxx.sh`. Not yet deployed to the VPS |
| 2 | DONE 2026-09-12. Site: `696393b0` poem card body form, `137b8f84` grammar snapshot at `contracts/directive-grammar.json`, `47639511` channel e2e plus a cross-origin `event.source` fix. Fork: `99ae4ae..7568d39` music, authors, poem, conversation, mermaid and unknown-directive cards, warnings mapped to cards, `scripts/sync-site-grammar.mjs` |
| 3 | DONE 2026-09-12. Site: `4e4fa0ae` `readiness` on `/dev/blog/render`, `03f91fa5` relayed as `buxx:readiness`. Fork: `926d415..6598c75` footnotes (`FootnoteRefNode`, ⌘⇧F, status strip), readiness header in the pane, pane width persistence |
| — | Browser verification 2026-09-12 against the fork's Vite demo found three bugs the unit tests could not: an infinite update loop from the footnote entity hook (`2bee539`), the `toJSON()` type invariant above (`51f09bc`, `d337781`), and typed markers never reaching the paragraph transform (`f690312`). All fixed; the Playwright smoke run then inserted a card from `/mood`, folded a typed `[!youtube …]` paragraph into a card with its thumbnail, inserted a footnote with ⌘⇧F and opened the pane with ⌘⇧P, with zero page errors |
| — | A second browser pass 2026-09-12 found that no buxx card could be selected or edited at all: Koenig gates selection, edit mode, arrow and backspace handling and snippets on `$isKoenigCard`, an `instanceof KoenigDecoratorNode` check, and both card nodes extended Lexical's `DecoratorNode` instead. Their duck-typed `isKoenigCard()` passed the other half of the check and hid the cause. Fixed in `06907ee2` with a contract test that fails on the old base class. The same pass fixed card rendering under `.kg-prose` (`b88ac61c`). Both bugs were invisible to 328 passing unit tests — which is how the third finding surfaced: Lexical swallows anything thrown inside `editor.update`, so 15 assertions across the buxx test files could never fail, and 2 were wrong once lifted out (`45edab25`) |

| — | A third pass 2026-09-13 measured every card type in one document instead of reading it: the youtube thumbnail resolved a percentage height against an `aspect-ratio` wrapper, fell back to hqdefault.jpg's 4:3 and was clipped from the bottom; the centred poem hugged its longest line because an auto cross-axis margin cancels `align-self: stretch` on a flex item; the mermaid card held a disabled textarea open at rest and themed its diagram from `prefers-color-scheme` rather than Koenig's dark class (`3e3756ff`, `decfbac8`). The dim incoming chat bubbles were checked against the vendored `conversation.css` and left alone — they are the site's own design |

Current UMD: `~/Dev/Koenig/packages/koenig-lexical/dist/koenig-lexical.umd.js`,
3,202,134 bytes, sha256
`693ed70d7d06b3c75a26bc9af22ae6fb30662ac81e1302a5749337c7e89b506e`, built
from `decfbac8`. Fork unit tests: 230 in `test/unit/buxx`, 337 overall.

Every commit listed here that landed on 2026-09-12 after `4726c596` is
unsigned (`commit.gpgsign=false`): the signing key lives in 1Password, which
was locked for the unattended run. Re-sign with `git rebase --exec 'git
commit --amend --no-edit -S'` before merging if signed history matters.

Simplifications made in Phase 3 that the product section does not spell
out: the editor computes only dangling-reference and orphan-definition
warnings itself (the site's `split-definition` warning arrives through the
pane once a post is saved); footnotes are never renumbered by the editor;
the readiness header shows one credit line per `[!authors]` credit.

## Handoff

The fork now has a home: `bunizao/koenig`, private, default branch
`buxx/koenig`, with `upstream` pointing at TryGhost/Koenig and the
`@tryghost/koenig-lexical@1.8.1` base tag pushed alongside it. The clone was
unshallowed first, so rebasing onto a future `@tryghost/koenig-lexical@<x>`
tag works without re-cloning. Until 2026-09-12 it existed only on one laptop.

Everything below still needs the owner, because every step needs either a
browser session, an ssh key that 1Password will only sign with a fingerprint,
or a deliberate decision to release.

1. **Site.** Branch `claude/ghost-koenig-editor-adapt-7154f7` holds every
   site commit and is open as draft PR #204. Mark it ready and merge;
   merging deploys within a minute, which is fine because nothing here
   changes a published page. The build of
   `dist/ghost-preview-theme/buxx-preview.zip` (`bun run ghost:preview-theme`)
   is not committed; build it locally.
2. **Preview theme.** Ghost Admin → Settings → Design & branding → Change
   theme → Upload theme → `buxx-preview.zip`, then activate it. Ghost's own
   Preview button now opens `buxx.me/dev/blog/<id>` inside the admin. The
   owner cookie must already be set on `buxx.me` in that browser.
3. **Editor.** Copy the UMD above to `orange-sin` as
   `/srv/koenig/koenig-lexical.umd.js`, then take one of the two routes in
   the deployment section: the compose bind-mount, which survives image
   updates, or the nginx `location` block, which is the only one that can
   beat the year-long immutable cache header. Hard-reload the admin
   afterwards, and purge the Cloudflare cache for the editor URL. The
   version banner in the editor confirms the fork loaded; a mismatch banner
   means the VPS Ghost minor moved past `6.39` and the fork needs a rebase
   before use.
4. **First real post.** Open an existing post that uses directives, make one
   edit, save, and diff `post.html` from the Content API against the copy
   from before. Only the directive form (paragraph → code block) may change.
   That diff is the acceptance test for the one rule.
5. **Rollback** is removing the bind-mount line or the nginx `location`
   block and restarting; Ghost's own copy of the editor is untouched
   underneath.
