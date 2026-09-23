# sillage sea footer

Provenance: the idea has been open since 2026-08-21 ("我想在这里画一条海和船"),
scoped against three reference sites (chloeyan.me, tinycamp.site,
baothiento.com) and one mockup drawn by the owner. Three flat procedural
attempts were rejected as not hand-drawn enough; the owner then asked for a
side-on cross-section of sea and sailboat ("2 维剖面的 海+帆船"), moving.

## State

**Built, on `feat/blog-sea-footer`, awaiting the owner's eye.**

- Art: `scripts/paint-sillage.ts` paints it as crayon on toothed paper —
  pigment deposited where stroke pressure beats the paper's height field, over a
  toned, mottled ground — in both themes, from `blogPalette`. The first crayon
  pass (2026-09-24) read as white static and was redone: the fix was a toned
  ground so gaps show lighter blue, not paper, and a soft deposit band.
- Composition follows the mockup: sea profile against the page, small cumulus,
  a back swell for depth instead of a horizon. An earlier horizon-and-far-sea
  version contradicted the cross-section brief and was dropped.
- Motion: the water drifts, the boat rides the painted swell, the wake is foam
  left on the water. Night lights the stern lantern (the colophon's "深夜里独自
  点亮的灯").
- Second pass (2026-09-24, owner: "把海和浪做的更精致一点 并且加一点交互设计还有
  更多的动作感"): whitecaps on the tallest crests, a front row of waves for
  depth, rows that breathe, a bow wave driven by the pitch, and touch — tap to
  splash, drag sideways to move the sea with the finger. A diagonal hatch over
  the water and per-wave shoulder strokes were tried and dropped: both turned
  the sea grey and busy.

## Decisions taken without the owner

- **Voyage, not mooring.** The boat holds its place on the page while the sea
  moves under it, and it leaves a wake. The alternative was a moored boat
  bobbing in place; a boat that leaves no sillage contradicts the name.
- **Blue flag, not the mockup's red.** The blog forbids warm accents. The flag
  is 霁 (`ji`), the one fill-only ink. Red is a one-line palette change in the
  script if the owner wants the mockup back.
- **Blue boat, not the mockup's brown hull and cream sails.** Same rule.
- **Dragging can stop the sea but not reverse it.** Running the loop backwards
  would sail the boat astern into her own wake.
- **No crest curls.** Tried on the front row; at this scale they read as stray
  white squiggles, not breaking water.

## Remaining

- [ ] Owner review of the art, light and dark, desktop and phone.
- [ ] Move this file to `notes/archive/` when the branch merges.
