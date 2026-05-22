import { createElement, useEffect, useMemo, useState } from 'react';
import type { Grid, LogoRuntimeDefinition } from '@/features/logos/data/types';

export type AnimatedLogoProps = {
  definition: LogoRuntimeDefinition;
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
  /**
   * If set, the component listens for `window` events named
   *   `peek:<eventChannel>:set`       — payload { animation: string, holdMs?: number }
   *   `peek:<eventChannel>:revert`    — reverts to the base animation prop
   * Lets imperative nav code drive the mascot's expression without prop-drilling.
   */
  eventChannel?: string;
};

export function AnimatedLogo(props: AnimatedLogoProps) {
  const {
    definition,
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
    eventChannel,
  } = props;

  const def = definition;
  const [hover, setHover] = useState(false);
  // Animation override driven by external events (null = use prop).
  const [override, setOverride] = useState<string | null>(null);
  const propAnim = animation;
  const activeKey = override
    ? override
    : hover && hoverAnimation
      ? hoverAnimation
      : propAnim;
  const anim = def.animations[activeKey] ?? def.animations.idle;
  const effectiveFps = fps ?? anim.fps;
  const accentColor = accent ?? def.accent;

  // Subscribe to external override events when a channel is declared.
  useEffect(() => {
    if (!eventChannel || typeof window === 'undefined') return;
    const setName = `peek:${eventChannel}:set`;
    const revertName = `peek:${eventChannel}:revert`;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const clearHold = () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent<{ animation: string; holdMs?: number }>).detail;
      if (!detail || !detail.animation) return;
      if (!def.animations[detail.animation]) return;
      clearHold();
      setOverride(detail.animation);
      if (typeof detail.holdMs === 'number' && detail.holdMs > 0) {
        holdTimer = setTimeout(() => {
          setOverride(null);
          holdTimer = null;
        }, detail.holdMs);
      }
    };
    const onRevert = () => {
      clearHold();
      setOverride(null);
    };
    window.addEventListener(setName, onSet as EventListener);
    window.addEventListener(revertName, onRevert);
    return () => {
      clearHold();
      window.removeEventListener(setName, onSet as EventListener);
      window.removeEventListener(revertName, onRevert);
    };
  }, [eventChannel, def]);

  const reducedMotion = useReducedMotion();
  const shouldLoop = loop ?? anim.loop ?? true;
  const [frameIndex, setFrameIndex] = useState(0);
  const timeline = anim.timeline;
  const hasTimeline = !!timeline?.length;

  useEffect(() => {
    setFrameIndex(0);
  }, [activeKey]);

  // When hoverAnimation is set, the brand is static at rest and only ticks on
  // hover — unless an external override is driving a specific expression.
  const idleAtRest = !!hoverAnimation && !hover && !override;
  useEffect(() => {
    if (paused || reducedMotion || idleAtRest) return;
    const frameCount = hasTimeline ? timeline.length : anim.frames.length;
    if (frameCount <= 1) return;
    const getInterval = (index: number) => {
      const beat = timeline?.[index];
      if (beat?.holdMs !== undefined) return beat.holdMs;
      if (beat?.holdFrames !== undefined) return (1000 / Math.max(1, effectiveFps)) * beat.holdFrames;
      return 1000 / Math.max(1, effectiveFps);
    };
    let raf: number | null = null;
    let last = performance.now();
    let acc = 0;
    let currentIndex = 0;
    let stopped = false;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      while (acc >= getInterval(currentIndex)) {
        const interval = getInterval(currentIndex);
        acc -= interval;
        const next = currentIndex + 1;
        if (next >= frameCount) {
          onCycle?.();
          if (!shouldLoop) {
            currentIndex = frameCount - 1;
            setFrameIndex(currentIndex);
            stopped = true;
            break;
          }
          currentIndex = 0;
        } else {
          currentIndex = next;
        }
        setFrameIndex(currentIndex);
      }
      if (stopped) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [anim, effectiveFps, paused, reducedMotion, shouldLoop, idleAtRest, onCycle, hasTimeline, timeline]);

  const gridIndex = hasTimeline ? timeline?.[frameIndex]?.frame ?? 0 : frameIndex;
  const grid: Grid = anim.frames[gridIndex] ?? def.base;
  const aspect = def.width / def.height;
  const renderedHeight = Math.round(size / aspect);

  const svg = useMemo(
    () => renderGridSvg(grid, {
      width: def.width,
      height: def.height,
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
  }, svg);
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

function renderGridSvg(
  grid: Grid,
  opts: {
    width: number;
    height: number;
    size: number;
    fg: string;
    accent?: string;
    title?: string;
  }
) {
  const { width, height, size, fg, accent, title } = opts;
  const renderedHeight = (size * height) / width;
  const cells = [];

  for (let y = 0; y < height; y += 1) {
    const row = grid[y];
    for (let x = 0; x < width; x += 1) {
      const value = row[x];
      if (value !== 1 && value !== 3) {
        continue;
      }

      cells.push(createElement('rect', {
        key: `${x}:${y}`,
        x,
        y,
        width: 1,
        height: 1,
        fill: value === 3 ? accent ?? 'var(--logo-accent, currentColor)' : fg,
      }));
    }
  }

  return createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: renderedHeight,
      role: title ? 'img' : undefined,
      'aria-label': title,
      'aria-hidden': title ? undefined : true,
      viewBox: `0 0 ${width} ${height}`,
      shapeRendering: 'crispEdges',
    },
    title ? createElement('title', { key: 'title' }, title) : null,
    ...cells,
  );
}
