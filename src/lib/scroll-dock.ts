/**
 * Attach a scroll-driven progress scalar to a host element.
 *
 * Where the browser can advance an animation from the scroller itself, the
 * scalar comes from `animation-timeline: scroll()` and the main thread is out
 * of the loop — the value is derived from the scroll position rather than
 * observed after the fact, so it can never lag the finger by a frame. That lag
 * is what a JS scroll handler cannot avoid, and what reads as "not quite
 * smooth" during momentum scrolling on iOS.
 *
 * Where it cannot, the same two numbers are written per frame from a passive
 * scroll listener. One model on both paths, so they cannot drift.
 *
 * The scalar itself, its curves, and why they are shaped this way: see
 * `@/styles/scroll-dock.css`. Callers own the geometry — publish it as plain
 * custom properties on the same host and derive positions in calc(). Rewriting
 * geometry is then a variable change, not an animation rebuild, which is what
 * makes re-measuring cheap enough to do mid-scroll.
 */

export type DockChannel = 'dock' | 'lift';

export interface DockProgress {
  /** Linear 0..1 across the whole run. */
  ride: number;
  /** 0 for the first 45% of the run, then eased 0..1. */
  fold: number;
}

export interface ScrollDock {
  /** True when the scroller drives the animation and no JS runs per frame. */
  readonly composited: boolean;
  /** Set a channel's run length in scroll px. Cheap — call it from measure(). */
  setRun(channel: DockChannel, px: number): void;
  /** The channel's current value. Valid on both paths. */
  read(channel: DockChannel): DockProgress;
  destroy(): void;
}

/** Where the fold starts, as a fraction of the run. Mirrors the 45% keyframe. */
const FOLD_START = 0.45;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * easeInOutCubic. The stylesheet approximates it as cubic-bezier(.65,0,.35,1);
 * the two paths are mutually exclusive, so the sub-pixel difference between the
 * curves is never on screen at the same time.
 */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const supportsScrollTimeline = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()') === true;

export function createScrollDock(host: HTMLElement, channels: DockChannel[]): ScrollDock {
  const composited = supportsScrollTimeline();
  const runs = new Map<DockChannel, number>(channels.map((channel) => [channel, 1]));
  let ranges = '';

  const read = (channel: DockChannel): DockProgress => {
    const ride = clamp01(window.scrollY / (runs.get(channel) ?? 1));
    return { ride, fold: ease(clamp01((ride - FOLD_START) / (1 - FOLD_START))) };
  };

  /**
   * Seed the scalars inline. On the fallback path this IS the animation; on the
   * composited path it only covers the frame before the animation attaches
   * (WebKit attaches on the frame after the properties land, and an element
   * rendering from `--dock-ride: 0` while the reader is mid-page is a visible
   * jump). Costs nothing once the animation is live, since animation values
   * outrank inline styles.
   */
  const paint = () => {
    for (const channel of channels) {
      const { ride, fold } = read(channel);
      host.style.setProperty(`--${channel}-ride`, ride.toFixed(5));
      host.style.setProperty(`--${channel}-fold`, fold.toFixed(5));
    }
  };

  /** The one part of the animation that depends on measured geometry. */
  const publishRanges = () => {
    if (!composited) return;
    const next = channels
      .flatMap((channel) => {
        const run = `0px ${Math.max(1, runs.get(channel) ?? 1).toFixed(2)}px`;
        return [run, run];
      })
      .join(',');
    if (next === ranges) return;
    ranges = next;
    host.style.setProperty('animation-range', next);
  };

  const onScroll = () => paint();

  if (composited) {
    const names = channels.flatMap((channel) => [`sd-${channel}-ride`, `sd-${channel}-fold`]);
    // Longhands, not the `animation` shorthand: the shorthand resets
    // animation-range, and the range is the one part that gets rewritten later.
    host.style.setProperty('animation-name', names.join(','));
    host.style.setProperty('animation-timing-function', names.map(() => 'linear').join(','));
    host.style.setProperty('animation-fill-mode', names.map(() => 'both').join(','));
    host.style.setProperty(
      'animation-timeline',
      names.map(() => 'scroll(root block)').join(','),
    );
    publishRanges();
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  paint();

  return {
    composited,
    read,
    setRun(channel, px) {
      runs.set(channel, Math.max(1, px));
      publishRanges();
      paint();
    },
    destroy() {
      if (!composited) window.removeEventListener('scroll', onScroll);
      for (const property of [
        'animation-name',
        'animation-timing-function',
        'animation-fill-mode',
        'animation-timeline',
        'animation-range',
        ...channels.flatMap((channel) => [`--${channel}-ride`, `--${channel}-fold`]),
      ]) {
        host.style.removeProperty(property);
      }
    },
  };
}
