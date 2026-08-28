# sillage — sea footer art

Placeholders. Every file here is a flat stand-in so the motion, the layering and
the horizon fade can be judged before the drawings exist. Replace the files,
keep the names, and the footer picks them up — the only code change is swapping
the four `--sillage-art-*` URLs in
`src/features/posts/ui/BlogSeaFooter.astro` if the extensions change.

## What to draw

| File | Size (@2x) | Notes |
|------|-----------|-------|
| `sea-near.png` | 3200 × 480 | **Horizontally seamless.** Crest silhouette clear. |
| `sea-far.png`  | 3200 × 360 | **Horizontally seamless.** Paler, flatter, less contrast. |
| `boat.png`     | ~440 × 520 | One boat, transparent ground, **no water**. |
| `cloud.png`    | 3200 × 440 | **Horizontally seamless.** A strip of several clouds, transparent ground. |

Palette sampled from the original mockup: sea `#8ca7c6`, far sea `#aabfd6`,
cloud `#dae5ed`, sail `#e9dcd2`, hull `#6b4a3a`, flag `#c25b52`.

## Three things that will cost a whole afternoon if missed

**Horizontal seamlessness is a hard requirement.** Draw to full width, then
offset the whole layer by half its width (duplicate and shift in Procreate); the
seam shows up in the middle, paint over it, shift back. Without this the drift
visibly jumps once per cycle.

**Draw the hull 40–60px below the waterline.** The boat rides up and down. At
its lowest point the flat bottom edge of the sprite would otherwise show. The
surplus is covered by the near sea at rest and only ever does hidden work.

**No water, foam, or reflection in `boat.png`.** The near sea layer passes in
front of the hull — that overlap is what puts the boat *in* the water rather
than on it. Painted-in water fights the real waves and breaks the illusion.

## What the code already handles

Seamless scrolling at two speeds, the boat's bob and rock, the horizon fade into
the page background in both themes, and the night palette (one filter over the
same assets — there is no separate dark art set to draw). Reduced-motion stops
all of it.
