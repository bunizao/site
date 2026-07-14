import * as React from 'react';
import { prepareDecode, type DecodeController } from '@bunizao/decode-text';

// A real paragraph, not three words — the decode effect only reads as an effect
// when there's a body of text to boil. Each line resolves in shuffled order (the
// engine groups by visual line), so a full block churns dramatically before
// settling. More lines, smaller type = more surface for the noise to crawl over.
const LINES = [
  'Every pixel here is placed on purpose, and',
  'the motion is tuned rather than decorated.',
  'Type is given room to breathe; colour keeps',
  'its restraint. Radius stays concentric, hit',
  'targets stay honest, and nothing moves on',
  'the screen without first earning the frame.',
  'What you are watching is the site itself,',
  'quietly decoding into the thing you see.',
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
      <span
        ref={ref}
        className="decode-preview block w-full select-none text-center font-mono text-xl font-semibold leading-relaxed text-foreground sm:text-2xl"
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
      </span>
    </button>
  );
}

export default DecodeTextPreview;
