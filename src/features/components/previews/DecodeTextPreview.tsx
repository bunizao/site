import * as React from 'react';
import { prepareDecode, type DecodeController } from '@bunizao/decode-text';

// A real paragraph, not three words — the decode effect only reads as an effect
// when there's a body of text to boil. Visual lines scramble independently, then
// settle left to right. More lines, smaller type = more surface for the noise.
//
// `mark` renders at full foreground against a dimmed body. Colour is the only
// highlight the engine can carry: it bakes color, font-weight and font-style
// onto each cell and drops the rest, and weight would break the 1ch grid.
const LINES = [
  'Nothing here arrives all at once. Every glyph',
  'picks a cursor, boils through a scramble, then',
  'settles into **the letter it was always going**',
  '**to be** — left to right, one at a time, so the',
  'paragraph still reads in order while it is only',
  'half resolved. What you are watching is the site',
  'itself, quietly decoding into the thing you see.',
];
const LOOP_PAUSE_MS = 2600; // settled-copy hold before the next boil

/**
 * Live decode-text demo. Auto-loops while on screen so the tile is always
 * boiling — the effect IS the point — and replays immediately on hover / click.
 * Grow layout needs a monospace host (1ch cells), so the stage stays mono.
 */
export function DecodeTextPreview() {
  const ref = React.useRef<HTMLSpanElement>(null);
  const controller = React.useRef<DecodeController | null>(null);
  const running = React.useRef(false);
  const loopTimer = React.useRef<number | undefined>(undefined);
  const onScreen = React.useRef(false);
  // The clean <br>-separated markup, captured once. Each boil restores it before
  // measuring — otherwise the loop's next prepareDecode reads the already-split
  // .dt-line DOM (no <br>) and re-flattens the three words onto one over-wide
  // line, which overflows the tile.
  const original = React.useRef<string>('');

  const play = React.useCallback(async () => {
    const el = ref.current;
    if (!el || running.current) return;
    running.current = true;
    window.clearTimeout(loopTimer.current);
    controller.current?.cancel();
    el.innerHTML = original.current;
    const nextController = await prepareDecode(el, { layout: 'grow' });
    controller.current = nextController;
    nextController.start();
    await nextController.finished;
    running.current = false;
    // Keep the loop alive only while the tile is visible — a hidden tab or a
    // scrolled-away tile shouldn't burn frames.
    if (onScreen.current) {
      loopTimer.current = window.setTimeout(() => void play(), LOOP_PAUSE_MS);
    }
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    original.current = el.innerHTML;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        onScreen.current = visible;
        if (visible && !running.current) void play();
        else if (!visible) window.clearTimeout(loopTimer.current);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(loopTimer.current);
      controller.current?.cancel();
    };
  }, [play]);

  return (
    <button
      type="button"
      aria-label="Replay decode text animation"
      className="block w-full cursor-pointer appearance-none border-0 bg-transparent p-0"
      onMouseEnter={() => void play()}
      onClick={() => void play()}
    >
      <span ref={ref} className="decode-preview">
        {/* Explicit <br> between lines: the decode engine groups by real visual
            line and keeps <br>, so this stacks instead of flattening the whole
            paragraph onto one over-wide line. */}
        {LINES.map((line, i) => (
          <React.Fragment key={line}>
            {i > 0 && <br />}
            {line.split('**').map((segment, j) =>
              j % 2 === 1 ? (
                <span key={j} className="decode-preview-mark">
                  {segment}
                </span>
              ) : (
                <React.Fragment key={j}>{segment}</React.Fragment>
              )
            )}
          </React.Fragment>
        ))}
      </span>
    </button>
  );
}

export default DecodeTextPreview;
