# @bunizao/decode-text

Dependency-free scramble/decode text reveal. Zero runtime deps, ~2 KB min+gz.

Two looks:

- **`grow`** — Soulwire-style: the line condenses in from the left while glyphs boil, then settle. Wants a monospace font (scramble and real glyph must share a width).
- **`static`** — classic decrypt: every character slot is locked to its final width up front and glyphs pop in place. Works in any font.

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
| `charset` | `` __--/\|<> `` | Scramble glyph pool |
| `cursorChar` | `-` | Glyph shown briefly when a cell appears |
| `layout` | `grow` | `grow` (condense, monospace) / `static` (pop in place, any font) |
| `order` | `ltr` | Appearance order within a line: left-to-right or shuffled |
| `spread` | `0.55` | Portion of the line timeline spent appearing |
| `holdMin` / `holdMax` | `0.28` / `0.45` | Scramble hold window (fraction of line timeline) |
| `cursorHold` | `0.05` | Cursor display time after appearing |
| `durationPerChar` | `0.024` | Seconds per character, clamped to `[minLineDuration, maxLineDuration]` |
| `minLineDuration` / `maxLineDuration` | `0.5` / `1.8` | Line duration clamp (seconds) |
| `lineStagger` | `0.16` | Next line starts at this fraction of the summed previous durations |
| `mutationHz` | `10` | Scramble refresh rate per cell (wall time) |
| `ease` | easeInOutSine | Timeline easing `(t: number) => number` |
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
