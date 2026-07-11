import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue, useAnimationFrame, animate } from 'framer-motion';

interface DialItem {
  slug: string;
  title: string;
  kind: string;
}

interface Props {
  items: DialItem[];
}

// A horizontal precision dial — the mood wheel laid on its side. Ticks drift
// left on their own so the first screen is alive; drag to scrub with inertia.
// The component nearest the center readout is active; click it to open.
const SPACING = 208; // px between adjacent components on the dial
const MINORS = 8; // minor ticks between two components
const DRIFT = 14; // idle drift speed, px/s
const FRICTION = 4.5; // inertia decay after a throw

export default function ComponentsDial({ items }: Props) {
  const len = items.length;
  const cycle = len * SPACING;

  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tx = useMotionValue(0); // strip translate, kept within (-cycle, 0]
  const [width, setWidth] = useState(1200);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Pointer + inertia state kept in refs so the animation frame stays cheap.
  const drag = useRef({ down: false, moved: false, lastX: 0, vx: 0, lastT: 0 });
  const velocity = useRef(0);
  const paused = useRef(false);

  useEffect(() => {
    const measure = () => setWidth(wrapRef.current?.offsetWidth ?? 1200);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Drive the strip transform straight from the motion value — no re-renders.
  useEffect(() => {
    const apply = (v: number) => {
      if (stripRef.current) stripRef.current.style.transform = `translate3d(${v}px,0,0)`;
    };
    apply(tx.get());
    return tx.on('change', apply);
  }, [tx]);

  // Enough repeats to always cover the viewport plus a cycle of slack.
  const copies = Math.max(4, Math.ceil(width / cycle) + 3);
  const stripWidth = copies * cycle;
  const leftBase = width / 2 - stripWidth / 2;

  const majorAt = useCallback(
    (screenCenter: number, txv: number) =>
      Math.round((screenCenter - leftBase - txv) / SPACING),
    [leftBase]
  );

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useAnimationFrame((_t, delta) => {
    const dt = Math.min(delta, 64) / 1000;
    let v = velocity.current;

    if (!drag.current.down) {
      // Idle drift (leftward) unless the user paused it by hovering.
      const idle = paused.current || reduceMotion ? 0 : -DRIFT;
      // Ease residual throw velocity back toward the idle drift.
      v = idle + (v - idle) * Math.exp(-FRICTION * dt);
      velocity.current = Math.abs(v - idle) < 0.4 ? idle : v;
      let next = tx.get() + v * dt;
      // Seamless wrap — the strip is periodic, so a whole-cycle jump is invisible.
      if (next <= -cycle) next += cycle;
      if (next > 0) next -= cycle;
      tx.set(next);
    }

    const idx = ((majorAt(width / 2, tx.get()) % len) + len) % len;
    setActive((prev) => (prev === idx ? prev : idx));
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { down: true, moved: false, lastX: e.clientX, vx: 0, lastT: performance.now() };
    velocity.current = 0;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.down) return;
    const now = performance.now();
    const dx = e.clientX - drag.current.lastX;
    if (Math.abs(dx) > 2) drag.current.moved = true;
    const dt = Math.max(now - drag.current.lastT, 1) / 1000;
    drag.current.vx = dx / dt;
    drag.current.lastX = e.clientX;
    drag.current.lastT = now;
    let next = tx.get() + dx;
    if (next <= -cycle) next += cycle;
    if (next > 0) next -= cycle;
    tx.set(next);
  };

  const endDrag = () => {
    if (!drag.current.down) return;
    // Hand the throw velocity to the frame loop as inertia.
    velocity.current = Math.max(-4000, Math.min(4000, drag.current.vx));
    drag.current.down = false;
    setDragging(false);
  };

  // Snap the dial so a given component lands on the center readout.
  const snapTo = useCallback(
    (slug: string) => {
      const target = items.findIndex((it) => it.slug === slug);
      if (target < 0) return;
      const current = majorAt(width / 2, tx.get());
      const currentMod = ((current % len) + len) % len;
      let step = target - currentMod;
      if (step > len / 2) step -= len;
      if (step < -len / 2) step += len;
      const dest = tx.get() - step * SPACING;
      velocity.current = 0;
      animate(tx.get(), dest, {
        duration: 0.5,
        ease: [0.23, 1, 0.32, 1],
        onUpdate: (v) => {
          let n = v;
          if (n <= -cycle) n += cycle;
          if (n > 0) n -= cycle;
          tx.set(n);
        },
      });
    },
    [items, len, majorAt, width, cycle, tx]
  );

  // Build the visible strip of ticks once; it moves via transform only.
  const majors = useMemo(() => Array.from({ length: copies * len }, (_, j) => j), [copies, len]);

  const activeItem = items[active];

  return (
    <div className="dial" ref={wrapRef}>
      <div className="dial-fade dial-fade--l" aria-hidden="true" />
      <div className="dial-fade dial-fade--r" aria-hidden="true" />

      {/* Center reticle */}
      <div className="dial-reticle" aria-hidden="true">
        <span className="dial-reticle-caret" />
        <span className="dial-reticle-line" />
      </div>

      <div
        className="dial-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        data-dragging={dragging || undefined}
      >
        <div className="dial-strip" ref={stripRef} style={{ left: leftBase, width: stripWidth }}>
          {majors.map((j) => {
            const item = items[j % len];
            const isActive = j % len === active;
            return (
              <div className="dial-col" key={j} style={{ left: j * SPACING }}>
                <a
                  className="dial-label"
                  href={`/components/${item.slug}`}
                  data-active={isActive || undefined}
                  onClick={(e) => {
                    if (drag.current.moved) {
                      e.preventDefault();
                      return;
                    }
                    if (!isActive) {
                      e.preventDefault();
                      snapTo(item.slug);
                    }
                  }}
                  tabIndex={-1}
                >
                  {item.title}
                </a>
                <span className="dial-tick dial-tick--major" />
                {Array.from({ length: MINORS - 1 }, (_, m) => (
                  <span
                    className="dial-tick dial-tick--minor"
                    key={m}
                    style={{ left: ((m + 1) * SPACING) / MINORS }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Readout */}
      <div className="dial-readout">
        <span className="dial-readout-index">
          {String(active + 1).padStart(2, '0')} / {String(len).padStart(2, '0')}
        </span>
        <a className="dial-readout-title" href={`/components/${activeItem.slug}`}>
          {activeItem.title}
          <span className="dial-readout-open" aria-hidden="true">Open →</span>
        </a>
      </div>
    </div>
  );
}
