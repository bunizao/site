// JSX is intentionally avoided here — we use React.createElement directly so the
// component works regardless of whether Vite's dep cache has the dev jsx-runtime
// available. The SVG body is built as an HTML string and injected.
import { createElement, useEffect, useMemo, useState } from 'react';
import { LOGOS, gridToSvg, type LogoId } from '@/features/logos/lib/svg';
import type { Grid } from '@/features/logos/data/types';

export type AnimatedLogoProps = {
  id: LogoId;
  animation?: string;
  hoverAnimation?: string;
  size?: number;
  fps?: number;
  paused?: boolean;
  fg?: string;
  accent?: string;
  className?: string;
  title?: string;
  loop?: boolean;
  onCycle?: () => void;
};

export function AnimatedLogo(props: AnimatedLogoProps) {
  const {
    id,
    animation = 'idle',
    hoverAnimation,
    size = 24,
    fps,
    paused = false,
    fg = 'currentColor',
    accent,
    className,
    title,
    loop,
    onCycle,
  } = props;

  const def = LOGOS[id];
  const [hover, setHover] = useState(false);
  const activeKey = hover && hoverAnimation ? hoverAnimation : animation;
  const anim = def.animations[activeKey] ?? def.animations.idle;
  const effectiveFps = fps ?? anim.fps;
  const accentColor = accent ?? def.accent;

  const reducedMotion = useReducedMotion();
  const shouldLoop = loop ?? anim.loop ?? true;
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [activeKey]);

  // When hoverAnimation is set, the brand is static at rest and only ticks on hover.
  const idleAtRest = !!hoverAnimation && !hover;
  useEffect(() => {
    if (paused || reducedMotion || idleAtRest) return;
    if (anim.frames.length <= 1) return;
    const interval = 1000 / Math.max(1, effectiveFps);
    let raf: number | null = null;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      while (acc >= interval) {
        acc -= interval;
        setFrameIndex((f) => {
          const next = f + 1;
          if (next >= anim.frames.length) {
            onCycle?.();
            return shouldLoop ? 0 : f;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [anim, effectiveFps, paused, reducedMotion, shouldLoop, idleAtRest, onCycle]);

  const grid: Grid = anim.frames[frameIndex] ?? def.base;
  const aspect = def.width / def.height;
  const renderedHeight = Math.round(size / aspect);

  const svg = useMemo(
    () =>
      gridToSvg(grid, def.width, def.height, {
        size,
        fg,
        accent: accentColor,
        title,
      }),
    [grid, def.width, def.height, size, fg, accentColor, title],
  );

  return createElement('span', {
    className,
    style: {
      display: 'inline-flex',
      width: size,
      height: renderedHeight,
      color: fg,
    },
    onMouseEnter: hoverAnimation ? () => setHover(true) : undefined,
    onMouseLeave: hoverAnimation ? () => setHover(false) : undefined,
    onFocus: hoverAnimation ? () => setHover(true) : undefined,
    onBlur: hoverAnimation ? () => setHover(false) : undefined,
    dangerouslySetInnerHTML: { __html: svg },
  });
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return reduced;
}
