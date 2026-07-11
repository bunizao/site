import * as React from 'react';
import { prepareDecode, type DecodeController } from '@bunizao/decode-text';

// A real paragraph, not three words — the decode effect only reads as an effect
// when there's enough text to boil. Each line resolves in shuffled order (the
// engine groups by visual line), so a block of copy churns dramatically before
// settling. Kept mono-friendly and roughly line-length-balanced.
const LINES = [
  'Every pixel here is placed on purpose.',
  'The motion is tuned, never decorated.',
  'Type breathes. Color keeps its restraint.',
  'Nothing moves without earning the frame.',
  'This is the site, decoding itself.',
];
const LOOP_PAUSE_MS = 2400; // settled-copy hold before the next boil

/**
 * Live decode-text demo. Auto-loops while on screen so the tile is always
 * boiling — the effect IS the point — and replays immediately on hover / click.
 * Grow layout needs a monospace host (1ch cells), so the stage stays mono.
 */
export function DecodeTextPreview() {
  const ref = React.useRef<HTMLDivElement>(null);
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
    const c = await prepareDecode(el, { layout: 'grow' });
    controller.current = c;
    c.start();
    await c.finished;
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
    <div
      ref={ref}
      className="decode-preview"
      onMouseEnter={() => void play()}
      onClick={() => void play()}
    >
      {/* Explicit <br> between words: the decode engine groups by real visual
          line and keeps <br>, so this stacks into three lines instead of
          flattening the block <div>s onto one over-wide line. */}
      {LINES.map((line, i) => (
        <React.Fragment key={line}>
          {i > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
    </div>
  );
}

export default DecodeTextPreview;
