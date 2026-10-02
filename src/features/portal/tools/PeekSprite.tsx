import * as React from 'react';
import type { Grid, LogoRuntimeAnimation, LogoRuntimeDefinition } from '@/features/logos/data/types';
import { gridToSvg, paletteGridToSvg } from '@/features/logos/lib/render';
import type { CellPalette } from '@/features/mascot/peek/model';

/* peek for React: the same frame and beat rules as AnimatedLogo.astro (fps
   or timeline holds, loop override, hover animation idling at rest, the
   `peek:<channel>:set|revert` events, frozen under reduced motion). Frames
   are drawn straight into the DOM, never through React, and only while the
   sprite is on screen, so a page of thirty sprites costs what the visible
   ones cost. */

interface SpriteProps {
  definition: LogoRuntimeDefinition;
  animation: string;
  hoverAnimation?: string;
  loop?: boolean;
  size: number;
  title: string;
  /** Listens for `peek:<channel>:set` and `peek:<channel>:revert`. */
  eventChannel?: string;
  className?: string;
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function PeekSprite({ definition, animation, hoverAnimation, loop, size, title, eventChannel, className }: SpriteProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const height = Math.round((size * definition.height) / definition.width);

  const draw = React.useCallback(
    (grid: Grid) => gridToSvg(grid, definition.width, definition.height, { size, fg: 'currentColor', accent: definition.accent, title }),
    [definition, size, title],
  );
  // The first frame is server-free static markup; the effect takes over.
  const first = React.useMemo(() => ({ __html: draw(definition.animations[animation]?.frames[0] ?? definition.base) }), [definition, animation, draw]);

  React.useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    const animations = definition.animations;
    // Markup per frame, built the first time a frame shows.
    const cache = new Map<LogoRuntimeAnimation, string[]>();
    const frameMarkup = (entry: LogoRuntimeAnimation, index: number): string => {
      let list = cache.get(entry);
      if (!list) {
        list = [];
        cache.set(entry, list);
      }
      list[index] ??= draw(entry.frames[index] ?? entry.frames[0] ?? definition.base);
      return list[index];
    };

    let hover = false;
    let visible = false;
    let override: string | null = null;
    let activeKey = '';
    let beatIndex = 0;
    let frameIndex = 0;
    let raf: number | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    let acc = 0;

    const current = (): LogoRuntimeAnimation | undefined => animations[activeKey] ?? animations.idle;
    const beatMs = (entry: LogoRuntimeAnimation): number => {
      const beat = entry.timeline?.[beatIndex];
      const step = 1000 / Math.max(1, entry.fps);
      if (beat?.holdMs !== undefined) return beat.holdMs;
      if (beat?.holdFrames !== undefined) return step * beat.holdFrames;
      return step;
    };
    const render = (): void => {
      const entry = current();
      if (!entry) return;
      const beat = entry.timeline?.[beatIndex];
      mount.innerHTML = frameMarkup(entry, beat ? beat.frame : frameIndex);
    };
    const stop = (): void => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };

    const tick = (now: number): void => {
      const entry = current();
      const beats = entry?.timeline?.length ?? 0;
      const idleAtRest = Boolean(hoverAnimation) && !hover && !override;
      if (!entry || !visible || reducedMotion() || idleAtRest || (beats === 0 && entry.frames.length <= 1) || beats === 1) {
        stop();
        return;
      }
      acc += now - last;
      last = now;
      const loops = loop ?? entry.loop ?? true;
      while (acc >= beatMs(entry)) {
        acc -= beatMs(entry);
        if (beats > 0) {
          if (beatIndex + 1 < beats) beatIndex += 1;
          else if (loops) beatIndex = 0;
          else {
            render();
            stop();
            return;
          }
        } else if (frameIndex + 1 < entry.frames.length) {
          frameIndex += 1;
        } else if (loops) {
          frameIndex = 0;
        } else {
          render();
          stop();
          return;
        }
        render();
      }
      raf = requestAnimationFrame(tick);
    };

    const start = (): void => {
      const next = override ?? (hover && hoverAnimation ? hoverAnimation : animation);
      if (next !== activeKey) {
        activeKey = next;
        beatIndex = 0;
        frameIndex = 0;
        acc = 0;
        render();
      }
      stop();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    activeKey = animation;

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    observer.observe(mount);

    const cleanups: Array<() => void> = [() => observer.disconnect(), stop];
    const listen = (target: EventTarget, type: string, handler: (event: Event) => void): void => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };

    if (hoverAnimation) {
      const setHover = (value: boolean) => () => {
        hover = value;
        start();
      };
      listen(mount, 'pointerenter', setHover(true));
      listen(mount, 'pointerleave', setHover(false));
      listen(mount, 'focus', setHover(true));
      listen(mount, 'blur', setHover(false));
    }

    if (eventChannel) {
      const clearHold = (): void => {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = null;
      };
      cleanups.push(clearHold);
      listen(window, `peek:${eventChannel}:set`, (event) => {
        const detail = (event as CustomEvent<{ animation?: string; holdMs?: number }>).detail;
        if (!detail?.animation || !animations[detail.animation]) return;
        clearHold();
        override = detail.animation;
        start();
        if (typeof detail.holdMs === 'number' && detail.holdMs > 0) {
          holdTimer = setTimeout(() => {
            override = null;
            holdTimer = null;
            start();
          }, detail.holdMs);
        }
      });
      listen(window, `peek:${eventChannel}:revert`, () => {
        clearHold();
        override = null;
        start();
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [definition, animation, hoverAnimation, loop, eventChannel, draw]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex', width: size, height }}
      tabIndex={hoverAnimation ? 0 : undefined}
      dangerouslySetInnerHTML={first}
    />
  );
}

/** Colours for looks (expressions and costumes); cell values 4 to 10. */
export const LOOK_COLORS: React.CSSProperties = {
  ['--peek-look-accent' as string]: 'oklch(0.62 0.13 25)',
  ['--peek-look-red' as string]: '#e85a4f',
  ['--peek-look-white' as string]: '#fafaf7',
  ['--peek-look-gold' as string]: '#f0c14b',
  ['--peek-look-green' as string]: '#6aa07c',
  ['--peek-look-ink' as string]: '#fafaf7',
  ['--peek-look-purple' as string]: '#9b80d8',
  ['--peek-look-brown' as string]: '#b48662',
};

const LOOK_PALETTE: Record<number, string> = {
  4: 'var(--peek-look-red)',
  5: 'var(--peek-look-white)',
  6: 'var(--peek-look-gold)',
  7: 'var(--peek-look-green)',
  8: 'var(--peek-look-ink)',
  9: 'var(--peek-look-purple)',
  10: 'var(--peek-look-brown)',
};

/** A still, multi-colour look. Needs LOOK_COLORS on an ancestor. */
export function PeekLook({ grid, palette, size, title }: { grid: Grid; palette?: CellPalette; size: number; title: string }) {
  const html = React.useMemo(
    () => ({
      __html: paletteGridToSvg(grid, grid[0]?.length ?? 0, grid.length, {
        size,
        fg: 'currentColor',
        accent: 'var(--peek-look-accent)',
        title,
        extraPalette: { ...LOOK_PALETTE, ...(palette ?? {}) } as Record<number, string>,
      }),
    }),
    [grid, palette, size, title],
  );
  return <span className="inline-flex" dangerouslySetInnerHTML={html} />;
}

/** The static base grid, as PixelLogo drew it. */
export function PeekStill({ grid, width, height, accent, size, title }: { grid: Grid; width: number; height: number; accent: string; size: number; title: string }) {
  const html = React.useMemo(() => ({ __html: gridToSvg(grid, width, height, { size, fg: 'currentColor', accent, title }) }), [grid, width, height, accent, size, title]);
  return <span className="inline-flex" dangerouslySetInnerHTML={html} />;
}
