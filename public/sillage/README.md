# sillage — sea footer art and sound

The art is generated, not drawn by hand. Every image here comes out of
`scripts/paint-sillage.ts`:

```bash
bun scripts/paint-sillage.ts          # repaint everything
bun scripts/paint-sillage.ts boat     # repaint one piece, in every set
```

The same run writes `src/features/posts/ui/sillage-motion.json` — the geometry,
the boat's ride and the wake timing the component animates this art with. The
two must always come from the same run; commit them together.

## What is here

Four sets of the same picture: `light/` and `dark/`, and `dusk-light/` and
`dusk-dark/` (blue hour) for the reader's evening. Each is repainted in its own
palette, not filtered from day: pastel on black paper puts the lighter pigment
on top, and a filter cannot do that. Only one set ever loads.

| File | Notes |
|------|-------|
| `front.webp`  | The nearest row of waves, across the lower sea, on its own faster loop. Seamless tile. |
| `near.webp`   | The sea in front of the boat. Seamless tile, opaque below the surface — it hides the hull. |
| `back.webp`   | A paler swell behind the boat, on its own slower loop. Seamless tile. |
| `clouds.webp` | A strip of small cumulus. Seamless tile. |
| `boat.webp`   | The boat, hull painted well below the waterline for pitch. |
| `flag.webp`   | Separate so it can flutter. |
| `foam.webp`   | Six wake streaks stacked as rows. Splashes reuse them. |
| `spray.webp`  | The bow wave. |
| `drops.webp`  | Four droplets stacked as rows, for the splash a touch makes. |
| `glint.webp`  | Wherever the lantern is lit (all but day): its reflection. |
| `dolphin.webp`| Leaps out of the near water at a touch. |
| `fish.webp`   | One of a jumping shoal. |
| `gull.webp`   | Day and dusk skies: two frames of a wingbeat, stacked. |
| `star.webp`   | Night and blue hour skies: lit where the sky is touched. |
| `sky.webp`    | Dusk sets only: the sky's colour, crayoned from the far swell up and gone to bare page before the footer's text. Tiles across; lossless alpha, because a lossy one bands. |
| `sun.webp`    | `dusk-light/` only: the low sun in its haze, half behind the far swell. |
| `glitter.webp`| `dusk-light/` only: the sun's road, from the far swell to the front row. |
| `moon.webp`   | `dusk-dark/` only: blue hour's new moon. The first stars reuse `star.webp`. |

## Changing it

Every day and night colour is mixed from `blogPalette` in `src/data/site.ts`;
dusk has its own few warm inks at the top of `palettes()`. Change an ink
there, re-run, and the sea follows. The swells, the boat's position on the tile
and the tempo are constants at the top of the script; the boat's ride is
sampled from the same swell, so it stays true to whatever the water does. The
surface function itself lives in `src/features/posts/ui/sillage-surface.ts`,
because the footer's touch code uses it too: a splash lands on the water that
was painted.

## Sound

`sound/` is cut from public-domain field recordings by
`scripts/cut-sillage-sound.sh`, which takes the downloaded sources as its
argument. All three sources are CC0 1.0: no attribution required.

| File | Cut from |
|------|----------|
| `surf.m4a`   | "WATRSurf — Surf; medium distance; loopable", USC / Sunset Editorial, [archive.org/details/SSE_Library_WATER](https://archive.org/details/SSE_Library_WATER). 14.3–41.7 s, crossfaded into a 24 s loop. |
| `wash.m4a`   | "BOATWash — Excursion boat with water surges on bow (no motor)", USC / Sunset Editorial, [archive.org/details/SSE_Library_BOATS](https://archive.org/details/SSE_Library_BOATS). Band-passed, 22 s loop. |
| `splash.m4a` | `splash_03, 12, 14, 04, 15, 06, 13` from "40 CC0 water/splash/slime SFX" by rubberduck, [opengameart.org](https://opengameart.org/content/40-cc0-water-splash-slime-sfx). One per second, in that order; the first four are for a touch. |

Change the takes or their order in the script and in `sillage-sound.ts`
(`TAKES`, `BIG`) together.
