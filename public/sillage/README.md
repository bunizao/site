# sillage — sea footer art

Generated, not drawn by hand. Every file here comes out of
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
| `near.webp`   | The sea in front of the boat. Seamless tile, opaque below the surface — it hides the hull. |
| `back.webp`   | A paler swell behind the boat, on its own slower loop. Seamless tile. |
| `clouds.webp` | A strip of small cumulus. Seamless tile. |
| `boat.webp`   | The boat, hull painted well below the waterline for pitch. |
| `flag.webp`   | Separate so it can flutter. |
| `foam.webp`   | Six wake streaks stacked as rows. |
| `glint.webp`  | Dark only: the stern lantern's reflection. |

## Changing it

Every colour is mixed from `blogPalette` in `src/data/site.ts`. Change an ink
there, re-run, and the sea follows. The swell, the boat's position on the tile
and the tempo are constants at the top of the script; the boat's ride is
sampled from the same swell, so it stays true to whatever the water does.
