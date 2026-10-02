import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { cn } from '@/lib/utils';
import { SMALL } from '../activity/table';

/* Pieces the preview tools share: a device frame that changes width without
   reloading what is inside it, a copy button that answers on the press, and
   j/k stepping through a list. */

export type Device = 'desktop' | 'phone';

export const DEVICE_OPTIONS = [
  { value: 'desktop' as Device, label: 'Desktop', ariaLabel: 'Desktop width' },
  { value: 'phone' as Device, label: 'Phone', ariaLabel: 'Phone width, 390 pixels' },
];

const PHONE_WIDTH = 390;
const PHONE_INSET = 16;

/** Reads `device` from the URL, defaulting to desktop. */
export function readDevice(search: URLSearchParams): Device {
  return search.get('width') === 'phone' ? 'phone' : 'desktop';
}

/** The size of an element, measured before first paint and kept current. */
export function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect();
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** `value`, one painted frame late. A width switch relays out the whole
    page in the frame, which can take longer than a frame; the pressed
    control paints first, and the page follows in the next frame. */
function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = React.useState(value);
  React.useEffect(() => {
    if (Object.is(shown, value)) return;
    let timer = 0;
    // A task queued from a frame callback runs after that frame paints.
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setShown(value));
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [value, shown]);
  return shown;
}

/** An iframe at a real device width, scaled down to fit when the pane is
    narrower. Desktop fills the pane at `desktopMin` pixels or more; phone is
    390 pixels, centred. Switching only restyles the same iframe, so the page
    inside keeps its state and scroll position. */
export function DeviceFrame({
  device: wanted,
  desktopMin,
  frameRef,
  className,
  ...iframe
}: {
  device: Device;
  desktopMin: number;
  frameRef?: React.Ref<HTMLIFrameElement>;
  className?: string;
} & React.ComponentProps<'iframe'>) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const { width, height } = useSize(boxRef);
  const device = useAfterPaint(wanted);

  let style: React.CSSProperties = { visibility: 'hidden' };
  if (width > 0 && height > 0) {
    if (device === 'phone') {
      const scale = Math.min(1, (width - PHONE_INSET * 2) / PHONE_WIDTH);
      style = {
        width: PHONE_WIDTH,
        height: (height - PHONE_INSET * 2) / scale,
        transform: `translate(${(width - PHONE_WIDTH * scale) / 2}px, ${PHONE_INSET}px) scale(${scale})`,
      };
    } else {
      const viewport = Math.max(width, desktopMin);
      const scale = width / viewport;
      style = { width: viewport, height: height / scale, transform: `scale(${scale})` };
    }
  }

  return (
    <div ref={boxRef} className={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden', className)}>
      <iframe
        ref={frameRef}
        {...iframe}
        style={{ ...style, ...iframe.style }}
        className={cn(
          'absolute top-0 left-0 origin-top-left border-0 bg-white',
          device === 'phone' && 'rounded-[20px] shadow-[0_0_0_1px_hsl(var(--border))]',
        )}
      />
    </div>
  );
}

/** Copies `text` and says so on the button for a moment. The press shows at
    once; the clipboard write is not awaited for that. */
export function CopyButton({ text, label = 'Copy URL', className }: { text: string | (() => string); label?: string; className?: string }) {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = (): void => {
    const value = typeof text === 'function' ? text() : text;
    const settle = (next: 'copied' | 'failed'): void => {
      setState(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), 1400);
    };
    setState('copied');
    navigator.clipboard.writeText(value).then(() => settle('copied'), () => settle('failed'));
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={copy} className={cn(SMALL, 'active:bg-accent', className)} aria-live="polite">
      {state === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </Button>
  );
}

/** Moves the selection by one through `ids`, wrapping at neither end. */
export function step(ids: readonly string[], current: string | null, by: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const index = current ? ids.indexOf(current) : -1;
  if (index === -1) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, index + by))];
}

/** Keeps `id`'s row in view inside its scroll container, without smooth
    scrolling, so a held key never lags behind the selection. */
export function revealRow(container: HTMLElement | null, id: string | null): void {
  if (!container || !id) return;
  const row = container.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
  row?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}
