import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';

interface ParticleVeilProps {
  children: ReactNode;
  /** When true the frosted mask dissolves into particles that collapse downward. */
  revealed: boolean;
  /** Layout classes for the content row underneath the veil. */
  className?: string;
}

interface Particle {
  hx: number; // home position (grid)
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  delay: number; // frames to wait before falling — drives the top-down cave-in
}

const SPACING = 8;
const MAX_DPR = 2;

// Deterministic hash so particle jitter/size stay stable across rebuilds.
function pseudo(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Hides its content behind a frosted-glass mask. On reveal the mask sharpens
 * away while its surface — drawn as a field of monochrome particles — caves in
 * from the top and collapses downward, dissolving as it falls.
 */
export function ParticleVeil({ children, revealed, className }: ParticleVeilProps) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<{ collapse: () => void; reform: () => void } | null>(null);

  useEffect(() => {
    if (reduced) return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let phase: 'cover' | 'collapse' | 'reform' = revealed ? 'collapse' : 'cover';
    let raf: number | null = null;
    let size = { w: 0, h: 0 };

    const build = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      size = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const next: Particle[] = [];
      for (let gy = SPACING / 2; gy < h; gy += SPACING) {
        for (let gx = SPACING / 2; gx < w; gx += SPACING) {
          const jx = (pseudo(gx, gy) - 0.5) * 3;
          const jy = (pseudo(gy, gx) - 0.5) * 3;
          const hx = gx + jx;
          const hy = gy + jy;
          next.push({
            hx,
            hy,
            x: hx,
            y: hy,
            vx: 0,
            vy: 0,
            size: 1.7 + pseudo(gx * 7, gy) * 1.5,
            alpha: 0,
            baseAlpha: 0.42 + pseudo(gx, gy * 3) * 0.28,
            delay: 0,
          });
        }
      }
      particles = next;
      // Cover state fades the veil in; revealed state stays cleared.
      if (phase === 'cover') ensureLoop();
      else draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, size.w, size.h);
      const dark = document.documentElement.classList.contains('dark');
      const rgb = dark ? '255,255,255' : '10,10,10';
      for (const p of particles) {
        if (p.alpha <= 0.01) continue;
        ctx.fillStyle = `rgba(${rgb},${p.alpha.toFixed(3)})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    };

    const step = (): boolean => {
      let alive = false;

      if (phase === 'collapse') {
        for (const p of particles) {
          if (p.delay > 0) {
            p.delay -= 1;
            if (p.alpha < p.baseAlpha) p.alpha = p.baseAlpha;
            alive = true;
            continue;
          }
          p.vy += 0.2; // gravity
          p.y += p.vy;
          p.x += p.vx;
          p.alpha -= 0.02;
          if (p.alpha > 0.01) alive = true;
        }
      } else if (phase === 'reform') {
        for (const p of particles) {
          p.x = p.hx;
          p.y = p.hy;
          p.vx = 0;
          p.vy = 0;
          p.delay = 0;
          if (p.alpha < p.baseAlpha) {
            p.alpha = Math.min(p.baseAlpha, p.alpha + 0.07);
            alive = true;
          }
        }
        if (!alive) phase = 'cover';
      } else {
        // cover — settle the veil to full strength, then idle
        for (const p of particles) {
          if (p.alpha < p.baseAlpha) {
            p.alpha = Math.min(p.baseAlpha, p.alpha + 0.08);
            alive = true;
          }
        }
      }

      draw();
      return alive;
    };

    const loop = () => {
      raf = step() ? requestAnimationFrame(loop) : null;
    };
    const ensureLoop = () => {
      if (raf == null) raf = requestAnimationFrame(loop);
    };

    apiRef.current = {
      collapse: () => {
        for (const p of particles) {
          if (p.alpha <= 0) p.alpha = p.baseAlpha;
          p.vy = 0.4 + pseudo(p.hx, p.hy) * 0.9;
          p.vx = (pseudo(p.hy, p.hx) - 0.5) * 1.1;
          p.delay = Math.round((p.hy / Math.max(1, size.h)) * 14 + pseudo(p.hx * 3, p.hy) * 5);
        }
        phase = 'collapse';
        ensureLoop();
      },
      reform: () => {
        phase = 'reform';
        ensureLoop();
      },
    };

    build();
    const ro = new ResizeObserver(build);
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const api = apiRef.current;
    if (!api) return;
    if (revealed) api.collapse();
    else api.reform();
  }, [revealed, reduced]);

  return (
    <div ref={wrapRef} className="relative">
      <div className={className}>{children}</div>

      {!reduced && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl bg-[hsl(var(--background)/0.5)] backdrop-blur-[9px] transition-opacity duration-[420ms] ease-[cubic-bezier(0.2,0,0,1)]"
            style={{ opacity: revealed ? 0 : 1 }}
          />
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        </>
      )}
    </div>
  );
}
