import * as React from 'react';
import { prepareDecode, type DecodeController } from '@bunizao/decode-text';

const LINES = ['decode-text', 'boils scrambled glyphs', 'into settled words'];

/**
 * Live decode-text demo. Runs once when it scrolls into view, and replays on
 * hover or click — the preview IS the component, so re-triggering is the point.
 * Grow layout needs a monospace host (1ch cells), so the stage stays mono.
 */
export function DecodeTextPreview() {
  const ref = React.useRef<HTMLDivElement>(null);
  const controller = React.useRef<DecodeController | null>(null);
  const running = React.useRef(false);

  const play = React.useCallback(async () => {
    const el = ref.current;
    if (!el || running.current) return;
    running.current = true;
    controller.current?.cancel();
    const c = await prepareDecode(el, { layout: 'grow' });
    controller.current = c;
    c.start();
    await c.finished;
    running.current = false;
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void play();
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
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
      {LINES.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

export default DecodeTextPreview;
