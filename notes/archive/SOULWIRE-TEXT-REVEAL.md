# Soulwire Text Reveal Research

## Scope

This note documents the large text loading effect on [soulwire.co.uk](https://soulwire.co.uk/) and translates the useful parts into implementation guidance for this project.

The public site does not expose source maps for its JavaScript or CSS bundles. The findings below come from the live HTML, the bundled assets, public GitHub repository checks, and runtime DOM sampling with Playwright.

Sources inspected:

- `https://soulwire.co.uk/`
- `https://soulwire.co.uk/app-9b5a62.js`
- `https://soulwire.co.uk/app-9b5a62.css`
- `https://soulwire.co.uk/sitemap.xml`
- `https://api.github.com/users/soulwire/repos?per_page=100`

Fetched in the local workspace timezone on 2026-06-04. Response headers from the site were dated 2026-06-03 GMT.

## Executive Summary

The effect is not a library trick. It is a small custom text decoder backed by a tiny requestAnimationFrame tween engine.

The important idea is line-first animation:

1. Render real fallback content in the HTML for metadata, no-JS browsing, and crawlers.
2. Mount an animated app shell over that fallback.
3. Measure the final paragraph at its real rendered width.
4. Split the paragraph into visual lines by temporarily wrapping words and grouping them by `offsetTop`.
5. Animate each line as its own non-wrapping block.
6. Within each line, reveal characters in shuffled order through a short cursor and scramble phase.
7. When every line is complete, replace the animated spans with the clean final paragraph.

That line-first choice is the whole taste of the effect. A normal typewriter moves left-to-right and feels mechanical. Soulwire makes the paragraph appear as a composed block, with local noise resolving into text.

## Asset Inventory

The homepage HTML is small, about 6 KB. It includes:

- complete semantic fallback content in `#content`
- an empty `#application` mount node
- one CSS bundle, `app-9b5a62.css`
- one JS bundle, `app-9b5a62.js`
- Google Analytics

The JavaScript bundle is about 55.6 KB uncompressed and 15.8 KB over the wire. The CSS bundle is about 11.7 KB uncompressed and 2.6 KB over the wire. There are no source maps at the adjacent `.map` URLs.

The GitHub account exposes many experiment repositories, but repository search did not reveal the current homepage source. The live bundle is the reliable public implementation surface.

## Runtime Structure

The app is assembled from small components:

- application shell
- greeting
- about text
- header logo/version
- footer links/status
- project menu
- project iframe viewer
- project loader
- canvas transition overlay
- text typer/decoder
- tween utility

The homepage sequence is staggered:

- greeting starts first
- about text starts roughly 0.8 seconds later
- footer starts around the same time as the about text
- header version/logo starts later
- project menu starts last

This matters because the site avoids competing focal points. The user sees a short greeting, then the main paragraph, then the secondary navigation. The effect feels calm because timing does more work than decoration.

## Large Text Loading Effect

### 1. Semantic Fallback

The server HTML already contains the real headline, biography paragraph, navigation links, and footer links in `#content`. The animated app mounts into a separate `#application` node.

The fallback is not explicitly removed in the sampled runtime. Instead, the app layer is absolutely positioned over the page with its own background. This is a pragmatic approach: the content remains available in the document while the visual layer owns the viewport.

For this project, keep the same principle but prefer explicit accessibility handling:

- keep semantic content in Astro-rendered HTML
- hide duplicate animated text from assistive tech with `aria-hidden="true"`
- keep one readable semantic paragraph available to screen readers
- avoid two focusable copies of the same links

### 2. Real Line Measurement

The key helper temporarily rewrites the target element. It splits text by spaces, wraps every word in a temporary span, reads each span's `offsetTop`, groups adjacent words with the same top offset, restores the element, then returns the final visual lines.

That means the line split comes from the actual browser layout, not guessed character counts. It respects:

- font family
- font size
- container width
- word lengths
- browser text layout

Runtime sampling showed:

- 390 px viewport: the intro paragraph became 9 animated lines
- 768 px viewport: the paragraph became 5 animated lines
- 1280 px viewport: the wrapper maxed at 720 px, still 5 animated lines

This is the correct method for paragraph-scale reveals. Guessing line breaks is a bad call because the first unusual word, font fallback, or viewport width will expose it.

### 3. Per-Line Animation

After measurement, the about component creates one span per measured line. Each line span starts as a non-breaking blank and is animated independently.

Important styling:

- the text uses Roboto Mono
- the paragraph has 14 px text and about 1.7 line height
- animated line spans are `display: block`
- animated line spans are `white-space: nowrap`
- temporary scramble glyphs have low opacity

The non-wrapping line spans prevent animated characters from reflowing into different lines while the line resolves. Once all lines complete, the component replaces the animated line spans with the clean final paragraph string.

That final cleanup is important. It removes noisy DOM, fixes copy/paste behavior, and leaves normal text after the show is over.

### 4. Tokenization

The decoder does not blindly split HTML strings by characters. It treats tags and HTML entities as atomic tokens. Tags remain in the output structure, while visible characters join a reveal queue.

This allows the same decoder to animate strings that include links or styled spans without corrupting the markup.

The tradeoff is obvious: because it writes `innerHTML`, the input must be trusted or sanitized before it reaches the decoder. This is acceptable for hardcoded copy, not for user-generated content.

### 5. Decode Algorithm

The decoder builds three structures:

- `items`: all tokens, including HTML tags and entities
- `start`: the initial output skeleton
- `queue`: visible characters with their output indexes

For plain characters, `start` contains an empty slot. For spaces, it keeps a non-breaking space. For tags, it keeps the tag. Then the visible character queue is shuffled.

Each animation frame computes three thresholds from progress:

- `show = progress ^ showPower`
- `mash = progress ^ mashPower`
- `done = progress ^ donePower`

Those powers create three zones:

- characters not yet shown remain blank
- newly reached characters show a cursor marker
- mid-zone characters show a random low-opacity scramble glyph
- completed characters show the final real character

For the large paragraph, Soulwire uses approximately:

- `showPower: 0.8`
- `mashPower: 2`
- `donePower: 6`
- `useInput: false`
- duration per line: `0.0215 * line.length`
- line delay: base delay plus `0.172 * cumulativeLineDuration`

This gives a fast broad reveal followed by a shorter resolving phase. It feels expensive, but it is just exponent curves over an array.

### 6. Timing Observations

Playwright runtime sampling at a 1280 px viewport showed:

- 0 ms: app shell mounted; about lines exist as blank spans
- 500 ms: about area still mostly blank
- 1200 ms: line placeholders remain blank
- 2200 ms: paragraph is in the scramble phase
- 3600 ms: paragraph is clean final text and menu is readable
- 5200 ms: DOM remains stable

The visual effect is short enough to be memorable and long enough to signal craft. Past about four seconds, it would become self-indulgent. Keep it under control.

## Supporting Effects

### Typing Mode

The same text utility also has a simple type mode. It reveals characters from start to end and optionally appends a cursor. Soulwire uses this for small labels like the greeting, section titles, and version text.

Do not use type mode for large paragraphs. It is less elegant and slower to read.

### Menu Decode

The project menu decodes each link label with a smaller stagger. Every link contains an index and title, and each item's duration is proportional to title length.

This is a useful pattern for lists:

- stable final markup per item
- local animation per item
- stagger based on accumulated duration
- no global timeline complexity

### Canvas Transition

Project page transitions use a separate canvas overlay. It draws skewed quadrilateral bands based on progress powers, then switches between obscure and reveal modes.

This is outside the paragraph effect, but the design lesson is relevant: Soulwire separates text animation from route transition animation. The text decoder does one job.

## What To Reuse Here

The reusable idea is not "copy the minified code." The useful pattern is:

- Astro renders the real text
- React enhances it after hydration
- measure actual line breaks
- animate line spans with a small state machine
- clean up to final text after completion
- respect reduced motion

This project already has GSAP, so reimplement the tweening with GSAP instead of copying Soulwire's custom animation engine. Copying a private mini tween engine would be pointless here; dependency surface already exists.

Recommended component shape:

- `src/components/effects/TextDecodeReveal.tsx`
- small, client-only React component
- accepts `text`, optional `as`, `className`, `delay`, `durationScale`
- renders semantic fallback or receives existing text from children
- uses `ResizeObserver` only before animation starts, or recomputes on resize if replay is needed
- uses `prefers-reduced-motion` and renders final text immediately when enabled

Recommended API:

```tsx
<TextDecodeReveal
  text={intro}
  className="max-w-3xl text-sm leading-7"
  delay={0.4}
/>
```

Keep the API small. Effects rot fast when they become little animation frameworks.

## Implementation Sketch

This sketch describes the structure, not source copied from Soulwire.

```ts
type Token =
  | { kind: "html"; value: string }
  | { kind: "space"; value: " " }
  | { kind: "char"; value: string; index: number };

type DecodeOptions = {
  duration: number;
  delay?: number;
  scramble?: string;
  showPower?: number;
  mashPower?: number;
  donePower?: number;
};
```

Line measurement:

```ts
function measureLines(element: HTMLElement, text: string): string[] {
  const original = element.innerHTML;
  element.innerHTML = text
    .split(" ")
    .map((word) => `<span data-line-token>${word}</span>`)
    .join(" ");

  const lines: string[][] = [];
  let currentTop = -1;

  element.querySelectorAll<HTMLElement>("[data-line-token]").forEach((word) => {
    const top = word.offsetTop;
    if (top !== currentTop) {
      currentTop = top;
      lines.push([]);
    }
    lines[lines.length - 1].push(word.innerHTML);
  });

  element.innerHTML = original;
  return lines.map((line) => line.join(" "));
}
```

Decode frame:

```ts
function renderDecodeFrame(tokens: Token[], progress: number, options: DecodeOptions): string {
  const showCount = Math.floor(Math.pow(progress, options.showPower ?? 0.8) * tokens.length);
  const mashCount = Math.floor(Math.pow(progress, options.mashPower ?? 2) * tokens.length);
  const doneCount = Math.floor(Math.pow(progress, options.donePower ?? 6) * tokens.length);

  // Build output from the stable token skeleton, then fill indexes from the shuffled queue.
  // Use low-opacity spans for scramble glyphs and final characters for completed indexes.
  return "";
}
```

The actual component should keep the measured lines in React state, then let GSAP drive a numeric progress object and update only the current line element's `innerHTML` per frame.

## Production Notes

Use this effect sparingly:

- Good: a homepage intro, manifesto excerpt, section opener, or short project summary.
- Bad: every paragraph, every card, every hover state.

Guardrails:

- Always support reduced motion.
- Keep final text in normal DOM after animation.
- Sanitize any string that can contain user content.
- Avoid replaying the paragraph on every route transition.
- Keep long paragraphs under roughly 400 visible characters.
- Avoid layout shift by measuring after fonts are ready.
- Do not block navigation or reading while the effect plays.

Recommended timing:

- title labels: 0.2-0.4 seconds
- paragraph lines: 0.4-0.9 seconds per line, staggered
- full paragraph: 1.8-3.2 seconds
- maximum hard cap: 3.8 seconds

## Risks

### Font Loading

Soulwire imports Roboto Mono from Google Fonts. If measurement runs before the final font is active, line breaks can differ. In a modern implementation, wait for `document.fonts.ready` before measuring.

### Resize During Animation

Soulwire measures once for the intro animation. That is fine because the final paragraph is restored after completion. If the viewport changes mid-animation, temporary line spans may no longer match the new width.

For this project, either:

- lock the animation after first measurement and accept the rare resize edge case, or
- cancel and remeasure on resize before completion.

The first option is usually better. The second option is more code for a low-value edge case.

### HTML Input

The decoder's HTML-token support is useful, but it increases risk if fed untrusted content. Use plain text by default. Only allow HTML for hardcoded strings or sanitized rich text.

### Accessibility

Animated scrambled text can be bad for screen readers if exposed. Put the animated layer behind `aria-hidden="true"` and render a stable semantic copy for assistive tech.

### Performance

The effect writes `innerHTML` on animation frames. It is acceptable for one intro paragraph and a small menu. It is a bad pattern for large feeds or repeated cards.

Use it as a hero-level enhancement, not a list rendering primitive.

## Recommended Take

Use the Soulwire method, not the Soulwire code.

The best version for this project is a small React enhancement component:

- Astro keeps real readable content.
- React measures visual lines after fonts are ready.
- GSAP drives progress.
- A local decoder renders temporary line spans.
- Reduced motion gets the final text immediately.
- The component cleans itself up after the reveal.

That keeps the charm and drops the baggage.
