# 022 — One motion vocabulary for the whole site

- **Status**: DONE (2026-08-01, `54926103`)
- **Severity**: MEDIUM
- **Category**: Cohesion / Design system
- **Estimated scope**: 2 files for the tokens, ~12 files for the adoption pass

## Problem

There is no site-wide motion vocabulary. Thirty-plus hand-written cubic-beziers
are spread across ~10k lines of CSS, and the same intended curve exists in five
different spellings:

```
cubic-bezier(0.16, 1, 0.3, 1)        23 uses  (globals, TimelineWheel, 404, VT)
cubic-bezier(0.23, 1, 0.32, 1)        6 uses  (components.css, projects.astro, globals)
cubic-bezier(0.22, 1, 0.36, 1)        8 uses  (SiteWordmark, hero cards, GitHubContributions)
cubic-bezier(0.25, 1, 0.3, 1)         6 uses  (blog.css, SiteWordmark)
cubic-bezier(0.215, 0.61, 0.355, 1)   1 use   (home-reveal.css --reveal-ease)
```

All five are "ease-out with a long tail". Nothing in the codebase records which
one is canonical, so every new rule picks whichever neighbouring rule it was
copied from.

The only two token declarations that exist are both scoped, so nothing outside
their subtree can reach them:

```css
/* src/styles/components.css:14 — only inside .components */
.components { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); }

/* src/pages/projects.astro:113 — re-declared locally for the same reason */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

`src/styles/globals.css:166` declares `--expo-out` at `:root` (a `linear()`
easing) but it is used by exactly two rules, both in the theme-wipe block.

**The portal already solved this.** `src/styles/portal.css:39-50` declares a
complete, commented motion scale and 56 rules consume it:

```css
/* src/styles/portal.css:39-50 — current, scoped to .theme-portal */
--portal-ease: cubic-bezier(0.2, 0, 0, 1);
--portal-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--portal-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--portal-dur-press: 110ms;
--portal-dur-fast: 130ms;
--portal-dur-base: 190ms;
--portal-dur-enter: 240ms;
```

That scale is the right one. It just lives one level too deep.

## Target

Promote the portal scale to `:root` under unprefixed names, and redefine the
portal names as aliases so the 56 existing portal rules keep working untouched.

```css
/* src/styles/globals.css — target, inside the existing :root block that
   declares --expo-out (around :166)

   Motion vocabulary. One curve family, one duration scale, site-wide. Adopted
   from the portal's scale (src/styles/portal.css), which was the only part of
   the site that had one. UI stays under 300ms; --dur-enter is the only step
   allowed to breathe, and entrances are the only thing allowed to use it. */
--ease: cubic-bezier(0.2, 0, 0, 1);
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);

--dur-press: 110ms;
--dur-fast: 130ms;
--dur-base: 190ms;
--dur-enter: 240ms;
```

`--expo-out` stays exactly as it is — it is a `linear()` easing used by the
1.5s theme wipe, which is a different register from UI motion and should not be
folded into this scale.

```css
/* src/styles/portal.css:39-50 — target: aliases, not duplicates */
/* Motion: inherited from the site scale in globals.css. These aliases exist so
   the ~56 rules below keep reading portal-prefixed names; the values are no
   longer declared here. */
--portal-ease: var(--ease);
--portal-ease-out: var(--ease-out);
--portal-ease-in-out: var(--ease-in-out);
--portal-dur-press: var(--dur-press);
--portal-dur-fast: var(--dur-fast);
--portal-dur-base: var(--dur-base);
--portal-dur-enter: var(--dur-enter);
```

### Adoption pass

Then replace literal curves with tokens **only where the value already matches a
token exactly**. This step must not change a single rendered frame.

| Literal | Token | Where |
| --- | --- | --- |
| `cubic-bezier(0.23, 1, 0.32, 1)` | `var(--ease-out)` | `src/styles/components.css:14` (delete the local decl), `src/pages/projects.astro:113` (delete the local decl), `src/styles/globals.css:1763` |
| `cubic-bezier(0.2, 0, 0, 1)` | `var(--ease)` | `src/styles/globals.css:1620-1622` |
| `cubic-bezier(0.77, 0, 0.175, 1)` | `var(--ease-in-out)` | `src/styles/blog.css` (single use) |

Deleting the two local `--ease-out` declarations is the point of the exercise:
`.components` and `/projects` then inherit the site token instead of shadowing
it with an identical value.

Curves that do **not** exactly match a token are left alone by this plan. They
are a separate judgement call per site (is this rule meant to be the standard
ease-out, or is its curve deliberate?) and collapsing them blind would change
how things feel. Record them instead — see Steps 4.

## Repo conventions to follow

- Site-wide tokens live in the `:root` block in `src/styles/globals.css`
  (exemplar: `--radius-md`, `--expo-out` at :160-183).
- Comments state the tradeoff, not the mechanism (exemplar:
  `src/styles/portal.css:39-40`, `:45-46`).
- Shared stylesheets read tokens defensively as `var(--t, fallback)` when they
  may be mounted outside their owning subtree (exemplar:
  `src/styles/code-box.css:11`). This applies to `code-box.css` only; the tokens
  added here are at `:root` and always resolve.
- lightningcss has stripped multi-keyword CSS from this repo's build before —
  verify tokens survive into `dist/`.

## Steps

1. `src/styles/globals.css` — add the seven declarations to the existing `:root`
   block, directly after `--expo-out` ends at :183, with the comment above.
2. `src/styles/portal.css:39-50` — replace the seven value declarations with the
   alias declarations above. Keep them in place; do not move them.
3. Adoption pass, exactly the table above. For `components.css:14` and
   `projects.astro:113`, delete the declaration line entirely rather than
   pointing it at the token — the whole point is that they inherit.
4. Append a short section to `docs/SHARED-LAYOUT.md` listing the seven tokens and
   the rule "new motion uses a token; a literal curve needs a comment saying why
   it is not one." In the same section, record the non-matching curves found
   during step 3 as a follow-up list, so the next pass has a work-list instead of
   re-deriving it.

## Boundaries

- Do NOT change any curve or duration **value**. This plan renames, it does not
  retune. If a literal does not match a token exactly, leave it.
- Do NOT touch `--expo-out` or the two theme-wipe rules that use it
  (`src/styles/globals.css:2363`, `:2388`, `:2417`).
- Do NOT touch `--reveal-ease` in `src/styles/home-reveal.css:11`. That file
  documents itself as deliberately unlayered and owning its own vocabulary;
  folding it in is a separate decision.
- Do NOT add tokens beyond the seven listed. A `--dur-slow` with no consumer is
  the same problem in a new coat.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
  `grep -r "\-\-ease-out" dist/client` finds the token in the built CSS.
- **No-op proof**: this plan must not change rendering. For each file touched in
  step 3, confirm the computed value is identical before and after — in DevTools,
  select an affected element and read `transition-timing-function` from Computed
  styles; the resolved `cubic-bezier(...)` string must be byte-identical.
- **Scoped-token check**: load `/components` and `/projects` and confirm the
  tile-hover and card transitions still animate. If a local `--ease-out`
  deletion was wrong, these are where it shows: a missing token resolves to
  `initial`, which for `transition-timing-function` is `ease` — subtly slower
  and softer, not obviously broken. Compare against the Computed value.
- **Portal check**: `/dev/portal` still animates. The alias step is where a typo
  silently degrades 56 rules at once.
- **Done when**: seven tokens resolve at `:root`, the portal reads them through
  aliases, the two scoped duplicates are gone, and no computed timing function
  anywhere changed.
