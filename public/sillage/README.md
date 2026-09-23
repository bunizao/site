# sillage — sea footer art and sound

The art is generated, not drawn by hand. Every image here comes out of
`scripts/paint-sillage.ts`:

```bash
bun scripts/paint-sillage.ts          # repaint everything
bun scripts/paint-sillage.ts boat     # repaint one piece, both themes
```

The same run writes `src/features/posts/ui/sillage-motion.json` — the geometry,
the boat's ride and the wake timing the component animates this art with. The
two must always come from the same run; commit them together.

## What is here

Two sets, `light/` and `dark/`, of the same picture. Night is repainted in a
night palette, not filtered from day: pastel on black paper puts the lighter
pigment on top, and a filter cannot do that.

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
| `glint.webp`  | Dark only: the stern lantern's reflection. |

## Changing it

Every colour is mixed from `blogPalette` in `src/data/site.ts`. Change an ink
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
