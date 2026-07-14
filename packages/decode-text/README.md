# @bunizao/decode-text

Dependency-free scramble/decode text reveal. Zero runtime deps, ~2 KB min+gz.

Two looks:

- **`grow`** — Soulwire-style: the line condenses in from the left while glyphs boil, then settle. Wants a monospace font (scramble and real glyph must share a width).
- **`static`** — classic decrypt: every character slot is locked to its final width up front and glyphs pop in place. Works in any font.

Scheduling is Soulwire's original three-power-front model: a `show` front
(`p^0.5`) floods cursors in early, a `mash` front (`p^2`) graduates them to
boiling scramble, and a `done` front (`p^15`) holds almost everything back
until it crystallises in an end cascade, under `easeInOutQuint`. The scramble
pool also absorbs the text's own ASCII glyphs (`scrambleFromText`), so the
mash reads like the sentence shuffling itself.

Why it feels right:

- **Frame-rate independent.** Scramble mutation is scheduled in wall time, not per frame — a 120 Hz display boils at the same speed as a 60 Hz one.
- **No layout shift.** The host's height is locked, per-frame churn is isolated with `contain: layout paint`, and visual lines are measured and re-homed into nowrap blocks so a growing line never re-wraps the paragraph.
- **Cheap frames.** Settled cells accumulate behind a per-line pointer and are never revisited; in `ltr` order each frame touches only the active window.
- **Backgrounded tabs resume smoothly** (capped-delta clock) instead of snapping to done.
- **Accessible.** Screen readers get the full text immediately via a visually-hidden copy; the animated layer is `aria-hidden`. `prefers-reduced-motion` skips the animation entirely by default.

## Usage

```ts
import { decodeText } from '@bunizao/decode-text';

// Prepare + start immediately.
const controller = await decodeText(document.querySelector('.bio')!, {
  layout: 'grow',      // 'grow' | 'static'
  order: 'ltr',        // 'ltr' | 'shuffle'
});
await controller.finished;
```

To avoid flashing the full text before the reveal, hide the element with CSS,
prepare (which blanks every slot), un-hide, then start on your own cue:

```ts
import { prepareDecode } from '@bunizao/decode-text';

const el = document.querySelector('.bio')!; // visibility: hidden in CSS
const controller = await prepareDecode(el);
el.style.visibility = 'visible';            // visible but blank — no flash
onHeroReady(() => controller.start());
controller.cancel();                        // restore original markup any time
```

Inline markup inside the host is flattened (except `<br>`); color, font-weight
and font-style that differ from the host are baked onto each character, so
`<span class="highlight">` / `<b>` emphasis survives.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `charset` | `` __-—/\|<> `` | Scramble glyph pool |
| `cursorChar` | `-` | Glyph a cell shows between the show and mash fronts |
| `layout` | `grow` | `grow` (condense, monospace) / `static` (pop in place, any font) |
| `order` | `shuffle` | Show/mash queue: `shuffle` (original) or `ltr` (smooth right-edge growth); final resolution is left to right in both modes |
| `showPower` | `0.5` | Show front exponent — cells turn visible as `p^showPower` sweeps the queue |
| `mashPower` | `2` | Mash front exponent — cursor graduates to scramble |
| `donePower` | `15` | Done front exponent — higher = later, sharper end cascade |
| `scrambleFromText` | `true` | Mix the text's own ASCII glyphs into the scramble pool |
| `durationPerChar` | `0.024` | Seconds per character, clamped to `[minLineDuration, maxLineDuration]` |
| `minLineDuration` / `maxLineDuration` | `0.5` / `1.8` | Line duration clamp (seconds) |
| `lineStagger` | `0.16` | Next line starts at this fraction of the summed previous durations |
| `mutationHz` | `18` | Scramble refresh rate per cell (wall time) |
| `ease` | easeInOutQuint | Timeline easing `(t: number) => number` |
| `fontTimeout` | `400` | Max ms to wait for `document.fonts.ready` before measuring |
| `respectReducedMotion` | `true` | Skip animation under `prefers-reduced-motion` |
| `onComplete` | — | Called when the reveal finishes |

### Styling

Cells carry `data-state="cursor"` / `data-state="scramble"` while animating and
get a default inline opacity (0.3 / 0.55). Override with your own CSS:

```css
.bio [data-state='scramble'] { color: var(--accent); opacity: 1 !important; }
```

## Demo

```bash
bun run demo   # vite dev server on the demo/ playground
```

## Publishing

`bun run build` emits `dist/` (ESM + type declarations). Point `exports` at
`dist/` before publishing to npm if your consumers do not compile TypeScript
from `node_modules` (this workspace consumes `src/` directly via Vite).
