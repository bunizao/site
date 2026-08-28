# sillage sea footer

Provenance: the idea has been open since 2026-08-21 ("我想在这里画一条海和船"),
scoped against three reference sites (chloeyan.me, tinycamp.site,
baothiento.com) and one mockup drawn by the owner. Three procedural attempts
were rejected — the texture has to be hand-drawn, so the code half was built to
receive art rather than to generate it.

## State

**Scaffold: shipped.** `src/features/posts/ui/BlogSeaFooter.astro` renders on the
`/blog` index. Seamless two-speed drift, boat occluded by the near crests, the
horizon dissolving into the page background in both themes, night as a filter
over the same assets, reduced-motion honoured.

**Art: outstanding.** `public/sillage/` holds flat placeholders. The drawing
spec — sizes, the seamlessness requirement, the two mistakes that cost an
afternoon each — is in `public/sillage/README.md`, next to the files it
describes. Do not duplicate it here.

## Remaining

- [ ] Draw `sea-near`, `sea-far`, `boat`, `cloud` per `public/sillage/README.md`.
- [ ] Drop the files in, swap the four `--sillage-art-*` URLs if the extensions
      change, and re-tune `--sillage-draught` so the real hull sits at the real
      waterline.
- [ ] Re-check `--sillage-cloud-opacity` in dark. The placeholder clouds are hard
      ellipses and read heavier at night than crayon edges will.

## Open decision

The boat is moored — it bobs and rocks in place. The alternative is a voyage:
it drifts across and loops, leaving a wake. That is a call about what the page
means, not about the code, and it is one keyframe block either way. See the
`sillage-bob` / `sillage-rock` pair in the component.

Ships to `notes/archive/` when the art lands.
